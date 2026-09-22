import AppKit

/// What the 🦌 menu can read and change. AppDelegate implements it.
protocol DeerMenuHost: AnyObject {
    var scale: Double { get }
    var isDeerHidden: Bool { get }
    var launchAtLogin: Bool { get }
    var currentDisplayName: String { get }
    var perchedWindowID: CGWindowID? { get }
    func option(_ key: DeerOption) -> Bool
    func setOption(_ key: DeerOption, _ on: Bool)
    func setScale(_ scale: Double)
    func setDeerHidden(_ hidden: Bool)
    func setLaunchAtLogin(_ on: Bool)
    func setDisplay(_ name: String)
    func perch(on window: WindowInfo?)
}

/// Toggles shared with the page (web/index.html reads them as OPT.<rawValue>).
enum DeerOption: String, CaseIterable {
    case friend, ignore, watch, follow, shy, onTop

    var title: String {
        switch self {
        case .friend: return "Friend Mode"
        case .ignore: return "Auto Mode (Ignore Cursor)"
        case .watch: return "Watch the Cursor"
        case .follow: return "Follow the Cursor"
        case .shy: return "Move Out of the Way When Hovered"
        case .onTop: return "Show in Front of Windows"
        }
    }

    var defaultValue: Bool { self == .watch }
}

/// The 🦌 menu-bar item — the only chrome this app has, since the deer's own window is
/// click-through. The menu is rebuilt every time it opens so checkmarks and the window list
/// are always current.
final class StatusBarController: NSObject, NSMenuDelegate {
    private let statusItem: NSStatusItem
    private weak var host: DeerMenuHost?

    private static let sizes: [(String, Double)] = [("Small", 1), ("Medium", 1.5), ("Large", 2)]

    init(host: DeerMenuHost) {
        self.host = host
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        super.init()
        if let url = Bundle.main.url(forResource: "MenuBarDeer", withExtension: "png"),
           let deer = NSImage(contentsOf: url) {
            deer.size = NSSize(width: 18 * deer.size.width / deer.size.height, height: 18)   // menu-bar height
            statusItem.button?.image = deer                 // her own sprite, in colour
        } else {
            statusItem.button?.title = "🦌"
        }
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        guard let host else { return }
        menu.removeAllItems()

        let title = NSMenuItem(title: "Deer Friend", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(.separator())

        menu.addItem(item(host.isDeerHidden ? "Show Deer" : "Hide Deer", keyEquivalent: "h") {
            host.setDeerHidden(!host.isDeerHidden)
        })
        menu.addItem(toggle(.friend))
        menu.addItem(.separator())

        for option in [DeerOption.ignore, .watch, .follow, .shy] {
            let entry = toggle(option)
            if option != .ignore && host.option(.ignore) { entry.isEnabled = false }   // auto mode overrides these
            menu.addItem(entry)
        }
        menu.addItem(.separator())

        menu.addItem(submenu("Live On", homeItems(host)))
        menu.addItem(toggle(.onTop))   // off: other windows can cover her
        menu.addItem(submenu("Display", NSScreen.screens.map { screen in
            checked(screen.localizedName, screen.localizedName == host.currentDisplayName) { host.setDisplay(screen.localizedName) }
        }))
        menu.addItem(submenu("Size", Self.sizes.map { name, value in
            checked(name, value == host.scale) { host.setScale(value) }
        }))
        menu.addItem(.separator())

        menu.addItem(checked("Launch at Login", host.launchAtLogin) { host.setLaunchAtLogin(!host.launchAtLogin) })
        menu.addItem(item("Quit Deer Friend", keyEquivalent: "q") { NSApp.terminate(nil) })
    }

    /// "Bottom of Screen" plus every normal on-screen window she could stand on top of.
    private func homeItems(_ host: DeerMenuHost) -> [NSMenuItem] {
        var items = [checked("Bottom of Screen", host.perchedWindowID == nil) { host.perch(on: nil) }]
        let windows = WindowTracker.listWindows()
        if !windows.isEmpty { items.append(.separator()) }
        for w in windows.prefix(20) {
            items.append(checked(w.menuTitle, w.id == host.perchedWindowID) { host.perch(on: w) })
        }
        return items
    }

    // MARK: - Menu item helpers (closures instead of one @objc selector per item)

    private func toggle(_ option: DeerOption) -> NSMenuItem {
        checked(option.title, host?.option(option) ?? false) { [weak self] in
            guard let host = self?.host else { return }
            host.setOption(option, !host.option(option))
        }
    }

    private func checked(_ title: String, _ on: Bool, _ action: @escaping () -> Void) -> NSMenuItem {
        let entry = item(title, action)
        entry.state = on ? .on : .off
        return entry
    }

    private func item(_ title: String, keyEquivalent: String = "", _ action: @escaping () -> Void) -> NSMenuItem {
        let entry = NSMenuItem(title: title, action: #selector(ClosureTarget.fire(_:)), keyEquivalent: keyEquivalent)
        let target = ClosureTarget(action)
        entry.target = target
        entry.representedObject = target   // menu items hold targets weakly; this keeps it alive
        return entry
    }

    private func submenu(_ title: String, _ items: [NSMenuItem]) -> NSMenuItem {
        let entry = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        let sub = NSMenu()
        items.forEach(sub.addItem)
        entry.submenu = sub
        return entry
    }
}

private final class ClosureTarget: NSObject {
    private let action: () -> Void
    init(_ action: @escaping () -> Void) { self.action = action }
    @objc func fire(_ sender: Any?) { action() }
}
