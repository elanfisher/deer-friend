import AppKit
import Foundation

enum DeerState: String {
    case standing, lookingAround, walking, running, jumping, sleeping
    case eatingGrass, chewing, chewingLookingAround
    case startled, curious, fed, petted
}

/// The whole "personality": tracks the cursor, runs the behavior state machine,
/// moves the deer around the screen, and produces a DeerPose each tick for the renderer.
final class DeerBrain {

    struct Tuning {
        var scareDistance: CGFloat = 210      // px — cursor must be closer than this to startle her
        var scareSpeed: CGFloat = 1300        // px/sec — cursor must be moving faster than this to startle her
        var curiousDistance: CGFloat = 360    // px — inside this + calm cursor = she takes notice
        var curiousSpeed: CGFloat = 260       // px/sec — "calm" ceiling for curious/approach behavior
        var petDistance: CGFloat = 75         // px — close enough to feed/pet
        var petSpeed: CGFloat = 90            // px/sec — must approach slowly to be allowed this close
        var approachHoldTime: TimeInterval = 0.55
    }
    var tuning = Tuning()

    // Snapshot the view reads each frame.
    private(set) var currentImage: CGImage?
    private(set) var worldPosition: CGPoint = .zero    // feet anchor, screen coords (AppKit, Y-up)
    private(set) var verticalOffset: CGFloat = 0        // jump lift, screen px
    private(set) var state: DeerState = .standing
    private(set) var trust: CGFloat = 0                 // 0...1, rises with successful feeding/petting
    private(set) var debugInfo: String = ""

    private let pixelScale: CGFloat = 5
    var spriteSize: CGSize { CGSize(width: DeerRenderer.canvasWidth * pixelScale, height: DeerRenderer.canvasHeight * pixelScale) }

    // Cursor tracking (simple polling, no accessibility permission needed)
    private var lastCursor: CGPoint = NSEvent.mouseLocation
    private var cursorPos: CGPoint = NSEvent.mouseLocation
    private var cursorVelocity: CGFloat = 0
    private var cursorDistance: CGFloat = .greatestFiniteMagnitude
    private var lastTickTime: TimeInterval = ProcessInfo.processInfo.systemUptime

    // World / roaming
    private var groundY: CGFloat = 100
    private var minX: CGFloat = 0
    private var maxX: CGFloat = 800
    private var facingRight = true
    private var fleeDirectionSign: CGFloat = 1
    private var wanderTargetX: CGFloat?
    private let walkSpeed: CGFloat = 55
    private let runSpeed: CGFloat = 260
    private var gaitPhase: CGFloat = 0

    // Timers
    private var t: TimeInterval = 0
    private var stateTime: TimeInterval = 0
    private var idleActivityTimer: TimeInterval = 0
    private var idleActivityDuration: TimeInterval = 3
    private var sinceLastInteraction: TimeInterval = 0
    private var approachTimer: TimeInterval = 0
    private let startleDuration: TimeInterval = 0.28
    private let jumpDuration: TimeInterval = 0.55
    private let jumpHeight: CGFloat = 34
    private let fleeMinDuration: TimeInterval = 1.1
    private let sleepThreshold: TimeInterval = 100

    private let interruptibleStates: [DeerState] = [
        .standing, .lookingAround, .walking, .eatingGrass, .chewing,
        .chewingLookingAround, .curious, .fed, .petted, .sleeping,
    ]

    func resetTrust() {
        trust = 0
    }

    func configure(screenFrame: NSRect) {
        groundY = screenFrame.minY + 26
        minX = screenFrame.minX + 40
        maxX = screenFrame.maxX - 40
        worldPosition = CGPoint(x: (minX + maxX) / 2, y: groundY)
    }

    func tick() {
        let now = ProcessInfo.processInfo.systemUptime
        let dt = min(0.1, max(0, now - lastTickTime))
        lastTickTime = now
        t += dt

        updateCursor(dt: dt)
        if state != .jumping { verticalOffset = 0 }
        updateFSM(dt: dt)
        currentImage = DeerRenderer.makeImage(pose: currentPose(), pixelScale: pixelScale)
        debugInfo = String(
            format: "%@  dist:%.0f  cursorV:%.0f  trust:%.2f",
            state.rawValue, cursorDistance, cursorVelocity, trust
        )
    }

    // MARK: - Cursor

    private func updateCursor(dt: TimeInterval) {
        let now = NSEvent.mouseLocation
        let dx = now.x - lastCursor.x
        let dy = now.y - lastCursor.y
        let dist = (dx * dx + dy * dy).squareRoot()
        let instSpeed = dt > 0 ? dist / CGFloat(dt) : 0
        cursorVelocity = cursorVelocity * 0.7 + instSpeed * 0.3
        lastCursor = now
        cursorPos = now

        let ddx = now.x - worldPosition.x
        let ddy = now.y - (worldPosition.y + spriteSize.height * 0.45)
        cursorDistance = (ddx * ddx + ddy * ddy).squareRoot()
    }

    private func faceTowardCursor() {
        facingRight = cursorPos.x >= worldPosition.x
    }

    // MARK: - FSM

    private func updateFSM(dt: TimeInterval) {
        stateTime += dt
        sinceLastInteraction += dt

        if interruptibleStates.contains(state),
           cursorVelocity > tuning.scareSpeed, cursorDistance < tuning.scareDistance {
            enterStartled()
            return
        }

        switch state {
        case .standing, .lookingAround, .walking, .eatingGrass, .chewing, .chewingLookingAround:
            runIdleAndProximityLogic(dt: dt)
        case .sleeping:
            runSleepLogic(dt: dt)
        case .startled:
            if stateTime > startleDuration { enterRunning() }
        case .running:
            runFleeLogic(dt: dt)
        case .jumping:
            runJumpLogic(dt: dt)
        case .curious:
            runCuriousLogic(dt: dt)
        case .fed:
            runFedLogic(dt: dt)
        case .petted:
            runPettedLogic(dt: dt)
        }
    }

    // MARK: Idle / wander (autonomous, only when cursor is not close)

    private func runIdleAndProximityLogic(dt: TimeInterval) {
        if cursorDistance < tuning.petDistance, cursorVelocity < tuning.petSpeed {
            sinceLastInteraction = 0
            enterCurious()
            return
        } else if cursorDistance < tuning.curiousDistance, cursorVelocity < tuning.curiousSpeed {
            sinceLastInteraction = 0
            enterCurious()
            return
        }

        idleActivityTimer += dt

        if sinceLastInteraction > sleepThreshold, state == .standing, idleActivityTimer > idleActivityDuration {
            enterSleeping()
            return
        }

        if state == .walking {
            stepTowardWanderTarget(dt: dt)
            if wanderTargetX == nil { pickNextIdleActivity() }
        } else if idleActivityTimer > idleActivityDuration {
            pickNextIdleActivity()
        }
    }

    private func pickNextIdleActivity() {
        idleActivityTimer = 0
        switch state {
        case .eatingGrass:
            state = .chewing
            stateTime = 0
            idleActivityDuration = .random(in: 2...4)
        case .chewing:
            state = Bool.random() ? .chewingLookingAround : .standing
            stateTime = 0
            idleActivityDuration = .random(in: 2.5...4.5)
        default:
            let r = Double.random(in: 0..<1)
            if r < 0.30 {
                wanderTargetX = .random(in: minX...maxX)
                state = .walking
                stateTime = 0
                idleActivityDuration = 999
            } else if r < 0.55 {
                state = .eatingGrass
                stateTime = 0
                idleActivityDuration = .random(in: 4...7)
            } else if r < 0.75 {
                state = .lookingAround
                stateTime = 0
                idleActivityDuration = .random(in: 2...4)
            } else if r < 0.85 {
                enterJumping()
            } else {
                state = .standing
                stateTime = 0
                idleActivityDuration = .random(in: 2...5)
            }
        }
    }

    private func stepTowardWanderTarget(dt: TimeInterval) {
        guard let target = wanderTargetX else { return }
        let dir: CGFloat = target > worldPosition.x ? 1 : -1
        facingRight = dir > 0
        let dx = dir * walkSpeed * CGFloat(dt)
        gaitPhase = (gaitPhase + CGFloat(dt) * (walkSpeed / 14)).truncatingRemainder(dividingBy: 1)
        if abs(target - worldPosition.x) <= abs(dx) {
            worldPosition.x = target
            wanderTargetX = nil
        } else {
            worldPosition.x += dx
        }
    }

    // MARK: Sleep

    private func runSleepLogic(dt: TimeInterval) {
        if cursorDistance < tuning.curiousDistance, cursorVelocity < tuning.curiousSpeed {
            sinceLastInteraction = 0
            enterStanding()
        } else if stateTime > 40 {
            sinceLastInteraction = 0
            enterStanding()
        }
    }

    // MARK: Startle / flee

    private func enterStartled() {
        state = .startled
        stateTime = 0
        approachTimer = 0
        trust = max(0, trust - 0.12)
        fleeDirectionSign = worldPosition.x >= cursorPos.x ? 1 : -1
        facingRight = fleeDirectionSign > 0
    }

    private func enterRunning() {
        state = .running
        stateTime = 0
        gaitPhase = 0
    }

    private func runFleeLogic(dt: TimeInterval) {
        let dx = fleeDirectionSign * runSpeed * CGFloat(dt)
        worldPosition.x = min(maxX, max(minX, worldPosition.x + dx))
        gaitPhase = (gaitPhase + CGFloat(dt) * (runSpeed / 22)).truncatingRemainder(dividingBy: 1)

        let farEnough = cursorDistance > tuning.curiousDistance * 1.3
        let calmEnough = cursorVelocity < tuning.scareSpeed * 0.5
        if stateTime > fleeMinDuration, farEnough || calmEnough {
            enterStanding()
        }
    }

    // MARK: Jump (playful hop, autonomous)

    private func enterJumping() {
        state = .jumping
        stateTime = 0
    }

    private func runJumpLogic(dt: TimeInterval) {
        let progress = min(1, CGFloat(stateTime / jumpDuration))
        verticalOffset = sin(progress * .pi) * jumpHeight
        let hopSpeed: CGFloat = 40
        worldPosition.x += (facingRight ? 1 : -1) * hopSpeed * CGFloat(dt)
        worldPosition.x = min(maxX, max(minX, worldPosition.x))
        if progress >= 1 {
            verticalOffset = 0
            enterStanding()
        }
    }

    // MARK: Curious / feed / pet

    private func runCuriousLogic(dt: TimeInterval) {
        sinceLastInteraction = 0
        faceTowardCursor()
        if cursorDistance < tuning.petDistance, cursorVelocity < tuning.petSpeed {
            approachTimer += dt
            if approachTimer > tuning.approachHoldTime { enterFed() }
        } else if cursorDistance < tuning.curiousDistance, cursorVelocity < tuning.curiousSpeed {
            approachTimer = 0
        } else {
            approachTimer = 0
            enterStanding()
        }
    }

    private func runFedLogic(dt: TimeInterval) {
        sinceLastInteraction = 0
        faceTowardCursor()
        trust = min(1, trust + CGFloat(dt) * 0.15)
        if cursorDistance < tuning.petDistance, cursorVelocity < tuning.petSpeed {
            if stateTime > 1.4 { enterPetted() }
        } else if cursorDistance < tuning.curiousDistance, cursorVelocity < tuning.curiousSpeed {
            enterCurious()
        } else {
            enterStanding()
        }
    }

    private func runPettedLogic(dt: TimeInterval) {
        sinceLastInteraction = 0
        faceTowardCursor()
        if cursorDistance < tuning.petDistance, cursorVelocity < tuning.petSpeed {
            trust = min(1, trust + CGFloat(dt) * 0.08)
        } else if cursorDistance < tuning.curiousDistance, cursorVelocity < tuning.curiousSpeed {
            enterCurious()
        } else {
            enterStanding()
        }
    }

    // MARK: State entry helpers

    private func enterStanding() {
        state = .standing
        stateTime = 0
        idleActivityTimer = 0
        idleActivityDuration = .random(in: 2...4)
    }

    private func enterSleeping() {
        state = .sleeping
        stateTime = 0
    }

    private func enterCurious() {
        state = .curious
        stateTime = 0
        approachTimer = 0
    }

    private func enterFed() {
        state = .fed
        stateTime = 0
        approachTimer = 0
    }

    private func enterPetted() {
        state = .petted
        stateTime = 0
    }

    // MARK: - Pose

    private func currentPose() -> DeerPose {
        var pose: DeerPose
        switch state {
        case .standing:
            pose = AnimationClips.standing(t)
        case .lookingAround:
            pose = AnimationClips.lookingAround(t)
        case .walking:
            pose = AnimationClips.walking(phase: gaitPhase, t: t)
        case .running:
            pose = AnimationClips.running(phase: gaitPhase)
        case .jumping:
            let progress = min(1, CGFloat(stateTime / jumpDuration))
            pose = AnimationClips.standing(t)
            let tuck = sin(progress * .pi)
            pose.legLift = [tuck, tuck, tuck, tuck]
            pose.neckAngle = 0.2
            pose.earPerk = 0.7
        case .sleeping:
            let settle = min(1, CGFloat(stateTime / 1.5))
            pose = AnimationClips.sleeping(t, settleAmount: settle)
        case .eatingGrass:
            pose = AnimationClips.eatingGrass(t)
        case .chewing:
            pose = AnimationClips.chewing(t)
        case .chewingLookingAround:
            pose = AnimationClips.chewingLookingAround(t)
        case .startled:
            let progress = min(1, CGFloat(stateTime / startleDuration))
            pose = AnimationClips.startled(progress: progress)
        case .curious:
            pose = AnimationClips.curious(t)
        case .fed:
            pose = AnimationClips.fed(t)
        case .petted:
            pose = AnimationClips.petted(t)
        }
        pose.facingRight = facingRight
        return pose
    }
}
