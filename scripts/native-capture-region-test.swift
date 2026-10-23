// Area selection is cropped by ScreenCaptureKit from a fractional display region.
let full = captureSourceRect(displayWidth: 1800, displayHeight: 1169, x: 0, y: 0, width: 1, height: 1)
precondition(full == CGRect(x: 0, y: 0, width: 1800, height: 1169))
let quarter = captureSourceRect(displayWidth: 1800, displayHeight: 1169, x: 0.25, y: 0.5, width: 0.5, height: 0.25)!
precondition(quarter.minX == 450 && quarter.minY >= 584 && quarter.minY <= 585 && quarter.width >= 900 && quarter.width <= 901)
precondition(captureSourceRect(displayWidth: 1800, displayHeight: 1169, x: nil, y: 0, width: 1, height: 1) == nil)
precondition(captureSourceRect(displayWidth: 1800, displayHeight: 1169, x: 0.9, y: 0, width: 0.5, height: 1) == nil)
precondition(captureSourceRect(displayWidth: 1800, displayHeight: 1169, x: 0, y: 0, width: 0.001, height: 0.5) == nil)
precondition(captureSourceRect(displayWidth: 1800, displayHeight: 1169, x: .nan, y: 0, width: 0.5, height: 0.5) == nil)
print("PASS capture region maps display fractions to an in-bounds source rect")
