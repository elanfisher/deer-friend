import AppKit

/// Dumb view: just blits whatever CGImage + rect AppDelegate hands it each tick,
/// plus an optional debug HUD line. All the interesting logic lives in DeerBrain.
final class DeerView: NSView {
    var image: CGImage?
    var imageRect: CGRect = .zero
    var debugText: String?

    override var isFlipped: Bool { true } // origin top-left, y grows downward — simpler for sprite placement

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.clear(bounds)

        if let image {
            ctx.interpolationQuality = .none // keep pixel-art crisp even on Retina upscale
            ctx.saveGState()
            ctx.draw(image, in: imageRect)
            ctx.restoreGState()
        }

        if let debugText {
            let bgRect = CGRect(x: 2, y: 2, width: bounds.width - 4, height: 16)
            NSColor.black.withAlphaComponent(0.45).setFill()
            NSBezierPath(roundedRect: bgRect, xRadius: 3, yRadius: 3).fill()
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.monospacedSystemFont(ofSize: 10, weight: .regular),
                .foregroundColor: NSColor.white,
            ]
            (debugText as NSString).draw(at: CGPoint(x: 6, y: 4), withAttributes: attrs)
        }
    }
}
