# Konuşma tanıma ölçümü (Faz B ön çalışması)

macOS `SpeechAnalyzer` + `DictationTranscriber` ile Türkçe transkript ve kelime zamanı ölçümü. Sonuçlar: `docs/YAPAY-ZEKA-AJAN-PLANI.md` → "Faz B ön doğrulama".

Bir çalışma klasöründe (repo dışında, örneğin scratchpad):

```bash
cp scripts/speech-eval/* /tmp/speech && cd /tmp/speech
xcrun swiftc -parse-as-library -O probe.swift -o probe && ./probe          # desteklenen diller
xcrun swiftc -parse-as-library -O transcribe.swift -o transcribe
python3 make-sample.py                                                     # tr-sentences.wav + truth.json
./transcribe tr-sentences.wav tr-TR > result.json
python3 split_stats.py result.json truth.json                              # cümle başı/sonu hatası
python3 chunked.py long.wav chunked.json && python3 snap.py long.wav chunked.json snapped.json
```

`chunked.py`: sesi sessizliklerden ≤30 sn parçalara böler. `snap.py`: cümle başlarını/sonlarını sessizlik tespitine yapıştırır.
