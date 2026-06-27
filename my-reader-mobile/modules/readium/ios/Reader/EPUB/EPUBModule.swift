import Foundation
import UIKit
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
      selectionActions: [SelectionActionData]?
    ) throws -> ReaderViewController {
        // CBZ/Divina publications often lack an identifier; only require one for EPUB.
        guard !publication.conforms(to: .epub) || publication.metadata.identifier != nil else {
            throw ReaderError.epubNotValid
        }

        let epubViewController = try EPUBViewController(
            publication: publication,
            locator: locator,
            bookId: bookId,
            selectionActions: selectionActions
        )
        epubViewController.moduleDelegate = delegate
        return epubViewController
    }

}
