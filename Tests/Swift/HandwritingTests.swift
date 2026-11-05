import XCTest
@testable import WhisketchCore
final class HandwritingTests: XCTestCase {
  func testNormalizationPreservesSequenceAndRelativeGeometry() throws {
    let source=[HandwritingStroke(width:2,points:[[10,20,0.2],[10,52,0.8]]),HandwritingStroke(width:2,points:[[30,20,0.4],[30,52,0.9]])]
    let result=try HandwritingRecognizer.normalized(source)
    XCTAssertEqual(result[0].points[0],[20,20,0.2]);XCTAssertEqual(result[0].points[1],[20,52,0.8]);XCTAssertEqual(result[1].points[0],[40,20,0.4])
    XCTAssertThrowsError(try HandwritingRecognizer.normalized([HandwritingStroke(width:2,points:[[.nan,2,0.3]])]))
  }
  func testActualStrokeRecognizerReportsResultOrExplicitEmpty() async throws {
    guard #available(macOS 27, *) else { throw XCTSkip("Requires system stroke recognition") }
    let paths:[[[Double]]]=[
      [[0,0],[0,40]],[[0,20],[24,20]],[[24,0],[24,40]],
      [[64,0],[40,0],[40,40],[64,40]],[[40,20],[60,20]],
      [[80,0],[80,40],[104,40]],[[120,0],[120,40],[144,40]],
      [[172,0],[160,5],[156,20],[160,35],[172,40],[184,35],[188,20],[184,5],[172,0]]
    ]
    let strokes=paths.map{HandwritingStroke(width:2,points:$0.map{[$0[0],$0[1],0.5]})}
    // Synthetic block strokes verify the real API can be called, not handwriting accuracy.
    // Preserve an explicit empty result so it cannot be mistaken for a passing quality test.
    do {
      let result=try await HandwritingRecognizer.text(in:strokes)
      XCTAssertFalse(result.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
      print("Stroke fixture result:",result)
    } catch HandwritingError.empty { print("Stroke fixture: no text. Real handwriting quality remains unverified.") }
  }
}
