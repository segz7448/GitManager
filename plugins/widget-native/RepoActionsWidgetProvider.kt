package com.zenas.gitmanager.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.app.PendingIntent
import android.widget.RemoteViews
import com.zenas.gitmanager.R

/**
 * Home screen widget showing the latest known Actions run status for a
 * single repo the user has chosen to watch (set via the app's Widget
 * Settings screen, not a per-instance widget configuration - keeps this
 * simple since one repo at a time is the common case).
 *
 * The widget's own onUpdate only fires at most every 30 minutes (Android's
 * enforced floor via updatePeriodMillis). Faster updates (~15-20s, while
 * "watching" is active) are pushed directly by RepoActionsMonitorService
 * calling AppWidgetManager.updateAppWidget() - this provider's onUpdate is
 * just the fallback/initial render path.
 */
class RepoActionsWidgetProvider : AppWidgetProvider() {

    companion object {
        const val PREFS_NAME = "gitmanager_widget_prefs"
        const val KEY_OWNER = "watched_owner"
        const val KEY_REPO = "watched_repo"
        const val KEY_STATUS_TEXT = "last_status_text"
        const val KEY_UPDATED_AT = "last_updated_at"
        const val KEY_STATUS_COLOR = "last_status_color"

        fun buildRemoteViews(context: Context): RemoteViews {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val owner = prefs.getString(KEY_OWNER, null)
            val repo = prefs.getString(KEY_REPO, null)
            val statusText = prefs.getString(KEY_STATUS_TEXT, "Tap to configure in app")
            val updatedAt = prefs.getString(KEY_UPDATED_AT, "")
            val statusColor = prefs.getInt(KEY_STATUS_COLOR, 0xFF8B949E.toInt())

            val views = RemoteViews(context.packageName, R.layout.widget_repo_actions)

            if (owner != null && repo != null) {
                views.setTextViewText(R.id.widget_repo_name, "$owner/$repo")
            } else {
                views.setTextViewText(R.id.widget_repo_name, "No repo watched")
            }
            views.setTextViewText(R.id.widget_run_status, statusText)
            views.setTextViewText(R.id.widget_updated_at, updatedAt)
            views.setTextColor(R.id.widget_status_dot, statusColor)

            // Tap the widget to open the app straight at this repo's
            // Actions tab, via the gitmanager:// deep link scheme already
            // registered for the app.
            val deepLinkUri = if (owner != null && repo != null) {
                Uri.parse("gitmanager://actions?owner=$owner&repo=$repo")
            } else {
                Uri.parse("gitmanager://")
            }
            val intent = Intent(Intent.ACTION_VIEW, deepLinkUri)
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_repo_name, pendingIntent)
            views.setOnClickPendingIntent(R.id.widget_run_status, pendingIntent)

            return views
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context))
        }
    }
}
