import UIKit
import PDFKit
import ReadiumShared
import ReadiumNavigator

class PDFViewController: ReaderViewController, SelectionActionHandlerDelegate {
    private var selectionActionHandler: SelectionActionHandler?
    private weak var pdfDocumentView: PDFDocumentView?
    private var pendingPDFViewFit = false
    private var isPDFViewMaintenanceScheduled = false
    private var pendingForcedPDFViewFit = false
    private var lastFittedPDFViewSize: CGSize?
    private var lastAppliedPDFViewScaleFactor: CGFloat?
    weak var selectionActionDelegate: SelectionActionDelegate?
    var onSelectionChange: ((ReadiumShared.Locator, String) -> Void)?
    var onTap: ((CGPoint) -> Void)?

    init(
      publication: Publication,
      locator: ReadiumShared.Locator?,
      bookId: String,
      selectionActions: [SelectionActionData]? = nil
    ) throws {
      // Convert typed selection actions directly to EditingActions (no JSON)
      var editingActions: [EditingAction] = []
      var actionIds: [String] = []

      if let actions = selectionActions {
        for action in actions {
          actionIds.append(action.id)

          let selectorName = "handleSelectionAction_\(action.id):"
          let selector = NSSelectorFromString(selectorName)

          editingActions.append(EditingAction(
            title: action.label,
            action: selector
          ))
        }
      }

      // Only use custom actions - don't add default iOS actions
      // If no custom actions are provided, use defaults as fallback
      if editingActions.isEmpty {
        editingActions.append(contentsOf: EditingAction.defaultActions)
      }

      let navigator = try PDFNavigatorViewController(
        publication: publication,
        initialLocation: locator,
        config: PDFNavigatorViewController.Configuration(
          defaults: PDFDefaults(visibleScrollbar: false),
          editingActions: editingActions
        )
      )

      super.init(
        navigator: navigator,
        publication: publication,
        bookId: bookId
      )

      // Set up the Objective-C handler for dynamic methods
      if !actionIds.isEmpty {
        let handler = SelectionActionHandler(actionIds: actionIds)
        handler.delegate = self
        selectionActionHandler = handler
      }

      navigator.delegate = self
    }

    var pdfNavigator: PDFNavigatorViewController {
      return navigator as! PDFNavigatorViewController
    }

    override func viewDidLayoutSubviews() {
      super.viewDidLayoutSubviews()

      configurePDFViewChrome(view)
      guard let pdfDocumentView else { return }
      fitPDFViewIfNeeded(pdfDocumentView)
    }

    func updateSelectionActions(_ selectionActions: [SelectionActionData]?) {
      // On iOS, selection actions must be set during navigator initialization
      // Dynamic updates would require recreating the navigator, which we don't support yet
      print("Warning: Updating selection actions after initialization is not supported on iOS")
    }

    func updatePreferences(_ preferences: PDFPreferences) {
      pdfNavigator.submitPreferences(preferences)
    }

    // Insert handler into the responder chain
    override var next: UIResponder? {
      if let handler = selectionActionHandler {
        // Set the handler's next responder to continue the chain
        handler.originalNextResponder = super.next
        return handler
      }
      return super.next
    }

    // SelectionActionHandlerDelegate implementation
    func handleSelectionAction(withId actionId: String) {
      guard let navigator = navigator as? PDFNavigatorViewController else {
        return
      }

      guard let selection = navigator.currentSelection else {
        return
      }

      selectionActionDelegate?.onSelectionAction(
        actionId: actionId,
        locator: selection.locator,
        selectedText: selection.locator.text.highlight ?? ""
      )

      // Clear the selection
      navigator.clearSelection()
    }
}

extension PDFViewController: PDFNavigatorDelegate {
  func navigator(_ navigator: SelectableNavigator, shouldShowMenuForSelection selection: Selection) -> Bool {
    onSelectionChange?(selection.locator, selection.locator.text.highlight ?? "")
    return true
  }

  func navigator(_ navigator: PDFNavigatorViewController, setupPDFView view: PDFDocumentView) {
    observePDFView(view)
    maintainPDFView(view)
    schedulePDFViewMaintenance(view, forceFit: true)

    guard onTap != nil else { return }

    let tap = UITapGestureRecognizer(target: self, action: #selector(handlePdfTap(_:)))
    tap.cancelsTouchesInView = false
    tap.delegate = self
    view.addGestureRecognizer(tap)
  }

  private func configurePDFViewChrome(_ view: UIView) {
    if let scrollView = view as? UIScrollView {
      // PDFKit may recreate nested scroll views after Readium applies preferences.
      // Keep this as a layout-time fallback so the bottom indicator stays hidden.
      scrollView.showsHorizontalScrollIndicator = false
      scrollView.showsVerticalScrollIndicator = false
    }

    for subview in view.subviews {
      configurePDFViewChrome(subview)
    }
  }

  private func observePDFView(_ view: PDFDocumentView) {
    guard pdfDocumentView !== view else {
      resetPDFViewFitState()
      return
    }

    if let pdfDocumentView {
      NotificationCenter.default.removeObserver(self, name: nil, object: pdfDocumentView)
    }

    pdfDocumentView = view
    resetPDFViewFitState()
    [
      NSNotification.Name.PDFViewDocumentChanged,
      NSNotification.Name.PDFViewPageChanged,
      NSNotification.Name.PDFViewVisiblePagesChanged,
      NSNotification.Name.PDFViewDisplayModeChanged
    ].forEach { name in
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(pdfViewDidChange(_:)),
        name: name,
        object: view
      )
    }
  }

  private func resetPDFViewFitState() {
    pendingPDFViewFit = true
    lastFittedPDFViewSize = nil
    lastAppliedPDFViewScaleFactor = nil
  }

  @objc private func pdfViewDidChange(_ notification: Notification) {
    guard let view = notification.object as? PDFDocumentView else { return }

    let shouldForceFit =
      notification.name == .PDFViewDocumentChanged ||
      notification.name == .PDFViewDisplayModeChanged
    if shouldForceFit {
      resetPDFViewFitState()
    }

    schedulePDFViewMaintenance(view, forceFit: shouldForceFit)
  }

  private func schedulePDFViewMaintenance(_ view: PDFDocumentView, forceFit: Bool = false) {
    pendingForcedPDFViewFit = pendingForcedPDFViewFit || forceFit

    guard !isPDFViewMaintenanceScheduled else { return }
    isPDFViewMaintenanceScheduled = true

    // PDFKit notifications can arrive before visiblePages/contentInset settle.
    // Coalescing to the next main turn avoids fixed delay retries.
    DispatchQueue.main.async { [weak self, weak view] in
      guard let self, let view else { return }
      let forceFit = self.pendingForcedPDFViewFit
      self.isPDFViewMaintenanceScheduled = false
      self.pendingForcedPDFViewFit = false
      self.maintainPDFView(view, forceFit: forceFit)
    }
  }

  private func maintainPDFView(_ view: PDFDocumentView, forceFit: Bool = false) {
    view.layoutIfNeeded()
    configurePDFViewChrome(self.view)
    fitPDFViewIfNeeded(view, force: forceFit)
  }

  private func fitPDFViewIfNeeded(_ view: PDFDocumentView, force: Bool = false) {
    guard view.document != nil else { return }

    let boundsSize = view.bounds.size
    guard boundsSize.width > 0, boundsSize.height > 0 else { return }

    guard let scaleFactor = scaleFactorToFitPDFView(view) else { return }
    guard scaleFactor.isFinite, scaleFactor > 0 else { return }

    let isAtLastAppliedScale = lastAppliedPDFViewScaleFactor
      .map { abs(view.scaleFactor - $0) <= 0.01 }
      ?? true
    let boundsChanged = lastFittedPDFViewSize != boundsSize
    let targetScaleChanged = lastAppliedPDFViewScaleFactor
      .map { abs(scaleFactor - $0) > 0.01 }
      ?? true
    // After our initial fit, only auto-fit while the user is still at our scale.
    // This keeps late PDFKit layout updates from fighting pinch zoom.
    guard force || pendingPDFViewFit || ((boundsChanged || targetScaleChanged) && isAtLastAppliedScale) else {
      return
    }

    view.minScaleFactor = scaleFactor
    if abs(view.scaleFactor - scaleFactor) > 0.01 {
      view.scaleFactor = scaleFactor
    }

    pendingPDFViewFit = false
    lastFittedPDFViewSize = boundsSize
    lastAppliedPDFViewScaleFactor = scaleFactor
  }

  private func scaleFactorToFitPDFView(_ view: PDFDocumentView) -> CGFloat? {
    guard view.displayMode == .twoUp else {
      return view.scaleFactorForSizeToFit
    }

    // PDFKit's generic fit scale is unreliable for paginated two-up spreads.
    // Readium has an internal spread-aware helper; mirror the visible-pages part here.
    let pages = view.visiblePages
    guard !pages.isEmpty else { return nil }

    var contentSize = CGSize.zero
    for page in pages {
      let pageSize = page.bounds(for: view.displayBox).size
      contentSize.width += pageSize.width
      contentSize.height = max(contentSize.height, pageSize.height)
    }
    guard contentSize.width > 0, contentSize.height > 0 else { return nil }

    let contentInset = firstScrollView(in: view)?.contentInset ?? .zero
    let availableSize = CGSize(
      width: view.bounds.width - contentInset.left - contentInset.right,
      height: view.bounds.height - contentInset.top - contentInset.bottom
    )
    guard availableSize.width > 0, availableSize.height > 0 else { return nil }

    return min(availableSize.width / contentSize.width, availableSize.height / contentSize.height)
  }

  private func firstScrollView(in view: UIView) -> UIScrollView? {
    if let scrollView = view as? UIScrollView {
      return scrollView
    }

    for subview in view.subviews {
      if let scrollView = firstScrollView(in: subview) {
        return scrollView
      }
    }

    return nil
  }

  @objc private func handlePdfTap(_ gesture: UITapGestureRecognizer) {
    guard let view = gesture.view as? PDFDocumentView else { return }
    // Let a tap that clears an active text selection only clear the selection,
    // without also toggling the chrome.
    guard view.currentSelection == nil else { return }

    let point = gesture.location(in: view)
    let bounds = view.bounds
    guard bounds.width > 0 && bounds.height > 0 else { return }

    let xRatio = point.x / bounds.width
    let yRatio = point.y / bounds.height
    let inCenterRegion =
      xRatio >= 0.25 && xRatio <= 0.75 &&
      yRatio >= 0.25 && yRatio <= 0.75
    guard inCenterRegion else { return }

    onTap?(point)
  }
}

extension PDFViewController: UIGestureRecognizerDelegate {

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    return true
  }

}

extension PDFViewController: UIPopoverPresentationControllerDelegate {
  // Prevent the popOver to be presented fullscreen on iPhones.
  func adaptivePresentationStyle(for controller: UIPresentationController, traitCollection: UITraitCollection) -> UIModalPresentationStyle
  {
    return .none
  }
}
