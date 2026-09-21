import AppKit

/// Tiny 🦌 menu-bar item — the only chrome this app has, since the deer's own
/// window is click-through and never steals focus.
final class StatusBarController {
    private let statusItem: NSStatusItem
    private var debugEnabled = false
    private let onToggleDebug: (Bool) -> Void
    private let onResetTrust: () -> Void
    private let onQuit: () -> Void

    init(onToggleDebug: @escaping (Bool) -> Void, onResetTrust: @escaping () -> Void, onQuit: @escaping () -> Void) {
        self.onToggleDebug = onToggleDebug
        self.onResetTrust = onResetTrust
        self.onQuit = onQuit

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.title = "🦌"

        let menu = NSMenu()

        let title = NSMenuItem(title: "Deer Friend", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(.separator())

        let debugItem = NSMenuItem(title: "Show Debug Info", action: #selector(toggleDebug(_:)), keyEquivalent: "")
        debugItem.target = self
        menu.addItem(debugItem)

        let resetItem = NSMenuItem(title: "Reset Trust", action: #selector(resetTrust(_:)), keyEquivalent: "")
        resetItem.target = self
        menu.addItem(resetItem)

        menu.addItem(.separator())

        let quitItem = NSMenuItem(title: "Quit Deer Friend", action: #selector(quit(_:)), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    @objc private func toggleDebug(_ sender: NSMenuItem) {
        debugEnabled.toggle()
        sender.state = debugEnabled ? .on : .off
        onToggleDebug(debugEnabled)
    }

    @objc private func resetTrust(_ sender: NSMenuItem) {
        onResetTrust()
    }

    @objc private func quit(_ sender: NSMenuItem) {
        onQuit()
    }
}
