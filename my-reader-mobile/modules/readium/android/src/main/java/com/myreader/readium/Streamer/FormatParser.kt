package com.myreader.readium.Streamer

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

internal object FormatParser {
  @SuppressLint("SetJavaScriptEnabled")
  suspend fun run(context: Context, address: String) = withContext(Dispatchers.Main) {
    val uri = Uri.parse(address)
    require(uri.scheme == "http" && uri.host == "127.0.0.1" && uri.port > 0)
    val result = CompletableDeferred<Unit>()
    val view = WebView(context)
    try {
      view.settings.apply {
        javaScriptEnabled = true
        allowFileAccess = false
        allowContentAccess = false
      }
      view.webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = request.url != uri
        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
          if (request.isForMainFrame) result.completeExceptionally(IllegalStateException(error.description.toString()))
        }
      }
      view.addJavascriptInterface(object {
        @JavascriptInterface fun postMessage(message: String) {
          if (message == "ok") result.complete(Unit) else result.completeExceptionally(IllegalStateException(message))
        }
      }, "ReaderFormat")
      view.loadUrl(address)
      withTimeout(180_000) { result.await() }
    } finally {
      view.removeJavascriptInterface("ReaderFormat")
      view.stopLoading()
      view.destroy()
    }
  }
}
