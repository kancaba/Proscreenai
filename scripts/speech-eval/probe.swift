import Foundation
import Speech

@main
struct Probe {
  static func main() async {
    let tr = Locale(identifier: "tr-TR")
    func ids(_ locales: [Locale]) -> [String] { locales.map { $0.identifier(.bcp47) }.sorted() }
    print("SpeechTranscriber.isAvailable:", SpeechTranscriber.isAvailable)
    let supported = await SpeechTranscriber.supportedLocales
    print("SpeechTranscriber supported (\(supported.count)):", ids(supported).joined(separator: " "))
    print("SpeechTranscriber installed:", ids(await SpeechTranscriber.installedLocales).joined(separator: " "))
    print("SpeechTranscriber tr equivalent:", String(describing: await SpeechTranscriber.supportedLocale(equivalentTo: tr)?.identifier(.bcp47)))
    let dictation = await DictationTranscriber.supportedLocales
    print("DictationTranscriber supported (\(dictation.count)) has tr:", ids(dictation).filter { $0.hasPrefix("tr") })
    print("DictationTranscriber tr equivalent:", String(describing: await DictationTranscriber.supportedLocale(equivalentTo: tr)?.identifier(.bcp47)))
    print("DictationTranscriber installed:", ids(await DictationTranscriber.installedLocales).joined(separator: " "))
    let legacy = SFSpeechRecognizer.supportedLocales().map { $0.identifier }.filter { $0.hasPrefix("tr") }
    print("SFSpeechRecognizer has tr:", legacy, "onDevice:", SFSpeechRecognizer(locale: tr)?.supportsOnDeviceRecognition ?? false)
    print("SFSpeechRecognizer authorization:", SFSpeechRecognizer.authorizationStatus().rawValue)
  }
}
