import ExpoModulesCore
import UIKit

public class MyReaderBookTransitionModule: Module {
  private var activeOverlay: UIView?
  private var sourceSnapshots: [String: UIImage] = [:]
  private var sourceCoverSnapshots: [String: UIImage] = [:]
  private var sourceFrames: [String: CGRect] = [:]

  public func definition() -> ModuleDefinition {
    Name("MyReaderBookTransition")

    Function("startTransition") { (options: [String: Any]) -> Bool in
      if Thread.isMainThread {
        return self.startTransition(options: options)
      }
      var didStart = false
      DispatchQueue.main.sync {
        didStart = self.startTransition(options: options)
      }
      return didStart
    }

    Function("isReduceMotionEnabled") { () -> Bool in
      UIAccessibility.isReduceMotionEnabled
    }

    Function("getPresentedViewOriginX") { () -> Double in
      Double(self.presentedViewFrameOnMain().minX)
    }

    Function("getPresentedViewOriginY") { () -> Double in
      let frame = self.presentedViewFrameOnMain()
      NSLog("[MyReaderBookTransition] presentedViewFrame=%@", self.rectString(frame))
      return Double(frame.minY)
    }

    Function("getPresentedViewWidth") { () -> Double in
      Double(self.presentedViewFrameOnMain().width)
    }

    Function("getPresentedViewHeight") { () -> Double in
      Double(self.presentedViewFrameOnMain().height)
    }
  }

  private func startTransition(options: [String: Any]) -> Bool {
    guard
      let window = Self.keyWindow(),
      let direction = options["direction"] as? String,
      let frame = options["frame"] as? [String: Any]
    else {
      NSLog("[MyReaderBookTransition] missing window/direction/frame")
      return false
    }

    activeOverlay?.removeFromSuperview()

    let requestedDuration = ((options["durationMs"] as? Double) ?? 360) / 1000
    let duration = UIAccessibility.isReduceMotionEnabled ? 0 : requestedDuration
    let rootX = frameNumber(options["rootX"])
    let rootY = frameNumber(options["rootY"])
    let measuredFrame = CGRect(
      x: frameNumber(frame["x"]),
      y: frameNumber(frame["y"]),
      width: max(1, frameNumber(frame["width"])),
      height: max(1, frameNumber(frame["height"]))
    )
    let isClosing = direction == "close"
    let bookId = options["bookId"] as? String
    let fallbackSourceFrame = measuredFrame.offsetBy(dx: rootX, dy: rootY)
    let sourceViewTag = intNumber(options["sourceViewTag"])
    let storedSourceFrame = isClosing ? bookId.flatMap { sourceFrames[$0] } : nil
    let nativeSourceFrame = sourceViewTag.flatMap {
      sourceFrameForViewTag($0, in: window)
    }
    let sourceFrame = storedSourceFrame ?? nativeSourceFrame ?? fallbackSourceFrame
    let sourceBorderRadius = max(0, frameNumber(frame["borderRadius"]))
    let bounds = window.bounds
    let coverCachePath = options["coverCachePath"] as? String
    let readerBackgroundColor = color(
      from: options["readerBackgroundColor"] as? String,
      fallback: UIColor(red: 0.98, green: 0.97, blue: 0.94, alpha: 1)
    )
    let readerForegroundColor = color(
      from: options["readerForegroundColor"] as? String,
      fallback: UIColor(red: 0.34, green: 0.27, blue: 0.21, alpha: 1)
    )
    let screenshot = Self.snapshot(window)
    NSLog(
      "[MyReaderBookTransition] start direction=%@ bookId=%@ sourceFrame=%@ fallbackFrame=%@ storedFrame=%@ tag=%@ hasScreenshot=%@",
      direction,
      bookId ?? "nil",
      rectString(sourceFrame),
      rectString(fallbackSourceFrame),
      storedSourceFrame.map { rectString($0) } ?? "nil",
      sourceViewTag.map { String($0) } ?? "nil",
      screenshot == nil ? "false" : "true"
    )
    let sourceCoverImage = isClosing
      ? bookId.flatMap { sourceCoverSnapshots[$0] }
      : loadImage(uriString: coverCachePath, headers: nil)
        ?? screenshot.flatMap { Self.crop($0, frame: sourceFrame, in: bounds) }
    if !isClosing, let bookId, let screenshot {
      sourceSnapshots[bookId] = screenshot
      sourceFrames[bookId] = sourceFrame
      if let sourceCoverImage {
        sourceCoverSnapshots[bookId] = sourceCoverImage
      }
    }
    let sourceBackground = isClosing
      ? bookId.flatMap { sourceSnapshots[$0] }
      : screenshot
    if isClosing {
      NSLog(
        "[MyReaderBookTransition] close hasSourceBackground=%@ cachedCount=%d",
        sourceBackground == nil ? "false" : "true",
        sourceSnapshots.count
      )
    }

    let overlay = UIView(frame: bounds)
    overlay.backgroundColor = .clear
    overlay.isUserInteractionEnabled = false
    overlay.clipsToBounds = false
    overlay.layer.zPosition = CGFloat.greatestFiniteMagnitude
    activeOverlay = overlay

    if let sourceBackground {
      let backgroundView = UIImageView(image: sourceBackground)
      backgroundView.frame = bounds
      backgroundView.contentMode = .scaleToFill
      overlay.addSubview(backgroundView)
    }

    let bookContainer = UIView(frame: bounds)
    bookContainer.backgroundColor = .clear
    bookContainer.clipsToBounds = false
    overlay.addSubview(bookContainer)

    let contentClipView = UIView(frame: bounds)
    contentClipView.backgroundColor = .clear
    contentClipView.clipsToBounds = true
    contentClipView.layer.masksToBounds = true
    contentClipView.layer.cornerCurve = .continuous
    bookContainer.addSubview(contentClipView)

    let contentView = makeContentView(
      bounds: bounds,
      screenshot: isClosing ? screenshot : nil,
      backgroundColor: readerBackgroundColor,
      foregroundColor: readerForegroundColor
    )
    contentView.frame = bounds
    contentClipView.addSubview(contentView)

    let coverView = makeCoverView(
      size: sourceFrame.size,
      coverCachePath: coverCachePath,
      coverImageUri: options["coverImageUri"] as? String,
      coverHeaders: options["coverHeaders"] as? [String: String],
      fallbackImage: sourceCoverImage,
      title: options["title"] as? String,
      borderRadius: sourceBorderRadius
    )

    window.addSubview(overlay)
    overlay.addSubview(coverView)
    let hiddenSiblings: [(UIView, CGFloat)] = isClosing
      ? window.subviews.filter { $0 !== overlay }.map { view in
        let alpha = view.alpha
        view.alpha = 0
        return (view, alpha)
      }
      : []

    let sourceTransform = transform(from: bounds, to: sourceFrame)
    let coverTargetScale = max(bounds.width / sourceFrame.width, bounds.height / sourceFrame.height)
    let coverTargetSize = CGSize(
      width: sourceFrame.width * coverTargetScale,
      height: sourceFrame.height * coverTargetScale
    )
    let coverTargetFrame = CGRect(
      x: 0,
      y: (bounds.height - coverTargetSize.height) / 2,
      width: coverTargetSize.width,
      height: coverTargetSize.height
    )
    let coverTargetBorderRadius = sourceBorderRadius / coverTargetScale
    let contentSourceScale = max(
      0.01,
      (sourceFrame.width / bounds.width + sourceFrame.height / bounds.height) / 2
    )
    let contentSourceBorderRadius = sourceBorderRadius / contentSourceScale
    bookContainer.transform = isClosing ? .identity : sourceTransform
    contentView.frame = bounds
    contentClipView.frame = bounds
    contentClipView.layer.cornerRadius = isClosing
      ? coverTargetBorderRadius
      : contentSourceBorderRadius
    if isClosing {
      setCoverPlacement(coverView, frame: coverTargetFrame, scale: coverTargetScale)
    } else {
      setCoverPlacement(coverView, frame: sourceFrame, scale: 1)
    }
    coverView.layer.cornerRadius = isClosing
      ? coverTargetBorderRadius
      : sourceBorderRadius
    coverView.layer.masksToBounds = true
    coverView.layer.transform = isClosing
      ? coverTransform(open: true, scale: coverTargetScale)
      : coverTransform(open: false, scale: 1)
    coverView.alpha = 1

    UIView.animate(
      withDuration: duration,
      delay: 0,
      options: [.curveEaseInOut, .allowUserInteraction],
      animations: {
        if isClosing {
          bookContainer.transform = sourceTransform
          contentClipView.frame = bounds
          contentView.frame = bounds
          self.setCoverPlacement(coverView, frame: sourceFrame, scale: 1)
        } else {
          bookContainer.transform = .identity
          contentClipView.frame = bounds
          contentView.frame = bounds
          self.setCoverPlacement(coverView, frame: coverTargetFrame, scale: coverTargetScale)
        }
        contentClipView.layer.cornerRadius = isClosing
          ? contentSourceBorderRadius
          : coverTargetBorderRadius
        coverView.layer.cornerRadius = isClosing
          ? sourceBorderRadius
          : coverTargetBorderRadius
        coverView.layer.masksToBounds = true
        coverView.layer.transform = isClosing
          ? self.coverTransform(open: false, scale: 1)
          : self.coverTransform(open: true, scale: coverTargetScale)
        coverView.alpha = isClosing ? 1 : 0
      },
      completion: { _ in
        NSLog(
          "[MyReaderBookTransition] end direction=%@ contentFrame=%@ coverFrame=%@",
          direction,
          self.rectString(contentView.frame),
          self.rectString(coverView.frame)
        )
        let cleanup = {
          overlay.removeFromSuperview()
          if isClosing, let bookId {
            self.sourceSnapshots.removeValue(forKey: bookId)
            self.sourceCoverSnapshots.removeValue(forKey: bookId)
            self.sourceFrames.removeValue(forKey: bookId)
          }
          if !hiddenSiblings.isEmpty {
            hiddenSiblings.forEach { view, alpha in
              view.alpha = alpha
            }
          }
          if self.activeOverlay === overlay {
            self.activeOverlay = nil
          }
        }
        if isClosing {
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.04, execute: cleanup)
        } else {
          cleanup()
        }
      }
    )
    return true
  }

  private func setCoverPlacement(_ view: UIView, frame: CGRect, scale: CGFloat) {
    view.layer.anchorPoint = CGPoint(x: 0, y: 0.5)
    view.layer.position = CGPoint(x: frame.minX, y: frame.midY)
  }

  private func makeContentView(
    bounds: CGRect,
    screenshot: UIImage?,
    backgroundColor: UIColor,
    foregroundColor: UIColor
  ) -> UIView {
    if let screenshot {
      let imageView = UIImageView(image: screenshot)
      imageView.contentMode = .scaleToFill
      imageView.backgroundColor = backgroundColor
      return imageView
    }

    let view = UIView(frame: bounds)
    view.backgroundColor = backgroundColor

    let indicator = UIActivityIndicatorView(style: .medium)
    indicator.color = foregroundColor.withAlphaComponent(0.34)
    indicator.center = CGPoint(x: bounds.midX, y: bounds.midY)
    indicator.autoresizingMask = [
      .flexibleLeftMargin,
      .flexibleRightMargin,
      .flexibleTopMargin,
      .flexibleBottomMargin,
    ]
    indicator.startAnimating()
    view.addSubview(indicator)

    return view
  }

  private func color(from value: String?, fallback: UIColor) -> UIColor {
    guard var text = value?.trimmingCharacters(in: .whitespacesAndNewlines) else {
      return fallback
    }
    if text.hasPrefix("#") {
      text.removeFirst()
    }
    guard text.count == 6, let rgb = Int(text, radix: 16) else {
      return fallback
    }
    return UIColor(
      red: CGFloat((rgb >> 16) & 0xff) / 255,
      green: CGFloat((rgb >> 8) & 0xff) / 255,
      blue: CGFloat(rgb & 0xff) / 255,
      alpha: 1
    )
  }

  private func makeCoverView(
    size: CGSize,
    coverCachePath: String?,
    coverImageUri: String?,
    coverHeaders: [String: String]?,
    fallbackImage: UIImage?,
    title: String?,
    borderRadius: CGFloat
  ) -> UIView {
    let bounds = CGRect(origin: .zero, size: size)
    let view = UIView(frame: bounds)
    view.backgroundColor = UIColor(red: 0.29, green: 0.22, blue: 0.16, alpha: 1)
    view.clipsToBounds = true
    view.layer.masksToBounds = true
    view.layer.cornerRadius = borderRadius
    view.layer.cornerCurve = .continuous

    if let image = loadImage(uriString: coverCachePath, headers: nil)
      ?? fallbackImage
      ?? loadImage(uriString: coverImageUri, headers: coverHeaders) {
      let imageView = UIImageView(image: image)
      imageView.frame = bounds
      imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      imageView.contentMode = .scaleAspectFill
      imageView.clipsToBounds = true
      view.addSubview(imageView)
    } else {
      let label = UILabel(frame: bounds.insetBy(dx: 32, dy: 32))
      label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      label.text = title
      label.textColor = .white
      label.font = .boldSystemFont(ofSize: 22)
      label.textAlignment = .center
      label.numberOfLines = 4
      view.addSubview(label)
    }

    return view
  }

  private func coverTransform(open: Bool, scale: CGFloat) -> CATransform3D {
    var transform = CATransform3DIdentity
    transform.m34 = -1 / 1200
    transform = CATransform3DScale(transform, scale, scale, 1)
    return CATransform3DRotate(transform, open ? -.pi * 0.62 : 0, 0, 1, 0)
  }

  private func transform(from bounds: CGRect, to frame: CGRect) -> CGAffineTransform {
    let scaleX = frame.width / bounds.width
    let scaleY = frame.height / bounds.height
    let translateX = frame.midX - bounds.midX
    let translateY = frame.midY - bounds.midY
    return CGAffineTransform(translationX: translateX, y: translateY)
      .scaledBy(x: scaleX, y: scaleY)
  }

  private func loadImage(uriString: String?, headers: [String: String]?) -> UIImage? {
    guard let uriString, let url = URL(string: uriString) else {
      return nil
    }

    if url.isFileURL {
      return UIImage(contentsOfFile: url.path)
    }

    var request = URLRequest(url: url)
    headers?.forEach { key, value in
      request.setValue(value, forHTTPHeaderField: key)
    }

    let data: Data?
    if headers?.isEmpty ?? true {
      data = try? Data(contentsOf: url)
    } else {
      data = try? NSURLConnection.sendSynchronousRequest(
        request,
        returning: nil
      )
    }

    guard let data else {
      return nil
    }
    return UIImage(data: data)
  }

  private func sourceFrameForViewTag(_ tag: Int, in window: UIWindow) -> CGRect? {
    guard tag > 0,
      let view = appContext?.findView(withTag: tag, ofType: UIView.self),
      view.window != nil
    else {
      return nil
    }

    return view.convert(view.bounds, to: window)
  }

  private func frameNumber(_ value: Any?) -> CGFloat {
    if let value = value as? CGFloat { return value }
    if let value = value as? Double { return CGFloat(value) }
    if let value = value as? Int { return CGFloat(value) }
    return 0
  }

  private func intNumber(_ value: Any?) -> Int? {
    if let value = value as? Int { return value }
    if let value = value as? Double { return Int(value) }
    if let value = value as? CGFloat { return Int(value) }
    return nil
  }

  private func rectString(_ rect: CGRect) -> String {
    NSCoder.string(for: rect)
  }

  private func presentedViewFrame() -> CGRect {
    guard let window = Self.keyWindow() else {
      return .zero
    }
    let view = Self.topPresentedView(in: window) ?? window
    let origin = view.convert(CGPoint.zero, to: window)
    return CGRect(origin: origin, size: view.bounds.size)
  }

  private func presentedViewFrameOnMain() -> CGRect {
    if Thread.isMainThread {
      return presentedViewFrame()
    }

    var frame = CGRect.zero
    DispatchQueue.main.sync {
      frame = self.presentedViewFrame()
    }
    return frame
  }

  private static func snapshot(_ view: UIView) -> UIImage? {
    let renderer = UIGraphicsImageRenderer(bounds: view.bounds)
    return renderer.image { _ in
      view.drawHierarchy(in: view.bounds, afterScreenUpdates: false)
    }
  }

  private static func crop(_ image: UIImage, frame: CGRect, in bounds: CGRect) -> UIImage? {
    guard let cgImage = image.cgImage, bounds.width > 0, bounds.height > 0 else {
      return nil
    }

    let scaleX = CGFloat(cgImage.width) / bounds.width
    let scaleY = CGFloat(cgImage.height) / bounds.height
    let cropRect = CGRect(
      x: max(0, frame.minX * scaleX),
      y: max(0, frame.minY * scaleY),
      width: max(1, frame.width * scaleX),
      height: max(1, frame.height * scaleY)
    ).intersection(CGRect(
      x: 0,
      y: 0,
      width: CGFloat(cgImage.width),
      height: CGFloat(cgImage.height)
    ))

    guard !cropRect.isNull, !cropRect.isEmpty else {
      return nil
    }

    guard let cropped = cgImage.cropping(to: cropRect) else {
      return nil
    }
    return UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }

  private static func topPresentedView(in window: UIWindow) -> UIView? {
    topPresentedViewController(from: window.rootViewController)?.view
  }

  private static func topPresentedViewController(
    from root: UIViewController?
  ) -> UIViewController? {
    guard var top = root else {
      return nil
    }

    while let presented = top.presentedViewController {
      top = presented
    }

    if let navigationController = top as? UINavigationController {
      return navigationController.visibleViewController ?? navigationController
    }

    if let tabController = top as? UITabBarController,
      let selected = tabController.selectedViewController {
      return topPresentedViewController(from: selected) ?? tabController
    }

    return top
  }

}
