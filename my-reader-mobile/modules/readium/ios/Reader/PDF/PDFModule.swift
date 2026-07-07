import Foundation
import ReadiumNavigator
import UIKit
import ReadiumShared

final class PDFModule: ReaderFormatModule {

    weak var delegate: ReaderFormatModuleDelegate?

    init(delegate: ReaderFormatModuleDelegate?) {
        self.delegate = delegate
    }

    func supports(_ publication: Publication) -> Bool {
        publication.conforms(to: .pdf)
    }

    func makeReaderViewController(
        for publication: Publication,
        locator: ReadiumShared.Locator?,
        bookId: String,
        preferences: PreferencesRecord?,
        selectionActions: [SelectionActionData]?,
        fontFamilyDeclarations: [AnyHTMLFontFamilyDeclaration]
    ) throws -> ReaderViewController {
        let pdfViewController = try PDFViewController(
            publication: publication,
            locator: locator,
            bookId: bookId,
            selectionActions: selectionActions
        )
        pdfViewController.moduleDelegate = delegate
        return pdfViewController
    }
}
