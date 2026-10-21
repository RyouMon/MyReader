import Foundation
import ReadiumNavigator
import UIKit
import ReadiumShared

/// The ReaderModule handles the presentation of publications to be read by the user.
/// It contains sub-modules implementing ReaderFormatModule to handle each format of publication (eg. EPUB, PDF).
protocol ReaderModuleAPI {
  var delegate: ReaderModuleDelegate? { get }

  @MainActor
  func getViewController(
    for publication: Publication,
    bookId: String,
    locator: ReadiumShared.Locator?,
    preferences: PreferencesRecord?,
    selectionActions: [SelectionActionData]?,
    fontFamilyDeclarations: [AnyHTMLFontFamilyDeclaration]
  ) async -> ReaderViewController?
}

protocol ReaderModuleDelegate: ModuleDelegate {}


final class ReaderModule: ReaderModuleAPI {
  weak var delegate: ReaderModuleDelegate?

  /// Sub-modules to handle different publication formats (eg. EPUB, PDF)
  var formatModules: [ReaderFormatModule] = []

  init(
    delegate: ReaderModuleDelegate?
  ) {
    self.delegate = delegate

    formatModules = [
      EPUBModule(delegate: self),
      PDFModule(delegate: self),
    ]
  }

  @MainActor
  func getViewController(
    for publication: Publication,
    bookId: String,
    locator: ReadiumShared.Locator?,
    preferences: PreferencesRecord?,
    selectionActions: [SelectionActionData]?,
    fontFamilyDeclarations: [AnyHTMLFontFamilyDeclaration]
  ) async -> ReaderViewController? {
    guard let module = self.formatModules.first(
      where:{ $0.supports(publication) }
    ) else {
      print("Unable to display the publication due to an unsupported format.")
      return nil
    }

    do {
      return try module.makeReaderViewController(
        for: publication,
        locator: await initialLocation(locator, in: publication),
        bookId: bookId,
        preferences: preferences,
        selectionActions: selectionActions,
        fontFamilyDeclarations: fontFamilyDeclarations
      )
    } catch {
      print("An unexpected error occurred when attempting to build the reader view.")
      print(error)
      return nil
    }
  }

  private func initialLocation(
    _ stored: ReadiumShared.Locator?,
    in publication: Publication
  ) async -> ReadiumShared.Locator? {
    guard let stored else { return nil }
    let href = stored.href.removingFragment().string
    if let link = publication.readingOrder.first(where: {
      let nativeHref = $0.url().removingFragment().string
      return href == nativeHref || href.hasSuffix("/" + nativeHref)
        || nativeHref.hasSuffix("/" + href)
    }) {
      // Keep precise text/DOM anchors when only the device's resource path differs.
      return stored.copy(href: link.url().removingFragment(), locations: {
        if let fragment = stored.href.fragment, !$0.fragments.contains(fragment) {
          $0.fragments.append(fragment)
        }
      })
    }
    if let position = stored.locations.position,
       let positions = try? await publication.positions().get(),
       positions.indices.contains(position - 1) {
      return positions[position - 1]
    }
    return await publication.locate(stored)
  }

}


extension ReaderModule: ReaderFormatModuleDelegate {
  func presentAlert(_ title: String, message: String, from viewController: UIViewController) {
    delegate?.presentAlert(title, message: message, from: viewController)
  }

  func presentError(_ error: Error?, from viewController: UIViewController) {
    delegate?.presentError(error, from: viewController)
  }

}
