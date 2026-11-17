package com.myreader.googleauthorization

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Looper
import com.google.android.gms.auth.api.identity.AuthorizationClient
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import com.google.android.gms.tasks.TaskCompletionSource
import com.google.android.gms.tasks.Tasks
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.events.BasicEventListener
import expo.modules.kotlin.events.EventListenerWithSenderAndPayload
import expo.modules.kotlin.events.EventName
import expo.modules.kotlin.events.OnActivityResultPayload
import expo.modules.kotlin.modules.Module
import io.mockk.*
import java.lang.ref.WeakReference
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class GoogleAuthorizationTest {
  private val drive = "https://www.googleapis.com/auth/drive"
  private val appContext = mockk<AppContext>()
  private val activity = mockk<Activity>(relaxed = true)
  private val client = mockk<AuthorizationClient>()
  private val module = MyReaderGoogleAuthorizationModule()
  private val definition by lazy { module.definition() }
  private val request = slot<AuthorizationRequest>()

  private class Reply : Promise {
    var value: Any? = null
    var code: String? = null
    var resolved = false
    override fun resolve(value: Any?) { this.value = value; resolved = true }
    override fun reject(code: String?, message: String?, cause: Throwable?) { this.code = code }
  }

  @Before fun setUp() {
    every { appContext.reactContext } returns RuntimeEnvironment.getApplication()
    every { appContext.currentActivity } returns activity
    Module::class.java.getDeclaredField("_appContextHolder").apply { isAccessible = true }
      .set(module, WeakReference(appContext))
    mockkStatic(Identity::class)
    every { Identity.getAuthorizationClient(any<Context>()) } returns client
    every { Identity.getAuthorizationClient(any<Activity>()) } returns client
    every { client.authorize(capture(request)) } returns Tasks.forResult(granted())
  }

  @After fun tearDown() { unmockkAll() }

  private fun granted(token: String? = "test-access-token", scopes: List<String> = listOf(drive)) =
    mockk<AuthorizationResult> {
      every { accessToken } returns token
      every { grantedScopes } returns scopes
      every { hasResolution() } returns false
    }

  private fun resolution(intent: PendingIntent? = mockk(relaxed = true)) =
    mockk<AuthorizationResult> {
      every { hasResolution() } returns true
      every { pendingIntent } returns intent
    }

  private fun call(name: String, vararg arguments: Any?): Reply {
    val function = definition.asyncFunctions.getValue(name)
    val body = function.javaClass.getDeclaredField("body").apply { isAccessible = true }.get(function)
    val reply = Reply()
    @Suppress("UNCHECKED_CAST")
    (body as (Array<out Any?>, Promise) -> Unit)(arguments, reply)
    shadowOf(Looper.getMainLooper()).idle()
    return reply
  }

  private fun authorize(email: String? = null, interactive: Boolean = true) =
    call("authorize", listOf(drive), email, interactive)

  private fun activityResult(code: Int, requestCode: Int = 11401) {
    @Suppress("UNCHECKED_CAST")
    val listener = definition.eventListeners.getValue(EventName.ON_ACTIVITY_RESULT)
      as EventListenerWithSenderAndPayload<Activity, OnActivityResultPayload>
    listener.call(activity, OnActivityResultPayload(requestCode, code, Intent()))
  }

  @Test fun interactive_sign_in_selects_an_account_and_requires_drive_access() {
    assertEquals("test-access-token", authorize().value)
    assertEquals(AuthorizationRequest.Prompt.SELECT_ACCOUNT, request.captured.prompt)
    assertEquals(listOf(drive), request.captured.requestedScopes.map { it.scopeUri })
    assertNull(request.captured.account)
  }

  @Test fun silent_renewal_is_bound_to_the_previously_selected_account() {
    assertEquals("test-access-token", authorize("reader@example.com", false).value)
    assertEquals("reader@example.com", request.captured.account?.name)
    assertEquals("com.google", request.captured.account?.type)
    assertEquals("authorization_required", authorize(null, false).code)
    verify(exactly = 1) { client.authorize(any()) }
  }

  @Test fun incomplete_grants_never_return_a_token() {
    for (result in listOf(granted(token = ""), granted(scopes = listOf("email")))) {
      every { client.authorize(any()) } returns Tasks.forResult(result)
      val reply = authorize()
      assertEquals("access_denied", reply.code)
      assertFalse(reply.resolved)
    }
  }

  @Test fun background_renewal_never_opens_an_interactive_resolution() {
    every { client.authorize(any()) } returns Tasks.forResult(resolution())
    assertEquals("authorization_required", authorize("reader@example.com", false).code)
    verify(exactly = 0) { activity.startIntentSenderForResult(any(), any(), any(), any(), any(), any()) }
  }

  @Test fun interactive_result_returns_the_granted_token_once() {
    every { client.authorize(any()) } returns Tasks.forResult(resolution())
    val pending = authorize()
    verify { activity.startIntentSenderForResult(any(), 11401, null, 0, 0, 0) }
    every { client.getAuthorizationResultFromIntent(any()) } returns granted("resolved-token")
    activityResult(Activity.RESULT_OK)
    assertEquals("resolved-token", pending.value)
    activityResult(Activity.RESULT_CANCELED)
    assertNull(pending.code)
  }

  @Test fun cancellation_preserves_request_ownership_and_allows_retry() {
    every { client.authorize(any()) } returns Tasks.forResult(resolution())
    val pending = authorize()
    assertEquals("authorization_in_progress", authorize().code)
    activityResult(Activity.RESULT_CANCELED, 42)
    assertNull(pending.code)
    activityResult(Activity.RESULT_CANCELED)
    assertEquals("user_cancelled", pending.code)
    every { client.authorize(any()) } returns Tasks.forResult(granted())
    assertEquals("test-access-token", authorize().value)
  }

  @Test fun sdk_failures_are_classified_and_release_the_pending_request() {
    val codes = mapOf(
      CommonStatusCodes.CANCELED to "user_cancelled",
      CommonStatusCodes.SIGN_IN_REQUIRED to "authorization_required",
      CommonStatusCodes.NETWORK_ERROR to "network_error",
      CommonStatusCodes.DEVELOPER_ERROR to "configuration_error",
      CommonStatusCodes.ERROR to "authorization_unavailable",
    )
    for ((status, code) in codes) {
      every { client.authorize(any()) } returns Tasks.forException(ApiException(Status(status)))
      assertEquals(code, authorize().code)
    }
  }

  @Test fun missing_context_rejects_authorization_and_cache_clear() {
    every { appContext.reactContext } returns null
    assertEquals("authorization_unavailable", authorize().code)
    assertEquals("authorization_unavailable", call("clearToken", "old-token").code)
    verify(exactly = 0) { client.authorize(any()) }
  }

  @Test fun a_missing_activity_or_pending_intent_rejects_without_stalling_retries() {
    every { client.authorize(any()) } returns Tasks.forResult(resolution())
    every { appContext.currentActivity } returns null
    assertEquals("authorization_unavailable", authorize().code)
    every { appContext.currentActivity } returns activity
    every { client.authorize(any()) } returns Tasks.forResult(resolution(null))
    assertEquals("authorization_unavailable", authorize().code)
  }

  @Test fun resolution_launch_and_callback_errors_reject_the_active_request() {
    every { client.authorize(any()) } returns Tasks.forResult(resolution())
    every { activity.startIntentSenderForResult(any(), any(), any(), any(), any(), any()) } throws IllegalStateException("Unavailable")
    assertEquals("authorization_unavailable", authorize().code)
    every { activity.startIntentSenderForResult(any(), any(), any(), any(), any(), any()) } just Runs
    val pending = authorize()
    every { client.getAuthorizationResultFromIntent(any()) } throws ApiException(Status(CommonStatusCodes.CANCELED))
    activityResult(Activity.RESULT_OK)
    assertEquals("user_cancelled", pending.code)
  }

  @Test fun module_destruction_cancels_a_pending_authorization() {
    val task = TaskCompletionSource<AuthorizationResult>()
    every { client.authorize(any()) } returns task.task
    val pending = authorize()
    (definition.eventListeners.getValue(EventName.MODULE_DESTROY) as BasicEventListener).call()
    assertEquals("user_cancelled", pending.code)
  }

  @Test fun cache_clear_uses_the_supplied_token_and_propagates_failure() {
    val clearRequest = slot<ClearTokenRequest>()
    every { client.clearToken(capture(clearRequest)) } returns Tasks.forResult(null)
    assertTrue(call("clearToken", "old-token").resolved)
    assertEquals("old-token", clearRequest.captured.token)
    every { client.clearToken(any()) } returns Tasks.forException(ApiException(Status(CommonStatusCodes.NETWORK_ERROR)))
    assertEquals("network_error", call("clearToken", "old-token").code)
  }
}
