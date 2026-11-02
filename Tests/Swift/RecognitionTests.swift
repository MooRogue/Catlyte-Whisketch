import AppKit
import XCTest

@testable import WhisketchCore

final class RecognitionTests: XCTestCase {
  func testPhotoTextRecognition() throws {
    let bitmap = NSBitmapImageRep(
      bitmapDataPlanes: nil, pixelsWide: 1000, pixelsHigh: 300, bitsPerSample: 8,
      samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
      bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor.white.setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1000, height: 300)).fill()
    ("Whisketch network" as NSString).draw(
      at: NSPoint(x: 50, y: 110),
      withAttributes: [.font: NSFont.systemFont(ofSize: 70), .foregroundColor: NSColor.black])
    NSGraphicsContext.restoreGraphicsState()
    let result = try PhotoRecognizer.text(in: bitmap.representation(using: .png, properties: [:])!)
    XCTAssertTrue(result.lowercased().contains("whisketch"), result)
    XCTAssertTrue(result.lowercased().contains("network"), result)
  }
}
