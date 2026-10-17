import ExpoModulesCore
import UIKit

public class MyReaderTokenFieldModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyReaderTokenField")

    View(MyReaderTokenFieldView.self) {
      Events("onTokenFieldChange", "onTokenFieldSubmit")
      Prop("value") { (view: MyReaderTokenFieldView, value: TokenFieldValue) in
        view.apply(value)
      }
      Prop("placeholder") { (view: MyReaderTokenFieldView, value: String) in
        view.field.placeholder = value
        view.field.accessibilityLabel = value
      }
      Prop("textColor") { (view: MyReaderTokenFieldView, value: UIColor) in
        view.field.textColor = value
      }
      Prop("accentColor") { (view: MyReaderTokenFieldView, value: UIColor) in
        view.field.tintColor = value
      }
      Prop("fieldColor") { (view: MyReaderTokenFieldView, value: UIColor) in
        view.field.backgroundColor = value
      }
      AsyncFunction("focus") { (view: MyReaderTokenFieldView) in
        view.field.becomeFirstResponder()
      }
    }
  }
}
