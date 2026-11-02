import Foundation

#if canImport(FoundationXML)
  import FoundationXML
#endif
struct CloudAccount: Codable {
  var server: String
  var username: String
  var folderPath: String = "Whisketch"
  func baseURL() throws -> URL {
    guard let u = URL(string: server), u.scheme == "https", u.host != nil, u.user == nil,
      u.password == nil, u.query == nil, u.fragment == nil
    else { throw CloudError.invalidServer }
    return u
  }
  func folderComponents() throws -> [String] {
    let path = folderPath.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(
      in: CharacterSet(charactersIn: "/"))
    if path.isEmpty { return [] }
    let components = path.components(separatedBy: "/")
    guard
      components.allSatisfy({
        !$0.isEmpty && $0 != "." && $0 != ".." && !$0.contains("\\") && !$0.contains("%")
          && $0.rangeOfCharacter(from: .controlCharacters) == nil
      })
    else { throw CloudError.invalidFolder }
    return components
  }
  func filesRoot() throws -> URL {
    guard !username.isEmpty, username != ".", username != "..",
      username.rangeOfCharacter(from: CharacterSet(charactersIn: "/\\%:").union(.controlCharacters))
        == nil
    else { throw CloudError.invalidFolder }
    return try baseURL().appendingPathComponent("remote.php/dav/files").appendingPathComponent(
      username, isDirectory: true)
  }
  func folder() throws -> URL {
    try folderComponents().reduce(filesRoot()) { url, part in
      url.appendingPathComponent(part, isDirectory: true)
    }
  }

}
enum CloudError: LocalizedError {
  case invalidServer, invalidResponse, invalidFolder
  case http(Int)
  case unsafePath
  var errorDescription: String? {
    switch self {
    case .invalidServer:
      return "Enter an HTTPS Nextcloud address without credentials or query parameters."
    case .invalidFolder:
      return
        "Use a folder path within your Nextcloud Files, such as Whisketch or Notes/Whiteboards. Relative path components are not allowed."
    case .invalidResponse: return "Unexpected response or saved-file verification failed."
    case .http(let code):
      return "Nextcloud returned HTTP \(code). Check your account, app password and permissions."
    case .unsafePath: return "Nextcloud returned a file outside your Whisketch folder."
    }
  }
}
struct CloudBoard: Identifiable {
  let id: String
  let name: String
  let url: URL
}
final class DAVParser: NSObject, XMLParserDelegate {
  var entries: [(String, String)] = []
  private var text = "", href = "", name = ""
  func parser(
    _ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
    qualifiedName: String?, attributes: [String: String]
  ) {
    text = ""
    if elementName.split(separator: ":").last == "response" {
      href = ""
      name = ""
    }
  }
  func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }
  func parser(
    _ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?,
    qualifiedName: String?
  ) {
    let e = elementName.split(separator: ":").last
    if e == "href" { href = text.trimmingCharacters(in: .whitespacesAndNewlines) }
    if e == "displayname" { name = text }
    if e == "response", !href.isEmpty { entries.append((href, name)) }
    text = ""
  }
}
final class SameOriginRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let a = task.originalRequest?.url, let b = request.url, a.scheme == b.scheme,
      a.host == b.host, a.port == b.port
    else {
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }
}
final class NextcloudClient {
  let account: CloudAccount
  private let password: String
  private let session: URLSession
  init(account: CloudAccount, password: String, session: URLSession? = nil) {
    self.account = account
    self.password = password
    let c = URLSessionConfiguration.ephemeral
    c.timeoutIntervalForRequest = 30
    c.httpShouldSetCookies = false
    self.session =
      session ?? URLSession(configuration: c, delegate: SameOriginRedirects(), delegateQueue: nil)
  }
  private func request(
    _ url: URL, method: String, body: Data? = nil, headers: [String: String] = [:]
  ) async throws -> (Data, HTTPURLResponse) {
    _ = try account.baseURL()
    var r = URLRequest(url: url)
    r.httpMethod = method
    r.httpBody = body
    r.setValue(
      "Basic " + Data("\(account.username):\(password)".utf8).base64EncodedString(),
      forHTTPHeaderField: "Authorization")
    for (k, v) in headers { r.setValue(v, forHTTPHeaderField: k) }
    let (d, res) = try await session.data(for: r)
    guard let h = res as? HTTPURLResponse else { throw CloudError.invalidResponse }
    return (d, h)
  }
  private func validateFile(_ u: URL) throws {
    let f = try account.folder()
    let prefix = f.standardized.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard u.scheme == f.scheme, u.host == f.host, u.port == f.port,
      u.standardized.path.hasPrefix("/" + prefix + "/")
    else { throw CloudError.unsafePath }
  }
  func boards() async throws -> [CloudBoard] {
    let f = try account.folder()
    let xml = Data(
      "<d:propfind xmlns:d=\"DAV:\"><d:prop><d:displayname/></d:prop></d:propfind>".utf8)
    let (d, r) = try await request(
      f, method: "PROPFIND", body: xml, headers: ["Depth": "1", "Content-Type": "application/xml"])
    if r.statusCode == 404 { return [] }
    guard r.statusCode == 207 else { throw CloudError.http(r.statusCode) }
    let p = XMLParser(data: d)
    let delegate = DAVParser()
    p.delegate = delegate
    p.shouldResolveExternalEntities = false
    guard p.parse() else { throw CloudError.invalidResponse }
    let base = try account.baseURL()
    return try delegate.entries.compactMap { href, name in
      guard let u = URL(string: href, relativeTo: base)?.absoluteURL else {
        throw CloudError.unsafePath
      }
      guard ["whiteboard", "excalidraw"].contains(u.pathExtension.lowercased()) else { return nil }
      try validateFile(u)
      return CloudBoard(
        id: u.absoluteString, name: name.isEmpty ? u.lastPathComponent : name, url: u)
    }
  }
  func download(_ b: CloudBoard) async throws -> String {
    try validateFile(b.url)
    let (d, r) = try await request(b.url, method: "GET")
    guard r.statusCode == 200 else { throw CloudError.http(r.statusCode) }
    guard d.count < 40_000_000, let s = String(data: d, encoding: .utf8),
      let o = try JSONSerialization.jsonObject(with: d) as? [String: Any], o["elements"] is [Any]
    else { throw CloudError.invalidResponse }
    return s
  }
  func publishCopy(name: String, json: String) async throws -> URL {
    let d = Data(json.utf8)
    guard let o = try JSONSerialization.jsonObject(with: d) as? [String: Any],
      o["elements"] is [Any]
    else { throw CloudError.invalidResponse }
    let f = try account.folder()
    var parent = try account.filesRoot()
    for component in try account.folderComponents() {
      parent = parent.appendingPathComponent(component, isDirectory: true)
      let (_, mk) = try await request(parent, method: "MKCOL")
      guard [201, 405].contains(mk.statusCode) else { throw CloudError.http(mk.statusCode) }
    }
    let safe = name.components(
      separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)
    ).joined(separator: "-").prefix(80)
    let u = f.appendingPathComponent("\(safe)-\(UUID().uuidString.prefix(8)).whiteboard")
    let (_, res) = try await request(
      u, method: "PUT", body: d,
      headers: ["Content-Type": "application/json", "If-None-Match": "*"])
    guard res.statusCode == 201 else { throw CloudError.http(res.statusCode) }
    let (check, verify) = try await request(u, method: "GET")
    guard verify.statusCode == 200, check == d else { throw CloudError.invalidResponse }
    return u
  }
}
