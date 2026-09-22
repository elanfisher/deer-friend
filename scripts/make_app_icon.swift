// Composes the app icon from the fawn sprite: a rounded square of sky over meadow with her
// looking straight at you, centred with room to spare so her ear tips never touch the edges.
//
//   swift scripts/make_app_icon.swift Resources/DeerFront.png Resources/AppIcon-1024.png 1024
import AppKit

let args = CommandLine.arguments
guard args.count >= 4,
      let sprite = NSImage(contentsOfFile: args[1])?
        .cgImage(forProposedRect: nil, context: nil, hints: nil),
      let size = Int(args[3]) else {
    FileHandle.standardError.write(Data("usage: make_app_icon.swift <sprite.png> <out.png> <size>\n".utf8))
    exit(1)
}

let S = CGFloat(size)
guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(1) }
ctx.setShouldAntialias(true)
ctx.interpolationQuality = .none

// Rounded-square mask, like other macOS icons
let corner = S * 0.225
ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: S, height: S),
                   cornerWidth: corner, cornerHeight: corner, transform: nil))
ctx.clip()

// Sky over meadow (CoreGraphics is y-up here, so the meadow is at the bottom)
ctx.setFillColor(CGColor(red: 0.749, green: 0.890, blue: 0.961, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: S, height: S))
let horizon = S * 0.30
ctx.setFillColor(CGColor(red: 0.561, green: 0.749, blue: 0.384, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: S, height: horizon))
ctx.setFillColor(CGColor(red: 0.498, green: 0.682, blue: 0.333, alpha: 1))
ctx.fill(CGRect(x: 0, y: horizon - S * 0.012, width: S, height: S * 0.012))

// Her, centred. She may take up at most ~58% of the icon, so the ears keep a wide margin.
let sw = CGFloat(sprite.width), sh = CGFloat(sprite.height)
let scale = (S * 0.58 / sh).rounded(.down)          // whole-number scale keeps the pixels crisp
let w = sw * scale, h = sh * scale
let rect = CGRect(x: ((S - w) / 2).rounded(), y: ((S - h) / 2).rounded() - S * 0.02, width: w, height: h)

// A soft shadow on the grass so she isn't floating
ctx.setFillColor(CGColor(red: 0.29, green: 0.44, blue: 0.20, alpha: 0.30))
ctx.fillEllipse(in: CGRect(x: rect.midX - w * 0.42, y: rect.minY - S * 0.012, width: w * 0.84, height: S * 0.035))
ctx.draw(sprite, in: rect)

guard let image = ctx.makeImage() else { exit(1) }
let out = URL(fileURLWithPath: args[2])
guard let dest = CGImageDestinationCreateWithURL(out as CFURL, "public.png" as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, image, nil)
CGImageDestinationFinalize(dest)
print("wrote \(out.path) (\(size)×\(size), deer at \(Int(scale))× scale)")
