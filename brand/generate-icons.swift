// Renders the app icons, tray icons and animated favicons from the brand mark:
// the AICSS "Lens" orb, variant B1 ("Thinking", MIT): four soft circles on the
// corners of a square, focus travelling clockwise, the rest blurred by depth.
// Uses CoreGraphics + ImageIO only, so it runs on any Mac with no dependencies.
//   swift brand/generate-icons.swift   (from the repo root)
// Then iconutil builds icon.icns; the .ico is assembled from brand/build/ico-*.png.
import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let root = FileManager.default.currentDirectoryPath
let icons = "\(root)/src-tauri/icons"
let resources = "\(root)/src-tauri/resources"
let build = "\(root)/brand/build"
try? FileManager.default.createDirectory(atPath: build, withIntermediateDirectories: true)

let ink = CGColor(red: 0.039, green: 0.039, blue: 0.039, alpha: 1)  // #0A0A0A
let black = CGColor(red: 0, green: 0, blue: 0, alpha: 1)
let white = CGColor(red: 1, green: 1, blue: 1, alpha: 1)
let red = CGColor(red: 0.937, green: 0.267, blue: 0.267, alpha: 1)  // #EF4444

// MARK: B1 geometry (Orb.module.css: 6px circles at (+-4.5, +-4.5) on a 28px stage)

/// One circle's look at a point in its 4s cycle: (opacity, blur px, scale),
/// interpolated from the `orb-focus` keyframes.
func focusState(_ phase: Double) -> (a: Double, blur: Double, scale: Double) {
  let keys: [(p: Double, a: Double, b: Double, s: Double)] = [
    (0, 0.05, 2, 1.12), (0.12, 1, 0, 1), (0.22, 1, 0, 1), (0.38, 0.3, 1.2, 1.06),
    (0.58, 0.1, 1.8, 1.1), (0.82, 0.05, 2, 1.12), (1, 0.05, 2, 1.12),
  ]
  let p = phase - floor(phase)
  for i in 0..<(keys.count - 1) where p >= keys[i].p && p <= keys[i + 1].p {
    let k0 = keys[i], k1 = keys[i + 1]
    let t = (p - k0.p) / max(1e-9, k1.p - k0.p)
    let e = t * t * (3 - 2 * t)  // smoothstep, close to the CSS easings
    return (k0.a + (k1.a - k0.a) * e, k0.b + (k1.b - k0.b) * e, k0.s + (k1.s - k0.s) * e)
  }
  return (0.05, 2, 1.12)
}

/// Corner order matches the CSS: A top-left, B top-right, C bottom-right, D bottom-left.
/// Delays 0, -3s, -2s, -1s => phase offsets 0, .75, .5, .25 of the 4s cycle.
let corners: [(x: Double, y: Double, offset: Double)] = [
  (-4.5, -4.5, 0), (4.5, -4.5, 0.75), (4.5, 4.5, 0.5), (-4.5, 4.5, 0.25),
]

/// A circle with a soft edge (radial falloff stands in for CSS blur).
func softCircle(_ ctx: CGContext, _ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat, blur: CGFloat, color: CGColor, alpha: CGFloat) {
  guard alpha > 0.003 else { return }
  let c = color.copy(alpha: alpha)!, clear = color.copy(alpha: 0)!
  if blur < 0.25 {
    ctx.setFillColor(c)
    ctx.fillEllipse(in: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r))
    return
  }
  let inner = max(0, r - blur), outer = r + blur
  let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [c, c, clear] as CFArray,
                     locations: [0, inner / outer, 1])!
  ctx.drawRadialGradient(g, startCenter: CGPoint(x: cx, y: cy), startRadius: 0,
                         endCenter: CGPoint(x: cx, y: cy), endRadius: outer, options: [])
}

/// Draws B1 centred on a 64-unit canvas. `k` = canvas units per stage px.
/// `t` animates (seconds into the 4s cycle); `alphas` overrides opacity for a
/// static mark (the live animation is too faint at rest to work as an icon).
func lens(_ ctx: CGContext, color: CGColor, k: CGFloat, t: Double = 0.68, alphas: [Double]? = nil, crisp: Bool = false) {
  for (i, c) in corners.enumerated() {
    let st = focusState(t / 4 + c.offset)
    let a = alphas?[i] ?? st.a
    let blur = crisp ? 0 : CGFloat(alphas == nil ? st.blur : (1 - a) * 2) * k
    let scale = alphas == nil ? st.scale : 1 + (1 - a) * 0.12
    softCircle(ctx, 32 + CGFloat(c.x) * k, 32 + CGFloat(c.y) * k, 3 * k * CGFloat(scale),
               blur: blur, color: color, alpha: CGFloat(a))
  }
}

/// The static mark: top-left in focus, the rest receding clockwise.
let markAlphas = [1.0, 0.5, 0.26, 0.38]

// MARK: Rendering helpers

func context(_ size: Int) -> CGContext {
  let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.translateBy(x: 0, y: CGFloat(size))  // top-left origin, like the CSS
  ctx.scaleBy(x: 1, y: -1)
  return ctx
}

func render(_ size: Int, _ path: String, draw: (CGContext, CGFloat) -> Void) {
  let ctx = context(size)
  draw(ctx, CGFloat(size))
  let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

/// The mark, scaled from the 64-unit canvas, with a faint light halo so the
/// dark circles still read on dark docks and tabs.
func mark(_ ctx: CGContext, _ s: CGFloat) {
  ctx.saveGState()
  ctx.scaleBy(x: s / 64, y: s / 64)
  ctx.setShadow(offset: .zero, blur: 2, color: CGColor(red: 1, green: 1, blue: 1, alpha: 0.8))
  lens(ctx, color: ink, k: 2.6, alphas: markAlphas)
  ctx.restoreGState()
}

func dot(_ ctx: CGContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ c: CGColor) {
  ctx.setFillColor(c)
  ctx.fillEllipse(in: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
}

// MARK: App icons

let appSizes: [(String, Int)] = [
  ("32x32.png", 32), ("64x64.png", 64), ("128x128.png", 128), ("128x128@2x.png", 256),
  ("icon.png", 512), ("logo.png", 512), ("StoreLogo.png", 50),
  ("Square30x30Logo.png", 30), ("Square44x44Logo.png", 44), ("Square71x71Logo.png", 71),
  ("Square89x89Logo.png", 89), ("Square107x107Logo.png", 107), ("Square142x142Logo.png", 142),
  ("Square150x150Logo.png", 150), ("Square284x284Logo.png", 284), ("Square310x310Logo.png", 310),
]
for (name, size) in appSizes { render(size, "\(icons)/\(name)", draw: mark) }

/// The macOS app icon: the mark on Apple's icon grid tile (an 824/1024
/// rounded square with the standard drop shadow), filled with the website's
/// light backdrop: blue glow top-left, warm glow bottom-right. Bare dots on
/// transparency read as a tiny smudge in the macOS 26 Dock.
func macTile(_ ctx: CGContext, _ s: CGFloat) {
  let inset = s * 100 / 1024, side = s * 824 / 1024
  let tile = CGRect(x: inset, y: inset, width: side, height: side)
  let path = CGPath(roundedRect: tile, cornerWidth: side * 0.225, cornerHeight: side * 0.225, transform: nil)
  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: s * 10 / 1024), blur: s * 20 / 1024,
                color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.28))
  ctx.addPath(path)
  ctx.setFillColor(CGColor(red: 0.961, green: 0.961, blue: 0.969, alpha: 1))  // #F5F5F7
  ctx.fillPath()
  ctx.restoreGState()
  ctx.saveGState()
  ctx.addPath(path)
  ctx.clip()
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  for (x, y, c) in [(0.18, 0.12, CGColor(red: 186 / 255, green: 204 / 255, blue: 236 / 255, alpha: 0.85)),
                    (0.86, 0.92, CGColor(red: 236 / 255, green: 214 / 255, blue: 204 / 255, alpha: 0.75))] {
    let centre = CGPoint(x: tile.minX + side * x, y: tile.minY + side * y)
    let g = CGGradient(colorsSpace: space, colors: [c, c.copy(alpha: 0)!] as CFArray, locations: [0, 1])!
    ctx.drawRadialGradient(g, startCenter: centre, startRadius: 0, endCenter: centre, endRadius: side * 0.75, options: [])
  }
  // A hairline rim, like the app's glass edges.
  ctx.addPath(path)
  ctx.setStrokeColor(CGColor(red: 0, green: 0, blue: 0, alpha: 0.06))
  ctx.setLineWidth(max(1, s / 512))
  ctx.strokePath()
  ctx.restoreGState()
  let m = side * 0.68
  ctx.saveGState()
  ctx.translateBy(x: (s - m) / 2, y: (s - m) / 2)
  mark(ctx, m)
  ctx.restoreGState()
}

let iconset = "\(build)/icon.iconset"
try? FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
  render(base, "\(iconset)/icon_\(base)x\(base).png", draw: macTile)
  render(base * 2, "\(iconset)/icon_\(base)x\(base)@2x.png", draw: macTile)
}
render(1024, "\(build)/mac-icon-1024.png", draw: macTile)
for size in [16, 24, 32, 48, 64, 128, 256] { render(size, "\(build)/ico-\(size).png", draw: mark) }
render(1024, "\(root)/brand/mark-1024.png", draw: mark)
// Web: apple-touch-icon and PWA icons are opaque (iOS ignores transparency).
for (name, size) in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)] {
  render(size, "\(root)/brand/\(name)") { ctx, s in
    ctx.setFillColor(white)
    ctx.fill(CGRect(x: 0, y: 0, width: s, height: s))
    ctx.saveGState()
    ctx.translateBy(x: s * 0.12, y: s * 0.12)
    mark(ctx, s * 0.76)
    ctx.restoreGState()
  }
}

// MARK: Tray icons (template images: black/white + alpha)

enum TrayState { case idle, recording, transcribing, warning }
func tray(_ ctx: CGContext, _ s: CGFloat, _ color: CGColor, _ state: TrayState) {
  ctx.saveGState()
  ctx.scaleBy(x: s / 64, y: s / 64)
  switch state {
  case .idle: lens(ctx, color: color, k: 3.1, alphas: [1, 0.55, 0.35, 0.45], crisp: true)
  case .recording: lens(ctx, color: color, k: 3.1, alphas: [1, 1, 1, 1], crisp: true)
  case .transcribing: lens(ctx, color: color, k: 3.1, alphas: [0.45, 1, 0.55, 0.35], crisp: true)
  case .warning:
    ctx.translateBy(x: -2, y: 2)
    lens(ctx, color: color, k: 2.8, alphas: [1, 0.55, 0.35, 0.45], crisp: true)
    ctx.translateBy(x: 2, y: -2)
    dot(ctx, 55, 9, 7, color)
  }
  ctx.restoreGState()
}
let trayFiles: [(String, TrayState)] = [
  ("tray_idle", .idle), ("tray_recording", .recording),
  ("tray_transcribing", .transcribing), ("tray_idle_warning", .warning),
]
for (name, state) in trayFiles {
  render(64, "\(resources)/\(name).png") { ctx, s in tray(ctx, s, white, state) }
  render(64, "\(resources)/\(name)_dark.png") { ctx, s in tray(ctx, s, black, state) }
}
// "Colored" tray theme: the mark, a red live dot while recording, shifted while working.
render(64, "\(resources)/tray_colored.png", draw: mark)
render(64, "\(resources)/recording.png") { ctx, s in
  mark(ctx, s)
  dot(ctx, s * 0.5, s * 0.5, s * 0.1, red)
}
render(64, "\(resources)/transcribing.png") { ctx, s in
  ctx.scaleBy(x: s / 64, y: s / 64)
  lens(ctx, color: ink, k: 2.6, alphas: [0.45, 1, 0.5, 0.3])
}

// MARK: Animated favicons (GIF). Only Firefox animates GIF favicons; others
// show frame 1, so frame 1 is the static mark. GIF has 1-bit alpha, so
// opacity is baked into the colour against the tab it will sit on.

func mix(_ a: CGColor, _ b: CGColor, _ t: Double) -> CGColor {
  let x = a.components!, y = b.components!
  return CGColor(red: x[0] + (y[0] - x[0]) * t, green: x[1] + (y[1] - x[1]) * t,
                 blue: x[2] + (y[2] - x[2]) * t, alpha: 1)
}

func writeGIF(_ path: String, size: Int, fg: CGColor, tab: CGColor) {
  let frames = 40
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL,
                                             UTType.gif.identifier as CFString, frames, nil)!
  CGImageDestinationSetProperties(dest, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
  for f in 0..<frames {
    let t = 0.68 + Double(f) / Double(frames) * 4  // start on the static pose
    let ctx = context(size)
    ctx.setShouldAntialias(false)  // no partial alpha: GIF transparency is on/off
    ctx.scaleBy(x: CGFloat(size) / 64, y: CGFloat(size) / 64)
    for (i, c) in corners.enumerated() {
      let st = focusState(t / 4 + c.offset)
      // Lift the faint states a little so the mark never vanishes at 16px.
      let a = f == 0 ? markAlphas[i] : 0.12 + 0.88 * st.a
      let r = 3 * 2.6 * CGFloat(st.scale)
      ctx.setFillColor(mix(tab, fg, a))
      ctx.fillEllipse(in: CGRect(x: 32 + CGFloat(c.x) * 2.6 - r, y: 32 + CGFloat(c.y) * 2.6 - r, width: 2 * r, height: 2 * r))
    }
    CGImageDestinationAddImage(dest, ctx.makeImage()!,
                               [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: 0.1]] as CFDictionary)
  }
  CGImageDestinationFinalize(dest)
}
let faviconDarkInk = CGColor(red: 0.96, green: 0.96, blue: 0.96, alpha: 1)  // #F5F5F5, as in mark.svg
writeGIF("\(root)/brand/favicon.gif", size: 64, fg: ink, tab: white)
writeGIF("\(root)/brand/favicon-dark.gif", size: 64,
         fg: faviconDarkInk,
         tab: CGColor(red: 0.13, green: 0.13, blue: 0.14, alpha: 1))

// MARK: Static favicons (PNG), light and dark: the static mark with real alpha,
// for browsers that don't animate and for reduced motion. A faint halo in the
// opposite tone keeps each readable if the tab doesn't match the system theme.
func staticFavicon(_ ctx: CGContext, _ s: CGFloat, fg: CGColor, halo: CGColor) {
  ctx.saveGState()
  ctx.scaleBy(x: s / 64, y: s / 64)
  ctx.setShadow(offset: .zero, blur: 2, color: halo)
  lens(ctx, color: fg, k: 2.6, alphas: markAlphas)
  ctx.restoreGState()
}
for size in [32, 48] {
  render(size, "\(root)/brand/favicon-\(size).png") { ctx, s in
    staticFavicon(ctx, s, fg: ink, halo: CGColor(red: 1, green: 1, blue: 1, alpha: 0.8))
  }
  render(size, "\(root)/brand/favicon-dark-\(size).png") { ctx, s in
    staticFavicon(ctx, s, fg: faviconDarkInk, halo: CGColor(red: 0, green: 0, blue: 0, alpha: 0.6))
  }
}
print("icons rendered")
