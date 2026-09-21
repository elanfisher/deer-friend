import AppKit

/// Tiny 🦌 menu-bar item — the only chrome this app has, since the deer's own
/// window is click-through and never steals focus.
final class StatusBarController: NSObject, NSMenuDelegate {
    private let statusItem: NSStatusItem
    private let onScale: (Double) -> Void
    private let onQuit: () -> Void
    private var sizeItems: [NSMenuItem] = []
    private let currentDisplay: () -> String
    private let onDisplay: (String) -> Void
    private let displayMenu = NSMenu()

    private static let sizes: [(String, Double)] = [("Small", 1), ("Medium", 1.5), ("Large", 2)]

    init(scale: Double, onScale: @escaping (Double) -> Void,
         currentDisplay: @escaping () -> String, onDisplay: @escaping (String) -> Void,
         onQuit: @escaping () -> Void) {
        self.onScale = onScale
        self.onQuit = onQuit
        self.currentDisplay = currentDisplay
        self.onDisplay = onDisplay
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        super.init()
        statusItem.button?.title = "🦌"

        let menu = NSMenu()
        let title = NSMenuItem(title: "Deer Friend", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(.separator())

        let sizeMenu = NSMenu()
        for (i, (name, value)) in Self.sizes.enumerated() {
            let item = NSMenuItem(title: name, action: #selector(pickSize(_:)), keyEquivalent: "")
            item.target = self
            item.tag = i
            item.state = value == scale ? .on : .off
            sizeMenu.addItem(item)
            sizeItems.append(item)
        }
        let sizeItem = NSMenuItem(title: "Size", action: nil, keyEquivalent: "")
        sizeItem.submenu = sizeMenu
        menu.addItem(sizeItem)

        displayMenu.delegate = self   // rebuilt each time it opens, so plugged-in screens show up
        let displayItem = NSMenuItem(title: "Display", action: nil, keyEquivalent: "")
        displayItem.submenu = displayMenu
        menu.addItem(displayItem)

        menu.addItem(.separator())
        let quitItem = NSMenuItem(title: "Quit Deer Friend", action: #selector(quit(_:)), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    @objc private func pickSize(_ sender: NSMenuItem) {
        for item in sizeItems { item.state = item === sender ? .on : .off }
        onScale(Self.sizes[sender.tag].1)
    }

    func menuWillOpen(_ menu: NSMenu) {
        guard menu === displayMenu else { return }
        menu.removeAllItems()
        let current = currentDisplay()
        for screen in NSScreen.screens {
            let item = NSMenuItem(title: screen.localizedName, action: #selector(pickDisplay(_:)), keyEquivalent: "")
            item.target = self
            item.state = screen.localizedName == current ? .on : .off
            menu.addItem(item)
        }
    }

    @objc private func pickDisplay(_ sender: NSMenuItem) {
        onDisplay(sender.title)
    }

    @objc private func quit(_ sender: NSMenuItem) {
        onQuit()
    }
}
