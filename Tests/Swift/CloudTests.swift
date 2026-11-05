import XCTest

@testable import WhisketchCore

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif
final class MockProtocol: URLProtocol {
  static var headers = ["ETag": "\"revision-1\""]
  static var handler: ((URLRequest) throws -> (Int, Data))?
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    do {
      let (code, data) = try Self.handler!(request)
      client?.urlProtocol(
        self,
        didReceive: HTTPURLResponse(
          url: request.url!, statusCode: code, httpVersion: nil, headerFields: Self.headers)!,
        cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}
final class CloudTests: XCTestCase {
  override func setUp() { MockProtocol.headers = ["ETag": "\"revision-1\""] }
  let account = CloudAccount(server: "https://cloud.example/nextcloud", username: "a b")
  func client() -> NextcloudClient {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockProtocol.self]
    return NextcloudClient(
      account: account, password: "example", session: URLSession(configuration: config))
  }
  func testRejectsUnsafeServer() {
    for s in [
      "http://cloud.example", "https://user:secret@cloud.example",
      "https://cloud.example?token=secret",
    ] { XCTAssertThrowsError(try CloudAccount(server: s, username: "a").baseURL()) }
  }
  func testPublishesOnlyNewFileAndVerifiesIt() async throws {
    let json = "{\"elements\":[],\"files\":{}}"
    var steps = 0
    MockProtocol.handler = { r in
      steps += 1
      switch steps {
      case 1:
        XCTAssertEqual(r.httpMethod, "MKCOL")
        return (405, Data())
      case 2:
        XCTAssertEqual(r.value(forHTTPHeaderField: "If-None-Match"), "*")
        XCTAssertTrue(r.url!.path.hasSuffix("/a-b.whisketch"))
        return (201, Data())
      default: return (200, Data(json.utf8))
      }
    }
    _ = try await client().publishCopy(name: "a/b", json: json)
    XCTAssertEqual(steps, 3)
  }
  func testExistingFileIsNotOverwritten() async throws {
    MockProtocol.handler = { r in (r.httpMethod == "MKCOL" ? 405 : 412, Data()) }
    do {
      _ = try await client().publishCopy(name: "board", json: "{\"elements\":[]}")
      XCTFail("Must preserve conflict")
    } catch {}
  }
  func testReadbackMismatchIsFailure() async throws {
    MockProtocol.handler = { r in
      (r.httpMethod == "MKCOL" ? 201 : r.httpMethod == "PUT" ? 201 : 200, Data("{}".utf8))
    }
    do {
      _ = try await client().publishCopy(name: "board", json: "{\"elements\":[]}")
      XCTFail("Must verify saved bytes")
    } catch {}
  }
  func testForeignDAVResponseCannotLeakCredentials() async throws {
    MockProtocol.handler = { _ in
      (
        207,
        Data(
          "<d:multistatus xmlns:d=\"DAV:\"><d:response><d:href>https://evil.example/board.whiteboard</d:href></d:response></d:multistatus>"
            .utf8)
      )
    }
    do {
      _ = try await client().boards()
      XCTFail("Must reject foreign host")
    } catch {}
  }
  func testFolderPathValidation() throws {
    for path in ["../Books", "A/../B", "A//B", "A/%2e%2e", "A\\B"] {
      XCTAssertThrowsError(
        try CloudAccount(server: "https://cloud.example", username: "alice", folderPath: path)
          .folder())
    }
    XCTAssertEqual(
      try CloudAccount(
        server: "https://cloud.example", username: "alice", folderPath: "Notes/Whiteboards"
      ).folder().path, "/remote.php/dav/files/alice/Notes/Whiteboards")
  }
  func testNestedFoldersCreatedOnlyWhenPublishing() async throws {
    let a = CloudAccount(
      server: "https://cloud.example", username: "alice", folderPath: "Notes/Whiteboards")
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockProtocol.self]
    let c = NextcloudClient(
      account: a, password: "example", session: URLSession(configuration: config))
    var paths: [String] = []
    let json = "{\"elements\":[]}"
    MockProtocol.handler = { request in
      paths.append(request.url!.path)
      if request.httpMethod == "MKCOL" { return (201, Data()) }
      if request.httpMethod == "PUT" {
        XCTAssertEqual(request.value(forHTTPHeaderField: "If-None-Match"), "*")
        return (201, Data())
      }
      return (200, Data(json.utf8))
    }
    _ = try await c.publishCopy(name: "nested", json: json)
    XCTAssertEqual(paths[0], "/remote.php/dav/files/alice/Notes")
    XCTAssertEqual(paths[1], "/remote.php/dav/files/alice/Notes/Whiteboards")
  }

  func testStableFileNameWithoutSuffix() throws {
    XCTAssertEqual(
      try client().fileURL(name: "Meeting notes").lastPathComponent, "Meeting notes.whisketch")
    XCTAssertEqual(try client().fileURL(name: "  ").lastPathComponent, "Untitled.whisketch")
  }
  func testUpdatesRequireExactETagAndVerifyRevision() async throws {
    var steps: [String] = []
    let json = "{\"elements\":[],\"files\":{}}"
    MockProtocol.handler = { r in
      steps.append(r.httpMethod!)
      if r.httpMethod == "MKCOL" { return (405, Data()) }
      if r.httpMethod == "PUT" {
        XCTAssertEqual(r.value(forHTTPHeaderField: "If-Match"), "\"old\"")
        XCTAssertNil(r.value(forHTTPHeaderField: "If-None-Match"))
        return (204, Data())
      }
      return (200, Data(json.utf8))
    }
    let c = client()
    let saved = try await c.save(c.fileURL(name: "Stable"), json: json, etag: "\"old\"")
    XCTAssertEqual(saved.etag, "\"revision-1\"")
    XCTAssertEqual(steps, ["MKCOL", "PUT", "GET"])
  }
  func testStaleUpdateCannotOverwriteOrReadBackAsSuccess() async throws {
    var gets = 0
    MockProtocol.handler = { r in
      if r.httpMethod == "GET" { gets += 1 }
      return (r.httpMethod == "MKCOL" ? 405 : 412, Data())
    }
    let c = client()
    do {
      _ = try await c.save(c.fileURL(name: "Stable"), json: "{\"elements\":[]}", etag: "\"stale\"")
      XCTFail("Must reject concurrent edits")
    } catch CloudError.conflict {}
    XCTAssertEqual(gets, 0)
  }
  func testMissingOrWeakETagRefusesUnsafeSynchronization() async throws {
    let c = client()
    let url = try c.fileURL(name: "Stable")
    MockProtocol.handler = { _ in (200, Data("{\"elements\":[]}".utf8)) }
    for headers in [[:], ["ETag": "W/\"weak\""]] {
      MockProtocol.headers = headers
      do {
        _ = try await c.fetch(url)
        XCTFail("Need a strong revision tag")
      } catch CloudError.missingETag {}
    }
  }
  func testRenameIsConditionalAndNeverOverwritesDestination() async throws {
    let c = client()
    let old = try c.fileURL(name: "Old")
    let new = try c.fileURL(name: "New")
    var methods: [String] = []
    MockProtocol.handler = { r in
      methods.append(r.httpMethod!)
      if r.httpMethod == "MOVE" {
        XCTAssertEqual(r.url, old)
        XCTAssertEqual(r.value(forHTTPHeaderField: "Destination"), new.absoluteString)
        XCTAssertEqual(r.value(forHTTPHeaderField: "Overwrite"), "F")
        XCTAssertEqual(r.value(forHTTPHeaderField: "If-Match"), "\"old\"")
        return (201, Data())
      }
      XCTAssertEqual(r.url, new)
      return (200, Data("{\"elements\":[]}".utf8))
    }
    let moved = try await c.move(old, to: new, etag: "\"old\"")
    XCTAssertEqual(moved.url, new.absoluteString)
    XCTAssertEqual(methods, ["MOVE", "GET"])
  }
  func testSubfoldersAndQueryURLsCannotBeUsedAsFiles() async throws {
    let c = client()
    let root = try account.folder()
    for url in [
      root.appendingPathComponent("sub/Other.whiteboard"),
      URL(string: root.absoluteString + "/a.whiteboard?token=x")!,
    ] {
      do {
        _ = try await c.fetch(url)
        XCTFail("Must reject paths outside selected directory")
      } catch CloudError.unsafePath {}
    }
  }

  func testEncodedTraversalIsRejectedBeforeSendingCredentials() async throws {
    var requests = 0
    MockProtocol.handler = { _ in
      requests += 1
      return (200, Data("{\"elements\":[]}".utf8))
    }
    let c = client()
    let root = try account.folder().absoluteString.trimmingCharacters(
      in: CharacterSet(charactersIn: "/"))
    for name in [
      "%2e%2e%2fOther.whiteboard", "%252e%252e%252fOther.whiteboard", "..%5cOther.whiteboard",
    ] {
      do {
        _ = try await c.fetch(URL(string: root + "/" + name)!)
        XCTFail("Reject encoded traversal")
      } catch CloudError.unsafePath {}
    }
    XCTAssertEqual(requests, 0)
  }

}
