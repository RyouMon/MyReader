package com.myreader.booktransition

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.max

class MyReaderBookTransitionModule : Module() {
  private var activeOverlay: View? = null
  private val sourceSnapshots = mutableMapOf<String, Bitmap>()
  private val sourceCoverSnapshots = mutableMapOf<String, Bitmap>()

  override fun definition() = ModuleDefinition {
    Name("MyReaderBookTransition")

    Function("startTransition") { options: Map<String, Any?> ->
      appContext.currentActivity?.runOnUiThread {
        startTransition(options)
      }
      true
    }
  }

  private fun startTransition(options: Map<String, Any?>) {
    val activity = appContext.currentActivity ?: return
    val root = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
    val direction = options["direction"] as? String ?: return
    val frame = options["frame"] as? Map<*, *> ?: return

    activeOverlay?.let { (it.parent as? ViewGroup)?.removeView(it) }

    val rootWidth = root.width.takeIf { it > 0 } ?: return
    val rootHeight = root.height.takeIf { it > 0 } ?: return
    val isClosing = direction == "close"
    val duration = ((options["durationMs"] as? Number)?.toLong() ?: 780L)
    val density = activity.resources.displayMetrics.density
    val screenWidth = number(options["screenWidth"]).takeIf { it > 0f }
    val screenHeight = number(options["screenHeight"]).takeIf { it > 0f }
    val scaleX = screenWidth?.let { rootWidth / it } ?: density
    val scaleY = screenHeight?.let { rootHeight / it } ?: density
    val rootWindowLocation = IntArray(2)
    root.getLocationInWindow(rootWindowLocation)
    val sourceX = number(frame["x"]) * scaleX
    val sourceY = number(frame["y"]) * scaleY
    val sourceWidth = max(1f, number(frame["width"]) * scaleX)
    val sourceHeight = max(1f, number(frame["height"]) * scaleY)
    val bookId = options["bookId"] as? String
    val screenshot = snapshot(root)
    val sourceCover = if (isClosing && bookId != null) {
      sourceCoverSnapshots[bookId]
    } else {
      screenshot?.let { crop(it, sourceX, sourceY, sourceWidth, sourceHeight) }
    }
    if (!isClosing && bookId != null && screenshot != null) {
      sourceSnapshots[bookId] = screenshot
      if (sourceCover != null) {
        sourceCoverSnapshots[bookId] = sourceCover
      }
    }
    val sourceBackground = if (isClosing && bookId != null) {
      sourceSnapshots[bookId]
    } else {
      screenshot
    }

    val overlay = FrameLayout(activity).apply {
      setBackgroundColor(Color.TRANSPARENT)
      isClickable = false
      clipChildren = false
      clipToPadding = false
      layoutParams = FrameLayout.LayoutParams(rootWidth, rootHeight)
    }
    activeOverlay = overlay

    if (sourceBackground != null) {
      overlay.addView(ImageView(activity).apply {
        setImageBitmap(sourceBackground)
        scaleType = ImageView.ScaleType.FIT_XY
      }, FrameLayout.LayoutParams(rootWidth, rootHeight))
    }

    val bookContainer = FrameLayout(activity).apply {
      setBackgroundColor(Color.TRANSPARENT)
      clipChildren = false
      clipToPadding = false
      pivotX = 0f
      pivotY = 0f
      cameraDistance = 12000f
    }
    overlay.addView(bookContainer, FrameLayout.LayoutParams(rootWidth, rootHeight))

    val contentView = if (isClosing && screenshot != null) {
      ImageView(activity).apply {
        setImageBitmap(screenshot)
        scaleType = ImageView.ScaleType.FIT_XY
        setBackgroundColor(Color.BLACK)
      }
    } else {
      makePlaceholderContent(activity, rootWidth, rootHeight)
    }
    bookContainer.addView(contentView, FrameLayout.LayoutParams(rootWidth, rootHeight))

    val coverView = makeCoverView(
      context = activity,
      coverImageUri = options["coverImageUri"] as? String,
      coverHeaders = options["coverHeaders"] as? Map<*, *>,
      fallbackBitmap = sourceCover,
      title = options["title"] as? String,
      width = rootWidth,
      height = rootHeight,
    )
    coverView.pivotX = 0f
    coverView.pivotY = rootHeight / 2f
    coverView.cameraDistance = 12000f
    bookContainer.addView(coverView, FrameLayout.LayoutParams(rootWidth, rootHeight))

    root.addView(overlay)

    val targetScaleX = sourceWidth / rootWidth
    val targetScaleY = sourceHeight / rootHeight
    val targetTranslationX = sourceX
    val targetTranslationY = sourceY
    Log.e(
      "MyReaderBookTransition",
      "start direction=$direction density=$density screen=($screenWidth,$screenHeight) scale=($scaleX,$scaleY) rootWindow=(${rootWindowLocation[0]},${rootWindowLocation[1]}) raw=(${number(frame["x"])},${number(frame["y"])},${number(frame["width"])},${number(frame["height"])}) source=($sourceX,$sourceY,$sourceWidth,$sourceHeight) target=(scale=$targetScaleX,$targetScaleY translate=$targetTranslationX,$targetTranslationY) root=($rootWidth,$rootHeight)"
    )

    if (isClosing) {
      bookContainer.scaleX = 1f
      bookContainer.scaleY = 1f
      bookContainer.translationX = 0f
      bookContainer.translationY = 0f
      coverView.rotationY = -112f
      coverView.alpha = 1f
    } else {
      bookContainer.scaleX = targetScaleX
      bookContainer.scaleY = targetScaleY
      bookContainer.translationX = targetTranslationX
      bookContainer.translationY = targetTranslationY
      coverView.rotationY = 0f
      coverView.alpha = 1f
    }

    AnimatorSet().apply {
      playTogether(
        ObjectAnimator.ofFloat(bookContainer, View.SCALE_X, if (isClosing) targetScaleX else 1f),
        ObjectAnimator.ofFloat(bookContainer, View.SCALE_Y, if (isClosing) targetScaleY else 1f),
        ObjectAnimator.ofFloat(bookContainer, View.TRANSLATION_X, if (isClosing) targetTranslationX else 0f),
        ObjectAnimator.ofFloat(bookContainer, View.TRANSLATION_Y, if (isClosing) targetTranslationY else 0f),
        ObjectAnimator.ofFloat(coverView, View.ROTATION_Y, if (isClosing) 0f else -112f),
        ObjectAnimator.ofFloat(coverView, View.ALPHA, if (isClosing) 1f else 0f),
      )
      this.duration = duration
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          root.removeView(overlay)
          if (isClosing && bookId != null) {
            sourceSnapshots.remove(bookId)
            sourceCoverSnapshots.remove(bookId)
          }
          if (activeOverlay === overlay) activeOverlay = null
        }
      })
      start()
    }
  }

  private fun makePlaceholderContent(context: Context, width: Int, height: Int): View {
    return LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.WHITE)
      setPadding(max(24, (width * 0.1f).toInt()), max(48, (height * 0.12f).toInt()), max(24, (width * 0.1f).toInt()), 0)
      repeat(12) { index ->
        addView(View(context).apply {
          setBackgroundColor(Color.argb(80, 120, 120, 120))
        }, LinearLayout.LayoutParams(
          if (index % 4 == 3) (width * 0.5f).toInt() else LinearLayout.LayoutParams.MATCH_PARENT,
          6,
        ).apply {
          bottomMargin = 12
        })
      }
    }
  }

  private fun makeCoverView(
    context: Context,
    coverImageUri: String?,
    coverHeaders: Map<*, *>?,
    fallbackBitmap: Bitmap?,
    title: String?,
    width: Int,
    height: Int,
  ): View {
    val cover = FrameLayout(context).apply {
      setBackgroundColor(Color.rgb(74, 55, 40))
      clipChildren = true
    }

    val bitmap = loadBitmap(coverImageUri, coverHeaders) ?: fallbackBitmap
    if (bitmap != null) {
      cover.addView(ImageView(context).apply {
        setImageBitmap(bitmap)
        scaleType = ImageView.ScaleType.FIT_XY
      }, FrameLayout.LayoutParams(width, height))
    } else {
      cover.addView(TextView(context).apply {
        text = title.orEmpty()
        setTextColor(Color.WHITE)
        textSize = 22f
        gravity = Gravity.CENTER
        setTypeface(typeface, android.graphics.Typeface.BOLD)
      }, FrameLayout.LayoutParams(width, height))
    }

    return cover
  }

  private fun loadBitmap(uriString: String?, headers: Map<*, *>?): Bitmap? {
    if (uriString.isNullOrBlank()) return null
    val context = appContext.currentActivity ?: return null
    return try {
      val uri = Uri.parse(uriString)
      if (uri.scheme == "file") {
        BitmapFactory.decodeFile(File(uri.path ?: return null).absolutePath)
      } else if (uri.scheme == "http" || uri.scheme == "https") {
        val connection = URL(uriString).openConnection() as HttpURLConnection
        headers?.forEach { (key, value) ->
          if (key is String && value is String) {
            connection.setRequestProperty(key, value)
          }
        }
        connection.connectTimeout = 800
        connection.readTimeout = 1200
        connection.inputStream.use { input ->
          BitmapFactory.decodeStream(input)
        }
      } else {
        context.contentResolver.openInputStream(uri)?.use { input ->
          BitmapFactory.decodeStream(input)
        }
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun snapshot(view: View): Bitmap? {
    if (view.width <= 0 || view.height <= 0) return null
    return try {
      Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888).also { bitmap ->
        view.draw(Canvas(bitmap))
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun crop(bitmap: Bitmap, x: Float, y: Float, width: Float, height: Float): Bitmap? {
    val left = x.toInt().coerceIn(0, bitmap.width - 1)
    val top = y.toInt().coerceIn(0, bitmap.height - 1)
    val right = (x + width).toInt().coerceIn(left + 1, bitmap.width)
    val bottom = (y + height).toInt().coerceIn(top + 1, bitmap.height)
    return try {
      Bitmap.createBitmap(bitmap, left, top, right - left, bottom - top)
    } catch (_: Exception) {
      null
    }
  }

  private fun number(value: Any?): Float {
    return (value as? Number)?.toFloat() ?: 0f
  }
}
