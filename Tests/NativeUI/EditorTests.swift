import XCTest

final class EditorTests: XCTestCase {
  func testSamplePersistsAndRotates() {
    let app = XCUIApplication()
    app.launch()
    let notebooks = app.webViews.buttons["Open notebooks"]
    XCTAssertTrue(notebooks.waitForExistence(timeout: 25), app.debugDescription)
    guard notebooks.exists else { return }
    notebooks.tap()
    app.webViews.buttons["Try a sample"].tap()
    let title = app.webViews.textFields["Notebook title"]
    XCTAssertTrue(title.waitForExistence(timeout: 10))
    XCTAssertEqual(title.value as? String, "Welcome to Whisketch")
    sleep(2)
    app.terminate()
    app.launch()
    XCTAssertTrue(title.waitForExistence(timeout: 15))
    XCTAssertEqual(title.value as? String, "Welcome to Whisketch")
    for orientation in [UIDeviceOrientation.portrait, .landscapeLeft, .portrait] {
      XCUIDevice.shared.orientation = orientation
      sleep(2)
      let f = app.windows.firstMatch.frame
      if orientation == .portrait {
        XCTAssertGreaterThan(f.height, f.width)
      } else {
        XCTAssertGreaterThan(f.width, f.height)
      }
      XCTAssertTrue(app.webViews.buttons["Open notebooks"].exists)
      let screenshot = XCTAttachment(screenshot: app.screenshot())
      screenshot.lifetime = .keepAlways
      add(screenshot)
    }
  }
}
