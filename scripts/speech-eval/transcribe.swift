import AVFoundation
import Foundation
import Speech

// usage: transcribe <audio> <locale> [preset]   → JSON lines of words with times (ms) on stdout
@main
struct Transcribe {
  static func main() async {
    let args = CommandLine.arguments
    let url = URL(fileURLWithPath: args[1])
    let locale = Locale(identifier: args[2])
    let preset = args.count > 3 ? args[3] : "custom"
    do {
      let transcriber: DictationTranscriber
      switch preset {
      case "timeIndexed": transcriber = DictationTranscriber(locale: locale, preset: .timeIndexedLongDictation)
      case "long": transcriber = DictationTranscriber(locale: locale, preset: .longDictation)
      default:
        transcriber = DictationTranscriber(
          locale: locale, contentHints: [], transcriptionOptions: [.punctuation],
          reportingOptions: [], attributeOptions: [.audioTimeRange, .transcriptionConfidence])
      }
      let status = await AssetInventory.status(forModules: [transcriber])
      FileHandle.standardError.write("asset status: \(status)\n".data(using: .utf8)!)
      if status != .installed, let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
        try await request.downloadAndInstall()
      }
      let analyzer = SpeechAnalyzer(modules: [transcriber])
      if let terms = ProcessInfo.processInfo.environment["TERMS"], !terms.isEmpty {
        let context = AnalysisContext()
        context.contextualStrings[.general] = terms.components(separatedBy: ",")
        try await analyzer.setContext(context)
      }
      let file = try AVAudioFile(forReading: url)
      let started = Date()
      let collect = Task { () -> [[String: Any]] in
        var words: [[String: Any]] = []
        for try await result in transcriber.results {
          for run in result.text.runs {
            let piece = String(result.text[run.range].characters)
            var entry: [String: Any] = ["text": piece]
            if let range = run.audioTimeRange {
              entry["startMs"] = Int((range.start.seconds * 1000).rounded())
              entry["endMs"] = Int((range.end.seconds * 1000).rounded())
            }
            if let confidence = run.transcriptionConfidence { entry["confidence"] = confidence }
            words.append(entry)
          }
        }
        return words
      }
      try await analyzer.start(inputAudioFile: file, finishAfterFile: true)
      let words = try await collect.value
      let elapsed = Date().timeIntervalSince(started)
      let out: [String: Any] = ["elapsedMs": Int(elapsed * 1000), "words": words]
      let data = try JSONSerialization.data(withJSONObject: out, options: [])
      FileHandle.standardOutput.write(data)
    } catch {
      FileHandle.standardError.write("error: \(error)\n".data(using: .utf8)!)
      exit(1)
    }
  }
}
