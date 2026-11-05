import Foundation
#if canImport(PencilKit)
import PencilKit
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif
#endif

struct HandwritingStroke: Codable, Sendable {
  let width: Double
  let points: [[Double]]
}
enum HandwritingError: LocalizedError {
  case invalid, unavailable, empty
  var errorDescription: String? {
    switch self {
    case .invalid: return "Select a smaller group of handwriting to recognize."
    case .unavailable: return "Stroke recognition needs iOS or macOS 27 or newer."
    case .empty: return "No handwriting was recognized. Try selecting one or two lines. Your ink is unchanged."
    }
  }
}
struct HandwritingRecognizer {
  static func normalized(_ strokes: [HandwritingStroke]) throws -> [HandwritingStroke] {
    guard !strokes.isEmpty, strokes.count <= 10000, strokes.reduce(0, {$0+$1.points.count}) <= 500000,
      strokes.allSatisfy({$0.width.isFinite && !$0.points.isEmpty && $0.points.allSatisfy({$0.count == 3 && $0.allSatisfy({$0.isFinite})})})
    else { throw HandwritingError.invalid }
    let points=strokes.flatMap(\.points)
    let minX=points.map({$0[0]}).min()!,minY=points.map({$0[1]}).min()!
    let heights=strokes.map { s in (s.points.map({$0[1]}).max()! - s.points.map({$0[1]}).min()!) }.filter({$0>2}).sorted()
    let median=heights.isEmpty ? 32 : heights[heights.count/2]
    let scale=min(4,max(0.05,32/median))
    return strokes.map { s in HandwritingStroke(width:max(1,min(8,s.width*scale)),points:s.points.map { [($0[0]-minX)*scale+20,($0[1]-minY)*scale+20,min(1,max(0.05,$0[2]))] }) }
  }
  static func text(in strokes: [HandwritingStroke]) async throws -> String {
    #if canImport(PencilKit)
    guard #available(iOS 27, macOS 27, macCatalyst 27, *) else { throw HandwritingError.unavailable }
    let normalized=try normalized(strokes)
    let drawing=PKDrawing(strokes:normalized.enumerated().map { index,stroke in
      let points=stroke.points.enumerated().map { i,p in
        PKStrokePoint(location:CGPoint(x:p[0],y:p[1]),timeOffset:Double(i)*0.01,size:CGSize(width:stroke.width,height:stroke.width),opacity:1,force:p[2],azimuth:0,altitude:.pi/2)
      }
      return PKStroke(ink:PKInk(.pen,color:.black),path:PKStrokePath(controlPoints:points,creationDate:Date(timeIntervalSince1970:Double(index))))
    })
    let recognizer=PKStrokeRecognizer(preferredLanguages:[Locale.Language(identifier:"en")])
    await recognizer.updateDrawing(drawing)
    guard let text=await recognizer.recognizedText(strokeIDs:nil),!text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else { throw HandwritingError.empty }
    return text
    #else
    throw HandwritingError.unavailable
    #endif
  }
}
