import AppKit
import AVFoundation
import CoreVideo

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let assets = root.appendingPathComponent("projects/Studio-Demo/assets")
try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
let width = 1280, height = 720, fps: Int32 = 30, seconds = 12
func color(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: CGFloat((hex >> 16) & 255)/255, green: CGFloat((hex >> 8) & 255)/255, blue: CGFloat(hex & 255)/255, alpha: alpha)
}
func rect(_ x: CGFloat,_ y: CGFloat,_ w: CGFloat,_ h: CGFloat) -> NSRect { NSRect(x:x,y:CGFloat(height)-y-h,width:w,height:h) }
func box(_ x: CGFloat,_ y: CGFloat,_ w: CGFloat,_ h: CGFloat,_ fill: UInt32,_ radius: CGFloat=12) {
    color(fill).setFill();NSBezierPath(roundedRect:rect(x,y,w,h),xRadius:radius,yRadius:radius).fill()
}
func label(_ text: String,_ x: CGFloat,_ y: CGFloat,_ size: CGFloat=14,_ fill: UInt32=0x272438,_ weight: NSFont.Weight = .regular,_ w: CGFloat=900) {
    let style=NSMutableParagraphStyle();style.lineBreakMode = .byTruncatingTail
    (text as NSString).draw(in:rect(x,y,w,size*1.65),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:weight),.foregroundColor:color(fill),.paragraphStyle:style])
}
func dot(_ x: CGFloat,_ y: CGFloat,_ r: CGFloat,_ fill: UInt32) { color(fill).setFill(); NSBezierPath(ovalIn:rect(x,y,r,r)).fill() }
func line(_ points: [(CGFloat,CGFloat)],_ fill: UInt32,_ thickness: CGFloat=2) {
    let path=NSBezierPath();path.move(to:NSPoint(x:points[0].0,y:CGFloat(height)-points[0].1));for p in points.dropFirst(){path.line(to:NSPoint(x:p.0,y:CGFloat(height)-p.1))};path.lineWidth=thickness;path.lineCapStyle = .round;path.lineJoinStyle = .round;color(fill).setStroke();path.stroke()
}
func draw(_ t: Double) {
    box(0,0,1280,720,0xf5f4f8,0)
    box(0,0,1280,44,0xedeaf3,0)
    dot(18,16,11,0xf4a1a7);dot(36,16,11,0xf1cf8b);dot(54,16,11,0x9ed2b3)
    label("launchboard / workspace",490,12,12,0x90899d,.medium)
    box(0,44,208,676,0xfffeff,0)
    box(24,78,29,29,0x7e65c2,9);label("L",33,81,20,0xffffff,.bold)
    label("Launchboard",65,81,19,0x302a40,.semibold)
    label("WORKSPACE",28,140,10,0xa29aad,.semibold)
    let active = t < 4 ? 0 : t < 8 ? 1 : 2
    for (i,name) in ["Overview","Projects","Analytics","Team","Settings"].enumerated() {
        let y=174+CGFloat(i)*47
        if i==active {box(14,y-6,180,38,0xf0eafc,9)}
        box(29,y+3,15,15,i==active ? 0x9c85d1 : 0xd5d0df,4)
        label(name,57,y,13,i==active ? 0x7659b1 : 0x8e8799,i==active ? .semibold : .regular)
    }
    box(19,571,170,91,0xf7f4fc,10);label("Made for your next",32,586,11,0x93889e);label("big idea.",32,604,18,0x584772,.semibold);label("Explore templates  →",32,636,10,0x8c72b8)
    dot(24,681,23,0xd7c9ed);label("Alex Morgan",58,683,11,0x696173,.medium)
    label(active==0 ? "Workspace overview" : active==1 ? "Your projects" : "Growth analytics",246,76,25,0x2d263b,.semibold)
    label("A little progress, every single day.",247,111,13,0xa39aaf)
    box(1090,78,143,36,t>1 && t<1.8 ? 0x9c83d7 : 0x8269bb,9);label("+  New project",1106,86,12,0xffffff,.medium)
    let metrics=[("TOTAL REVENUE","$24,680","+18.6% this month"),("ACTIVE PROJECTS",t>2 ? "19" : "18","3 launching this week"),("SUBSCRIBERS","1,248","+12.4% this month")]
    for (i,m) in metrics.enumerated() {
        let x=246+CGFloat(i)*335
        box(x,157,315,115,0xffffff,12)
        label(m.0,x+20,176,10,0xa49aad,.semibold)
        label(m.1,x+20,199,29,0x352b46,.semibold)
        label(m.2,x+20,242,10,i==1 ? 0x9d8dab : 0x67a58d)
        line([(x+217,238),(x+231,228),(x+246,232),(x+260,216),(x+279,220),(x+292,207)],0xb49bdf,2)
    }
    box(246,291,652,337,0xffffff,12)
    label("Revenue overview",268,311,15,0x483b5d,.semibold);label("The bigger picture looks good.",268,338,11,0xa89cae)
    box(769,309,105,27,0xf6f3fa,7);label("This quarter  ▾",781,316,10,0x9c8fa8)
    for i in 0..<5 {
        let y=389+CGFloat(i)*46
        line([(300,y),(870,y)],0xf0edf5,1)
        label(["30k","24k","18k","12k","6k"][i],270,y-7,9,0xb2a9bd)
    }
    var points:[(CGFloat,CGFloat)]=[]
    for i in 0..<48 {
        let x=305+CGFloat(i)*11.8
        let progress=Double(i)/47
        let wobble=sin(Double(i)*0.65+t*0.3)*13+cos(Double(i)*0.22)*12
        points.append((x,CGFloat(560-progress*155+wobble)))
    }
    let area=NSBezierPath();area.move(to:NSPoint(x:points[0].0,y:CGFloat(height)-580));for p in points{area.line(to:NSPoint(x:p.0,y:CGFloat(height)-p.1))};area.line(to:NSPoint(x:points.last!.0,y:CGFloat(height)-580));area.close();color(0xb59bdf,0.13).setFill();area.fill();line(points,0xa58acb,3)
    for (i,m) in ["JAN","FEB","MAR","APR","MAY","JUN"].enumerated(){label(m,304+CGFloat(i)*107,597,9,0xb0a5bc)}
    if t>8 {box(633,393,126,48,0x332a47,8);label("Looking good!",646,402,11,0xe5d9f6,.medium);label("+18.6% growth",646,419,10,0xbfa9dc)}
    box(918,291,319,337,0xffffff,12)
    label("Launch checklist",940,312,15,0x483b5d,.semibold);label("Your next release, in motion.",940,340,11,0xa89cae)
    let names=["Define the big idea","Polish the experience","Record the walkthrough","Share it with the world"]
    for (i,n) in names.enumerated(){
        let y=387+CGFloat(i)*51
        let checked = Double(i)*2 < t
        box(941,y,18,18,checked ? 0xc2afd9 : 0xf0edf4,5)
        if checked {label("✓",944,y-1,12,0xffffff,.bold)}
        label(n,970,y,11,0x8b7d99)
        if i<3 {line([(940,y+35),(1214,y+35)],0xf5f2f8,1)}
    }
    box(940,593,274,8,0xf1ecf7,4);box(940,593,CGFloat(min(1,t/9))*274,8,0xc0a8dc,4)
    box(246,646,991,48,0xeee9f6,10);label("✦   Small details. A better story.",266,661,12,0x907aa8,.medium);label("Everything is saved locally.",1012,663,10,0xa394b1)
}
let frames=root.appendingPathComponent(".cache/demo-frames")
try FileManager.default.createDirectory(at:frames,withIntermediateDirectories:true)
for frame in 0..<(seconds*Int(fps)) {
    try autoreleasepool {
        let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:width,pixelsHigh:height,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
        NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:bitmap);draw(Double(frame)/Double(fps));NSGraphicsContext.restoreGraphicsState()
        let data=bitmap.representation(using:.png,properties:[:])!
        try data.write(to:frames.appendingPathComponent(String(format:"%04d.png",frame)))
        if frame==0 {try data.write(to:assets.appendingPathComponent("launchboard-cover.png"))}
    }
}
let background=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:width,pixelsHigh:height,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:background)
NSGradient(starting:color(0xd4ccf1),ending:color(0xaac8dc))!.draw(in:NSRect(x:0,y:0,width:width,height:height),angle:35)
color(0xf2b4c8,0.45).setFill();NSBezierPath(ovalIn:NSRect(x:800,y:-290,width:1000,height:1100)).fill()
color(0xb3e1d8,0.55).setFill();NSBezierPath(ovalIn:NSRect(x:-400,y:200,width:1000,height:1000)).fill()
NSGraphicsContext.restoreGraphicsState();try background.representation(using:.png,properties:[:])!.write(to:assets.appendingPathComponent("studio-background.png"))
print("Created 12-second Launchboard demo and background")
