import ExpoModulesCore
import UIKit

struct SearchTokenValue: Record {
  @Field var id: String = ""
  @Field var label: String = ""
}

struct TokenFieldValue: Record {
  @Field var text: String = ""
  @Field var tokens: [SearchTokenValue] = []
  @Field var eventCount: Int = 0
}

final class MyReaderTokenFieldView: ExpoView, UISearchTextFieldDelegate, UITextPasteDelegate {
  let field = UISearchTextField()
  let onTokenFieldChange = EventDispatcher()
  let onTokenFieldSubmit = EventDispatcher()
  private var eventCount = 0
  private var lastText = ""
  private var lastTokens: [[String: String]] = []
  private var applyingValue = false
  private static let pasteType = "com.myreader.catalog-search-token"

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    field.delegate = self
    field.pasteDelegate = self
    field.pasteConfiguration?.addAcceptableTypeIdentifiers([Self.pasteType])
    field.autocorrectionType = .no
    field.autocapitalizationType = .none
    field.returnKeyType = .search
    field.font = .preferredFont(forTextStyle: .body)
    field.adjustsFontForContentSizeCategory = true
    field.clearButtonMode = .whileEditing
    field.accessibilityIdentifier = "catalog-native-token-input"
    field.addTarget(self, action: #selector(changed), for: .editingChanged)
    addSubview(field)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    field.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      DispatchQueue.main.async { [weak self] in self?.field.becomeFirstResponder() }
    }
  }

  private var tokenValues: [[String: String]] {
    field.tokens.compactMap { $0.representedObject as? [String: String] }
  }

  private func makeToken(_ value: [String: String]) -> UISearchToken {
    let token = UISearchToken(icon: nil, text: value["label"] ?? "")
    token.representedObject = value
    return token
  }

  func apply(_ value: TokenFieldValue) {
    // A JS render acknowledging an older keystroke must not replace newer native input.
    guard value.eventCount >= eventCount else { return }
    applyingValue = true
    defer { applyingValue = false }
    let tokens = value.tokens.map { ["id": $0.id, "label": $0.label] }
    if tokens != tokenValues { field.tokens = tokens.map(makeToken) }
    if field.text != value.text, field.markedTextRange == nil { field.text = value.text }
    lastText = field.text ?? ""
    lastTokens = tokenValues
    updateAccessibilityValue()
  }

  @objc private func changed() {
    guard !applyingValue else { return }
    let text = field.text ?? ""
    let tokens = tokenValues
    guard text != lastText || tokens != lastTokens else { return }
    lastText = text
    lastTokens = tokens
    updateAccessibilityValue()
    eventCount += 1
    onTokenFieldChange(["text": text, "tokens": tokens, "eventCount": eventCount])
  }

  private func updateAccessibilityValue() {
    field.accessibilityValue = (lastTokens.compactMap { $0["label"] } + [lastText])
      .filter { !$0.isEmpty }.joined(separator: ", ")
  }

  func textFieldDidChangeSelection(_ textField: UITextField) {
    // Token-only delete, cut, drag and undo can change selection without changing plain text.
    changed()
  }

  func textFieldShouldReturn(_ textField: UITextField) -> Bool {
    guard field.markedTextRange == nil else { return false }
    changed()
    field.resignFirstResponder()
    onTokenFieldSubmit(["text": field.text ?? ""])
    return false
  }

  func searchTextField(_ searchTextField: UISearchTextField, itemProviderForCopying token: UISearchToken) -> NSItemProvider {
    let value = token.representedObject as? [String: String] ?? [:]
    let provider = NSItemProvider(object: (value["label"] ?? "") as NSString)
    provider.registerDataRepresentation(forTypeIdentifier: Self.pasteType, visibility: .all) { completion in
      completion(try? JSONSerialization.data(withJSONObject: value), nil)
      return nil
    }
    return provider
  }

  func textPasteConfigurationSupporting(
    _ textPasteConfigurationSupporting: UITextPasteConfigurationSupporting,
    transform item: UITextPasteItem
  ) {
    guard item.itemProvider.hasItemConformingToTypeIdentifier(Self.pasteType),
      let searchItem = item as? UISearchTextFieldPasteItem
    else { item.setDefaultResult(); return }
    item.itemProvider.loadDataRepresentation(forTypeIdentifier: Self.pasteType) { [weak self] data, _ in
      DispatchQueue.main.async {
        guard let self, let data,
          let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: String],
          value["id"] != nil, value["label"] != nil
        else { item.setDefaultResult(); return }
        searchItem.setSearchTokenResult(self.makeToken(value))
      }
    }
  }
}
