import XCTest

final class ReaderSettingsUITests: XCTestCase {
    private let app = XCUIApplication(
        bundleIdentifier: ProcessInfo.processInfo.environment["TARGET_APP_ID"]
            ?? "ryoumon.myreadermobile"
    )

    func testFontChangesInSheetOverLibraryReader() {
        continueAfterFailure = false
        app.launch()
        let library = app.buttons["tab-library"]
        XCTAssertTrue(library.waitForExistence(timeout: 15))
        library.tap()
        let allBooks = app.buttons["library-collection-all"]
        if allBooks.waitForExistence(timeout: 2) { allBooks.tap() }
        let book = element(matching: #"Open "MyReader TTS E2E"|打开《MyReader TTS E2E》"#)
        XCTAssertTrue(book.waitForExistence(timeout: 10))
        book.tap()
        let secondPage = element(matching: "Latest narration second page.*")
        XCTAssertTrue(secondPage.waitForExistence(timeout: 15))
        openReaderMenu()
        element(matching: "Contents|目录").tap()
        let chapter = element(matching: "Playback position authority")
        XCTAssertTrue(chapter.waitForExistence(timeout: 10))
        chapter.tap()
        XCTAssertTrue(element(matching: "Playback position first page.*").waitForExistence(timeout: 10))
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        XCTAssertTrue(secondPage.waitForExistence(timeout: 10))
        openSettings()
        let serif = element(matching: "Font: Serif.*|字体: 衬线.*")
        XCTAssertTrue(serif.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(serif.isHittable)
        serif.tap()
        XCTAssertTrue(
            element(matching: "Font: Serif, Selected|字体: 衬线, 已选择")
                .waitForExistence(timeout: 5)
        )
        dismissSettingsAndCapture(name: "Serif body")
        openSettings()
        let humanist = element(matching: "Font: Humanist Sans.*|字体: 人文无衬线.*")
        XCTAssertTrue(humanist.waitForExistence(timeout: 10))
        XCTAssertTrue(humanist.isHittable)
        humanist.tap()
        XCTAssertTrue(
            element(matching: "Font: Humanist Sans, Selected|字体: 人文无衬线, 已选择")
                .waitForExistence(timeout: 5)
        )
        dismissSettingsAndCapture(name: "Humanist Sans body")
        let close = element(matching: "Close reader")
        if !close.exists {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        close.tap()
        XCTAssertTrue(book.waitForExistence(timeout: 10))
        book.tap()
        XCTAssertTrue(secondPage.waitForExistence(timeout: 15))
    }

    private func openSettings() {
        openReaderMenu()
        element(matching: "Reading Settings|阅读设置").tap()
    }

    private func openReaderMenu() {
        let more = element(matching: "More Actions|More actions|更多操作")
        if !more.exists {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(more.waitForExistence(timeout: 5))
        more.tap()
    }

    private func dismissSettingsAndCapture(name: String) {
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)).tap()
        XCTAssertTrue(element(matching: "Latest narration second page.*").waitForExistence(timeout: 10))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func element(matching pattern: String) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label MATCHES %@", pattern))
            .firstMatch
    }
}
