import Foundation
import UIKit
import ReadiumNavigator
import ReadiumShared

final class EPUBModule: ReaderFormatModule {

    weak var delegate: ReaderFormatModuleDelegate?

    init(delegate: ReaderFormatModuleDelegate?) {
        self.delegate = delegate
    }

    func supports(_ publication: Publication) -> Bool {
      publication.conforms(to: .epub)
        || publication.readingOrder.allAreHTML
        || publication.conforms(to: .divina)
    }

    func makeReaderViewController(
      for publication: Publication,
      locator: ReadiumShared.Locator?,
      bookId: String,
      preferences: PreferencesRecord?,
      selectionActions: [SelectionActionData]?,
      fontFamilyDeclarations: [AnyHTMLFontFamilyDeclaration]
    ) throws -> ReaderViewController {
        // CBZ/Divina publications often lack an identifier; only require one for EPUB.
        guard !publication.conforms(to: .epub) || publication.metadata.identifier != nil else {
            throw ReaderError.epubNotValid
        }

        let epubViewController = try EPUBViewController(
            publication: publication,
            locator: locator,
            bookId: bookId,
            preferences: preferences,
            selectionActions: selectionActions,
            fontFamilyDeclarations: fontFamilyDeclarations
        )
        epubViewController.moduleDelegate = delegate
        return epubViewController
    }

}
