import AppKit
import ServiceManagement
import WebKit

/// Hosts the web fawn (web/index.html in desktop mode) in a transparent, click-through window:
/// the whole screen (hopping between the tops of your windows), a strip along the bottom, or
/// perched on top of one chosen window. The page can't see the
/// real cursor through a click-through window, so it's polled here and passed in.
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, DeerMenuHost {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusBar: StatusBarController!
    private var cursorTimer: Timer?
    private var perchTimer: Timer?
    private var ledgeTimer: Timer?
    private var lastLedges: String?
    private var lastCursor = (x: CGFloat.nan, y: CGFloat.nan, down: false)
    private let defaults = UserDefaults.standard
    private var pageFile: URL?

    /// Logical px tall: room for jumps, hearts and Z's above the ground line.
    private let stripHeight: CGFloat = 150
    /// Her feet sit a few px above the strip's bottom edge; sink it this much onto a window's top.
    private let perchSink: CGFloat = 4

    private(set) var scale: Double
    private(set) var isDeerHidden = false
    private(set) var perchedWindowID: CGWindowID?

    /// Where she lives when not perched on one window: "screen" (hop between windows) or "bottom".
    var home: String { defaults.string(forKey: "deerHome") ?? "screen" }
    var isRoaming: Bool { perchedWindowID == nil && home == "screen" }

    override init() {
        scale = UserDefaults.standard.object(forKey: "deerScale") as? Double ?? 1
        super.init()
    }

    // MARK: - Launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // no Dock icon

        let config = WKWebViewConfiguration()
        config.userContentController.addUserScript(
            WKUserScript(source: bootScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let win = NSWindow(contentRect: isRoaming ? roamFrame() : stripFrame(), styleMask: [.borderless], backing: .buffered, defer: false)
        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = false
        win.ignoresMouseEvents = true // fully click-through — never blocks the desktop or other apps
        win.level = option(.onTop) ? .floating : .normal   // .normal lets other windows cover her
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
            pageFile = url
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            NSLog("DeerFriend: couldn't find web/index.html")
        }

        statusBar = StatusBarController(host: self)
        win.orderFrontRegardless() // show without activating / stealing focus
        placeForHome()

        let timer = Timer(timeInterval: 1.0 / 24.0, repeats: true) { [weak self] _ in self?.pushCursor() }
        RunLoop.main.add(timer, forMode: .common)
        cursorTimer = timer

        NotificationCenter.default.addObserver(
            self, selector: #selector(screensChanged),
            name: NSApplication.didChangeScreenParametersNotification, object: nil)
    }

    /// Settings the page needs before its first frame.
    private func bootScript() -> String {
        let opts = DeerOption.allCases.map { "\"\($0.rawValue)\": \(option($0))" }.joined(separator: ", ")
        let debug = ProcessInfo.processInfo.environment["DEERFRIEND_DEBUG"] == "1"
            ? "addEventListener('error', e => { window.__err = e.message + ' @' + e.lineno; });" : ""
        return debug + "window.DEER_DESKTOP = true; window.DEER_SCALE = \(scale); window.DEER_OPTS = {\(opts)};"
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

    private func js(_ source: String) {
        webView.evaluateJavaScript("window.deerDesktop && \(source)")
    }

    // MARK: - Placement

    /// The display she lives on: the one picked in the menu, else the main display.
    private func currentScreen() -> NSScreen {
        let wanted = defaults.string(forKey: "deerDisplay")
        return NSScreen.screens.first { $0.localizedName == wanted } ?? NSScreen.main ?? NSScreen.screens[0]
    }

    var currentDisplayName: String { currentScreen().localizedName }

    /// Bottom of the chosen display, just above the Dock.
    private func stripFrame() -> NSRect {
        let visible = currentScreen().visibleFrame // excludes Dock + menu bar
        return NSRect(x: visible.minX, y: visible.minY, width: visible.width, height: stripHeight * scale)
    }

    /// The whole usable screen (below the menu bar, above the Dock): she roams all of it.
    private func roamFrame() -> NSRect { currentScreen().visibleFrame }

    /// Puts the window where her home is, and starts or stops feeding her the window ledges.
    private func placeForHome() {
        if let id = perchedWindowID, let found = WindowTracker.lookup(id) {
            place(found.onScreen ? perchFrame(found.bounds) : stripFrame())
        } else if isRoaming {
            place(roamFrame())
        } else {
            place(stripFrame())
        }
        // Roaming she's drawn in front of windows, but only ever stands on their visible edges.
        window.level = isRoaming || option(.onTop) ? .floating : .normal

        if isRoaming {
            if ledgeTimer == nil {
                let timer = Timer(timeInterval: 0.125, repeats: true) { [weak self] _ in self?.pushLedges() }
                RunLoop.main.add(timer, forMode: .common)
                ledgeTimer = timer
            }
            pushLedges()
        } else {
            ledgeTimer?.invalidate()
            ledgeTimer = nil
            lastLedges = nil
            js("deerDesktop.setLedges([])")
        }
    }

    /// Sends her the visible tops of your windows, plus the ground — only when they change.
    private func pushLedges() {
        guard !isDeerHidden else { return }
        let frame = window.frame
        var ledges = WindowTracker.ledges(in: frame, headroom: 80 * scale).map {
            ["id": $0.id, "x0": Double($0.x0), "x1": Double($0.x1), "y": Double($0.y)] as [String: Any]
        }
        ledges.append(["id": "ground", "x0": 0.0, "x1": Double(frame.width), "y": Double(frame.height - 4)])
        guard let data = try? JSONSerialization.data(withJSONObject: ledges),
              let json = String(data: data, encoding: .utf8), json != lastLedges else { return }
        lastLedges = json
        js("deerDesktop.setLedges(\(json))")
    }

    func setHome(_ newHome: String) {
        defaults.set(newHome, forKey: "deerHome")
        perch(on: nil)
    }

    /// Standing on the top edge of a window.
    private func perchFrame(_ bounds: CGRect) -> NSRect {
        NSRect(x: bounds.minX, y: WindowTracker.appKitTopEdge(of: bounds) - perchSink,
               width: bounds.width, height: stripHeight * scale)
    }

    private func place(_ frame: NSRect) {
        if window.frame != frame { window.setFrame(frame, display: true) }   // the page re-lays itself out on resize
    }

    func perch(on target: WindowInfo?) {
        perchTimer?.invalidate()
        perchTimer = nil
        perchedWindowID = target?.id
        placeForHome()
        guard target != nil else { return }
        // Follow the window as it's dragged around; drop back to the Dock line if it closes.
        let timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in self?.followPerch() }
        RunLoop.main.add(timer, forMode: .common)
        perchTimer = timer
    }

    private func followPerch() {
        guard let id = perchedWindowID else { return }
        guard let found = WindowTracker.lookup(id) else { perch(on: nil); return }   // window closed
        place(found.onScreen ? perchFrame(found.bounds) : stripFrame())               // minimized: wait at the Dock line
        // Sit directly above her window in the stacking order, so windows in front of it cover her too.
        if found.onScreen && !option(.onTop) && WindowTracker.windowDirectlyAbove(id) != CGWindowID(window.windowNumber) {
            window.order(.above, relativeTo: Int(id))
        }
    }

    func setDisplay(_ name: String) {
        defaults.set(name, forKey: "deerDisplay")
        perch(on: nil)
    }

    @objc private func screensChanged() {
        if perchedWindowID == nil { placeForHome() }
    }

    // MARK: - Menu actions

    func option(_ key: DeerOption) -> Bool {
        defaults.object(forKey: "opt." + key.rawValue) as? Bool ?? key.defaultValue
    }

    func setOption(_ key: DeerOption, _ on: Bool) {
        defaults.set(on, forKey: "opt." + key.rawValue)
        if key == .onTop {
            placeForHome()
            window.orderFrontRegardless()
            return
        }
        js("deerDesktop.setOptions({\(key.rawValue): \(on)})")
    }

    func setScale(_ s: Double) {
        scale = s
        defaults.set(s, forKey: "deerScale")
        js("deerDesktop.setScale(\(s))")
        lastLedges = nil
        placeForHome()
    }

    func setDeerHidden(_ hidden: Bool) {
        isDeerHidden = hidden
        js("deerDesktop.setPaused(\(hidden))")   // stop animating entirely while hidden
        if hidden { window.orderOut(nil) } else { window.orderFrontRegardless() }
    }

    var launchAtLogin: Bool { SMAppService.mainApp.status == .enabled }

    func setLaunchAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            NSLog("DeerFriend: launch at login failed: \(error)")
        }
        if SMAppService.mainApp.status == .requiresApproval {
            SMAppService.openSystemSettingsLoginItems()   // macOS asks the user to allow it once
        }
    }

    // MARK: - Cursor

    /// Global cursor → strip-local page coordinates (y grows downward). Only sent when it changes.
    private func pushCursor() {
        guard !isDeerHidden else { return }
        let p = NSEvent.mouseLocation
        let f = window.frame
        let x = (p.x - f.minX).rounded()
        let y = (f.maxY - p.y).rounded()
        let down = NSEvent.pressedMouseButtons & 1 != 0
        guard x != lastCursor.x || y != lastCursor.y || down != lastCursor.down else { return }
        lastCursor = (x, y, down)
        js("deerDesktop.cursor(\(x), \(y), \(down))")
    }

    // MARK: - WKNavigationDelegate

    /// The web view only ever shows the bundled page — any other navigation is refused.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        let allowed = url?.isFileURL == true && url?.standardizedFileURL.path == pageFile?.standardizedFileURL.path
        decisionHandler(allowed ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        lastLedges = nil
        if isRoaming { pushLedges() }
        // DEERFRIEND_DEBUG=1: log where the deer are every few seconds (development only)
        if ProcessInfo.processInfo.environment["DEERFRIEND_DEBUG"] == "1" {
            let timer = Timer(timeInterval: 3, repeats: true) { [weak self] _ in
                self?.webView.evaluateJavaScript(
                    "window.__err || JSON.stringify(deerDebug.herd.map(d => [d.state, d.ledgeId, Math.round(d.x), Math.round(d.y)]))") { r, _ in
                    NSLog("deer: \(r ?? "?")  ledges: \(self?.lastLedges?.count ?? 0) chars")
                }
            }
            RunLoop.main.add(timer, forMode: .common)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("DeerFriend: page failed to load: \(error)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("DeerFriend: page failed to load: \(error)")
    }
}
