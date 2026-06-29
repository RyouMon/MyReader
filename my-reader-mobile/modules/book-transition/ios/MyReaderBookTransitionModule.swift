import ExpoModulesCore
import UIKit

public class MyReaderBookTransitionModule: Module {
  private var activeOverlay: UIView?
  private var sourceSnapshots: [String: UIImage] = [:]
  private var sourceCoverSnapshots: [String: UIImage] = [:]

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

    let duration = ((options["durationMs"] as? Double) ?? 780) / 1000
    let sourceFrame = CGRect(
      x: frameNumber(frame["x"]),
      y: frameNumber(frame["y"]),
      width: max(1, frameNumber(frame["width"])),
      height: max(1, frameNumber(frame["height"]))
    )
    let bounds = window.bounds
    let isClosing = direction == "close"
    let bookId = options["bookId"] as? String
    let screenshot = Self.snapshot(window)
    NSLog(
      "[MyReaderBookTransition] start direction=%@ bookId=%@ sourceFrame=%@ hasScreenshot=%@",
      direction,
      bookId ?? "nil",
      rectString(sourceFrame),
      screenshot == nil ? "false" : "true"
    )
    let sourceCoverImage = isClosing
      ? bookId.flatMap { sourceCoverSnapshots[$0] }
      : screenshot.flatMap { Self.crop($0, frame: sourceFrame, in: bounds) }
    if !isClosing, let bookId, let screenshot {
      sourceSnapshots[bookId] = screenshot
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

    let contentView = makeContentView(
      bounds: bounds,
      screenshot: isClosing ? screenshot : nil,
      title: options["title"] as? String
    )
    contentView.frame = bounds
    bookContainer.addSubview(contentView)

    let coverView = makeCoverView(
      bounds: bounds,
      coverImageUri: options["coverImageUri"] as? String,
      coverHeaders: options["coverHeaders"] as? [String: String],
      fallbackImage: sourceCoverImage,
      title: options["title"] as? String
    )
    setCoverFrame(coverView, frame: bounds)
    bookContainer.addSubview(coverView)

    window.addSubview(overlay)
    let hiddenSiblings: [(UIView, CGFloat)] = isClosing
      ? window.subviews.filter { $0 !== overlay }.map { view in
        let alpha = view.alpha
        view.alpha = 0
        return (view, alpha)
      }
      : []

    let sourceTransform = transform(from: bounds, to: sourceFrame)
    bookContainer.transform = isClosing ? .identity : sourceTransform
    contentView.frame = bounds
    if isClosing {
      setCoverFrame(coverView, frame: bounds)
    }
    coverView.layer.transform = isClosing ? coverTransform(open: true) : CATransform3DIdentity
    coverView.alpha = 1

    UIView.animate(
      withDuration: duration,
      delay: 0,
      options: [.curveEaseInOut, .allowUserInteraction],
      animations: {
        if isClosing {
          contentView.frame = sourceFrame
          self.setCoverFrame(coverView, frame: sourceFrame)
        } else {
          bookContainer.transform = .identity
        }
        coverView.layer.transform = isClosing ? CATransform3DIdentity : self.coverTransform(open: true)
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

  private func setCoverFrame(_ view: UIView, frame: CGRect) {
    view.bounds = CGRect(origin: .zero, size: frame.size)
    view.layer.anchorPoint = CGPoint(x: 0, y: 0.5)
    view.layer.position = CGPoint(x: frame.minX, y: frame.midY)
  }

  private func makeContentView(bounds: CGRect, screenshot: UIImage?, title: String?) -> UIView {
    if let screenshot {
      let imageView = UIImageView(image: screenshot)
      imageView.contentMode = .scaleToFill
      imageView.backgroundColor = .black
      return imageView
    }

    let view = UIView(frame: bounds)
    view.backgroundColor = UIColor.systemBackground

    let insetX = max(24, bounds.width * 0.1)
    var y = max(48, bounds.height * 0.12)
    for index in 0..<12 {
      let width = (index % 4 == 3) ? bounds.width * 0.5 : bounds.width - insetX * 2
      let line = UIView(frame: CGRect(x: insetX, y: y, width: width, height: 6))
      line.backgroundColor = UIColor.separator.withAlphaComponent(0.45)
      line.layer.cornerRadius = 3
      view.addSubview(line)
      y += 18
    }

    return view
  }

  private func makeCoverView(
    bounds: CGRect,
    coverImageUri: String?,
    coverHeaders: [String: String]?,
    fallbackImage: UIImage?,
    title: String?
  ) -> UIView {
    let view = UIView(frame: bounds)
    view.backgroundColor = UIColor(red: 0.29, green: 0.22, blue: 0.16, alpha: 1)
    view.clipsToBounds = true

    if let image = fallbackImage ?? loadImage(uriString: coverImageUri, headers: coverHeaders) {
      let imageView = UIImageView(image: image)
      imageView.frame = bounds
      imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      imageView.contentMode = .scaleToFill
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

  private func coverTransform(open: Bool) -> CATransform3D {
    var transform = CATransform3DIdentity
    transform.m34 = -1 / 1200
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

  private func frameNumber(_ value: Any?) -> CGFloat {
    if let value = value as? CGFloat { return value }
    if let value = value as? Double { return CGFloat(value) }
    if let value = value as? Int { return CGFloat(value) }
    return 0
  }

  private func rectString(_ rect: CGRect) -> String {
    NSCoder.string(for: rect)
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
}
