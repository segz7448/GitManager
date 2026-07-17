package com.zenas.gitmanager.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetControlModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "WidgetControl"

  @ReactMethod
  fun startMonitoring(owner: String, repo: String, token: String, promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(
        RepoActionsWidgetProvider.PREFS_NAME,
        Context.MODE_PRIVATE
      )
      prefs.edit()
        .putString(RepoActionsWidgetProvider.KEY_OWNER, owner)
        .putString(RepoActionsWidgetProvider.KEY_REPO, repo)
        .putString("gh_token", token)
        .putString(RepoActionsWidgetProvider.KEY_STATUS_TEXT, "Starting...")
        .apply()

      val intent = Intent(reactApplicationContext, RepoActionsMonitorService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(intent)
      } else {
        reactApplicationContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("START_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun stopMonitoring(promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, RepoActionsMonitorService::class.java)
      intent.action = RepoActionsMonitorService.ACTION_STOP
      reactApplicationContext.startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("STOP_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun getWatchedRepo(promise: Promise) {
    val prefs = reactApplicationContext.getSharedPreferences(
      RepoActionsWidgetProvider.PREFS_NAME,
      Context.MODE_PRIVATE
    )
    val owner = prefs.getString(RepoActionsWidgetProvider.KEY_OWNER, null)
    val repo = prefs.getString(RepoActionsWidgetProvider.KEY_REPO, null)
    val map = com.facebook.react.bridge.Arguments.createMap()
    if (owner != null) map.putString("owner", owner) else map.putNull("owner")
    if (repo != null) map.putString("repo", repo) else map.putNull("repo")
    promise.resolve(map)
  }

  /**
   * Widgets are added to the home screen through Android's own widget
   * picker UI (long-press home screen -> Widgets), which this app cannot
   * trigger directly. This just reports how many instances of our widget
   * are currently placed, so the JS side can show an accurate "0 widgets
   * added yet - long-press your home screen to add one" message.
   */
  @ReactMethod
  fun getPlacedWidgetCount(promise: Promise) {
    try {
      val appWidgetManager = AppWidgetManager.getInstance(reactApplicationContext)
      val componentName = ComponentName(reactApplicationContext, RepoActionsWidgetProvider::class.java)
      val ids = appWidgetManager.getAppWidgetIds(componentName)
      promise.resolve(ids.size)
    } catch (e: Exception) {
      promise.resolve(0)
    }
  }
}
