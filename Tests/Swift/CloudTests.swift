import XCTest

@testable import WhisketchCore

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif
final class MockProtocol: URLProtocol {
  static var handler: ((URLRequest) throws -> (Int, Data))?
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    do {
      let (code, data) = try Self.handler!(request)
      client?.urlProtocol(
        self,
        didReceive: HTTPURLResponse(
          url: request.url!, statusCode: code, httpVersion: nil, headerFields: nil)!,
        cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}
final class CloudTests: XCTestCase {
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
        XCTAssertTrue(r.url!.path.hasSuffix(".whiteboard"))
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
}
