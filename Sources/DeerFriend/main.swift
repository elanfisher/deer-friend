import AppKit
import ImageIO
import UniformTypeIdentifiers

/// Dev helper: `DeerFriend --snapshot <dir>` renders one PNG per animation pose
/// and exits, so the rig can be eyeballed without running the live overlay.
func runSnapshotMode(to outDir: String) {
    try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

    let jumpPose: DeerPose = {
        var p = AnimationClips.standing(0)
        p.legLift = [1, 1, 1, 1]
        p.neckAngle = 0.2
        p.earPerk = 0.7
        return p
    }()

    let poses: [(String, DeerPose)] = [
        ("01_standing", AnimationClips.standing(0)),
        ("02_looking_around", AnimationClips.lookingAround(1.2)),
        ("03_walking", AnimationClips.walking(phase: 0.25, t: 0)),
        ("04_running", AnimationClips.running(phase: 0.25)),
        ("05_jumping", jumpPose),
        ("06_sleeping", AnimationClips.sleeping(0, settleAmount: 1)),
        ("07_eating_grass", AnimationClips.eatingGrass(0.3)),
        ("08_chewing", AnimationClips.chewing(0.1)),
        ("09_chewing_looking_around", AnimationClips.chewingLookingAround(1.0)),
        ("10_startled", AnimationClips.startled(progress: 1)),
        ("11_curious", AnimationClips.curious(0.5)),
        ("12_fed", AnimationClips.fed(0.2)),
        ("13_petted", AnimationClips.petted(0.6)),
        ("14_facing_left", { var p = AnimationClips.standing(0); p.facingRight = false; return p }()),
    ]

    for (name, pose) in poses {
        guard let image = DeerRenderer.makeImage(pose: pose, pixelScale: 6) else { continue }
        let path = outDir + "/\(name).png"
        let url = URL(fileURLWithPath: path)
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { continue }
        CGImageDestinationAddImage(dest, image, nil)
        CGImageDestinationFinalize(dest)
    }
    print("Wrote \(poses.count) snapshots to \(outDir)")
}

if let snapshotIdx = CommandLine.arguments.firstIndex(of: "--snapshot") {
    let outDir = CommandLine.arguments.count > snapshotIdx + 1 ? CommandLine.arguments[snapshotIdx + 1] : "/tmp/deer_snapshots"
    runSnapshotMode(to: outDir)
    exit(0)
}

// Global so it isn't deallocated the instant `app.delegate` (a weak ref) is set.
let appDelegate = AppDelegate()

let app = NSApplication.shared
app.delegate = appDelegate
app.run()
