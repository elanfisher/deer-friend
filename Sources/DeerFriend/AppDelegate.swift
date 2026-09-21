import AppKit
import WebKit

/// Hosts the web fawn (web/index.html in desktop mode) in a transparent, click-through
/// strip along the bottom of the screen, just above the Dock. The page can't see the real
/// cursor through a click-through window, so we poll it here and pass it in.
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusBar: StatusBarController!
    private var timer: Timer?
    private var lastCursor = (x: CGFloat.nan, y: CGFloat.nan, down: false)

    /// 1 = small (about the size of a desktop mascot), 1.5 = medium, 2 = large.
    private var scale: Double = UserDefaults.standard.object(forKey: "deerScale") as? Double ?? 1
    private let stripHeight: CGFloat = 150   // logical px: room for jumps, hearts and Z's

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // no Dock icon

        let config = WKWebViewConfiguration()
        let boot = "window.DEER_DESKTOP = true; window.DEER_SCALE = \(scale);"
        config.userContentController.addUserScript(
            WKUserScript(source: boot, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let win = NSWindow(contentRect: stripFrame(), styleMask: [.borderless], backing: .buffered, defer: false)
        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = false
        win.ignoresMouseEvents = true // fully click-through — never blocks the desktop or other apps
        win.level = .floating
        win.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        win.isReleasedWhenClosed = false

        let web = WKWebView(frame: win.contentView!.bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground") // transparent page background
        web.navigationDelegate = self
        win.contentView = web

        window = win
        webView = web

        if let url = pageURL() {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            NSLog("DeerFriend: couldn't find web/index.html")
        }

        statusBar = StatusBarController(
            scale: scale,
            onScale: { [weak self] s in self?.setScale(s) },
            currentDisplay: { [weak self] in self?.currentScreen().localizedName ?? "" },
            onDisplay: { [weak self] name in self?.setDisplay(name) },
            onQuit: { NSApp.terminate(nil) }
        )

        win.orderFrontRegardless() // show without activating / stealing focus

        let t = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in self?.pushCursor() }
        RunLoop.main.add(t, forMode: .common)
        timer = t

        NotificationCenter.default.addObserver(
            self, selector: #selector(screensChanged),
            name: NSApplication.didChangeScreenParametersNotification, object: nil)
    }

    /// The display she lives on: the one picked in the 🦌 menu, else the main display.
    private func currentScreen() -> NSScreen {
        let wanted = UserDefaults.standard.string(forKey: "deerDisplay")
        return NSScreen.screens.first { $0.localizedName == wanted } ?? NSScreen.main ?? NSScreen.screens[0]
    }

    private func stripFrame() -> NSRect {
        let visible = currentScreen().visibleFrame // excludes Dock + menu bar
        return NSRect(x: visible.minX, y: visible.minY, width: visible.width, height: stripHeight * scale)
    }

    private func pageURL() -> URL? {
        if let bundled = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") {
            return bundled
        }
        // `swift run` during development: fall back to the source tree
        let dev = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("web/index.html")
        return FileManager.default.fileExists(atPath: dev.path) ? dev : nil
    }

    /// Global cursor → strip-local page coordinates (y grows downward). Only sent when it changes.
    private func pushCursor() {
        let p = NSEvent.mouseLocation
        let f = window.frame
        let x = (p.x - f.minX).rounded()
        let y = (f.maxY - p.y).rounded()
        let down = NSEvent.pressedMouseButtons & 1 != 0
        guard x != lastCursor.x || y != lastCursor.y || down != lastCursor.down else { return }
        lastCursor = (x, y, down)
        webView.evaluateJavaScript("window.deerDesktop && deerDesktop.cursor(\(x), \(y), \(down))")
    }

    private func setScale(_ s: Double) {
        scale = s
        UserDefaults.standard.set(s, forKey: "deerScale")
        window.setFrame(stripFrame(), display: true)
        webView.evaluateJavaScript("window.deerDesktop && deerDesktop.setScale(\(s))")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("DeerFriend load failed: \(error)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("DeerFriend load failed: \(error)")
    }

    private func setDisplay(_ name: String) {
        UserDefaults.standard.set(name, forKey: "deerDisplay")
        window.setFrame(stripFrame(), display: true)   // the page re-lays itself out on resize
    }

    @objc private func screensChanged() {
        window.setFrame(stripFrame(), display: true)
    }
}
