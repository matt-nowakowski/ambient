// Renders the macOS installer (DMG) window background: off-white with the
// ambient haze, the wordmark, and an arrow from the app to Applications.
//   swift brand/generate-dmg.swift   (from the repo root)
// Output: src-tauri/dmg/background.png at 2x, tagged 144 dpi so Finder draws
// it at 660x400 points, crisp on Retina. Icon positions live in
// tauri.conf.json (bundle.macOS.dmg) and must match the arrow below.
import AppKit
import CoreGraphics
import Foundation

let root = FileManager.default.currentDirectoryPath
let out = "\(root)/src-tauri/dmg"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

// The product name, from brand.config.json (the single source of truth).
let brandName: String = {
  let data = try! Data(contentsOf: URL(fileURLWithPath: "\(root)/brand.config.json"))
  let json = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
  return json["name"] as! String
}()

let W: CGFloat = 660, H: CGFloat = 400, scale: CGFloat = 2
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: Int(W * scale), height: Int(H * scale), bitsPerComponent: 8, bytesPerRow: 0,
                    space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.scaleBy(x: scale, y: scale)
// Top-left origin, like the window.
ctx.translateBy(x: 0, y: H)
ctx.scaleBy(x: 1, y: -1)

func rgb(_ hex: Int, _ a: CGFloat = 1) -> CGColor {
  CGColor(red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: a)
}

// Paper.
ctx.setFillColor(rgb(0xF7F6F4))
ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

// Haze: soft lavender and blue glows, like the website.
func glow(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ color: CGColor) {
  let g = CGGradient(colorsSpace: cs, colors: [color, color.copy(alpha: 0)!] as CFArray, locations: [0, 1])!
  ctx.drawRadialGradient(g, startCenter: CGPoint(x: x, y: y), startRadius: 0, endCenter: CGPoint(x: x, y: y), endRadius: r, options: [])
}
glow(560, 40, 260, rgb(0xB9B4F5, 0.38))
glow(90, 380, 240, rgb(0xA9C8F2, 0.30))
glow(380, 200, 300, rgb(0xFFFFFF, 0.55))

// Wordmark: the B1 lens (four circles) + "ambient".
let ink = rgb(0x0A0A0A)
let lensX: CGFloat = 290, lensY: CGFloat = 62, k: CGFloat = 4.6
for (dx, dy, a) in [(-1.0, -1.0, 1.0), (1.0, -1.0, 0.5), (1.0, 1.0, 0.26), (-1.0, 1.0, 0.38)] as [(CGFloat, CGFloat, CGFloat)] {
  ctx.setFillColor(ink.copy(alpha: a)!)
  let r: CGFloat = 3.2
  ctx.fillEllipse(in: CGRect(x: lensX + dx * k - r, y: lensY + dy * k - r, width: 2 * r, height: 2 * r))
}
func text(_ s: String, _ x: CGFloat, _ y: CGFloat, size: CGFloat, weight: NSFont.Weight, color: CGColor, center: Bool = false) {
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: true)
  let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: size, weight: weight),
    .foregroundColor: NSColor(cgColor: color)!,
    .kern: size * -0.02,
  ]
  let str = NSAttributedString(string: s, attributes: attrs)
  let w = str.size().width
  str.draw(at: NSPoint(x: center ? x - w / 2 : x, y: y))
  NSGraphicsContext.restoreGraphicsState()
}
text(brandName.lowercased(), 304, 49, size: 22, weight: .light, color: ink)

// Arrow from the app (180, 205) to Applications (480, 205).
ctx.setStrokeColor(rgb(0x0A0A0A, 0.28))
ctx.setLineWidth(1.4)
ctx.setLineCap(.round)
ctx.setLineDash(phase: 0, lengths: [1, 6])
let start = CGPoint(x: 262, y: 205), control = CGPoint(x: 330, y: 186), tip = CGPoint(x: 396, y: 205)
ctx.move(to: start)
ctx.addQuadCurve(to: tip, control: control)
ctx.strokePath()
ctx.setLineDash(phase: 0, lengths: [])
// The head follows the curve's direction at its end (tip − control), so it
// tilts down with the arc instead of pointing flat right.
let angle = atan2(tip.y - control.y, tip.x - control.x)
let back: CGFloat = 9, spread: CGFloat = 7
let (dx, dy) = (cos(angle), sin(angle))
let base = CGPoint(x: tip.x - back * dx, y: tip.y - back * dy)
ctx.move(to: CGPoint(x: base.x - spread * dy, y: base.y + spread * dx))
ctx.addLine(to: tip)
ctx.addLine(to: CGPoint(x: base.x + spread * dy, y: base.y - spread * dx))
ctx.strokePath()

text("Drag \(brandName) to Applications", 330, 318, size: 13, weight: .regular, color: rgb(0x0A0A0A, 0.48), center: true)

let image = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: image)
rep.size = NSSize(width: W, height: H)  // => 144 dpi
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(out)/background.png"))
print("wrote src-tauri/dmg/background.png")
