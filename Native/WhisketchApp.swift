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
  var pendingPublish: (String, String)?
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard let obj = message.body as? [String: Any], let type = obj["type"] as? String else {
      return
    }
    switch type {
    case "error": error = obj["message"] as? String
    case "connect": showCloud = true
    case "ocr": showImport = true
    case "publish":
      if let name = obj["name"] as? String, let json = obj["json"] as? String {
        pendingPublish = (name, json)
        showCloud = true
      }
    case "export":
      guard let name = obj["name"] as? String, let json = obj["json"] as? String else { return }
      do {
        let safe = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(
          of: "\\", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(
          String(safe.prefix(100)) + ".excalidraw")
        try Data(json.utf8).write(to: url, options: .atomic)
        exportURL = url
      } catch { self.error = error.localizedDescription }
    default: break
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
  @State var boards: [CloudBoard] = []
  @State var status = "Connect with a Nextcloud app password. Only the Whisketch folder is used."
  @State var busy = false
  var account: CloudAccount {
    CloudAccount(server: server.trimmingCharacters(in: .whitespacesAndNewlines), username: user)
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
          Button("Connect and list boards") {
            work { client in
              boards = try await client.boards()
              try PasswordStore.save(password, for: account)
              UserDefaults.standard.set(account.server, forKey: "cloudServer")
              UserDefaults.standard.set(user, forKey: "cloudUser")
              status =
                boards.isEmpty
                ? "Connected. No editable boards in Whisketch yet."
                : "Connected. Select a board to import a local copy."
            }
          }.disabled(busy || user.isEmpty || password.isEmpty)
        }
        Section {
          Text(status).font(.callout)
          if busy { ProgressView() }
        }
        if bridge.pendingPublish != nil {
          Section("Publish a new copy") {
            Text(
              "A uniquely named .whiteboard file will be created and verified. Your local notebook remains independent; existing boards are never overwritten."
            ).font(.callout)
            Button("Publish this notebook") {
              work { client in
                guard let (name, json) = bridge.pendingPublish else { return }
                let url = try await client.publishCopy(name: name, json: json)
                bridge.pendingPublish = nil
                status = "Verified new copy: \(url.lastPathComponent)"
                bridge.call(
                  "setNotice", ["Published a verified copy to Nextcloud. Live sync is not enabled."]
                )
              }
            }.disabled(busy || user.isEmpty || password.isEmpty)
          }
        }
        Section("Import a copy") {
          ForEach(boards) { board in
            Button(board.name) {
              work { client in
                let json = try await client.download(board)
                bridge.call("importDocument", [json, board.name])
                dismiss()
              }
            }.disabled(busy)
          }
        }
        Section {
          Text(
            "Live collaboration, automatic two-way sync and iCloud are not included in this first prototype."
          ).font(.footnote)
        }
      }.navigationTitle("Nextcloud").toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
      }.onAppear { password = PasswordStore.read(account) }
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
  var body: some Scene {
    WindowGroup {
      Editor(bridge: bridge)
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
struct ShareItem: Identifiable {
  let url: URL
  var id: String { url.absoluteString }
}
