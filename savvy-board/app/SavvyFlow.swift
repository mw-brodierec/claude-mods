// Savvy Flow: the savvy board in its own small Mac app (a WebKit window), so the Dock shows one
// "Savvy Flow" tile with Clawd instead of an extra Google Chrome per launch.
// Single instance by macOS rules (`open -a` brings the running one forward); quits with its window.
// Built by build-app.sh; the board's server (../server.mjs) serves the page.
import Cocoa
import WebKit

let board = URL(string: ProcessInfo.processInfo.environment["SAVVY_BOARD_URL"] ?? "http://127.0.0.1:7447/")!

final class App: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
  var window: NSWindow!
  var web: WKWebView!

  func applicationDidFinishLaunching(_ n: Notification) {
    web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    web.navigationDelegate = self
    web.uiDelegate = self
    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 900),
                      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "Savvy Flow"
    window.contentView = web
    // First run: top-right corner of the main screen, like the old Chrome window. After that the
    // window keeps wherever Marc left it.
    if !window.setFrameUsingName("SavvyBoard"), let v = NSScreen.main?.visibleFrame {
      let h = min(900, v.height - 16)
      window.setFrame(NSRect(x: v.maxX - 428, y: v.maxY - h - 8, width: 420, height: h), display: false)
    }
    window.setFrameAutosaveName("SavvyBoard")
    window.makeKeyAndOrderFront(nil)
    web.load(URLRequest(url: board))
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }

  // The board's own pages stay here; PR links, memos and anything else go to their default app.
  func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler h: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let u = a.request.url else { return h(.cancel) }
    if u.host == board.host && u.port == board.port { return h(.allow) }
    NSWorkspace.shared.open(u)
    h(.cancel)
  }

  // target="_blank" links.
  func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
    if let u = a.request.url { NSWorkspace.shared.open(u) }
    return nil
  }

  // Server not up yet (login, LaunchAgent restart): try again until it answers.
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { w.load(URLRequest(url: board)) }
  }

  @objc func reloadBoard(_ s: Any?) { web.load(URLRequest(url: board)) }
}

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
// Without a menu, ⌘Q, ⌘W, ⌘C and ⌘R do nothing.
let menu = NSMenu(), appItem = NSMenuItem(), appMenu = NSMenu()
appMenu.addItem(withTitle: "Reload", action: #selector(App.reloadBoard(_:)), keyEquivalent: "r")
appMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
appMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
appMenu.addItem(.separator())
appMenu.addItem(withTitle: "Quit Savvy Flow", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
appItem.submenu = appMenu
menu.addItem(appItem)
app.mainMenu = menu
app.setActivationPolicy(.regular)
app.run()
