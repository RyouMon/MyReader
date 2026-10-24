package com.myreader.readium.reader

import android.content.Intent
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UserNavigationViewportTest {
  @Test fun slow_renderer_keeps_the_late_page_location_owned_by_the_user() = runBlocking {
    withViewport { web, root ->
      val state = TtsPlaybackNavigationState()
      state.beginTtsFollow()
      val navigationId = state.beginUserNavigation()
      val viewport = checkNotNull(UserNavigationViewport.capture(root))
      web.evaluateJavascript("""
        (() => {
          const blockedUntil = performance.now() + 1500;
          while (performance.now() < blockedUntil) {}
          const start = performance.now();
          const target = innerWidth;
          requestAnimationFrame(function move(now) {
            const progress = Math.min((now - start) / 300, 1);
            scrollTo(target * progress, 0);
            if (progress < 1) requestAnimationFrame(move);
          });
        })();
      """.trimIndent(), null)

      val unchanged = viewport.unchangedAfterSettling()
      if (unchanged) {
        state.cancelUserNavigationIfUnchanged(navigationId)
      }
      val rendered = CompletableDeferred<String>()
      web.evaluateJavascript("JSON.stringify({x: scrollX, width: innerWidth, content: document.documentElement.scrollWidth})") {
        rendered.complete(it)
      }
      val renderedPosition = withTimeout(5_000) { rendered.await() }
      assertTrue("unchanged=$unchanged, native=${web.scrollX}, rendered=$renderedPosition", web.scrollX > 0)
      val lateLocation = state.locationEvent()
      assertEquals("user", lateLocation.source)
      assertEquals(navigationId, lateLocation.navigationId)
      assertFalse(state.allowsTtsFollow)
    }
  }

  @Test fun unchanged_boundary_restores_narration_follow_after_rendering_finishes() = runBlocking {
    withViewport { web, root ->
      val state = TtsPlaybackNavigationState()
      state.beginTtsFollow()
      val navigationId = state.beginUserNavigation()
      val viewport = checkNotNull(UserNavigationViewport.capture(root))
      web.evaluateJavascript("scrollTo(0, 0)", null)

      assertTrue(viewport.unchangedAfterSettling())
      assertTrue(state.cancelUserNavigationIfUnchanged(navigationId))
      assertTrue(state.allowsTtsFollow)
      assertEquals("tts", state.locationEvent().source)
    }
  }

  @Test fun a_removed_view_cannot_confirm_an_unchanged_page() = runBlocking {
    withViewport { web, root ->
      val viewport = checkNotNull(UserNavigationViewport.capture(root))
      root.removeView(web)

      assertFalse(viewport.unchangedAfterSettling())
      assertNull(UserNavigationViewport.capture(root))
    }
  }

  @Test fun a_resource_transition_does_not_count_as_an_unchanged_page() = runBlocking {
    withViewport { web, root ->
      val viewport = checkNotNull(UserNavigationViewport.capture(root))
      web.animate().translationX(web.width.toFloat()).setDuration(300).start()

      assertFalse(viewport.unchangedAfterSettling())
    }
  }

  private suspend fun withViewport(test: suspend (WebView, ViewGroup) -> Unit) {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    ActivityScenario.launch<ReaderCbzTestActivity>(
      Intent(context, ReaderCbzTestActivity::class.java)
    ).use { scenario ->
      val loaded = CompletableDeferred<Pair<WebView, ViewGroup>>()
      scenario.onActivity { activity ->
        val web = WebView(activity)
        web.settings.javaScriptEnabled = true
        web.settings.useWideViewPort = true
        web.webViewClient = object : WebViewClient() {
          override fun onPageFinished(view: WebView, url: String) {
            loaded.complete(web to activity.container)
          }
        }
        activity.container.addView(web, ViewGroup.LayoutParams(-1, -1))
        web.loadDataWithBaseURL("https://reader.test/", """
          <html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,shrink-to-fit=no"/>
          <style>html { overflow: hidden; } body { margin: 0; width: 300vw; height: 100vh; }</style></head>
          <body>First page followed by the manually selected page.</body></html>
        """.trimIndent(), "text/html", "UTF-8", null)
      }
      val (web, root) = withTimeout(15_000) { loaded.await() }
      try {
        withContext(Dispatchers.Main) { test(web, root) }
      } finally {
        withContext(Dispatchers.Main) { root.removeView(web); web.destroy() }
      }
    }
  }
}
