import AppKit

// Global so it isn't deallocated the instant `app.delegate` (a weak ref) is set.
let appDelegate = AppDelegate()

let app = NSApplication.shared
app.delegate = appDelegate
app.run()
