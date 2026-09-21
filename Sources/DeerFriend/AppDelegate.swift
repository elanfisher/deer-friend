import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var view: DeerView!
    private let brain = DeerBrain()
    private var statusBar: StatusBarController!
    private var timer: Timer?
    private var showDebug = false
    private var lastWindowOrigin = NSPoint(x: .infinity, y: .infinity)

    // Window padding around the sprite so jump arcs / raised tail / ears never clip.
    private let paddingLeft: CGFloat = 30
    private let paddingRight: CGFloat = 30
    private let paddingBottom: CGFloat = 6
    private let topPaddingExtra: CGFloat = 20
    private let jumpHeightBudget: CGFloat = 34

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // no Dock icon, no menu bar app menu

        let screen = NSScreen.main ?? NSScreen.screens[0]
        brain.configure(screenFrame: screen.visibleFrame) // respects Dock + menu bar automatically

        let sprite = brain.spriteSize
        let topPadding = jumpHeightBudget + topPaddingExtra
        let size = NSSize(
            width: sprite.width + paddingLeft + paddingRight,
            height: sprite.height + paddingBottom + topPadding
        )

        let win = NSWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        win.isOpaque = false
        win.backgroundColor = .clear
        win.hasShadow = false
        win.ignoresMouseEvents = true // fully click-through — never blocks the desktop or other apps
        win.level = .floating
        win.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        win.isReleasedWhenClosed = false

        let contentView = DeerView(frame: NSRect(origin: .zero, size: size))
        win.contentView = contentView

        window = win
        view = contentView

        statusBar = StatusBarController(
            onToggleDebug: { [weak self] enabled in self?.showDebug = enabled },
            onResetTrust: { [weak self] in self?.brain.resetTrust() },
            onQuit: { NSApp.terminate(nil) }
        )

        win.orderFrontRegardless() // show without activating / stealing focus

        let t = Timer(timeInterval: 1.0 / 24.0, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(t, forMode: .common) // keep ticking during menu tracking / scroll
        timer = t
    }

    private func tick() {
        brain.tick()

        let sprite = brain.spriteSize
        let winSize = window.frame.size

        let origin = NSPoint(
            x: (brain.worldPosition.x - winSize.width / 2).rounded(),
            y: (brain.worldPosition.y - paddingBottom).rounded()
        )
        // Repositioning is a WindowServer round-trip; skip it while she isn't
        // actually moving (standing, grazing, sleeping, ...) to keep idle CPU low.
        if origin != lastWindowOrigin {
            window.setFrameOrigin(origin)
            lastWindowOrigin = origin
        }

        let topPadding = winSize.height - paddingBottom - sprite.height
        view.image = brain.currentImage
        view.imageRect = CGRect(
            x: paddingLeft, y: topPadding - brain.verticalOffset,
            width: sprite.width, height: sprite.height
        )
        view.debugText = showDebug ? brain.debugInfo : nil
        view.needsDisplay = true
    }
}
