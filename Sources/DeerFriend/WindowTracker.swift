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

    /// Converts the window's top edge from Quartz (y-down) to AppKit (y-up) screen coordinates.
    static func appKitTopEdge(of bounds: CGRect) -> CGFloat {
        let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
        return primaryHeight - bounds.minY
    }
}
