import AppKit

let image = NSImage(size: NSSize(width: 1024, height: 1024))
let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4,
  hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(calibratedRed: 0.13, green: 0.17, blue: 0.24, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1024, height: 1024)).fill()
let cat = NSBezierPath()
cat.move(to: NSPoint(x: 240, y: 470))
cat.line(to: NSPoint(x: 240, y: 790))
cat.line(to: NSPoint(x: 430, y: 670))
cat.line(to: NSPoint(x: 590, y: 670))
cat.line(to: NSPoint(x: 784, y: 790))
cat.line(to: NSPoint(x: 784, y: 470))
cat.curve(
  to: NSPoint(x: 240, y: 470), controlPoint1: NSPoint(x: 784, y: 100),
  controlPoint2: NSPoint(x: 240, y: 100))
NSColor(calibratedRed: 0.73, green: 0.64, blue: 0.98, alpha: 1).setFill()
cat.fill()
func stroke(_ points: [NSPoint], color: NSColor, width: CGFloat) {
  let p = NSBezierPath()
  p.lineWidth = width
  p.lineCapStyle = .round
  p.move(to: points[0])
  for v in points.dropFirst() { p.line(to: v) }
  color.setStroke()
  p.stroke()
}
let ink = NSColor(calibratedRed: 0.13, green: 0.17, blue: 0.24, alpha: 1)
for x in [CGFloat(360), 640] {
  stroke([NSPoint(x: x, y: 505), NSPoint(x: x + 24, y: 505)], color: ink, width: 38)
}
stroke(
  [NSPoint(x: 480, y: 410), NSPoint(x: 512, y: 378), NSPoint(x: 544, y: 410)], color: ink, width: 30
)
for side in [-1.0, 1.0] {
  for y in [420.0, 330.0] {
    stroke(
      [NSPoint(x: 512 + side * 170, y: y + 15), NSPoint(x: 512 + side * 360, y: y - 25)],
      color: ink, width: 28)
  }
}
stroke(
  [NSPoint(x: 700, y: 150), NSPoint(x: 850, y: 380)],
  color: NSColor(calibratedRed: 0.47, green: 0.88, blue: 0.79, alpha: 1), width: 65)
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(
  to: URL(fileURLWithPath: CommandLine.arguments[1]))
