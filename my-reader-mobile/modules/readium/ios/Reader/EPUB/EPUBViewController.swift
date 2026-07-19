import UIKit
import ReadiumShared
import ReadiumNavigator

struct SelectionActionData: Codable {
    let id: String
    let label: String
}

protocol SelectionActionDelegate: AnyObject {
    func onSelectionAction(actionId: String, locator: ReadiumShared.Locator, selectedText: String)
}

class EPUBViewController: ReaderViewController, SelectionActionHandlerDelegate {
    private var selectionActionHandler: SelectionActionHandler?
    private var selectionMenu: SelectionMenuRecord?
    private var selectionMenuPresenter: AnyObject?
    weak var selectionActionDelegate: SelectionActionDelegate?
    var usesCustomSelectionMenu = false
    var onSelectionChange: ((ReadiumShared.Locator, String, CGRect?) -> Void)?
    var onSelectionMenuDismiss: (() -> Void)?

    init(
      publication: Publication,
      locator: ReadiumShared.Locator?,
      bookId: String,
      preferences: PreferencesRecord? = nil,
      selectionActions: [SelectionActionData]? = nil,
      fontFamilyDeclarations: [AnyHTMLFontFamilyDeclaration] = []
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

      let epubPreferences = preferences.map(preferencesRecordToEPUB) ?? .empty
      var decorationTemplates = HTMLDecorationTemplate.defaultTemplates()
      decorationTemplates[readerNoteMarkerStyleId] = readerNoteMarkerTemplate()
      let navigator = try EPUBNavigatorViewController(
        publication: publication,
        initialLocation: locator,
        config: EPUBNavigatorViewController.Configuration(
          preferences: epubPreferences,
          editingActions: editingActions,
          decorationTemplates: decorationTemplates,
          fontFamilyDeclarations: fontFamilyDeclarations,
          readiumCSSRSProperties: Self.readiumCSSRSProperties(
            for: epubPreferences,
            fontFamilyDeclarations: fontFamilyDeclarations
          )
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

    var epubNavigator: EPUBNavigatorViewController {
      return navigator as! EPUBNavigatorViewController
    }

    private static func readiumCSSRSProperties(
      for preferences: EPUBPreferences,
      fontFamilyDeclarations: [AnyHTMLFontFamilyDeclaration]
    ) -> CSSRSProperties {
      guard let fontFamily = preferences.fontFamily else {
        return CSSRSProperties()
      }

      let alternates = fontFamilyDeclarations
        .first { $0.fontFamily == fontFamily }?
        .alternates
        .map(\.rawValue) ?? []

      return CSSRSProperties(baseFontFamily: [fontFamily.rawValue] + alternates)
    }

    func updateSelectionActions(_ selectionActions: [SelectionActionData]?) {
      // On iOS, selection actions must be set during navigator initialization
      // Dynamic updates would require recreating the navigator, which we don't support yet
      print("Warning: Updating selection actions after initialization is not supported on iOS")
    }

    override func viewDidLoad() {
      super.viewDidLoad()

      /// Set initial UI appearance.
      setUIColor(for: epubNavigator.settings.theme)

      if #available(iOS 16.0, *) {
        let presenter = NativeSelectionMenuPresenter(
          hostView: epubNavigator.view,
          onAction: { [weak self] actionId in
            self?.handleNativeSelectionAction(actionId)
          },
          onDismiss: { [weak self] in
            self?.handleNativeSelectionMenuDismiss()
          }
        )
        selectionMenuPresenter = presenter
        presenter.update(selectionMenu)
      }
    }

    func updateSelectionMenu(_ menu: SelectionMenuRecord?) {
      selectionMenu = menu
      if #available(iOS 16.0, *) {
        (selectionMenuPresenter as? NativeSelectionMenuPresenter)?.update(menu)
      }
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
      guard let navigator = navigator as? EPUBNavigatorViewController else {
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

    private func handleNativeSelectionAction(_ actionId: String) {
      guard let menu = selectionMenu,
            let locatorRecord = menu.locator,
            let locator = locatorRecordToReadium(locatorRecord) else {
        return
      }

      selectionActionDelegate?.onSelectionAction(
        actionId: actionId,
        locator: locator,
        selectedText: menu.selectedText
      )
      epubNavigator.clearSelection()
    }

    private func handleNativeSelectionMenuDismiss() {
      selectionMenu = nil
      epubNavigator.clearSelection()
      onSelectionMenuDismiss?()
    }

    internal func setUIColor(for theme: Theme) {
      let colors = AssociatedColors.getColors(for: theme)

      navigator.view.backgroundColor = colors.mainColor
      view.backgroundColor = colors.mainColor
      //
      navigationController?.navigationBar.barTintColor = colors.mainColor
      navigationController?.navigationBar.tintColor = colors.textColor

      navigationController?.navigationBar.titleTextAttributes = [NSAttributedString.Key.foregroundColor: colors.textColor]
    }

}

extension EPUBViewController: EPUBNavigatorDelegate {
  func navigator(
    _ navigator: SelectableNavigator,
    shouldShowMenuForSelection selection: Selection
  ) -> Bool {
    guard usesCustomSelectionMenu else { return true }
    updateSelectionMenu(nil)
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.onSelectionChange?(
        selection.locator,
        selection.locator.text.highlight ?? "",
        selection.frame
      )
    }
    return false
  }
}

@available(iOS 16.0, *)
private final class NativeSelectionMenuPresenter: NSObject, UIEditMenuInteractionDelegate {
  private weak var hostView: UIView?
  private let onAction: (String) -> Void
  private let onDismiss: () -> Void
  private var menu: SelectionMenuRecord?
  private var presentationGeneration = 0
  private var presentationActive = false
  private var isProgrammaticDismissal = false
  private var pendingPresentation = false
  private lazy var interaction = UIEditMenuInteraction(delegate: self)

  init(
    hostView: UIView,
    onAction: @escaping (String) -> Void,
    onDismiss: @escaping () -> Void
  ) {
    self.hostView = hostView
    self.onAction = onAction
    self.onDismiss = onDismiss
    super.init()
    hostView.addInteraction(interaction)
  }

  func update(_ menu: SelectionMenuRecord?) {
    self.menu = menu

    guard menu != nil else {
      presentationGeneration += 1
      pendingPresentation = false
      if presentationActive {
        isProgrammaticDismissal = true
        interaction.dismissMenu()
      } else {
        isProgrammaticDismissal = false
      }
      return
    }

    if presentationActive {
      if isProgrammaticDismissal {
        pendingPresentation = true
      }
      return
    }

    schedulePresentation()
  }

  private func schedulePresentation() {
    presentationGeneration += 1
    let generation = presentationGeneration
    DispatchQueue.main.async { [weak self] in
      guard let self,
            generation == self.presentationGeneration,
            let menu = self.menu,
            !self.presentationActive,
            let hostView = self.hostView,
            hostView.window != nil else {
        return
      }
      let sourcePoint = self.sourceRect(for: menu, in: hostView).center
      self.presentationActive = true
      self.interaction.presentEditMenu(
        with: UIEditMenuConfiguration(identifier: nil, sourcePoint: sourcePoint)
      )
    }
  }

  func editMenuInteraction(
    _ interaction: UIEditMenuInteraction,
    menuFor configuration: UIEditMenuConfiguration,
    suggestedActions: [UIMenuElement]
  ) -> UIMenu? {
    guard let menu else { return nil }

    let colorActions = menu.colors.map { color in
      UIAction(
        title: "",
        image: Self.colorImage(cssColor: color.color, selected: color.selected == true),
        identifier: UIAction.Identifier(color.id),
        discoverabilityTitle: color.label,
        attributes: [],
        state: .off,
        handler: { [weak self] _ in self?.performAction(color.id) }
      )
    }
    let textActions = menu.actions.map { action in
      UIAction(
        title: action.label,
        identifier: UIAction.Identifier(action.id),
        attributes: action.destructive == true ? [.destructive] : [],
        handler: { [weak self] _ in self?.performAction(action.id) }
      )
    }

    let colorMenu = UIMenu(title: menu.colorMenuLabel, children: colorActions)
    return UIMenu(children: [colorMenu] + textActions)
  }

  func editMenuInteraction(
    _ interaction: UIEditMenuInteraction,
    targetRectFor configuration: UIEditMenuConfiguration
  ) -> CGRect {
    guard let menu, let hostView else { return .zero }
    return sourceRect(for: menu, in: hostView)
  }

  func editMenuInteraction(
    _ interaction: UIEditMenuInteraction,
    willPresentMenuFor configuration: UIEditMenuConfiguration,
    animator: any UIEditMenuInteractionAnimating
  ) {
    presentationActive = true
  }

  func editMenuInteraction(
    _ interaction: UIEditMenuInteraction,
    willDismissMenuFor configuration: UIEditMenuConfiguration,
    animator: any UIEditMenuInteractionAnimating
  ) {
    animator.addCompletion { [weak self] in
      guard let self else { return }
      let shouldNotifyDismiss = !self.isProgrammaticDismissal
      let shouldPresentPending =
        self.isProgrammaticDismissal && self.pendingPresentation && self.menu != nil
      self.presentationActive = false
      self.isProgrammaticDismissal = false
      self.pendingPresentation = false

      if shouldPresentPending {
        self.schedulePresentation()
      } else if shouldNotifyDismiss {
        self.menu = nil
        self.onDismiss()
      }
    }
  }

  private func performAction(_ actionId: String) {
    isProgrammaticDismissal = true
    pendingPresentation = false
    onAction(actionId)
  }

  private func sourceRect(for menu: SelectionMenuRecord, in hostView: UIView) -> CGRect {
    guard let rect = menu.rect else {
      return CGRect(
        x: hostView.bounds.midX,
        y: hostView.bounds.midY,
        width: 1,
        height: 1
      )
    }

    let source = CGRect(
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    )
    let visible = source.intersection(hostView.bounds)
    return visible.isNull || visible.isEmpty ? source : visible
  }

  private static func colorImage(cssColor: String, selected: Bool) -> UIImage? {
    guard let color = UIColor.fromCSS(cssColor) else { return nil }

    let size = CGSize(width: 22, height: 22)
    return UIGraphicsImageRenderer(size: size).image { context in
      let bounds = CGRect(origin: .zero, size: size)
      if selected {
        UIColor.label.setFill()
        context.cgContext.fillEllipse(in: bounds.insetBy(dx: 1, dy: 1))
        color.setFill()
        context.cgContext.fillEllipse(in: bounds.insetBy(dx: 4, dy: 4))
      } else {
        color.setFill()
        context.cgContext.fillEllipse(in: bounds.insetBy(dx: 2, dy: 2))
      }
    }.withRenderingMode(.alwaysOriginal)
  }
}

private extension CGRect {
  var center: CGPoint {
    CGPoint(x: midX, y: midY)
  }
}

extension EPUBViewController: UIGestureRecognizerDelegate {

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    return true
  }

}

extension EPUBViewController: UIPopoverPresentationControllerDelegate {
  // Prevent the popOver to be presented fullscreen on iPhones.
  func adaptivePresentationStyle(for controller: UIPresentationController, traitCollection: UITraitCollection) -> UIModalPresentationStyle
  {
    return .none
  }
}
