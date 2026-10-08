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

  let onLocationChange = EventDispatcher()
  let onPublicationReady = EventDispatcher()
  let onDecorationActivated = EventDispatcher()
  let onSelectionChange = EventDispatcher()
  let onSelectionAction = EventDispatcher()
  let onTap = EventDispatcher()
  let onTtsStateChange = EventDispatcher()
  let onTtsSynthesisRequest = EventDispatcher()
  let onTtsSynthesisCancel = EventDispatcher()

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
      guard oldValue.map(preferencesRecordToEPUB) != preferences.map(preferencesRecordToEPUB) else {
        return
      }
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
  private var ttsController: EPUBTtsController?
  private var ttsGeneration = 0
  private var ttsSessionId: String?
  private let ttsNavigationState = TtsPlaybackNavigationState()
  private var userNavigationResetTask: Task<Void, Never>?
  private var activeDragNavigationId: String?
  private var viewportLocationTask: Task<Void, Never>?
  private var lastDispatchedHref: String?

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
            epubVC.onViewportChange = { [weak self] viewport in
              self?.handleViewportChange(viewport)
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
    lastDispatchedHref = locator.href.string
    var payload = ["locator": locatorToDict(locator)] as [String: Any]
    let navigation = ttsNavigationState.locationEvent()
    if let source = navigation.source { payload["source"] = source }
    if let navigationId = navigation.navigationId {
      payload["navigationId"] = navigationId
      userNavigationResetTask?.cancel()
      userNavigationResetTask = nil
      if activeDragNavigationId == navigationId {
        activeDragNavigationId = nil
      }
    }
    if let navigationKind = navigation.navigationKind {
      payload["navigationKind"] = navigationKind
    }
    dispatchEvent(
      "onLocationChange",
      payload: payload
    )
  }

  @MainActor
  private func handleViewportChange(_ viewport: NavigatorViewport?) {
    guard ttsSessionId != nil,
          !suppressLocationEvents,
          let viewport,
          let navigator = readerViewController?.navigator
            as? EPUBNavigatorViewController else { return }

    ttsNavigationState.viewportDidChange()
    let shouldDetectViewportDeparture =
      ttsNavigationState.allowsTtsFollow &&
      !ttsNavigationState.isReturningToPlaybackPosition
    let playbackLocator = ttsController?.playbackLocator

    viewportLocationTask?.cancel()
    viewportLocationTask = Task { @MainActor [weak self, weak navigator] in
      guard let self, let navigator else { return }
      let locator = await self.captureViewportStartLocator(
        fallback: navigator.currentLocation,
        navigator: navigator
      )
      guard !Task.isCancelled,
            navigator.viewport == viewport,
            let locator else { return }
      if shouldDetectViewportDeparture,
         self.ttsNavigationState.allowsTtsFollow,
         let playbackLocator {
        let playbackIsVisible = await self.isTtsLocatorVisible(
          playbackLocator,
          currentHref: locator.href.string,
          navigator: navigator
        )
        if !playbackIsVisible {
          self.beginUserNavigation()
        }
      }
      self.dispatchLocation(locator)
      self.viewportLocationTask = nil
    }
  }

  private func markTtsFollowTextNavigation(
    id: UUID,
    locator: RLocator,
    active: Bool
  ) {
    if active { ttsNavigationState.beginTtsFollow() }
    else { ttsNavigationState.endTtsFollow() }
  }

  private func clearTtsFollowTextNavigation() {
    userNavigationResetTask?.cancel()
    userNavigationResetTask = nil
    activeDragNavigationId = nil
    viewportLocationTask?.cancel()
    viewportLocationTask = nil
    ttsNavigationState.resetForSession()
  }

  @discardableResult
  private func beginUserNavigation(
    detachViewport: Bool = true,
    scheduleReset: Bool = true
  ) -> String {
    userNavigationResetTask?.cancel()
    let navigationId = ttsNavigationState.beginUserNavigation(
      detachViewport: detachViewport
    )
    if scheduleReset {
      scheduleUserNavigationReset(navigationId)
    }
    ttsController?.prepareForUserNavigation()
    return navigationId
  }

  private func scheduleUserNavigationReset(_ navigationId: String) {
    userNavigationResetTask?.cancel()
    userNavigationResetTask = Task { @MainActor [weak self] in
      try? await Task.sleep(nanoseconds: 3_000_000_000)
      guard let self, !Task.isCancelled else { return }
      _ = self.ttsNavigationState.cancelUserNavigationIfUnchanged(navigationId)
      self.userNavigationResetTask = nil
    }
  }

  private func finishUserNavigationGesture() {
    guard let navigationId = activeDragNavigationId else { return }
    activeDragNavigationId = nil
    scheduleUserNavigationReset(navigationId)
  }

  private func cancelUserNavigationGesture() {
    guard let navigationId = activeDragNavigationId else { return }
    activeDragNavigationId = nil
    // Readium cancels this observer when its pagination recognizer takes over,
    // including for a successful page turn. Let the viewport event settle it.
    scheduleUserNavigationReset(navigationId)
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

        guard inCenterRegion else {
          self.beginUserNavigation()
          return false
        }

        self.dispatchTapEvent(at: event.location)
        return false
      })
      tapToken.store(in: &inputObserverTokens)
      let dragToken = visualNavigator.addObserver(.drag(
        onStart: { [weak self] _ in
          guard let self else { return false }
          self.activeDragNavigationId = self.beginUserNavigation(
            scheduleReset: false
          )
          return false
        },
        onEnd: { [weak self] _ in
          self?.finishUserNavigationGesture()
          return false
        },
        onCancel: { [weak self] _ in
          self?.cancelUserNavigationGesture()
          return false
        }
      ))
      dragToken.store(in: &inputObserverTokens)
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
    let payload: [String: Any] = [
      "point": ["x": Double(point.x), "y": Double(point.y)] as [String: Any]
    ]
    dispatchEvent("onTap", payload: payload)
  }

  @MainActor
  private func captureViewportStartLocator(
    fallback: Locator?,
    navigator: EPUBNavigatorViewController
  ) async -> Locator? {
    let navigatorLocation = navigator.currentLocation
    guard var currentLocation = navigatorLocation ?? fallback else { return nil }

    let visibleResources = navigator.viewport?.resources ?? []
    let href = ttsViewportStartHref(
      currentHref: navigatorLocation?.href.string,
      fallbackHref: fallback?.href.string,
      visibleHrefs: visibleResources.map { $0.href.string }
    ) ?? currentLocation.href.string
    if currentLocation.href.string != href,
       let visibleResource = visibleResources.first(where: { $0.href.string == href }) {
      currentLocation = currentLocation.copy(
        href: visibleResource.href,
        locations: { locations in
          locations = Locator.Locations(
            progression: visibleResource.progression.lowerBound
          )
        },
        text: { text in
          text = Locator.Text()
        }
      )
    }

    guard case let .success(value) = await navigator.evaluateJavaScript(
            captureReaderViewportStartAnchorScript
          ),
          let json = value as? String,
          let data = json.data(using: .utf8),
          let anchor = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return currentLocation }

    return locator(applying: anchor, to: currentLocation) ?? currentLocation
  }

  private func locator(
    applying anchor: [String: Any],
    to currentLocation: Locator
  ) -> Locator? {
    guard let cssSelector = anchor["cssSelector"] as? String,
          let domRange = anchor["domRange"] as? [String: Any],
          let domRangeValue = JSONValue(domRange),
          let text = anchor["text"] as? [String: Any]
    else { return nil }

    return ttsViewportStartLocator(
      current: currentLocation,
      cssSelector: cssSelector,
      domRange: domRangeValue,
      text: Locator.Text(
        after: text["after"] as? String,
        before: text["before"] as? String,
        highlight: text["highlight"] as? String
      )
    )
  }

  // MARK: - Imperative navigation (called by ReadiumModule via tag lookup)

  func goTo(locator: LocatorRecord, preferences: PreferencesRecord? = nil) {
    Task { @MainActor [weak self] in
      guard let self = self else { return }
      let requestedFileURL = self.file?.url
      if let preferences { self.preferences = preferences }
      // Wait for layout restoration before applying the requested destination.
      var generation: Int
      repeat {
        generation = self.preferenceApplyGeneration
        await self.preferenceApplyTask?.value
      } while generation != self.preferenceApplyGeneration
      guard self.file?.url == requestedFileURL,
            let navigator = self.readerViewController?.navigator,
            let readiumLocator = locatorRecordToReadium(locator) else { return }
      self.beginUserNavigation(detachViewport: false)
      _ = await navigator.go(to: readiumLocator, options: .animated)
    }
  }

  func goForward() {
    Task { @MainActor [weak self] in
      guard let self = self, let navigator = self.readerViewController?.navigator else { return }
      self.beginUserNavigation()
      _ = await navigator.goForward(options: .animated)
    }
  }

  func goBackward() {
    Task { @MainActor [weak self] in
      guard let self = self, let navigator = self.readerViewController?.navigator else { return }
      self.beginUserNavigation()
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
  private func isTtsLocatorVisible(
    href: String,
    progression: Double?,
    domRange: [String: Any]?,
    currentHref: String?,
    navigator: EPUBNavigatorViewController
  ) async -> Bool {
    let visibleProgressions = Dictionary(
      navigator.viewport?.resources.map {
        ($0.href.string, $0.progression)
      } ?? [],
      uniquingKeysWith: { _, latest in latest }
    )
    let progressionVisibility = ttsProgressionIsVisible(
      targetHref: href,
      targetProgression: progression,
      visibleProgressions: visibleProgressions
    )

    var domRangeVisibility: Bool?
    if ttsFollowStaysInCurrentResource(
      currentHref: currentHref,
      targetHref: href
    ),
       let domRange,
       JSONSerialization.isValidJSONObject(domRange),
       let data = try? JSONSerialization.data(withJSONObject: domRange),
       let json = String(data: data, encoding: .utf8),
       case let .success(value) = await navigator.evaluateJavaScript(
         readerBookmarkVisibilityScript(domRangeJSON: json)
       ),
       let result = value as? String {
      domRangeVisibility = result == "true"
    }

    return ttsLocatorIsVisible(
      progressionVisibility: progressionVisibility,
      domRangeVisibility: domRangeVisibility
    )
  }

  @MainActor
  private func isTtsLocatorVisible(
    _ locator: RLocator,
    currentHref: String? = nil,
    navigator: EPUBNavigatorViewController
  ) async -> Bool {
    let href = locator.href.string
    let visibleProgressions = Dictionary(
      navigator.viewport?.resources.map {
        ($0.href.string, $0.progression)
      } ?? [],
      uniquingKeysWith: { _, latest in latest }
    )
    let progressionVisibility = ttsProgressionIsVisible(
      targetHref: href,
      targetProgression: locator.locations.progression,
      visibleProgressions: visibleProgressions
    )

    var textVisibility: Bool?
    if ttsFollowStaysInCurrentResource(
      currentHref: currentHref ?? lastDispatchedHref
        ?? navigator.currentLocation?.href.string,
      targetHref: href
    ),
       let json = try? locator.jsonString(),
       case let .success(value) = await navigator.evaluateJavaScript(
         readerTextLocatorVisibilityScript(locatorJSON: json)
       ),
       let result = value as? String {
      textVisibility = result == "true"
    }

    return ttsLocatorIsVisible(
      progressionVisibility: progressionVisibility,
      domRangeVisibility: textVisibility
    )
  }

  @MainActor
  func isBookmarkVisible(locator: LocatorRecord) async -> Bool {
    guard let navigator = readerViewController?.navigator as? EPUBNavigatorViewController else {
      return false
    }
    return await isTtsLocatorVisible(
      href: locator.href,
      progression: locator.locations?.progression,
      domRange: locator.locations?.domRange,
      currentHref: lastDispatchedHref ?? navigator.currentLocation?.href.string,
      navigator: navigator
    )
  }

  @MainActor
  func reattachTtsViewport(
    sessionId: String,
    viewportNavigationId: String
  ) async -> Bool {
    guard let navigator = readerViewController?.navigator
            as? EPUBNavigatorViewController,
          let controller = ttsController else { return false }
    for attempt in 0..<4 {
      guard sessionId == ttsSessionId,
            let playbackLocator = controller.playbackLocator else { return false }
      let visible = await isTtsLocatorVisible(
        playbackLocator,
        navigator: navigator
      )
      guard sessionId == ttsSessionId else { return false }
      if controller.playbackLocator != playbackLocator {
        continue
      }
      if visible {
        return ttsNavigationState.reattachViewport(
          navigationId: viewportNavigationId
        )
      }
      if attempt < 3 {
        try? await Task.sleep(nanoseconds: 16_000_000)
      }
    }
    return false
  }

  @MainActor
  func returnToTtsPosition(
    sessionId: String,
    viewportNavigationId: String
  ) async -> Bool {
    guard sessionId == ttsSessionId,
          let controller = ttsController,
          let navigator = readerViewController?.navigator
            as? EPUBNavigatorViewController,
          ttsNavigationState.returnToPlaybackPosition(
            navigationId: viewportNavigationId
          ) else { return false }

    var returned = false
    defer {
      ttsNavigationState.completeReturnToPlaybackPosition(
        navigationId: viewportNavigationId,
        succeeded: returned
      )
    }

    navigationAttempts: for _ in 0..<4 {
      guard sessionId == ttsSessionId,
            ttsNavigationState.allowsTtsFollow,
            let playbackLocator = controller.playbackLocator else { return false }

      let alreadyVisible = await isTtsLocatorVisible(
        playbackLocator,
        navigator: navigator
      )
      guard sessionId == ttsSessionId,
            ttsNavigationState.allowsTtsFollow else { return false }
      if controller.playbackLocator != playbackLocator {
        continue
      }
      if alreadyVisible {
        returned = true
        return true
      }

      let moved = await controller.navigateToPlaybackLocator(
        playbackLocator,
        animated: false
      )
      guard sessionId == ttsSessionId,
            ttsNavigationState.allowsTtsFollow else { return false }
      if controller.playbackLocator != playbackLocator {
        continue
      }
      guard moved else { return false }

      for settleAttempt in 0..<12 {
        guard sessionId == ttsSessionId,
              ttsNavigationState.allowsTtsFollow else { return false }
        if controller.playbackLocator != playbackLocator {
          continue navigationAttempts
        }
        if await isTtsLocatorVisible(playbackLocator, navigator: navigator) {
          returned = true
          return true
        }
        if settleAttempt < 11 {
          try? await Task.sleep(nanoseconds: 50_000_000)
        }
      }
      return false
    }
    return false
  }

  // MARK: - TTS

  func startTts(
    sessionId: String,
    config: TtsEngineConfigRecord,
    from locator: LocatorRecord?,
    startAtViewportStart: Bool,
    viewportDetached: Bool,
    viewportNavigationId: String?
  ) {
    Task { @MainActor [weak self] in
      guard let self else { return }
      self.ttsSessionId = sessionId
      guard let epub = self.readerViewController as? EPUBViewController else {
        self.dispatchEvent(
          "onTtsStateChange",
          payload: [
            "sessionId": sessionId,
            "state": "error",
            "error": "TTS is only available for EPUB publications.",
          ]
        )
        return
      }

      if viewportDetached {
        self.ttsNavigationState.detachViewportForSession(
          navigationId: viewportNavigationId
        )
      } else {
        self.clearTtsFollowTextNavigation()
      }
      self.ttsGeneration += 1
      let generation = self.ttsGeneration
      self.ttsController?.stop(emitState: false)
      self.ttsController = nil
      let requestedLocator = locator.flatMap(locatorRecordToReadium)
      let startLocator: RLocator?
      if startAtViewportStart {
        await self.waitForViewportLayoutStable(epub.epubNavigator)
        guard self.ttsGeneration == generation else { return }
        startLocator = await self.captureViewportStartLocator(
          fallback: requestedLocator,
          navigator: epub.epubNavigator
        )
      } else {
        startLocator = requestedLocator
      }
      guard self.ttsGeneration == generation else { return }
      guard let controller = EPUBTtsController(
        publication: epub.publication,
        navigator: epub.epubNavigator,
        config: config,
        onStateChange: { [weak self] payload in
          guard let self, self.ttsGeneration == generation else { return }
          var payload = payload
          payload["sessionId"] = sessionId
          self.dispatchEvent("onTtsStateChange", payload: payload)
        },
        onSynthesisRequest: { [weak self] payload in
          guard let self, self.ttsGeneration == generation else { return }
          var payload = payload
          payload["sessionId"] = sessionId
          self.dispatchEvent("onTtsSynthesisRequest", payload: payload)
        },
        onSynthesisCancel: { [weak self] payload in
          guard let self, self.ttsGeneration == generation else { return }
          var payload = payload
          payload["sessionId"] = sessionId
          self.dispatchEvent("onTtsSynthesisCancel", payload: payload)
        },
        shouldFollowText: { [weak self] in
          guard let self, self.ttsGeneration == generation else { return false }
          return self.ttsNavigationState.allowsTtsFollow
        },
        onFollowTextNavigation: { [weak self] id, locator, active in
          guard let self, self.ttsGeneration == generation else { return }
          self.markTtsFollowTextNavigation(
            id: id,
            locator: locator,
            active: active
          )
        }
      ) else {
        self.dispatchEvent(
          "onTtsStateChange",
          payload: [
            "sessionId": sessionId,
            "state": "error",
            "error": "Unable to initialize the TTS engine.",
          ]
        )
        return
      }
      self.ttsController = controller
      guard self.ttsGeneration == generation else {
        controller.stop(emitState: false)
        return
      }
      await controller.start(from: startLocator)
    }
  }

  func playTts() {
    Task { @MainActor [weak self] in self?.ttsController?.play() }
  }

  func pauseTts() {
    Task { @MainActor [weak self] in self?.ttsController?.pause() }
  }

  func stopTts() {
    Task { @MainActor [weak self] in
      guard let self else { return }
      let sessionId = self.ttsSessionId
      self.ttsSessionId = nil
      self.ttsGeneration += 1
      self.clearTtsFollowTextNavigation()
      self.ttsController?.stop(emitState: false)
      self.ttsController = nil
      if let sessionId {
        self.dispatchEvent(
          "onTtsStateChange",
          payload: ["sessionId": sessionId, "state": "stopped"]
        )
      }
    }
  }

  func previousTts() {
    Task { @MainActor [weak self] in self?.ttsController?.previous() }
  }

  func nextTts() {
    Task { @MainActor [weak self] in self?.ttsController?.next() }
  }

  func completeTtsSynthesis(_ completion: TtsSynthesisCompletionRecord) {
    Task { @MainActor [weak self] in
      guard let self, completion.sessionId == self.ttsSessionId else { return }
      self.ttsController?.complete(completion)
    }
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
      viewportLocationTask?.cancel()
      viewportLocationTask = nil
      viewportAnchor = nil
      pendingLocation = nil
      suppressLocationEvents = false
      pendingViewportReload = nil
      viewportPresentationFrozen = false
      lastDispatchedHref = nil
    }
    ttsController?.stop()
    ttsController = nil
    ttsSessionId = nil
    clearTtsFollowTextNavigation()
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
