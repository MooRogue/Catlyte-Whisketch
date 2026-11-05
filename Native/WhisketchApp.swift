import Security
import SwiftUI
import UniformTypeIdentifiers
import Vision
import WebKit

final class Bridge: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
  weak var web: WKWebView?
  @Published var showCloud = false
  @Published var showImport = false
  @Published var exportURL: URL?
  @Published var error: String?
  @Published var recognition: RecognizedText?
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard message.frameInfo.isMainFrame, let obj = message.body as? [String: Any],
      let type = obj["type"] as? String
    else {
      return
    }
    switch type {
    case "error": error = obj["message"] as? String
    case "ready": sendCloudConfiguration()
    case "cloudRequest": cloudRequest(obj)
    case "connect": showCloud = true
    case "ocr": showImport = true
    case "recognizeBoard":
      guard let text = obj["data"] as? String, let comma = text.firstIndex(of: ","),
        let data = Data(base64Encoded: String(text[text.index(after: comma)...]))
      else { return }
      Task { @MainActor in
        do {
          let result = try await Task.detached(priority: .userInitiated) {
            try PhotoRecognizer.text(in: data)
          }.value
          guard !result.isEmpty else {
            self.error =
              "No text was recognized. Try selecting a smaller area or clearer handwriting."
            return
          }
          recognition = RecognizedText(text: result)
        } catch { self.error = error.localizedDescription }
      }
    case "exportNotebookPDF":
      guard let name = obj["name"] as? String, let pages = obj["pages"] as? [String],
        !pages.isEmpty, pages.count <= 500 else { return }
      do {
        let bounds = CGRect(x: 0, y: 0, width: 595, height: 842)
        let images = try pages.map { value -> UIImage in
          guard let comma = value.firstIndex(of: ","),
            let data = Data(base64Encoded: String(value[value.index(after: comma)...])),
            let image = UIImage(data: data) else { throw CloudError.invalidResponse }
          return image
        }
        let output = UIGraphicsPDFRenderer(bounds: bounds).pdfData { context in
          for image in images {
            context.beginPage()
            let scale = min(555 / image.size.width, 802 / image.size.height)
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            image.draw(in: CGRect(x:(595-size.width)/2,y:(842-size.height)/2,width:size.width,height:size.height))
          }
        }
        let safe = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: "\\", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(String(safe.prefix(100))+".pdf")
        try output.write(to: url, options: .atomic); exportURL = url
      } catch { self.error = error.localizedDescription }
    case "exportImage", "exportPDF":
      guard let name = obj["name"] as? String, let text = obj["data"] as? String,
        let comma = text.firstIndex(of: ","),
        let data = Data(base64Encoded: String(text[text.index(after: comma)...]))
      else { return }
      do {
        let safe = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(
          of: "\\", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(
          String(safe.prefix(100)) + (type == "exportPDF" ? ".pdf" : ".png"))
        var output = data
        if type == "exportPDF", let image = UIImage(data: data) {
          let page = CGRect(x: 0, y: 0, width: 595, height: 842)
          output = UIGraphicsPDFRenderer(bounds: page).pdfData { context in
            context.beginPage()
            let scale = min(555 / image.size.width, 802 / image.size.height)
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            image.draw(
              in: CGRect(
                x: (595 - size.width) / 2, y: (842 - size.height) / 2, width: size.width,
                height: size.height))
          }
        }
        try output.write(to: url, options: .atomic)
        exportURL = url
      } catch { self.error = error.localizedDescription }
    case "export", "exportBackup":
      guard let name = obj["name"] as? String, let json = obj["json"] as? String else { return }
      do {
        let safe = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(
          of: "\\", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(
          String(safe.prefix(100)) + (type == "exportBackup" ? ".json" : ".whisketch"))
        try Data(json.utf8).write(to: url, options: .atomic)
        exportURL = url
      } catch { self.error = error.localizedDescription }
    default: break
    }
  }
  func savedCloudAccount() -> CloudAccount? {
    guard UserDefaults.standard.object(forKey: "cloudAutoSync") as? Bool ?? true,
      let server = UserDefaults.standard.string(forKey: "cloudServer"),
      let user = UserDefaults.standard.string(forKey: "cloudUser"), !user.isEmpty
    else { return nil }
    let account = CloudAccount(
      server: server, username: user,
      folderPath: UserDefaults.standard.string(forKey: "cloudFolder") ?? "Whisketch")
    return PasswordStore.read(account).isEmpty ? nil : account
  }
  func sendCloudConfiguration() {
    guard let account = savedCloudAccount(), let folder = try? account.folder() else {
      call("configureCloud", ["null"])
      return
    }
    let object = ["scope": folder.absoluteString, "folder": account.folderPath]
    if let data = try? JSONSerialization.data(withJSONObject: object),
      let json = String(data: data, encoding: .utf8)
    {
      call("configureCloud", [json])
    }
  }
  func cloudRequest(_ object: [String: Any]) {
    guard let id = object["requestID"] as? String else { return }
    Task { @MainActor in
      var response: [String: Any] = ["id": id]
      do {
        guard let account = savedCloudAccount(), let scope = object["scope"] as? String,
          scope == (try account.folder().absoluteString)
        else { throw CloudError.invalidServer }
        let client = NextcloudClient(account: account, password: PasswordStore.read(account))
        let operation = object["operation"] as? String
        if operation == "target", let name = object["name"] as? String {
          response["result"] = ["url": try client.fileURL(name: name).absoluteString]
        } else {
          guard let text = object["url"] as? String, let url = URL(string: text) else {
            throw CloudError.unsafePath
          }
          var document: CloudDocument?
          switch operation {
          case "read": document = try await client.fetch(url)
          case "write":
            guard let json = object["json"] as? String else { throw CloudError.invalidResponse }
            document = try await client.save(url, json: json, etag: object["etag"] as? String)
          case "move":
            guard let destination = object["destination"] as? String,
              let to = URL(string: destination),
              let etag = object["etag"] as? String
            else { throw CloudError.invalidResponse }
            document = try await client.move(url, to: to, etag: etag)
          default: throw CloudError.invalidResponse
          }
          if let document = document {
            response["result"] = try JSONSerialization.jsonObject(
              with: JSONEncoder().encode(document))
          } else {
            response["result"] = NSNull()
          }
        }
      } catch {
        response["error"] = error.localizedDescription
        if case CloudError.conflict = error { response["code"] = "conflict" }
      }
      if let data = try? JSONSerialization.data(withJSONObject: response),
        let json = String(data: data, encoding: .utf8)
      {
        call("cloudResponse", [json])
      }
    }
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      return
    }
    if url.scheme == "whisketch", url.host == "localhost" {
      decisionHandler(.allow)
    } else {
      if url.scheme == "https" || url.scheme == "http" { UIApplication.shared.open(url) }
      decisionHandler(.cancel)
    }
  }
  func call(_ name: String, _ args: [String]) {
    guard let data = try? JSONSerialization.data(withJSONObject: args),
      let json = String(data: data, encoding: .utf8)
    else { return }
    web?.evaluateJavaScript("window.Whisketch && window.Whisketch.\(name)(...\(json))")
  }
  func insertRecognizedText(_ text: String, completion: @escaping (String?) -> Void) {
    guard let web, let data = try? JSONSerialization.data(withJSONObject: [text]),
      let json = String(data: data, encoding: .utf8) else {
      completion("The page is not ready. Please try again."); return
    }
    web.evaluateJavaScript("window.Whisketch && window.Whisketch.insertText(...\(json))") { result, error in
      DispatchQueue.main.async {
        if error == nil, let response = result as? [String: Any], response["inserted"] as? Bool == true {
          completion(nil)
        } else { completion("Text could not be inserted. Keep this review open and try again when the page is ready.") }
      }
    }
  }
  func importFile(_ url: URL) {
    Task { @MainActor in
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      do {
        if let data = try? Data(contentsOf: url), let text = String(data: data, encoding: .utf8),
          (try? JSONSerialization.jsonObject(with: data)) is [String: Any]
        {
          call("importDocument", [text, url.lastPathComponent])
          return
        }
        let data = try Data(contentsOf: url)
        let text = try await Task.detached(priority: .userInitiated) {
          try PhotoRecognizer.text(in: data)
        }.value
        guard !text.isEmpty else { throw CloudError.invalidResponse }
        guard let image = UIImage(data: data), let png = image.pngData() else {
          throw CloudError.invalidResponse
        }
        call("insertCapture", ["data:image/png;base64," + png.base64EncodedString(), text])
        call("setNotice", ["Photo and recognized text inserted. Review the transcription."])
      } catch {
        self.error = "Could not import or recognize this file: \(error.localizedDescription)"
      }
    }
  }
}
struct Editor: UIViewRepresentable {
  @ObservedObject var bridge: Bridge
  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(EditorResources(), forURLScheme: "whisketch")
    config.userContentController.add(bridge, name: "whisketch")
    config.userContentController.addUserScript(
      WKUserScript(
        source:
          "window.addEventListener('error',e=>window.webkit.messageHandlers.whisketch.postMessage({type:'error',message:e.message||'Editor resource failed to load'}),true);window.addEventListener('unhandledrejection',e=>window.webkit.messageHandlers.whisketch.postMessage({type:'error',message:String(e.reason)}));",
        injectionTime: .atDocumentStart, forMainFrameOnly: true))
    let web = WKWebView(frame: .zero, configuration: config)
    web.isInspectable = true
    web.scrollView.isScrollEnabled = false
    web.isOpaque = false
    web.navigationDelegate = bridge
    bridge.web = web
    web.load(URLRequest(url: URL(string: "whisketch://localhost/index.html")!))
    return web
  }
  func updateUIView(_ uiView: WKWebView, context: Context) {}
}
enum PasswordStore {
  static func key(_ account: CloudAccount) -> String { account.server + "|" + account.username }
  static func read(_ account: CloudAccount) -> String {
    var value: CFTypeRef?
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.catlyte.Whisketch.nextcloud",
      kSecAttrAccount as String: key(account), kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    guard SecItemCopyMatching(q as CFDictionary, &value) == errSecSuccess, let data = value as? Data
    else { return "" }
    return String(data: data, encoding: .utf8) ?? ""
  }
  static func save(_ password: String, for account: CloudAccount) throws {
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.catlyte.Whisketch.nextcloud",
      kSecAttrAccount as String: key(account),
    ]
    SecItemDelete(q as CFDictionary)
    var insert = q
    insert[kSecValueData as String] = Data(password.utf8)
    insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else {
      throw CloudError.invalidResponse
    }
  }
}
struct CloudSheet: View {
  @ObservedObject var bridge: Bridge
  @Environment(\.dismiss) var dismiss
  @State var server =
    UserDefaults.standard.string(forKey: "cloudServer") ?? "https://nextcloud.genkizone.com"
  @State var user = UserDefaults.standard.string(forKey: "cloudUser") ?? ""
  @State var password = ""
  @State var folder = UserDefaults.standard.string(forKey: "cloudFolder") ?? "Whisketch"
  @State var boards: [CloudBoard] = []
  @State var status =
    "Connect with a Nextcloud app password, then select where your Whisketch notebooks live."
  @State var busy = false
  @State var autoSync =
    UserDefaults.standard.object(forKey: "cloudAutoSync") as? Bool
    ?? !(UserDefaults.standard.string(forKey: "cloudUser") ?? "").isEmpty
  var account: CloudAccount {
    CloudAccount(
      server: server.trimmingCharacters(in: .whitespacesAndNewlines), username: user,
      folderPath: folder)
  }
  func work(_ action: @escaping (NextcloudClient) async throws -> Void) {
    busy = true
    Task { @MainActor in
      defer { busy = false }
      do {
        _ = try account.baseURL()
        let client = NextcloudClient(account: account, password: password)
        try await action(client)
      } catch { status = error.localizedDescription }
    }
  }
  var body: some View {
    NavigationStack {
      Form {
        Section("Nextcloud") {
          TextField("HTTPS server", text: $server).textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          TextField("Username", text: $user).textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          SecureField("App password", text: $password)
          TextField("Folder in Files", text: $folder).textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          Text(
            "Files → \(folder.isEmpty ? "All files" : folder). Notebook files can live in any folder. Connected notes sync when opened and after edits."
          ).font(.footnote)
          Button("Connect and enable automatic sync") {
            let connectingPassword = password
            work { client in
              boards = try await client.boards()
              try PasswordStore.save(connectingPassword, for: client.account)
              UserDefaults.standard.set(client.account.server, forKey: "cloudServer")
              UserDefaults.standard.set(client.account.username, forKey: "cloudUser")
              UserDefaults.standard.set(client.account.folderPath, forKey: "cloudFolder")
              UserDefaults.standard.set(true, forKey: "cloudAutoSync")
              autoSync = true
              bridge.sendCloudConfiguration()
              status =
                boards.isEmpty
                ? "Automatic sync enabled. Open a notebook to save it here."
                : "Automatic sync enabled. Select a notebook to open and keep synced."
            }
          }.disabled(busy || user.isEmpty || password.isEmpty)
        }.disabled(busy)
        Section {
          Text(status).font(.callout)
          if busy { ProgressView() }
        }
        if autoSync {
          Button("Pause automatic sync") {
            UserDefaults.standard.set(false, forKey: "cloudAutoSync")
            autoSync = false
            bridge.sendCloudConfiguration()
            status = "Automatic sync paused. Notes remain saved on this device."
          }
        }
        Section("Open a synced board") {
          ForEach(boards) { board in
            Button(board.name) {
              work { client in
                guard let document = try await client.fetch(board.url) else {
                  throw CloudError.http(404)
                }
                // A successfully connected account is persisted before opening boards.
                bridge.sendCloudConfiguration()
                bridge.call(
                  "openCloudDocument",
                  [
                    document.json, board.name, document.url, document.etag,
                    try client.account.folder().absoluteString,
                  ])
                dismiss()
              }
            }.disabled(busy)
          }
        }
        Section {
          Text(
            "Notes refresh on opening and save automatically after edits. Offline changes stay local until a retry succeeds. Conflicts require choosing a version. This is file sync, not simultaneous live collaboration. iCloud is not included."
          ).font(.footnote)
        }
      }.navigationTitle("Nextcloud").toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
      }.onAppear { password = PasswordStore.read(account) }
        .onChange(of: server) { _, _ in
          password = PasswordStore.read(account)
          boards = []
        }
        .onChange(of: user) { _, _ in
          password = PasswordStore.read(account)
          boards = []
        }
        .onChange(of: folder) { _, _ in boards = [] }
    }
  }
}
struct ShareSheet: UIViewControllerRepresentable {
  let url: URL
  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: [url], applicationActivities: nil)
  }
  func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
@main struct WhisketchApp: App {
  @StateObject var bridge = Bridge()
  @Environment(\.scenePhase) private var scenePhase
  var body: some Scene {
    WindowGroup {
      Editor(bridge: bridge)
        .onChange(of: scenePhase) { _, phase in
          if phase == .active {
            bridge.sendCloudConfiguration()
            bridge.call("cloudForeground", [])
          }
        }
        .sheet(item: $bridge.recognition) { RecognitionSheet(bridge: bridge, text: $0.text) }
        .sheet(isPresented: $bridge.showCloud) { CloudSheet(bridge: bridge) }
        .sheet(
          item: Binding(
            get: { bridge.exportURL.map { ShareItem(url: $0) } },
            set: { bridge.exportURL = $0?.url })
        ) { ShareSheet(url: $0.url) }
        .fileImporter(isPresented: $bridge.showImport, allowedContentTypes: [.image, .json, .data])
      { result in
        switch result {
        case .success(let url): bridge.importFile(url)
        case .failure(let e): bridge.error = e.localizedDescription
        }
      }
        .alert(
          "Whisketch",
          isPresented: Binding(get: { bridge.error != nil }, set: { if !$0 { bridge.error = nil } })
        ) {
          Button("OK") { bridge.error = nil }
        } message: {
          Text(bridge.error ?? "")
        }
    }
  }
}
struct RecognizedText: Identifiable {
  let id = UUID()
  let text: String
}
struct RecognitionSheet: View {
  @ObservedObject var bridge: Bridge
  @Environment(\.dismiss) var dismiss
  @State var text: String
  @State private var inserting = false
  @State private var insertionError: String?
  init(bridge: Bridge, text: String) {
    self.bridge = bridge
    self._text = State(initialValue: text)
  }
  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 16) {
        Text(
          "Review the extracted text before inserting it. Your original ink and drawings stay unchanged. Handwriting accuracy varies."
        ).font(.callout).foregroundStyle(.secondary)
        TextEditor(text: $text).font(.body).padding(8).background(.thinMaterial).clipShape(
          RoundedRectangle(cornerRadius: 14))
        if let insertionError { Text(insertionError).foregroundStyle(.red).font(.callout) }
      }.padding().navigationTitle("Recognized text").toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Insert text") {
            inserting = true; insertionError = nil
            bridge.insertRecognizedText(text) { error in
              inserting = false
              if let error { insertionError = error } else { dismiss() }
            }
          }.disabled(inserting || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      }
    }
  }
}
struct ShareItem: Identifiable {
  let url: URL
  var id: String { url.absoluteString }
}
