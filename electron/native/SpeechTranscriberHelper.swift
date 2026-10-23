// Transcribes audio chunks on device with Apple's DictationTranscriber (macOS 26+),
// which, unlike SpeechTranscriber, supports Turkish.
//
// usage: openscreen-speech-transcriber <manifest.json>
// manifest: {"locale": "tr-TR", "chunks": [{"path": "/tmp/chunk-0.wav", "offsetMs": 0}, ...]}
//
// Writes one JSON object per line to stdout:
//   {"type":"assets","status":"installed"|"downloading"}
//   {"type":"chunk","index":0,"pieces":[{"text":"Merhaba ","startMs":480,"endMs":1200,"confidence":0.84}]}
//   {"type":"done"}
//   {"type":"error","code":"unsupported-os"|"unsupported-locale"|"assets-unavailable"|"bad-manifest"|"failed","message":"..."}
// Piece times are in source milliseconds (chunk offset added). Text runs are passed through
// as recognised; a run without a leading space continues the previous word.

import AVFoundation
import Foundation
import Speech

struct ManifestChunk: Decodable {
  let path: String
  let offsetMs: Int
}

struct Manifest: Decodable {
  let locale: String
  let chunks: [ManifestChunk]
}

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object, options: []) else { return }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func fail(_ code: String, _ message: String) -> Never {
  emit(["type": "error", "code": code, "message": message])
  exit(1)
}

@available(macOS 26.0, *)
func makeTranscriber(_ locale: Locale) -> DictationTranscriber {
  DictationTranscriber(
    locale: locale,
    contentHints: [],
    transcriptionOptions: [.punctuation],
    reportingOptions: [],
    attributeOptions: [.audioTimeRange, .transcriptionConfidence]
  )
}

@available(macOS 26.0, *)
func transcribe(_ manifest: Manifest) async {
  guard let locale = await DictationTranscriber.supportedLocale(equivalentTo: Locale(identifier: manifest.locale)) else {
    fail("unsupported-locale", "Speech recognition does not support \(manifest.locale) on this Mac.")
  }

  let probe = makeTranscriber(locale)
  let status = await AssetInventory.status(forModules: [probe])
  if status == .unsupported {
    fail("unsupported-locale", "Speech recognition does not support \(manifest.locale) on this Mac.")
  }
  if status != .installed {
    do {
      // No request means the model is already on this Mac.
      if let request = try await AssetInventory.assetInstallationRequest(supporting: [probe]) {
        emit(["type": "assets", "status": "downloading"])
        try await request.downloadAndInstall()
      }
    } catch {
      fail("assets-unavailable", "Could not download the speech model: \(error.localizedDescription)")
    }
  }
  emit(["type": "assets", "status": "installed"])

  for (index, chunk) in manifest.chunks.enumerated() {
    do {
      // A fresh analyzer per chunk keeps timings anchored to each chunk's start.
      let transcriber = makeTranscriber(locale)
      let analyzer = SpeechAnalyzer(modules: [transcriber])
      let file = try AVAudioFile(forReading: URL(fileURLWithPath: chunk.path))
      let collector = Task { () -> [[String: Any]] in
        var pieces: [[String: Any]] = []
        for try await result in transcriber.results {
          for run in result.text.runs {
            guard let range = run.audioTimeRange else { continue }
            var piece: [String: Any] = [
              "text": String(result.text[run.range].characters),
              "startMs": chunk.offsetMs + Int((range.start.seconds * 1000).rounded()),
              "endMs": chunk.offsetMs + Int((range.end.seconds * 1000).rounded()),
            ]
            if let confidence = run.transcriptionConfidence { piece["confidence"] = confidence }
            pieces.append(piece)
          }
        }
        return pieces
      }
      try await analyzer.start(inputAudioFile: file, finishAfterFile: true)
      emit(["type": "chunk", "index": index, "pieces": try await collector.value])
    } catch {
      fail("failed", "Chunk \(index) could not be transcribed: \(error.localizedDescription)")
    }
  }
  emit(["type": "done"])
}

let arguments = CommandLine.arguments
guard arguments.count >= 2,
      let manifestData = FileManager.default.contents(atPath: arguments[1]),
      let manifest = try? JSONDecoder().decode(Manifest.self, from: manifestData)
else {
  fail("bad-manifest", "Usage: openscreen-speech-transcriber <manifest.json>")
}

if #available(macOS 26.0, *) {
  Task {
    await transcribe(manifest)
    exit(0)
  }
  dispatchMain()
} else {
  fail("unsupported-os", "Automatic captions need macOS 26 or later.")
}
