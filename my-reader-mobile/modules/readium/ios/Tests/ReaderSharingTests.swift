import Foundation
import Testing
import UIKit
@testable import ExpoModulesCore
@testable import ExpoSharing

@Suite(.serialized)
struct ReaderSharingTests {
  @Test
  @MainActor
  func allSharedFilesMustBeReadableBeforeTheSystemSheetOpens() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: folder) }
    let files = [folder.appendingPathComponent("Book-2.jpg"), folder.appendingPathComponent("Book-3.jpg")]
    for (index, file) in files.enumerated() { try Data([UInt8(index)]).write(to: file) }
    let context = AppContext(config: AppContextConfig(documentDirectory: folder, cacheDirectory: folder, appGroups: nil))
    let module = SharingModule(appContext: context)
    let function = try #require(module.definition().functions["shareAsync"] as? AsyncFunctionDefinition<(URL, SharingOptions, Promise), URL, Void>)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
    let presenter = SharePresenter()
    window.rootViewController = presenter
    window.makeKeyAndVisible()
    defer { window.isHidden = true }
    var options = SharingOptions()
    options.additionalUrls = [files[1]]
    let promise = Promise(appContext: context, resolver: { _ in }, rejecter: { _ in })
    try function.body((files[0], options, promise))
    #expect(presenter.activity != nil)
    #expect(files.allSatisfy { FileManager.default.isReadableFile(atPath: $0.path) })
    presenter.activity = nil
    try FileManager.default.removeItem(at: files[1])
    #expect(throws: FilePermissionException.self) { try function.body((files[0], options, promise)) }
    #expect(presenter.activity == nil)
  }
}

private final class SharePresenter: UIViewController {
  var activity: UIActivityViewController?
  override func present(_ viewControllerToPresent: UIViewController, animated: Bool, completion: (() -> Void)? = nil) {
    activity = viewControllerToPresent as? UIActivityViewController
    completion?()
  }
}
