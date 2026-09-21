import CoreGraphics

/// A single frame's worth of joint parameters for the procedural deer rig.
/// AnimationClips produce these each tick; DeerRenderer turns them into pixels.
struct DeerPose {
    var facingRight: Bool = true

    // Torso
    var bodyBob: CGFloat = 0          // vertical bounce, canvas px
    var bodyLowered: CGFloat = 0      // 0 = standing, 1 = fully lying down (sleep silhouette)

    // Neck / head
    var neckAngle: CGFloat = 0        // -1 grazing (head to ground) ... 0 neutral ... +1 alert/high
    var headYaw: CGFloat = 0          // -1 (away from viewer) ... 0 ... +1 (toward viewer), "looking around"
    var headReach: CGFloat = 0        // 0..1 extra forward stretch (reaching for a hand / grass)

    // Face
    var earPerk: CGFloat = 0.4        // 0 drooped/relaxed ... 1 fully perked/alert
    var eyeOpen: CGFloat = 1          // 0 closed ... 1 open
    var eyeWide: CGFloat = 0          // 0 normal ... 1 startled-wide
    var mouthChew: CGFloat = 0        // 0..1 jaw offset, oscillates while chewing

    // Tail
    var tailFlag: CGFloat = 0         // 0 hanging ... 1 fully raised & flagged (alarm display)
    var tailWag: CGFloat = 0          // -1..1 side wag offset

    // Legs: order = [frontLeft, frontRight, backLeft, backRight]
    var legAngle: [CGFloat] = [0, 0, 0, 0]   // radians from straight-down, + = forward swing
    var legLift: [CGFloat] = [0, 0, 0, 0]    // 0 grounded ... 1 fully tucked/airborne

    static let restingStand = DeerPose()
}
