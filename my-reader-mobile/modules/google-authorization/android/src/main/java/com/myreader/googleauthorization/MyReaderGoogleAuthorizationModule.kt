package com.myreader.googleauthorization

import android.accounts.Account
import android.app.Activity
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val AUTHORIZATION_REQUEST = 11401
private const val DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"

class MyReaderGoogleAuthorizationModule : Module() {
  private var pendingAuthorization: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("MyReaderGoogleAuthorization")

    AsyncFunction("authorize") {
        scopes: List<String>, accountEmail: String?, interactive: Boolean, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("authorization_unavailable", "Google authorization context unavailable", null)
        return@AsyncFunction
      }
      if (interactive && pendingAuthorization != null) {
        promise.reject("authorization_in_progress", "Google authorization already in progress", null)
        return@AsyncFunction
      }
      val request = AuthorizationRequest.builder()
        .setRequestedScopes(scopes.map(::Scope))
      if (!accountEmail.isNullOrBlank()) {
        request.setAccount(Account(accountEmail, "com.google"))
      } else if (interactive) {
        request.setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT)
      } else {
        promise.reject("authorization_required", "Google account authorization required", null)
        return@AsyncFunction
      }
      if (interactive) pendingAuthorization = promise
      Identity.getAuthorizationClient(context).authorize(request.build())
        .addOnSuccessListener { result ->
          if (!result.hasResolution()) {
            finish(result, promise)
          } else if (!interactive) {
            promise.reject("authorization_required", "Google account authorization required", null)
          } else {
            val activity = appContext.currentActivity
            val intent = result.pendingIntent
            if (activity == null || intent == null) {
              reject(promise, "authorization_unavailable", "Google authorization activity unavailable")
            } else {
              try {
                activity.startIntentSenderForResult(
                  intent.intentSender, AUTHORIZATION_REQUEST, null, 0, 0, 0,
                )
              } catch (error: Exception) {
                rejectError(promise, error)
              }
            }
          }
        }
        .addOnFailureListener { rejectError(promise, it) }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { activity, (requestCode, resultCode, data) ->
      if (requestCode != AUTHORIZATION_REQUEST) return@OnActivityResult
      val promise = pendingAuthorization ?: return@OnActivityResult
      if (resultCode == Activity.RESULT_CANCELED) {
        reject(promise, "user_cancelled", "Google authorization cancelled")
      } else {
        try {
          finish(Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data), promise)
        } catch (error: Exception) {
          rejectError(promise, error)
        }
      }
    }

    AsyncFunction("clearToken") { accessToken: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("authorization_unavailable", "Google authorization context unavailable", null)
      } else {
        Identity.getAuthorizationClient(context)
          .clearToken(ClearTokenRequest.builder().setToken(accessToken).build())
          .addOnSuccessListener { promise.resolve(null) }
          .addOnFailureListener { rejectError(promise, it) }
      }
    }

    OnDestroy {
      pendingAuthorization?.let {
        reject(it, "user_cancelled", "Google authorization interrupted")
      }
    }
  }

  private fun finish(result: AuthorizationResult, promise: Promise) {
    val token = result.accessToken
    if (token.isNullOrBlank() || !result.grantedScopes.contains(DRIVE_SCOPE)) {
      reject(promise, "access_denied", "Google Drive access was not granted")
      return
    }
    if (pendingAuthorization === promise) pendingAuthorization = null
    promise.resolve(token)
  }

  private fun reject(promise: Promise, code: String, message: String) {
    if (pendingAuthorization === promise) pendingAuthorization = null
    promise.reject(code, message, null)
  }

  private fun rejectError(promise: Promise, error: Exception) {
    val status = (error as? ApiException)?.statusCode
    val code = when (status) {
      CommonStatusCodes.CANCELED -> "user_cancelled"
      CommonStatusCodes.SIGN_IN_REQUIRED -> "authorization_required"
      CommonStatusCodes.NETWORK_ERROR -> "network_error"
      CommonStatusCodes.DEVELOPER_ERROR -> "configuration_error"
      else -> "authorization_unavailable"
    }
    reject(promise, code, "Google authorization failed (status ${status ?: "unknown"})")
  }
}
