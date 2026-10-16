package expo.modules.sharing

import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ResolveInfo
import android.net.Uri
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.services.FilePermissionService
import io.mockk.every
import io.mockk.mockk
import java.io.File
import java.lang.ref.WeakReference
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SharingImagesTest {
    @Test fun single_and_double_page_shares_preserve_all_uri_permissions_and_payloads() {
        for (count in listOf(1, 2)) {
            val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
            val appContext = mockk<AppContext>()
            every { appContext.reactContext } returns activity
            every { appContext.throwingActivity } returns activity
            every { appContext.filePermission } returns FilePermissionService()
            val module = SharingModule()
            Module::class.java.getDeclaredField("_appContextHolder").apply { isAccessible = true }
                .set(module, WeakReference(appContext))
            val files = (1..count).map { index ->
                File(activity.cacheDir, "Book-$index.jpg").apply { writeBytes(byteArrayOf(index.toByte())) }
            }
            val targets = ResolveInfo().apply { activityInfo = ActivityInfo().apply { packageName = "reader.share.target"; name = "ShareActivity" } }
            shadowOf(activity.packageManager).addResolveInfoForIntent(Intent(Intent.ACTION_CHOOSER), targets)
            val options = SharingOptions(additionalUrls = files.drop(1).map { Uri.fromFile(it).toString() }, mimeType = "image/jpeg", UTI = null, dialogTitle = null)
            val function = module.definition().asyncFunctions.getValue("shareAsync")
            val body = function.javaClass.getDeclaredField("body").apply { isAccessible = true }.get(function)
            @Suppress("UNCHECKED_CAST")
            (body as (Array<out Any?>, Promise) -> Unit)(arrayOf(Uri.fromFile(files.first()).toString(), options), mockk(relaxed = true))
            val chooser = shadowOf(activity).nextStartedActivityForResult.intent
            val share = chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)!!
            assertEquals(if (count == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE, share.action)
            val uris = if (count == 1) listOf(share.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)!!) else share.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)!!
            assertEquals(count, uris.size)
            assertEquals(count, share.clipData!!.itemCount)
            assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION, share.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION)
            assertEquals("image/jpeg", share.type)
            for ((index, uri) in uris.withIndex()) {
                assertEquals(uri, share.clipData!!.getItemAt(index).uri)
                assertArrayEquals(files[index].readBytes(), activity.contentResolver.openInputStream(uri)!!.use { it.readBytes() })
            }
        }
    }
}
