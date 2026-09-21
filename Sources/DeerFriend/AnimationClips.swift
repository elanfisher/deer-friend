import CoreGraphics
import Foundation

/// Pure(-ish) functions that turn "how far into this animation are we" into a DeerPose.
/// DeerBrain decides *which* clip to sample and layers a few overrides on top
/// (facing, head-turned-toward-cursor, etc).
enum AnimationClips {

    // MARK: - Small helpers

    private static func clamp01(_ v: CGFloat) -> CGFloat { min(1, max(0, v)) }

    /// A gentle "breathing" bob shared by most stationary poses.
    private static func breathing(_ t: TimeInterval, amplitude: CGFloat = 0.6, speed: Double = 1.1) -> CGFloat {
        CGFloat(sin(t * speed)) * amplitude
    }

    /// Blink every few seconds: mostly open, occasionally snaps shut for a beat.
    private static func blink(_ t: TimeInterval) -> CGFloat {
        let cycle = t.truncatingRemainder(dividingBy: 4.2)
        return cycle > 4.0 ? 0.05 : 1.0
    }

    private static func chew(_ t: TimeInterval, speed: Double = 5.0) -> CGFloat {
        (CGFloat(sin(t * speed)) * 0.5 + 0.5)
    }

    /// Four-legged gait cycle shared by walking & running.
    /// `phase` is 0...1 repeating (driven by distance travelled, not wall time, so
    /// footfall rate always matches the deer's actual speed on screen).
    private static func gaitLegs(phase: CGFloat, amplitude: CGFloat) -> ([CGFloat], [CGFloat]) {
        // Trot: diagonal pairs move together (FL+BR, FR+BL).
        let offsets: [CGFloat] = [0, 0.5, 0.5, 0]
        var angles = [CGFloat](repeating: 0, count: 4)
        var lifts = [CGFloat](repeating: 0, count: 4)
        for i in 0..<4 {
            let p = (phase + offsets[i]).truncatingRemainder(dividingBy: 1)
            let theta = p * 2 * .pi
            angles[i] = sin(theta) * amplitude
            lifts[i] = clamp01(sin(theta) * 1.3) // leg is "lifted" only during forward swing
        }
        return (angles, lifts)
    }

    // MARK: - Idle family

    static func standing(_ t: TimeInterval) -> DeerPose {
        var p = DeerPose.restingStand
        p.bodyBob = breathing(t)
        p.earPerk = 0.45 + CGFloat(sin(t * 0.37)) * 0.05
        p.eyeOpen = blink(t)
        p.tailWag = CGFloat(sin(t * 0.8)) * 0.15
        return p
    }

    static func lookingAround(_ t: TimeInterval) -> DeerPose {
        var p = standing(t)
        // Slow sweep with little "pause" dwell at the extremes, not a pure sine.
        let raw = sin(t * 0.55)
        p.headYaw = CGFloat(raw > 0 ? pow(raw, 0.6) : -pow(-raw, 0.6))
        p.earPerk = 0.6
        return p
    }

    static func walking(phase: CGFloat, t: TimeInterval) -> DeerPose {
        var p = DeerPose.restingStand
        let (angles, lifts) = gaitLegs(phase: phase, amplitude: 0.5)
        p.legAngle = angles
        p.legLift = lifts
        p.bodyBob = abs(sin(phase * 4 * .pi)) * 0.8
        p.earPerk = 0.5
        p.tailWag = CGFloat(sin(t * 3)) * 0.1
        return p
    }

    static func running(phase: CGFloat) -> DeerPose {
        var p = DeerPose.restingStand
        let (angles, lifts) = gaitLegs(phase: phase, amplitude: 0.95)
        p.legAngle = angles
        p.legLift = lifts
        p.bodyBob = abs(sin(phase * 4 * .pi)) * 1.6
        p.earPerk = 0.15
        p.eyeWide = 0.6
        p.tailFlag = 1.0
        p.neckAngle = 0.15
        return p
    }

    // MARK: - Grazing / chewing family

    static func eatingGrass(_ t: TimeInterval) -> DeerPose {
        var p = DeerPose.restingStand
        p.neckAngle = -1.0
        p.headReach = 0.3
        p.bodyBob = breathing(t, amplitude: 0.3, speed: 0.9)
        p.mouthChew = chew(t, speed: 6.5)
        p.earPerk = 0.35
        p.tailWag = CGFloat(sin(t * 0.6)) * 0.1
        return p
    }

    static func chewing(_ t: TimeInterval) -> DeerPose {
        var p = standing(t)
        p.neckAngle = -0.15
        p.mouthChew = chew(t, speed: 4.0)
        return p
    }

    static func chewingLookingAround(_ t: TimeInterval) -> DeerPose {
        var p = chewing(t)
        let raw = sin(t * 0.4)
        p.headYaw = CGFloat(raw > 0 ? pow(raw, 0.6) : -pow(-raw, 0.6)) * 0.8
        return p
    }

    // MARK: - Sleep

    static func sleeping(_ t: TimeInterval, settleAmount: CGFloat) -> DeerPose {
        var p = DeerPose.restingStand
        p.bodyLowered = settleAmount
        p.neckAngle = -0.5 * settleAmount
        p.eyeOpen = 1 - settleAmount
        p.earPerk = 0.1
        p.bodyBob = breathing(t, amplitude: 0.35, speed: 0.7) * settleAmount
        return p
    }

    // MARK: - Reactive states

    static func startled(progress: CGFloat) -> DeerPose {
        var p = DeerPose.restingStand
        p.earPerk = 1.0
        p.eyeWide = progress
        p.eyeOpen = 1
        p.tailFlag = progress
        p.neckAngle = 0.3 * progress
        return p
    }

    static func curious(_ t: TimeInterval) -> DeerPose {
        var p = DeerPose.restingStand
        p.earPerk = 0.95
        p.neckAngle = 0.35
        p.bodyBob = breathing(t, amplitude: 0.4, speed: 1.4)
        p.tailWag = CGFloat(sin(t * 2.2)) * 0.2
        p.eyeOpen = 1
        return p
    }

    static func fed(_ t: TimeInterval) -> DeerPose {
        var p = DeerPose.restingStand
        p.neckAngle = -0.55
        p.headReach = 0.85
        p.mouthChew = chew(t, speed: 8)
        p.earPerk = 0.7
        p.eyeOpen = 0.75
        p.tailWag = CGFloat(sin(t * 4)) * 0.35
        return p
    }

    static func petted(_ t: TimeInterval) -> DeerPose {
        var p = DeerPose.restingStand
        p.neckAngle = -0.2
        p.headReach = 0.15
        p.earPerk = 0.55
        p.eyeOpen = 0.4 + CGFloat(sin(t * 0.9)) * 0.1
        p.bodyBob = breathing(t, amplitude: 0.3, speed: 0.8)
        p.tailWag = CGFloat(sin(t * 1.6)) * 0.4
        return p
    }
}
