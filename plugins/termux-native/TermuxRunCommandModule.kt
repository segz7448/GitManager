package com.zenas.gitmanager.termux

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.Promise
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Bridges to Termux's RUN_COMMAND intent so the app can execute real shell
 * commands (git push, etc.) in the user's actual Termux installation and
 * get stdout/stderr/exit code back.
 *
 * Requires on the device:
 *  - Termux installed (com.termux)
 *  - `allow-external-apps = true` set in ~/.termux/termux.properties,
 *    followed by `termux-reload-settings`
 *  - The RUN_COMMAND permission granted to this app (Android Settings ->
 *    Apps -> GitManager -> Permissions -> "Run commands in Termux
 *    environment", or it's requested at runtime)
 *
 * All extra key names and result bundle key names below are taken directly
 * from termux-app's TermuxConstants.java (RUN_COMMAND_SERVICE /
 * TERMUX_SERVICE inner classes) - not guessed.
 */
class TermuxRunCommandModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val TERMUX_PACKAGE = "com.termux"
    const val RUN_COMMAND_SERVICE_CLASS = "com.termux.app.RunCommandService"
    const val ACTION_RUN_COMMAND = "com.termux.RUN_COMMAND"

    const val EXTRA_RUN_COMMAND_PATH = "com.termux.RUN_COMMAND_PATH"
    const val EXTRA_RUN_COMMAND_ARGUMENTS = "com.termux.RUN_COMMAND_ARGUMENTS"
    const val EXTRA_RUN_COMMAND_WORKDIR = "com.termux.RUN_COMMAND_WORKDIR"
    const val EXTRA_RUN_COMMAND_BACKGROUND = "com.termux.RUN_COMMAND_BACKGROUND"
    const val EXTRA_RUN_COMMAND_SESSION_ACTION = "com.termux.RUN_COMMAND_SESSION_ACTION"
    const val EXTRA_RUN_COMMAND_PENDING_INTENT = "com.termux.RUN_COMMAND_PENDING_INTENT"

    // Result bundle (delivered inside the broadcast we receive back)
    const val EXTRA_RESULT_BUNDLE = "result"
    const val RESULT_STDOUT = "stdout"
    const val RESULT_STDERR = "stderr"
    const val RESULT_EXIT_CODE = "exitCode"
    const val RESULT_ERR = "err"
    const val RESULT_ERRMSG = "errmsg"

    const val TIMEOUT_MS = 60000L

    private val requestCounter = AtomicInteger(1000)
    private val pendingCalls = ConcurrentHashMap<Int, PendingCall>()
  }

  private class PendingCall(
    val promise: Promise,
    val receiver: BroadcastReceiver,
    val timeoutRunnable: Runnable
  )

  override fun getName() = "TermuxRunCommand"

  /**
   * Checks whether Termux is installed and whether this app currently
   * holds the RUN_COMMAND permission. Does not check allow-external-apps
   * (no way to read that from outside Termux).
   */
  @ReactMethod
  fun getStatus(promise: Promise) {
    val context = reactApplicationContext
    val result = Arguments.createMap()

    val termuxInstalled = try {
      context.packageManager.getPackageInfo(TERMUX_PACKAGE, 0)
      true
    } catch (e: PackageManager.NameNotFoundException) {
      false
    }

    val hasPermission = context.checkSelfPermission("com.termux.permission.RUN_COMMAND") ==
      PackageManager.PERMISSION_GRANTED

    result.putBoolean("termuxInstalled", termuxInstalled)
    result.putBoolean("hasPermission", hasPermission)
    promise.resolve(result)
  }

  /**
   * Runs a command in Termux and resolves with { stdout, stderr, exitCode,
   * err, errmsg }. Rejects if Termux isn't installed, permission isn't
   * granted, or the call times out (which usually means
   * allow-external-apps isn't enabled in Termux).
   *
   * @param path absolute path to the executable, e.g. "/data/data/com.termux/files/usr/bin/bash"
   * @param args array of arguments, e.g. ["-c", "cd ~/myrepo && git push"]
   * @param workdir absolute path to run in, or null
   */
  @ReactMethod
  fun runCommand(path: String, args: ReadableArray, workdir: String?, promise: Promise) {
    val context = reactApplicationContext

    val termuxInstalled = try {
      context.packageManager.getPackageInfo(TERMUX_PACKAGE, 0)
      true
    } catch (e: PackageManager.NameNotFoundException) {
      false
    }
    if (!termuxInstalled) {
      promise.reject("TERMUX_NOT_INSTALLED", "Termux is not installed on this device.")
      return
    }

    val requestId = requestCounter.incrementAndGet()
    val action = "${context.packageName}.TERMUX_RESULT_$requestId"

    val handler = Handler(Looper.getMainLooper())

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context, intent: Intent) {
        val call = pendingCalls.remove(requestId) ?: return
        handler.removeCallbacks(call.timeoutRunnable)
        try {
          context.unregisterReceiver(this)
        } catch (e: IllegalArgumentException) {
          // already unregistered - ignore
        }

        val resultBundle: Bundle? = intent.getBundleExtra(EXTRA_RESULT_BUNDLE)
        if (resultBundle == null) {
          call.promise.reject("NO_RESULT", "Termux returned no result bundle.")
          return
        }

        val map = Arguments.createMap()
        map.putString("stdout", resultBundle.getString(RESULT_STDOUT) ?: "")
        map.putString("stderr", resultBundle.getString(RESULT_STDERR) ?: "")
        // exitCode arrives as an Integer in the bundle; guard for absence
        val exitCode = if (resultBundle.containsKey(RESULT_EXIT_CODE)) {
          resultBundle.getInt(RESULT_EXIT_CODE)
        } else {
          -1
        }
        map.putInt("exitCode", exitCode)
        map.putString("errmsg", resultBundle.getString(RESULT_ERRMSG) ?: "")
        call.promise.resolve(map)
      }
    }

    val timeoutRunnable = Runnable {
      val call = pendingCalls.remove(requestId)
      if (call != null) {
        try {
          context.unregisterReceiver(call.receiver)
        } catch (e: IllegalArgumentException) {
          // already unregistered - ignore
        }
        call.promise.reject(
          "TIMEOUT",
          "No response from Termux after ${TIMEOUT_MS / 1000}s. Check that Termux is running, " +
            "allow-external-apps=true is set in ~/.termux/termux.properties (then run " +
            "termux-reload-settings), and the RUN_COMMAND permission is granted to this app."
        )
      }
    }

    pendingCalls[requestId] = PendingCall(promise, receiver, timeoutRunnable)

    // Register receiver for the one-shot broadcast Termux will send back.
    // RECEIVER_EXPORTED is required on API 33+ since the broadcast comes
    // from a different app (Termux), not from within our own process.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, IntentFilter(action), Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      context.registerReceiver(receiver, IntentFilter(action))
    }

    val resultIntent = Intent(action).setPackage(context.packageName)
    // FLAG_MUTABLE is required (not FLAG_IMMUTABLE) because Termux needs
    // to attach the result Bundle as an extra onto this pending intent.
    val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    val pendingIntent = PendingIntent.getBroadcast(context, requestId, resultIntent, pendingIntentFlags)

    val argsArray = Array(args.size()) { i -> args.getString(i) ?: "" }

    val commandIntent = Intent(ACTION_RUN_COMMAND).apply {
      setComponent(ComponentName(TERMUX_PACKAGE, RUN_COMMAND_SERVICE_CLASS))
      putExtra(EXTRA_RUN_COMMAND_PATH, path)
      putExtra(EXTRA_RUN_COMMAND_ARGUMENTS, argsArray)
      if (workdir != null) putExtra(EXTRA_RUN_COMMAND_WORKDIR, workdir)
      putExtra(EXTRA_RUN_COMMAND_BACKGROUND, true)
      putExtra(EXTRA_RUN_COMMAND_SESSION_ACTION, "0")
      putExtra(EXTRA_RUN_COMMAND_PENDING_INTENT, pendingIntent)
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(commandIntent)
      } else {
        context.startService(commandIntent)
      }
    } catch (e: SecurityException) {
      pendingCalls.remove(requestId)
      try {
        context.unregisterReceiver(receiver)
      } catch (ex: IllegalArgumentException) {}
      promise.reject(
        "PERMISSION_DENIED",
        "Missing com.termux.permission.RUN_COMMAND. Grant it in Android Settings -> Apps -> " +
          "GitManager -> Permissions.",
        e
      )
      return
    } catch (e: Exception) {
      pendingCalls.remove(requestId)
      try {
        context.unregisterReceiver(receiver)
      } catch (ex: IllegalArgumentException) {}
      promise.reject("RUN_COMMAND_FAILED", e.message, e)
      return
    }

    handler.postDelayed(timeoutRunnable, TIMEOUT_MS)
  }
}
