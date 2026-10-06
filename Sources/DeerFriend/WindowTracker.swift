import AppKit

/// A normal app window she can live on top of.
struct WindowInfo {
    let id: CGWindowID
    let owner: String
    let title: String
    /// Quartz coordinates: origin at the top-left of the primary display, y grows downward.
    let bounds: CGRect

    var menuTitle: String {
        let name = title.isEmpty ? owner : "\(owner) — \(title)"
        let short = name.count > 48 ? String(name.prefix(47)) + "…" : name
        return "\(short)  (\(Int(bounds.width))×\(Int(bounds.height)))"
    }
}

/// Reads window positions from the window server. Window *positions* and owner names need no
/// special permission; titles are only included if the app has Screen Recording access.
enum WindowTracker {
    static func listWindows() -> [WindowInfo] {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { return [] }
        let me = ProcessInfo.processInfo.processIdentifier
        return raw.compactMap { info in
            guard (info[kCGWindowLayer as String] as? Int) == 0,                  // ordinary app windows only
                  (info[kCGWindowOwnerPID as String] as? pid_t) != me,
                  let window = parse(info),
                  window.bounds.width >= 200, window.bounds.height >= 120 else { return nil }
            return window
        }
    }

    /// A stretch of window top-edge she can stand on, in the overlay's own coordinates
    /// (origin top-left, y down).
    struct Ledge {
        let id: String
        let x0: CGFloat
        let x1: CGFloat
        let y: CGFloat
    }

    /// The *visible* top edges of the on-screen windows inside `overlay` (an AppKit frame):
    /// each window's top edge minus the parts hidden behind windows in front of it.
    /// `headroom` keeps ledges far enough below the top that she isn't cut off.
    static func ledges(in overlay: NSRect, headroom: CGFloat) -> [Ledge] {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { return [] }
        let me = ProcessInfo.processInfo.processIdentifier
        // Front-to-back, ordinary visible app windows (not ours).
        let windows: [WindowInfo] = raw.compactMap { info in
            guard (info[kCGWindowLayer as String] as? Int) == 0,
                  (info[kCGWindowOwnerPID as String] as? pid_t) != me,
                  (info[kCGWindowAlpha as String] as? Double ?? 1) > 0.1,
                  let window = parse(info), window.bounds.width >= 40, window.bounds.height >= 40 else { return nil }
            return window
        }

        let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
        let area = CGRect(x: overlay.minX, y: primaryHeight - overlay.maxY, width: overlay.width, height: overlay.height)

        var result: [Ledge] = []
        for (index, window) in windows.enumerated() {
            let b = window.bounds
            let edge = b.minY
            guard b.width >= 120, b.height >= 60,
                  edge >= area.minY + headroom, edge <= area.maxY - 40 else { continue }
            var spans = [(max(b.minX, area.minX), min(b.maxX, area.maxX))]
            // Remove whatever part of this edge is covered by windows in front of it.
            for front in windows[..<index] where front.bounds.minY <= edge + 2 && front.bounds.maxY >= edge {
                spans = spans.flatMap { span -> [(CGFloat, CGFloat)] in
                    let (lo, hi) = span, cutLo = front.bounds.minX, cutHi = front.bounds.maxX
                    if cutHi <= lo || cutLo >= hi { return [span] }
                    return [(lo, min(hi, cutLo)), (max(lo, cutHi), hi)].filter { $0.1 - $0.0 > 0 }
                }
            }
            for (k, span) in spans.filter({ $0.1 - $0.0 >= 70 }).sorted(by: { $0.0 < $1.0 }).enumerated() {
                result.append(Ledge(id: "w\(window.id):\(k)",
                                    x0: span.0 - area.minX, x1: span.1 - area.minX, y: edge - area.minY))
            }
        }
        return result
    }

    /// Current bounds of one window, and whether it's on screen (not minimized / on another Space).
    static func lookup(_ id: CGWindowID) -> (bounds: CGRect, onScreen: Bool)? {
        guard let raw = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]],
              let info = raw.first, let window = parse(info) else { return nil }
        return (window.bounds, info[kCGWindowIsOnscreen as String] as? Bool ?? false)
    }

    private static func parse(_ info: [String: Any]) -> WindowInfo? {
        guard let id = info[kCGWindowNumber as String] as? CGWindowID,
              let dict = info[kCGWindowBounds as String] as? NSDictionary,
              let rect = CGRect(dictionaryRepresentation: dict as CFDictionary) else { return nil }
        return WindowInfo(id: id,
                          owner: info[kCGWindowOwnerName as String] as? String ?? "Window",
                          title: info[kCGWindowName as String] as? String ?? "",
                          bounds: rect)
    }

    /// The normal window stacked immediately in front of `id`, if any.
    static func windowDirectlyAbove(_ id: CGWindowID) -> CGWindowID? {
        guard let above = CGWindowListCopyWindowInfo([.optionOnScreenAboveWindow], id) as? [[String: Any]] else { return nil }
        // listed front-to-back, so the last normal-layer entry is the one just above it
        return above.last { ($0[kCGWindowLayer as String] as? Int) == 0 }?[kCGWindowNumber as String] as? CGWindowID
    }

    /// Converts the window's top edge from Quartz (y-down) to AppKit (y-up) screen coordinates.
    static func appKitTopEdge(of bounds: CGRect) -> CGFloat {
        let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
        return primaryHeight - bounds.minY
    }
}
