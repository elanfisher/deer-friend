import CoreGraphics
import Foundation

/// Draws a DeerPose as pixel art: everything is rendered onto a tiny bitmap with
/// antialiasing off, then the caller scales it up with nearest-neighbor filtering.
/// No image assets — the "sprite" is a small procedural rig (body/neck/head/ears/legs/tail)
/// so every animation is just joint angles over time.
enum DeerRenderer {
    static let canvasWidth: CGFloat = 56
    static let canvasHeight: CGFloat = 40

    // MARK: Palette (white-tailed doe, summer reddish-tan coat)
    private static let coat        = CGColor(red: 0.69, green: 0.47, blue: 0.30, alpha: 1)
    private static let coatShade   = CGColor(red: 0.52, green: 0.35, blue: 0.22, alpha: 1)
    private static let coatDark    = CGColor(red: 0.40, green: 0.27, blue: 0.17, alpha: 1) // far-side legs
    private static let creamBelly  = CGColor(red: 0.96, green: 0.92, blue: 0.83, alpha: 1)
    private static let tailWhite   = CGColor(red: 0.99, green: 0.98, blue: 0.95, alpha: 1)
    private static let hoof        = CGColor(red: 0.20, green: 0.14, blue: 0.10, alpha: 1)
    private static let noseColor   = CGColor(red: 0.12, green: 0.08, blue: 0.07, alpha: 1)
    private static let eyeColor    = CGColor(red: 0.08, green: 0.06, blue: 0.05, alpha: 1)
    private static let shadowColor = CGColor(red: 0, green: 0, blue: 0, alpha: 0.22)

    static func makeImage(pose: DeerPose, pixelScale: CGFloat) -> CGImage? {
        let w = Int(canvasWidth * pixelScale)
        let h = Int(canvasHeight * pixelScale)
        guard w > 0, h > 0, let ctx = CGContext(
            data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }

        ctx.setShouldAntialias(false)
        ctx.interpolationQuality = .none
        // CGBitmapContext is Y-up by default; every coordinate in this file was authored
        // Y-down (0 = top of scene, canvasHeight = ground), so flip before scaling to canvas units.
        ctx.translateBy(x: 0, y: CGFloat(h))
        ctx.scaleBy(x: 1, y: -1)
        ctx.scaleBy(x: pixelScale, y: pixelScale) // everything below is drawn in canvas units

        draw(pose: pose, in: ctx)
        return ctx.makeImage()
    }

    private static func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat { a + (b - a) * t }
    private static func lerpPt(_ a: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint {
        CGPoint(x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t))
    }

    private static func draw(pose: DeerPose, in ctx: CGContext) {
        ctx.saveGState()
        if !pose.facingRight {
            ctx.translateBy(x: canvasWidth, y: 0)
            ctx.scaleBy(x: -1, y: 1)
        }

        // --- Layout (facing-right local space; flip above handles facing-left) ---
        let groundY: CGFloat = 33
        let legLen: CGFloat = 10
        let bodyH: CGFloat = 9
        let rearX: CGFloat = 18
        let frontX: CGFloat = 36
        let lowered = pose.bodyLowered

        let bodyBottomY = groundY - legLen                       // hip/shoulder height, feet planted
        let hipY = lerp(bodyBottomY, groundY - 3, lowered)        // sinks toward ground when lying
        let effBodyH = lerp(bodyH, bodyH * 0.6, lowered)
        let bodyTopY = hipY - effBodyH - pose.bodyBob             // bob pulses body height (squash/stretch)

        // Ground shadow
        let shadowW = lerp(24, 30, lowered)
        ctx.setFillColor(shadowColor)
        ctx.fillEllipse(in: CGRect(x: (rearX + frontX) / 2 - shadowW / 2, y: groundY, width: shadowW, height: 3))

        // Far-side legs (drawn first, slightly behind & darker), fade out as she lies down
        let legAlpha = 1 - lowered
        if legAlpha > 0.02 {
            ctx.setAlpha(legAlpha)
            drawLeg(ctx, hip: CGPoint(x: rearX - 1, y: hipY), angle: pose.legAngle[2], lift: pose.legLift[2], length: legLen, color: coatDark)
            drawLeg(ctx, hip: CGPoint(x: frontX - 1, y: hipY), angle: pose.legAngle[0], lift: pose.legLift[0], length: legLen, color: coatDark)
            ctx.setAlpha(1)
        }

        // Torso
        let bodyRect = CGRect(x: rearX - 3, y: bodyTopY, width: (frontX - rearX) + 8, height: effBodyH)
        ctx.addPath(CGPath(roundedRect: bodyRect, cornerWidth: effBodyH * 0.45, cornerHeight: effBodyH * 0.45, transform: nil))
        ctx.setFillColor(coat)
        ctx.fillPath()

        // Belly patch
        let bellyRect = CGRect(x: rearX - 1, y: bodyTopY + effBodyH * 0.55, width: (frontX - rearX) + 3, height: effBodyH * 0.5)
        ctx.addPath(CGPath(roundedRect: bellyRect, cornerWidth: 2, cornerHeight: 2, transform: nil))
        ctx.setFillColor(creamBelly)
        ctx.fillPath()

        // Tail
        drawTail(ctx, base: CGPoint(x: rearX - 2, y: bodyTopY + 1), flag: pose.tailFlag, wag: pose.tailWag)

        // Near-side legs (in front, normal color)
        if legAlpha > 0.02 {
            ctx.setAlpha(legAlpha)
            drawLeg(ctx, hip: CGPoint(x: rearX + 1, y: hipY), angle: pose.legAngle[3], lift: pose.legLift[3], length: legLen, color: coat)
            drawLeg(ctx, hip: CGPoint(x: frontX + 1, y: hipY), angle: pose.legAngle[1], lift: pose.legLift[1], length: legLen, color: coat)
            ctx.setAlpha(1)
        }

        // Neck + head (drawn last, on top)
        drawHead(ctx, neckBase: CGPoint(x: frontX + 2, y: bodyTopY + 1), pose: pose)

        ctx.restoreGState()
    }

    private static func drawLeg(_ ctx: CGContext, hip: CGPoint, angle: CGFloat, lift: CGFloat, length: CGFloat, color: CGColor) {
        let bentLength = length * (1 - lift * 0.45)
        let kneeRaise = lift * 5
        let dx = sin(angle) * bentLength
        let dy = cos(angle) * bentLength
        let knee = CGPoint(x: hip.x + dx * 0.5, y: hip.y + dy * 0.5 - kneeRaise)
        let foot = CGPoint(x: hip.x + dx, y: hip.y + dy)

        ctx.setStrokeColor(color)
        ctx.setLineWidth(2.2)
        ctx.setLineCap(.round)
        ctx.beginPath()
        ctx.move(to: hip)
        ctx.addLine(to: knee)
        ctx.addLine(to: foot)
        ctx.strokePath()

        ctx.setFillColor(hoof)
        ctx.fill(CGRect(x: foot.x - 1.1, y: foot.y - 0.8, width: 2.2, height: 1.8))
    }

    private static func drawTail(_ ctx: CGContext, base: CGPoint, flag: CGFloat, wag: CGFloat) {
        ctx.saveGState()
        ctx.translateBy(x: base.x, y: base.y)
        let hangingAngle: CGFloat = 2.4 + wag * 0.3   // down & back, resting
        let flaggedAngle: CGFloat = -2.0              // up & back, alarm display
        let angle = lerp(hangingAngle, flaggedAngle, flag)
        let length = lerp(5, 7, flag)
        let width = lerp(2.2, 4.5, flag)

        ctx.rotate(by: angle)
        let rect = CGRect(x: -width / 2, y: 0, width: width, height: length)
        ctx.addPath(CGPath(roundedRect: rect, cornerWidth: width * 0.4, cornerHeight: width * 0.4, transform: nil))
        ctx.setFillColor(coat)
        ctx.fillPath()

        // White underside — bigger & more visible the more she "flags" it (real white-tail alarm tell)
        let whiteFrac = lerp(0.4, 0.85, flag)
        let tipRect = CGRect(x: -width / 2 + 0.4, y: length * (1 - whiteFrac), width: width - 0.8, height: length * whiteFrac)
        ctx.addPath(CGPath(roundedRect: tipRect, cornerWidth: 1, cornerHeight: 1, transform: nil))
        ctx.setFillColor(tailWhite)
        ctx.fillPath()
        ctx.restoreGState()
    }

    private static func drawHead(_ ctx: CGContext, neckBase: CGPoint, pose: DeerPose) {
        let downPt = CGPoint(x: 6, y: 10)      // grazing
        let neutralPt = CGPoint(x: 7, y: -6)   // level
        let upPt = CGPoint(x: 3, y: -14)       // alert

        var offset = pose.neckAngle < 0
            ? lerpPt(neutralPt, downPt, -pose.neckAngle)
            : lerpPt(neutralPt, upPt, pose.neckAngle)
        offset.x += pose.headReach * 5
        offset.y += pose.headReach * 1.5

        let headBase = CGPoint(x: neckBase.x + offset.x, y: neckBase.y + offset.y)

        // Neck
        ctx.setStrokeColor(coat)
        ctx.setLineWidth(5.5)
        ctx.setLineCap(.round)
        ctx.beginPath()
        ctx.move(to: neckBase)
        ctx.addLine(to: headBase)
        ctx.strokePath()

        ctx.saveGState()
        ctx.translateBy(x: headBase.x, y: headBase.y)
        ctx.rotate(by: pose.headYaw * 0.22) // subtle tilt reads as "looking" even in profile

        // Head + snout
        ctx.addPath(CGPath(roundedRect: CGRect(x: -1, y: -4, width: 8, height: 7), cornerWidth: 2, cornerHeight: 2, transform: nil))
        ctx.setFillColor(coat)
        ctx.fillPath()
        ctx.addPath(CGPath(roundedRect: CGRect(x: 6, y: -1.5, width: 5, height: 4), cornerWidth: 1.4, cornerHeight: 1.4, transform: nil))
        ctx.setFillColor(coat)
        ctx.fillPath()

        // Nose
        ctx.setFillColor(noseColor)
        ctx.fill(CGRect(x: 10, y: -0.5, width: 1.8, height: 1.8))

        // Jaw (chewing)
        let jawY = 2 + pose.mouthChew * 1.4
        ctx.setFillColor(coatShade)
        ctx.fill(CGRect(x: 5, y: jawY, width: 5, height: 1.4))

        // Eye
        let eyeH = max(0.4, 1.6 * pose.eyeOpen)
        let eyeW: CGFloat = 1.4 + pose.eyeWide * 0.6
        ctx.setFillColor(eyeColor)
        ctx.fill(CGRect(x: 2.2, y: -0.8 - eyeH / 2, width: eyeW, height: eyeH))

        // Ears
        drawEar(ctx, base: CGPoint(x: 0.5, y: -3.6), perk: pose.earPerk, mirrorSide: -1)
        drawEar(ctx, base: CGPoint(x: 4, y: -3.8), perk: pose.earPerk, mirrorSide: 1)

        ctx.restoreGState()
    }

    private static func drawEar(_ ctx: CGContext, base: CGPoint, perk: CGFloat, mirrorSide: CGFloat) {
        ctx.saveGState()
        ctx.translateBy(x: base.x, y: base.y)
        let droopedAngle: CGFloat = 1.3 * mirrorSide
        let perkedAngle: CGFloat = 0.15 * mirrorSide
        ctx.rotate(by: lerp(droopedAngle, perkedAngle, perk))

        let path = CGMutablePath()
        path.move(to: CGPoint(x: -1, y: 0))
        path.addLine(to: CGPoint(x: 1, y: 0))
        path.addLine(to: CGPoint(x: 0.2, y: -4.5))
        path.closeSubpath()
        ctx.addPath(path)
        ctx.setFillColor(coat)
        ctx.fillPath()
        ctx.restoreGState()
    }
}
