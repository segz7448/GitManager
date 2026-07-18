package com.zenas.gitmanager.widget

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.zenas.gitmanager.MainActivity
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

/**
 * Polls a single watched repo's latest Actions run every POLL_INTERVAL_MS
 * and pushes updates to both the home screen widget and this service's own
 * persistent notification (required by Android for any foreground service).
 *
 * Android 15+ hard-caps "dataSync" foreground services at 6 hours; rather
 * than let the OS kill this abruptly, it self-stops at SAFETY_STOP_MS and
 * leaves the widget showing a clear "stopped" message so the person isn't
 * looking at a status that quietly stopped updating.
 */
class RepoActionsMonitorService : Service() {

    companion object {
        const val CHANNEL_ID = "gitmanager_widget_monitor"
        const val NOTIFICATION_ID = 4201
        const val POLL_INTERVAL_MS = 15000L
        const val SAFETY_STOP_MS = 5L * 60L * 60L * 1000L + 30L * 60L * 1000L // 5.5 hours
        const val ACTION_STOP = "com.zenas.gitmanager.widget.STOP_MONITORING"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var pollRunnable: Runnable? = null
    private var startTimeMs: Long = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopMonitoring("Monitoring stopped")
            return START_NOT_STICKY
        }

        startTimeMs = System.currentTimeMillis()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Watching for updates..."))
        schedulePoll()
        return START_STICKY
    }

    private fun schedulePoll() {
        pollRunnable?.let { handler.removeCallbacks(it) }
        pollRunnable = Runnable {
            val elapsed = System.currentTimeMillis() - startTimeMs
            if (elapsed >= SAFETY_STOP_MS) {
                stopMonitoring("Monitoring stopped (6h Android limit) - reopen app to resume")
                return@Runnable
            }
            pollOnce()
            handler.postDelayed(pollRunnable!!, POLL_INTERVAL_MS)
        }
        handler.post(pollRunnable!!)
    }

    private fun pollOnce() {
        val prefs = getSharedPreferences(RepoActionsWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        val owner = prefs.getString(RepoActionsWidgetProvider.KEY_OWNER, null)
        val repo = prefs.getString(RepoActionsWidgetProvider.KEY_REPO, null)
        val token = prefs.getString("gh_token", null)

        if (owner == null || repo == null || token == null) {
            return
        }

        Thread {
            try {
                val url = URL("https://api.github.com/repos/$owner/$repo/actions/runs?per_page=1")
                val conn = url.openConnection() as HttpURLConnection
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.setRequestProperty("Accept", "application/vnd.github+json")
                conn.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
                conn.connectTimeout = 10000
                conn.readTimeout = 10000

                val responseCode = conn.responseCode
                if (responseCode == 200) {
                    val body = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = org.json.JSONObject(body)
                    val runs: JSONArray = json.optJSONArray("workflow_runs") ?: JSONArray()

                    if (runs.length() > 0) {
                        val run = runs.getJSONObject(0)
                        val status = run.optString("status", "unknown")
                        val conclusion = run.optString("conclusion", null)
                        val runNumber = run.optInt("run_number", 0)

                        val displayStatus = if (status == "completed") conclusion else status
                        val statusText = "Run #$runNumber: $displayStatus"
                        val color = colorForStatus(displayStatus)
                        val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
                            .format(java.util.Date())

                        prefs.edit()
                            .putString(RepoActionsWidgetProvider.KEY_STATUS_TEXT, statusText)
                            .putString(RepoActionsWidgetProvider.KEY_UPDATED_AT, "Updated $timestamp")
                            .putInt(RepoActionsWidgetProvider.KEY_STATUS_COLOR, color)
                            .apply()

                        handler.post {
                            pushWidgetUpdate()
                            updateNotification("$owner/$repo: $displayStatus")
                        }
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                // Transient network errors are expected occasionally - just
                // try again on the next poll tick rather than crash.
            }
        }.start()
    }

    private fun colorForStatus(status: String?): Int {
        return when (status) {
            "success" -> 0xFF3FB950.toInt()
            "failure" -> 0xFFF85149.toInt()
            "in_progress", "queued" -> 0xFFD29922.toInt()
            "cancelled" -> 0xFF8B949E.toInt()
            else -> 0xFF8B949E.toInt()
        }
    }

    private fun pushWidgetUpdate() {
        val appWidgetManager = AppWidgetManager.getInstance(this)
        val componentName = ComponentName(this, RepoActionsWidgetProvider::class.java)
        val ids = appWidgetManager.getAppWidgetIds(componentName)
        val views = RepoActionsWidgetProvider.buildRemoteViews(this)
        for (id in ids) {
            appWidgetManager.updateAppWidget(id, views)
        }
    }

    private fun stopMonitoring(finalStatusText: String) {
        val prefs = getSharedPreferences(RepoActionsWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(RepoActionsWidgetProvider.KEY_STATUS_TEXT, finalStatusText)
            .apply()
        pushWidgetUpdate()
        pollRunnable?.let { handler.removeCallbacks(it) }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Repo Actions Monitoring",
                NotificationManager.IMPORTANCE_LOW
            )
            channel.description = "Shows while GitManager is watching a repo's Actions runs for the home screen widget"
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(contentText: String): android.app.Notification {
        val openAppIntent = Intent(this, MainActivity::class.java)
        val openAppPendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, RepoActionsMonitorService::class.java).apply { action = ACTION_STOP }
        val stopPendingIntent = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GitManager - watching repo")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setContentIntent(openAppPendingIntent)
            .addAction(0, "Stop watching", stopPendingIntent)
            .build()
    }

    private fun updateNotification(contentText: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(contentText))
    }

    override fun onDestroy() {
        pollRunnable?.let { handler.removeCallbacks(it) }
        super.onDestroy()
    }
}
