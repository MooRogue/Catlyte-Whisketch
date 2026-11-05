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
  case unsafePath, missingETag, conflict
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
    case .missingETag:
      return
        "Nextcloud did not provide a strong revision tag. The local note was kept without overwriting the server."
    case .conflict:
      return "This file changed on Nextcloud. Both versions were kept; choose which version to use."
    case .unsafePath: return "Nextcloud returned a file outside your selected folder."
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
    let name = u.lastPathComponent
    guard !name.contains("/"), !name.contains("\\"),
      name.range(of: "%2[eEfF]|%5[cC]", options: .regularExpression) == nil, u.scheme == f.scheme,
      u.host == f.host, u.port == f.port,
      u.user == nil, u.password == nil, u.query == nil, u.fragment == nil,
      u.deletingLastPathComponent().standardized.path.trimmingCharacters(
        in: CharacterSet(charactersIn: "/")) == prefix,
      ["whisketch", "whiteboard", "excalidraw"].contains(u.pathExtension.lowercased())
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
      guard ["whisketch", "whiteboard", "excalidraw"].contains(u.pathExtension.lowercased()) else { return nil }
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
      let o = try JSONSerialization.jsonObject(with: d) as? [String: Any], validNotebook(o)
    else { throw CloudError.invalidResponse }
    return s
  }
  func fileURL(name: String) throws -> URL {
    var safe = name.components(
      separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)
    ).joined(separator: "-").trimmingCharacters(in: .whitespacesAndNewlines)
    if safe.isEmpty { safe = "Untitled" }
    safe = String(safe.prefix(100))
    return try account.folder().appendingPathComponent(safe + ".whisketch")
  }
  private func revision(_ r: HTTPURLResponse) throws -> String {
    guard let tag = r.value(forHTTPHeaderField: "ETag"), tag.hasPrefix("\""),
      tag.hasSuffix("\""), !tag.contains("\r"), !tag.contains("\n")
    else {
      throw CloudError.missingETag
    }
    return tag
  }
  private func validNotebook(_ object: [String: Any]) -> Bool {
    if object["elements"] is [Any] { return true } // one-time legacy import
    guard object["type"] as? String == "whisketch-notebook", object["version"] as? Int == 1,
      let pages = object["pages"] as? [[String: Any]], !pages.isEmpty, pages.count <= 500
    else { return false }
    var ids = Set<String>()
    return pages.allSatisfy { page in
      guard let id = page["id"] as? String, ids.insert(id).inserted,
        page["title"] is String, let content = page["content"] as? [String: Any],
        content["objects"] is [Any] else { return false }
      return true
    }
  }
  private func boardData(_ data: Data) throws -> String {
    guard data.count < 40_000_000, let json = String(data: data, encoding: .utf8),
      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      validNotebook(object)
    else { throw CloudError.invalidResponse }
    return json
  }
  func fetch(_ url: URL) async throws -> CloudDocument? {
    try validateFile(url)
    let (data, response) = try await request(url, method: "GET")
    if response.statusCode == 404 { return nil }
    guard response.statusCode == 200 else { throw CloudError.http(response.statusCode) }
    return CloudDocument(
      url: url.absoluteString, json: try boardData(data), etag: try revision(response))
  }
  private func ensureFolder() async throws {
    var parent = try account.filesRoot()
    for component in try account.folderComponents() {
      parent = parent.appendingPathComponent(component, isDirectory: true)
      let (_, response) = try await request(parent, method: "MKCOL")
      guard [201, 405].contains(response.statusCode) else {
        throw CloudError.http(response.statusCode)
      }
    }
  }
  func save(_ url: URL, json: String, etag: String?) async throws -> CloudDocument {
    try validateFile(url)
    let data = Data(json.utf8)
    _ = try boardData(data)
    if let etag = etag {
      guard etag.hasPrefix("\""), etag.hasSuffix("\""), !etag.contains("\r"), !etag.contains("\n")
      else { throw CloudError.missingETag }
    }
    try await ensureFolder()
    let headers = [
      "Content-Type": "application/json", etag == nil ? "If-None-Match" : "If-Match": etag ?? "*",
    ]
    let (_, response) = try await request(url, method: "PUT", body: data, headers: headers)
    if [409, 412].contains(response.statusCode) { throw CloudError.conflict }
    guard (etag == nil ? [201] : [200, 204]).contains(response.statusCode) else {
      throw CloudError.http(response.statusCode)
    }
    guard let verified = try await fetch(url), Data(verified.json.utf8) == data else {
      throw CloudError.invalidResponse
    }
    return verified
  }
  func move(_ from: URL, to: URL, etag: String) async throws -> CloudDocument {
    try validateFile(from)
    try validateFile(to)
    guard etag.hasPrefix("\""), etag.hasSuffix("\""), !etag.contains("\r"), !etag.contains("\n")
    else { throw CloudError.missingETag }
    let (_, response) = try await request(
      from, method: "MOVE",
      headers: ["Destination": to.absoluteString, "Overwrite": "F", "If-Match": etag])
    if [409, 412].contains(response.statusCode) { throw CloudError.conflict }
    guard response.statusCode == 201 else { throw CloudError.http(response.statusCode) }
    guard let moved = try await fetch(to) else { throw CloudError.invalidResponse }
    return moved
  }
  func publishCopy(name: String, json: String) async throws -> URL {
    let url = try fileURL(name: name)
    _ = try await save(url, json: json, etag: nil)
    return url
  }
}
struct CloudDocument: Codable {
  let url: String
  let json: String
  let etag: String
}
