import UniformTypeIdentifiers
import WebKit

// Stable local origin keeps the offline editor and its IndexedDB library independent of bundle paths.
final class EditorResources: NSObject, WKURLSchemeHandler {
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let requestURL = task.request.url, requestURL.host == "localhost",
      let root = Bundle.main.url(forResource: "Web", withExtension: nil)
    else {
      task.didFailWithError(URLError(.fileDoesNotExist))
      return
    }
    let relative = requestURL.path == "/" ? "index.html" : String(requestURL.path.dropFirst())
    let file = root.appendingPathComponent(relative).standardizedFileURL
    guard file.path.hasPrefix(root.standardizedFileURL.path + "/") else {
      task.didFailWithError(URLError(.noPermissionsToReadFile))
      return
    }
    do {
      let data = try Data(contentsOf: file)
      let mime =
        file.pathExtension == "js"
        ? "application/javascript"
        : UTType(filenameExtension: file.pathExtension)?.preferredMIMEType
          ?? "application/octet-stream"
      let response = HTTPURLResponse(
        url: requestURL, statusCode: 200, httpVersion: "HTTP/1.1",
        headerFields: [
          "Content-Type": mime, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache",
        ])!
      task.didReceive(response)
      task.didReceive(data)
      task.didFinish()
    } catch { task.didFailWithError(error) }
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
