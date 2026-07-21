import Combine
import ExpoModulesCore
import ReadiumShared
import ReadiumNavigator
import React
import UIKit

/// Expo View hosting a Readium `ReaderViewController` (EPUB / PDF / CBZ).
///
/// Ports the fork's `HybridReadiumView` from Nitro to an Expo Module: props
/// arrive via `Prop`, events are emitted via `dispatchEvent`, and imperative
/// navigation (`goTo`/`goForward`/`goBackward`) is dispatched by the module
/// through the view-tag `registry` (JS passes `findNodeHandle(ref)`).
final class ReadiumView: ExpoView {

  private struct PendingViewportReload {
    let generation: Int
    let anchor: ViewportAnchor
    var fontFamily: String?
  }

  private struct ViewportAnchor {
    let locator: RLocator
    let yRatio: Double?
  }

  private struct ViewportLayoutState: Equatable {
    let fontsLoaded: Bool
    let clientWidth: Int
    let clientHeight: Int
    let scrollWidth: Int
    let scrollHeight: Int
  }

  // MARK: - Props

  var file: ReadiumFileRecord? = nil {
    didSet {
      guard let file = file else { return }
      pendingFileUrl = file.url
      pendingInitialLocation = file.initialLocation.flatMap { locatorRecordToReadium($0) }
      tryLoadBook()
    }
  }

  var preferences: PreferencesRecord? = nil {
    didSet {
      let preserveViewport = preferencesRequireViewportPreservation(
        from: oldValue,
        to: preferences
      )
      let reloadForFontFamily = shouldReloadEPUBForFontFamilyChange(
        from: oldValue,
        to: preferences
      )
      preferencesReceived = true
      tryLoadBook()
      if preserveViewport || viewportAnchor != nil {
        applyPreferencesPreservingViewport(reloadForFontFamily: reloadForFontFamily)
      } else {
        updatePreferences()
      }
    }
  }

  var decorations: [DecorationGroupRecord]? = nil {
    didSet { updateDecorations() }
  }

  var selectionActions: [SelectionActionRecord]? = nil {
    didSet {
      selectionActionsReceived = true
      tryLoadBook()
    }
  }

  var selectionMenu: SelectionMenuRecord? = nil {
    didSet {
      (readerViewController as? EPUBViewController)?.updateSelectionMenu(selectionMenu)
    }
  }

  var customSelectionMenu = false {
    didSet {
      customSelectionMenuReceived = true
      tryLoadBook()
    }
  }

  var fontFamilyDeclarations: [FontFamilyDeclarationRecord]? = nil {
    didSet {
      fontFamilyDeclarationsReceived = true
      tryLoadBook()
    }
  }

  // MARK: - State

  private let readerService = ReaderService()
  private var readerViewController: ReaderViewController?
  private var subscriptions = Set<AnyCancellable>()
  private var inputObserverTokens = Set<InputObservableToken>()
  private var pendingFileUrl: String?
  private var pendingInitialLocation: RLocator?
  private var loadedFileUrl: String?
  private var hasLoadedBook = false
  private var preferencesReceived = false
  private var selectionActionsReceived = false
  private var customSelectionMenuReceived = false
  private var fontFamilyDeclarationsReceived = false
  private var activeDecorationGroups = Set<String>()
  private var preferenceApplyTask: Task<Void, Never>?
  private var preferenceApplyGeneration = 0
  private var viewportAnchor: ViewportAnchor?
  private var suppressLocationEvents = false
  private var pendingLocation: RLocator?
  private var pendingViewportReload: PendingViewportReload?
  private var viewportPresentationFrozen = false

  private var viewController: UIViewController? {
    sequence(first: self, next: { $0.next }).first(where: { $0 is UIViewController }) as? UIViewController
  }

  // MARK: - View-tag registry (imperative navigation lookup)

  static var registry: [Int: ReadiumView] = [:]

  private func registerInRegistry() {
    let tag = self.tag
    if tag != 0 {
      ReadiumView.registry[tag] = self
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    registerInRegistry()
  }

  override func willMove(toSuperview newSuperview: UIView?) {
    super.willMove(toSuperview: newSuperview)
    if newSuperview == nil {
      let tag = self.tag
      if tag != 0 {
        ReadiumView.registry.removeValue(forKey: tag)
      }
      Task { @MainActor [weak self] in
        self?.cleanup()
      }
    }
  }

  // MARK: - Book loading

  private func tryLoadBook() {
    guard let url = pendingFileUrl,
          preferencesReceived,
          selectionActionsReceived,
          customSelectionMenuReceived,
          fontFamilyDeclarationsReceived,
          !hasLoadedBook else {
      return
    }

    hasLoadedBook = true
    let initialLoc = pendingInitialLocation
    pendingFileUrl = nil
    pendingInitialLocation = nil

    loadBook(url: url, location: initialLoc)
  }

  private func loadBook(url: String, location: RLocator?) {
    guard let rootViewController = UIApplication.shared.delegate?.window??.rootViewController else { return }

    loadedFileUrl = url
    let readiumLocator = location

    let actionData: [SelectionActionData]? = {
      let actions = selectionActions ?? []
      guard !actions.isEmpty else { return nil }
      return actions.map { SelectionActionData(id: $0.id, label: $0.label) }
    }()

    readerService.buildViewController(
      url: url,
      bookId: url,
      locator: readiumLocator,
      preferences: preferences,
      selectionActions: actionData,
      fontFamilyDeclarations: fontFamilyDeclarationsToReadium(fontFamilyDeclarations),
      sender: rootViewController,
      completion: { [weak self] vc in
        Task { @MainActor [weak self] in
          guard let self = self else { return }

          if let epubVC = vc as? EPUBViewController {
            epubVC.selectionActionDelegate = self
            epubVC.usesCustomSelectionMenu = self.customSelectionMenu
            epubVC.updateSelectionMenu(self.selectionMenu)
            epubVC.onSelectionChange = { [weak self] locator, selectedText, rect in
              self?.emitSelectionChange(
                locator: locator,
                selectedText: selectedText,
                rect: rect
              )
            }
            epubVC.onSelectionMenuDismiss = { [weak self] in
              self?.dispatchEvent("onSelectionChange", payload: [:])
            }
          } else if let pdfVC = vc as? PDFViewController {
            pdfVC.selectionActionDelegate = self
            pdfVC.onSelectionChange = { [weak self] locator, selectedText in
              self?.emitSelectionChange(locator: locator, selectedText: selectedText)
            }
            pdfVC.onTap = { [weak self] point in
              self?.dispatchTapEvent(at: point)
            }
          }

          self.addViewControllerAsSubview(vc)
        }
      }
    )
  }

  // MARK: - Preferences

  private func preferencesRequireViewportPreservation(
    from previous: PreferencesRecord?,
    to next: PreferencesRecord?
  ) -> Bool {
    guard let previous, let next else { return false }
    return previous.columnCount != next.columnCount ||
      previous.fontFamily != next.fontFamily ||
      previous.fontSize != next.fontSize ||
      previous.fontWeight != next.fontWeight ||
      previous.hyphens != next.hyphens ||
      previous.language != next.language ||
      previous.letterSpacing != next.letterSpacing ||
      previous.ligatures != next.ligatures ||
      previous.lineHeight != next.lineHeight ||
      previous.pageMargins != next.pageMargins ||
      previous.paragraphIndent != next.paragraphIndent ||
      previous.paragraphSpacing != next.paragraphSpacing ||
      previous.publisherStyles != next.publisherStyles ||
      previous.readingProgression != next.readingProgression ||
      previous.scroll != next.scroll ||
      previous.textAlign != next.textAlign ||
      previous.textNormalization != next.textNormalization ||
      previous.typeScale != next.typeScale ||
      previous.verticalText != next.verticalText ||
      previous.wordSpacing != next.wordSpacing
  }

  private func updatePreferences() {
    guard readerViewController != nil else { return }
    guard let prefs = preferences else { return }

    if let epubNavigator = readerViewController?.navigator as? EPUBNavigatorViewController {
      epubNavigator.submitPreferences(preferencesRecordToEPUB(prefs))
    } else if let pdfNavigator = readerViewController?.navigator as? PDFNavigatorViewController {
      pdfNavigator.submitPreferences(preferencesRecordToPDF(prefs))
    }
  }

  private func shouldReloadEPUBForFontFamilyChange(
    from oldPreferences: PreferencesRecord?,
    to newPreferences: PreferencesRecord?
  ) -> Bool {
    guard readerViewController?.navigator is EPUBNavigatorViewController else {
      return false
    }
    return oldPreferences?.fontFamily != newPreferences?.fontFamily
  }

  private func applyPreferencesPreservingViewport(reloadForFontFamily: Bool) {
    guard readerViewController?.navigator is EPUBNavigatorViewController else {
      updatePreferences()
      return
    }

    let generation = preferenceApplyGeneration + 1
    preferenceApplyGeneration = generation
    preferenceApplyTask?.cancel()
    preferenceApplyTask = Task { @MainActor [weak self] in
      guard let self else { return }
      let anchor: ViewportAnchor?
      if let existingAnchor = self.viewportAnchor {
        anchor = existingAnchor
      } else {
        anchor = await self.captureViewportAnchor()
      }
      guard !Task.isCancelled, generation == self.preferenceApplyGeneration else {
        return
      }
      guard let anchor else {
        self.updatePreferences()
        return
      }

      self.viewportAnchor = anchor
      self.suppressLocationEvents = true
      self.setViewportPresentationFrozen(true)

      if reloadForFontFamily, let url = self.loadedFileUrl {
        self.pendingViewportReload = PendingViewportReload(
          generation: generation,
          anchor: anchor,
          fontFamily: self.preferences?.fontFamily
        )
        self.cleanup(keepingViewportTransaction: true)
        self.loadBook(url: url, location: anchor.locator)
        return
      }

      guard let navigator = self.readerViewController?.navigator as? EPUBNavigatorViewController else {
        self.finishViewportPreferenceTransaction()
        return
      }
      self.updatePreferences()
      await self.waitForViewportLayoutStable(navigator)
      guard !Task.isCancelled, generation == self.preferenceApplyGeneration else {
        return
      }

      _ = await navigator.go(
        to: anchor.locator,
        options: NavigatorGoOptions(animated: false)
      )
      await self.waitForViewportLayoutStable(navigator)
      if self.preferences?.scroll == true {
        await self.restoreViewportAnchorOffset(anchor, navigator: navigator)
        await self.waitForViewportLayoutStable(navigator)
      }
      guard !Task.isCancelled, generation == self.preferenceApplyGeneration else {
        return
      }
      self.finishViewportPreferenceTransaction()
    }
  }

  @MainActor
  private func captureViewportAnchor() async -> ViewportAnchor? {
    guard let navigator = readerViewController?.navigator as? EPUBNavigatorViewController,
          let currentLocation = navigator.currentLocation else { return nil }
    guard case let .success(value) = await navigator.evaluateJavaScript(
      captureReaderBookmarkAnchorScript
    ),
      let json = value as? String,
      let data = json.data(using: .utf8),
      let anchor = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let cssSelector = anchor["cssSelector"] as? String,
      let domRange = anchor["domRange"] as? [String: Any],
      let domRangeValue = JSONValue(domRange),
      let text = anchor["text"] as? [String: Any]
    else { return nil }

    return ViewportAnchor(
      locator: currentLocation.copy(
        locations: { locations in
          locations.otherLocations["cssSelector"] = .string(cssSelector)
          locations.otherLocations["domRange"] = domRangeValue
        },
        text: { locatorText in
          locatorText.before = text["before"] as? String
          locatorText.highlight = text["highlight"] as? String
          locatorText.after = text["after"] as? String
        }
      ),
      yRatio: (anchor["yRatio"] as? NSNumber)?.doubleValue
    )
  }

  @MainActor
  private func restoreViewportAnchorOffset(
    _ anchor: ViewportAnchor,
    navigator: EPUBNavigatorViewController
  ) async {
    guard let yRatio = anchor.yRatio,
          let domRange = anchor.locator.locations.otherLocations["domRange"]?.any,
          JSONSerialization.isValidJSONObject(domRange),
          let data = try? JSONSerialization.data(withJSONObject: domRange),
          let json = String(data: data, encoding: .utf8) else { return }
    _ = await navigator.evaluateJavaScript(
      readerViewportAnchorOffsetRestoreScript(
        domRangeJSON: json,
        yRatio: yRatio
      )
    )
  }

  @MainActor
  private func waitForViewportLayoutStable(
    _ navigator: EPUBNavigatorViewController
  ) async {
    var previous: ViewportLayoutState?
    var stableFrames = 0

    for _ in 0..<12 {
      try? await Task.sleep(nanoseconds: 16_000_000)
      guard !Task.isCancelled else { return }
      guard case let .success(value) = await navigator.evaluateJavaScript(
        readerViewportLayoutStateScript
      ),
        let json = value as? String,
        let data = json.data(using: .utf8),
        let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let state = viewportLayoutState(from: object)
      else { continue }

      stableFrames = state.fontsLoaded && state == previous
        ? stableFrames + 1
        : 0
      if stableFrames >= 2 { return }
      previous = state
    }
  }

  private func viewportLayoutState(
    from object: [String: Any]
  ) -> ViewportLayoutState? {
    guard let fontsLoaded = object["fontsLoaded"] as? Bool,
          let clientWidth = (object["clientWidth"] as? NSNumber)?.intValue,
          let clientHeight = (object["clientHeight"] as? NSNumber)?.intValue,
          let scrollWidth = (object["scrollWidth"] as? NSNumber)?.intValue,
          let scrollHeight = (object["scrollHeight"] as? NSNumber)?.intValue else {
      return nil
    }
    return ViewportLayoutState(
      fontsLoaded: fontsLoaded,
      clientWidth: clientWidth,
      clientHeight: clientHeight,
      scrollWidth: scrollWidth,
      scrollHeight: scrollHeight
    )
  }

  @MainActor
  private func resumeViewportPreferenceReloadIfNeeded(
    _ navigator: EPUBNavigatorViewController
  ) {
    guard var pending = pendingViewportReload else { return }
    guard pending.generation == preferenceApplyGeneration else { return }

    if pending.fontFamily != preferences?.fontFamily,
       let url = loadedFileUrl {
      pending.fontFamily = preferences?.fontFamily
      pendingViewportReload = pending
      cleanup(keepingViewportTransaction: true)
      loadBook(url: url, location: pending.anchor.locator)
      return
    }

    preferenceApplyTask = Task { @MainActor [weak self] in
      guard let self else { return }
      await self.waitForViewportLayoutStable(navigator)
      guard !Task.isCancelled,
            pending.generation == self.preferenceApplyGeneration else { return }
      _ = await navigator.go(
        to: pending.anchor.locator,
        options: NavigatorGoOptions(animated: false)
      )
      await self.waitForViewportLayoutStable(navigator)
      if self.preferences?.scroll == true {
        await self.restoreViewportAnchorOffset(
          pending.anchor,
          navigator: navigator
        )
        await self.waitForViewportLayoutStable(navigator)
      }
      guard !Task.isCancelled,
            pending.generation == self.preferenceApplyGeneration else { return }
      self.pendingViewportReload = nil
      self.finishViewportPreferenceTransaction()
    }
  }

  @MainActor
  private func finishViewportPreferenceTransaction() {
    let finalLocation =
      (readerViewController?.navigator as? EPUBNavigatorViewController)?.currentLocation ??
      pendingLocation
    viewportAnchor = nil
    pendingLocation = nil
    suppressLocationEvents = false
    setViewportPresentationFrozen(false)
    if let finalLocation {
      dispatchLocation(finalLocation)
    }
  }

  @MainActor
  private func setViewportPresentationFrozen(_ frozen: Bool) {
    viewportPresentationFrozen = frozen
    readerViewController?.view.layer.opacity = frozen ? 0 : 1
  }

  private func dispatchLocation(_ locator: RLocator) {
    dispatchEvent(
      "onLocationChange",
      payload: ["locator": locatorToDict(locator)] as [String: Any]
    )
  }

  // MARK: - Decorations

  private func updateDecorations() {
    guard readerViewController != nil else { return }
    guard let groups = decorations else { return }
    guard let navigator = readerViewController?.navigator as? DecorableNavigator else { return }

    for group in groups {
      let readiumDecorations = (group.decorations ?? []).compactMap { decorationRecordToReadium($0) }
      navigator.apply(decorations: readiumDecorations, in: group.name)

      if !activeDecorationGroups.contains(group.name) {
        activeDecorationGroups.insert(group.name)

        navigator.observeDecorationInteractions(inGroup: group.name) { [weak self] event in
          guard let self = self else { return }

          var payload: [String: Any] = [
            "decoration": decorationToDict(event.decoration, group: event.group),
            "group": event.group,
          ]
          if let rect = event.rect {
            payload["rect"] = [
              "x": rect.origin.x,
              "y": rect.origin.y,
              "width": rect.size.width,
              "height": rect.size.height,
            ] as [String: Any]
          }
          if let point = event.point {
            payload["point"] = ["x": point.x, "y": point.y] as [String: Any]
          }

          self.dispatchEvent("onDecorationActivated", payload: payload)
        }
      }
    }
  }

  // MARK: - View lifecycle

  @MainActor
  private func addViewControllerAsSubview(_ vc: ReaderViewController) {
    vc.publisher.sink { [weak self] locator in
      guard let self = self else { return }
      if self.suppressLocationEvents {
        self.pendingLocation = locator
      } else {
        self.dispatchLocation(locator)
      }
    }
    .store(in: &subscriptions)

    readerViewController = vc
    vc.view.layer.opacity = viewportPresentationFrozen ? 0 : 1
    let bookId = vc.bookId
    PublicationStore.shared.set(bookId, vc.publication)

    // Forward single taps in the center 50% to JS so the React Native chrome
    // can toggle; edge taps are left for Readium's default navigation gestures.
    // PDF is handled separately through a dedicated gesture recognizer because
    // PDFKit consumes the navigator's generic tap observer.
    if let visualNavigator = vc.navigator as? VisualNavigator {
      let isPDF = vc.navigator is PDFNavigatorViewController
      let tapToken = visualNavigator.addObserver(.tap { [weak self, weak visualNavigator] event in
        guard let self, event.phase != .cancel else { return false }
        guard !isPDF else { return false }
        guard let bounds = visualNavigator?.view.bounds,
              bounds.width > 0 && bounds.height > 0 else { return false }

        let xRatio = event.location.x / bounds.width
        let yRatio = event.location.y / bounds.height
        let inCenterRegion =
          xRatio >= 0.25 && xRatio <= 0.75 &&
          yRatio >= 0.25 && yRatio <= 0.75
        guard inCenterRegion else { return false }

        self.dispatchTapEvent(at: event.location)
        return false
      })
      tapToken.store(in: &inputObserverTokens)
    }

    // Apply pending state once the navigator exists.
    if preferences != nil { updatePreferences() }
    if decorations != nil { updateDecorations() }

    guard let parentVC = viewController, self.superview != nil else { return }

    vc.view.frame = self.bounds
    parentVC.addChild(vc)
    self.addSubview(vc.view)
    vc.didMove(toParent: parentVC)

    vc.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      vc.view.topAnchor.constraint(equalTo: self.topAnchor),
      vc.view.bottomAnchor.constraint(equalTo: self.bottomAnchor),
      vc.view.leftAnchor.constraint(equalTo: self.leftAnchor),
      vc.view.rightAnchor.constraint(equalTo: self.rightAnchor),
    ])

    if let epubNavigator = vc.navigator as? EPUBNavigatorViewController {
      resumeViewportPreferenceReloadIfNeeded(epubNavigator)
    }

    Task { @MainActor [weak self] in
      guard let self = self else { return }

      let tocResult = await vc.publication.tableOfContents()
      let positionsResult = await vc.publication.positions()

      let toc = (try? tocResult.get()).map { flattenLinksToDicts($0) } ?? []
      let positions = (try? positionsResult.get()).map { $0.map { locatorToDict($0) } } ?? []
      let metadata = metadataToDict(vc.publication.metadata)
      let selectable = vc.navigator is SelectableNavigator
      let decorable = vc.navigator as? DecorableNavigator
      let supportedDecorationStyles = [
        Decoration.Style.Id.highlight,
        Decoration.Style.Id.underline,
        readerNoteMarkerStyleId,
      ].filter { decorable?.supports(decorationStyle: $0) == true }
        .map(\.rawValue)

      self.dispatchEvent("onPublicationReady", payload: [
        "publicationId": bookId,
        "tableOfContents": toc,
        "positions": positions,
        "metadata": metadata,
        "capabilities": [
          "canSelectText": selectable,
          "canDecorate": decorable != nil,
          "supportedDecorationStyles": supportedDecorationStyles,
        ] as [String: Any],
      ] as [String: Any])
    }
  }

  // MARK: - Tap forwarding

  private func dispatchTapEvent(at point: CGPoint) {
    dispatchEvent("onTap", payload: [
      "point": ["x": Double(point.x), "y": Double(point.y)] as [String: Any]
    ] as [String: Any])
  }

  // MARK: - Imperative navigation (called by ReadiumModule via tag lookup)

  func goTo(locator: LocatorRecord) {
    Task { @MainActor [weak self] in
      guard let self = self else { return }
      guard let navigator = self.readerViewController?.navigator,
            let readiumLocator = locatorRecordToReadium(locator) else { return }
      _ = await navigator.go(to: readiumLocator, options: .animated)
    }
  }

  func goForward() {
    Task { @MainActor [weak self] in
      guard let self = self, let navigator = self.readerViewController?.navigator else { return }
      _ = await navigator.goForward(options: .animated)
    }
  }

  func goBackward() {
    Task { @MainActor [weak self] in
      guard let self = self, let navigator = self.readerViewController?.navigator else { return }
      _ = await navigator.goBackward(options: .animated)
    }
  }

  func clearSelection() {
    Task { @MainActor [weak self] in
      (self?.readerViewController?.navigator as? SelectableNavigator)?.clearSelection()
    }
  }

  @MainActor
  func getBookmarkLocator() async -> [String: Any]? {
    await captureViewportAnchor().map { locatorToDict($0.locator) }
  }

  @MainActor
  func isBookmarkVisible(locator: LocatorRecord) async -> Bool {
    guard let navigator = readerViewController?.navigator as? EPUBNavigatorViewController,
          let domRange = locator.locations?.domRange,
          JSONSerialization.isValidJSONObject(domRange),
          let data = try? JSONSerialization.data(withJSONObject: domRange),
          let json = String(data: data, encoding: .utf8),
          case let .success(value) = await navigator.evaluateJavaScript(
            readerBookmarkVisibilityScript(domRangeJSON: json)
          ),
          let result = value as? String
    else { return false }
    return result == "true"
  }

  // MARK: - Selection emission

  private func emitSelectionChange(
    locator: RLocator,
    selectedText: String,
    rect: CGRect? = nil
  ) {
    var payload: [String: Any] = [
      "locator": locatorToDict(locator),
      "selectedText": selectedText,
    ]
    if let rect {
      payload["rect"] = [
        "x": rect.origin.x,
        "y": rect.origin.y,
        "width": rect.size.width,
        "height": rect.size.height,
      ]
    }
    dispatchEvent("onSelectionChange", payload: payload)
  }

  // MARK: - Cleanup

  @MainActor
  func cleanup(keepingViewportTransaction: Bool = false) {
    if !keepingViewportTransaction {
      preferenceApplyGeneration += 1
      preferenceApplyTask?.cancel()
      preferenceApplyTask = nil
      viewportAnchor = nil
      pendingLocation = nil
      suppressLocationEvents = false
      pendingViewportReload = nil
      viewportPresentationFrozen = false
    }
    guard let vc = readerViewController else { return }
    readerViewController = nil
    PublicationStore.shared.remove(vc.bookId, ifSameAs: vc.publication)

    if let visualNavigator = vc.navigator as? VisualNavigator {
      inputObserverTokens.forEach { visualNavigator.removeObserver($0) }
    }
    inputObserverTokens.removeAll()

    vc.willMove(toParent: nil)
    if vc.view.superview != nil {
      vc.view.removeFromSuperview()
    }
    vc.removeFromParent()

    for subscription in subscriptions {
      subscription.cancel()
    }
    subscriptions = Set<AnyCancellable>()
    activeDecorationGroups.removeAll()
  }
}

// MARK: - SelectionActionDelegate

extension ReadiumView: SelectionActionDelegate {
  func onSelectionAction(actionId: String, locator: RLocator, selectedText: String) {
    dispatchEvent("onSelectionAction", payload: [
      "locator": locatorToDict(locator),
      "selectedText": selectedText,
      "actionId": actionId,
    ] as [String: Any])
  }
}
