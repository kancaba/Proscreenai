// Reads the text on still images with Apple's Vision framework, on device, so the editor can
// suggest blurring private details (e-mail addresses, ID numbers …) shown in a recording.
//
// usage: openscreen-text-recognizer <image> [<image> …]
//
// Writes one JSON object per line to stdout, in any order:
//   {"type":"frame","index":0,"lines":[{"text":"Alıcı: a@b.io","words":[{"text":"a@b.io","x":0.1,"y":0.2,"w":0.1,"h":0.02}]}]}
//   {"type":"error","index":0,"message":"..."}
//   {"type":"done"}
// Boxes are fractions (0–1) of the image, measured from its top-left corner. Each line is split
// into whitespace-separated words with their own boxes, so a part of a line can be covered.

import Foundation
import Vision

let output = NSLock()

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object, options: []) else { return }
  output.lock()
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
  output.unlock()
}

func box(_ rect: CGRect) -> [String: Double] {
  // Vision measures from the bottom-left corner.
  ["x": Double(rect.minX), "y": Double(1 - rect.maxY), "w": Double(rect.width), "h": Double(rect.height)]
}

func recognize(_ path: String, index: Int) {
  let url = URL(fileURLWithPath: path)
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  // Addresses, numbers and keys are not dictionary words.
  request.usesLanguageCorrection = false
  let wanted = ["tr-TR", "en-US"]
  if let supported = try? request.supportedRecognitionLanguages() {
    let languages = wanted.filter { supported.contains($0) }
    if !languages.isEmpty { request.recognitionLanguages = languages }
  }
  let handler = VNImageRequestHandler(url: url, options: [:])
  do {
    try handler.perform([request])
  } catch {
    emit(["type": "error", "index": index, "message": error.localizedDescription])
    return
  }
  var lines: [[String: Any]] = []
  for observation in request.results ?? [] {
    guard let candidate = observation.topCandidates(1).first else { continue }
    let text = candidate.string
    var words: [[String: Any]] = []
    var start = text.startIndex
    while start < text.endIndex {
      guard let wordStart = text[start...].firstIndex(where: { !$0.isWhitespace }) else { break }
      let wordEnd = text[wordStart...].firstIndex(where: { $0.isWhitespace }) ?? text.endIndex
      let range = wordStart..<wordEnd
      if let rect = try? candidate.boundingBox(for: range)?.boundingBox {
        var word: [String: Any] = ["text": String(text[range])]
        for (key, value) in box(rect) { word[key] = value }
        words.append(word)
      }
      start = wordEnd
    }
    var line: [String: Any] = ["text": text, "words": words]
    for (key, value) in box(observation.boundingBox) { line[key] = value }
    lines.append(line)
  }
  emit(["type": "frame", "index": index, "lines": lines])
}

let paths = Array(CommandLine.arguments.dropFirst())
if paths.isEmpty {
  emit(["type": "error", "index": -1, "message": "No images given."])
  exit(1)
}
DispatchQueue.concurrentPerform(iterations: paths.count) { index in
  recognize(paths[index], index: index)
}
emit(["type": "done"])
