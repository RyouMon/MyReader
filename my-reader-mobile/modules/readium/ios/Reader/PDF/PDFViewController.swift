import UIKit
import PDFKit
import ReadiumShared
import ReadiumNavigator

class PDFViewController: ReaderViewController, SelectionActionHandlerDelegate {
    private var selectionActionHandler: SelectionActionHandler?
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
    guard onTap != nil else { return }

    let tap = UITapGestureRecognizer(target: self, action: #selector(handlePdfTap(_:)))
    tap.cancelsTouchesInView = false
    tap.delegate = self
    view.addGestureRecognizer(tap)
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
