package com.myreader.readium.Streamer

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket

class FormatParserTest {
    @Test
    fun deliversSuccessAndParserErrorsFromItsLocalWebView() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        for (message in listOf("ok", "Invalid book")) {
            ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { server ->
                server.soTimeout = 20_000
                val response = async(Dispatchers.IO) {
                    server.accept().use { client ->
                        val request = client.getInputStream().bufferedReader()
                        while (!request.readLine().isNullOrEmpty()) { /* consume HTTP headers */ }
                        val page = "<link rel=icon href=data:,><script>ReaderFormat.postMessage('$message')</script>"
                        client.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${page.length}\r\nConnection: close\r\n\r\n$page").toByteArray())
                    }
                }
                val result = runCatching {
                    withTimeout(20_000) { FormatParser.run(context, "http://127.0.0.1:${server.localPort}/book") }
                }
                response.await()
                if (message == "ok") result.getOrThrow()
                else assertEquals(message, result.exceptionOrNull()?.message)
            }
        }
        assertTrue(runCatching { FormatParser.run(context, "file:///book") }.exceptionOrNull() is IllegalArgumentException)
    }

    @Test
    fun unavailableSessionFailsWithoutWaitingForTheConversionTimeout() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val port = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
        val error = runCatching {
            withTimeout(15_000) { FormatParser.run(context, "http://127.0.0.1:$port/book") }
        }.exceptionOrNull()
        assertTrue("Expected a WebView load error, got $error", error is IllegalStateException)
    }
}
