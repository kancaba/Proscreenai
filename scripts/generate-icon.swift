import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let iconset = root.appendingPathComponent("icons/screenmovie.iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
let publicIcons = root.appendingPathComponent("public/app-icons")
func render(_ size: Int, to url: URL) throws {
    let pixels = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: pixels)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.cgContext.scaleBy(x: CGFloat(size)/1024, y: CGFloat(size)/1024)
    NSColor(calibratedRed: 0.76, green: 0.70, blue: 0.97, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 54, y: 54, width: 916, height: 916), xRadius: 205, yRadius: 205).fill()
    let ink = NSColor(calibratedRed: 0.16, green: 0.12, blue: 0.23, alpha: 1)
    ink.setFill()
    NSBezierPath(roundedRect: NSRect(x: 228, y: 247, width: 568, height: 466), xRadius: 63, yRadius: 63).fill()
    NSColor(calibratedRed: 0.87, green: 0.82, blue: 1, alpha: 1).setFill()
    let triangle = NSBezierPath(); triangle.move(to: NSPoint(x: 449, y: 346)); triangle.line(to: NSPoint(x: 449, y: 565)); triangle.line(to: NSPoint(x: 626, y: 455)); triangle.close(); triangle.fill()
    NSGraphicsContext.saveGraphicsState()
    let transform = AffineTransform(translationByX: 0, byY: 0)
    var tilt = transform; tilt.translate(x: 228, y: 697); tilt.rotate(byDegrees: 10); tilt.translate(x: -228, y: -697)
    (tilt as NSAffineTransform).concat()
    ink.setFill(); NSBezierPath(roundedRect: NSRect(x: 228, y: 660, width: 568, height: 107), xRadius: 20, yRadius: 20).fill()
    NSColor(calibratedRed: 0.87, green: 0.82, blue: 1, alpha: 1).setFill()
    for x in [290, 450, 610] {
        let stripe = NSBezierPath(); stripe.move(to: NSPoint(x:x,y:660));stripe.line(to:NSPoint(x:x+53,y:660));stripe.line(to:NSPoint(x:x+109,y:767));stripe.line(to:NSPoint(x:x+56,y:767));stripe.close();stripe.fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    NSGraphicsContext.restoreGraphicsState()
    try pixels.representation(using: .png, properties: [:])!.write(to: url)
}
for size in [16,32,128,256,512] {
    try render(size, to: iconset.appendingPathComponent("icon_\(size)x\(size).png"))
    try render(size*2, to: iconset.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
for size in [32,128,512] { try render(size,to:publicIcons.appendingPathComponent("screenmovie-\(size).png")) }
