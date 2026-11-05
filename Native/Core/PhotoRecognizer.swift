import Foundation
import Vision

struct PhotoRecognizer {
  static func text(in data: Data) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = true
    request.minimumTextHeight = 0.005
    try VNImageRequestHandler(data: data, options: [:]).perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(
      separator: "\n")
  }
}
