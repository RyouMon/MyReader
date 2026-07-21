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
      preferencesReceived = true
      if shouldReloadEPUBForFontFamilyChange(from: oldValue, to: preferences) {
        reloadEPUBPreservingLocation()
      } else {
        tryLoadBook()
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

  private func reloadEPUBPreservingLocation() {
    guard let url = loadedFileUrl else {
      updatePreferences()
      return
    }

    Task { @MainActor [weak self] in
      guard let self = self else { return }
      let location = (self.readerViewController?.navigator as? EPUBNavigatorViewController)?.currentLocation
      self.cleanup()
      self.loadBook(url: url, location: location)
    }
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
      self.dispatchEvent("onLocationChange", payload: ["locator": locatorToDict(locator)] as [String: Any])
    }
    .store(in: &subscriptions)

    readerViewController = vc
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
      let text = anchor["text"] as? [String: Any]
    else { return nil }

    var locator = locatorToDict(currentLocation)
    var locations = locator["locations"] as? [String: Any] ?? [:]
    locations["cssSelector"] = cssSelector
    locations["domRange"] = domRange
    locator["locations"] = locations
    locator["text"] = text
    return locator
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
  func cleanup() {
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
