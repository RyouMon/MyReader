import UIKit
import PDFKit
import ReadiumShared
import ReadiumNavigator

class PDFViewController: ReaderViewController, SelectionActionHandlerDelegate {
    private var selectionActionHandler: SelectionActionHandler?
    weak var selectionActionDelegate: SelectionActionDelegate?
    var onSelectionChange: ((ReadiumShared.Locator, String) -> Void)?

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
        ),
        httpServer: EPUBHTTPServer.shared
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
