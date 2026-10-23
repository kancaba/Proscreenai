# ScreenMovie — Devam planı ve mevcut durum

> **23 Ekim 2026 güncel kontrolü:** [Kalan işler ve öncelikler](KALAN-ISLER-2026-10-23.md). Aşağıdaki 19–20 Ekim paket/durum açıklamaları tarihsel kayıttır. Son ana sayfa, marka, galeri ve görsel güncellemeleri 22 Ekim paketine girdi.

Son güncelleme: **19 Ekim 2026**. Bu dosya, geliştirmeyi daha sonra başka bir oturumda sürdürebilmek için hazırlanmıştır. Yeni özellik uygulamak yerine mevcut çalışma burada devredilmiştir.

> **Önce okunmalı (19 Ekim, ikinci oturum sonrası):** Native video writer hatası (-11800 / -16341) güncel kaynak kodla **yeniden üretilemedi**: statik ekran 20/40 sn, 10 pause döngüsü ve 3400×2100 tam pencere gürültüyle 3 pause döngüsü denendi, hepsinde video ve sistem sesi writer'ı tamamlandı (bkz. §5.1). Aynı testlerde iki gerçek hata bulundu ve düzeltildi: duraklatmalarda sesin videonun önüne kayması ve pencere kaydının yanlış alarmla yarıda kesilmesi. Native kayıt yine de **henüz kabul edilmiş değildir**: mikrofon, uygulama içinden uçtan uca kayıt (HUD + mux + cursor senkronu) ve paketlenmiş uygulama testi yapılmadı. Sabit konumdaki uygulama 19 Ekim 16:32 paketidir (Apple Development imzalı, Faz A–E dahil); kullanıcı testi bekliyor.

> **22 Ekim — bağımsız görsel modülü:** [Görsel Stüdyo uygulama ve doğrulama](GORSEL-STUDYO-DURUM-2026-10-22.md). Gerçek Codex görsel üretme/düzenleme ve prompt akışı eklendi; paket güncellenmedi.

## 1. Başlangıç noktası ve korunacak kararlar

- Proje: `<project-root>`.
- Electron ile devam edilecek; Tauri veya başka framework'e geçiş istenmiyor.
- Ürün adı ScreenMovie. Kullanıcıya görünen alanlarda başka projenin markası gösterilmeyecek; gerekli lisans ve atıflar `THIRD_PARTY_NOTICES.md` içinde korunacak.
- Kullanıcı çok sayıda uygulama kopyası istemiyor. Kullanılacak sabit uygulama konumu: `release-source-fix/mac-arm64/ScreenMovie.app`.
- Onaylı kapsam: [özellik envanteri ve faz planı](SCREEN-STUDIO-OZELLIK-PLANI.md). 104 satırlık envanter esas takip listesidir; tamamlanmamış maddeler tamamlandı olarak işaretlenmemeli.
- Önceki uygulama kayıtları: [Faz 0 günlüğü](PHASE-0-IMPLEMENTATION.md). Günlükteki uygulandı ifadeleri, aşağıdaki native hata için başarı kanıtı sayılmaz.
- API anahtarı mevcut güvenli ayar alanında kalacak. Bu belgeye, kaynak koda, loglara veya proje dosyalarına yazılmayacak. Kullanıcıdan her AI işleminde tekrar anahtar kaydetmesi istenmeyecek.
- Çok sayıda değiştirilmiş ve henüz Git'e eklenmemiş dosya var. `git reset`, `git clean` veya toplu geri alma yapılmamalı. Bu devirde commit oluşturulmadı.

## 2. Kaynak kod / uygulama paketi farkı

| Alan | Durum |
| --- | --- |
| Kaynak kod | Pixel buffer adaptor, açık H.264 ayarları, ses boşluklarını sessizlikle doldurma, kayıt başlangıcında saat kökünün atomik ayarlanması ve pencere kaydında 3 ardışık doğrulama içeriyor. Helper'ın terminalden gerçek kaydı geçti (§5.1); uygulama içi kabul testi bekliyor. |
| `electron/native/bin/darwin-arm64/` | 19 Ekim'de `npm run build:native-helpers` ile güncel kaynaktan yeniden derlendi. |
| Sabit konumdaki uygulama | **19 Ekim 10:15'te güncel kaynaktan yeniden paketlendi** (`electron-builder --mac --arm64 --dir`, ad-hoc imza, `app.screenmovie.desktop`, codesign doğrulandı; içindeki helper ses boşluğu düzeltmesini içeriyor). Log: `artifacts/package-2026-10-19.log`. Kullanıcının uygulama içi kabul testi (mikrofon + sistem sesi, pause, cursor senkronu) bekleniyor. |
| Son paket | **20 Ekim akşam**: Apple Development imzalı (aynı tanıma kuralı, izinler korunur), **297 MB** (önceki 576 MB). Aşağıdaki iki "Sonraki pakete girecek"/"20 Ekim paketine girenler" satırındaki her şeyi ve Dock düzeltmesini içeriyor. `codesign --verify --deep --strict` geçti. Log: `artifacts/package-2026-10-20-slim.log`. Kullanıcının isteğiyle eski kopyalar kaldırıldı: `release-source-fix/backup/` (iki zip yedeği) Çöp Sepeti'ne taşındı; diskte yalnızca `release-source-fix/mac-arm64/ScreenMovie.app` var. |
| 20 Ekim akşam paketine girenler | (1) **Paket boyutu 576 → ~306 MB** (kayıpsız): yalnızca `ffmpeg-static` ve `uiohook-napi` çalışma bağımlılığı, diğer 40 paket Vite tarafından derlendiği için `devDependencies`'e taşındı (app.asar 244 → 5,8 MB); `dist/wallpapers` kopyası ve kullanılmayan önizleme görselleri pakete girmiyor (duvar kâğıtları `assets/wallpapers` olarak bir kez); `electronLanguages` en/tr/es/zh_CN. İmzasız deneme paketinde açılış, ffmpeg + konuşma helper'ı ve araç bulma doğrulandı. (2) **Kaydın sesi**: Ses sekmesinde sesi kapat/aç ve düzey (0–100 %); önizleme ve dışa aktarma aynı (kapalıyken ses izi yok, %50'de −6 dB); geri alınabilir; projede `sourceAudioVolume`. (3) **Yazılar kutusuna sığar**: önizleme ve dışa aktarma ortak `src/lib/text/textLayout.ts` ile aynı satır kaydırma ve küçültme; 16:9, 1:1, 9:16'da eşit (caption-parity-test, `CAPTION_ASPECT`). (4) **Premiere tarzı kesme**: zaman çizelgesi kesilmiş hâli gösterir (kesilen kısım kalkar, sonrası kayar); C / Kes = videoyu imleçte böl; parçayı seç + Delete = kes; kesim işaretine tıkla + Delete = geri getir; KESME satırı kaldırıldı; veri kaynak zamanında (`trimRegions` + yeni `clipSplits`), dışa aktarma değişmedi; oynatma çubuğu da kesilmiş süreyi gösterir. Testler: yeni `clip-cut-test` 12, `source-audio-test` 6; smoke 41 ve timeline-tools 12 yeni kesme akışına göre güncellendi; 188 birim testi. |
| 20 Ekim paketine girenler | (1) açılış ekranında izin kurulumu kartı ve tıklama takibi kapalıyken kayıt öncesi soru; (2) **C tuşu** = kes: seçili öğe varsa imleçte böler, yoksa videoya kesme ekler (eski kayıtlı T varsayılanı C'ye taşınır); (3) kısayol penceresi iki sütun ve kaydırmalı, etiketler Türkçe; (4) zoom hareket bulanıklığı varsayılan kapalı, isteğe bağlı anahtar + güç; (5) önizleme netliği: Pixi filtreleri ekran çözünürlüğünde (`resolution: 'inherit'`) ve yalnız etkiliyken açık (önceden Retina'da yarım çözünürlük); (6) yapay zeka paneli: token kullanımı (görev ve sohbet toplamı) ve "Geniş görünüm" penceresi; kare paylaşımının token kullanımını artırdığı uyarısı; (7) altyazı önizleme/dışa aktarma eşitliği: dışa aktarma artık önizlemedeki tek kutu modelini ve CSS taban çizgisini kullanıyor ("İ" noktası kırpılmıyor), yeni altyazı kutusu %20 yükseklikte; (8) dışa aktarma pencere açmadan kayıt klasörüne `<proje adı> YYYY-AA-GG SS.dd.mp4` olarak kaydediliyor (üzerine yazmaz). Testler: `click-permission-test`, `caption-parity-test` (yeni), `timeline-tools-test` 12, `agent-test` 16; smoke/text-effects/caption-parity dışa aktarılan dosyayı kayıt klasöründe arıyor. Eski `editor-workflow-test`, `full-feature-test`, `resolution-matrix` betikleri hâlâ dışa aktarma kayıt penceresini bekliyor, güncellenmeli. |
| Tıklama zoom'u (Faz A) | 19 Ekim akşamı kaynakta: HUD izin uyarısı, kayıt sonrası bildirim (Kaldır/Ayarla), Hareket sekmesinde otomatik zoom ayarları, zoom'suz projede öneri. Son pakette var. Ayrıntı: `docs/YAPAY-ZEKA-AJAN-PLANI.md`. |
| Otomatik altyazı (Faz B) | 19 Ekim akşamı kaynakta: AI sekmesinde "Konuşmadan altyazı oluştur" (macOS `DictationTranscriber`, cihaz üzerinde, Türkçe/İngilizce). Whisper kullanılmıyor; seslendirme Modelion'da kalıyor. Son pakette var. Ayrıntı: `docs/YAPAY-ZEKA-AJAN-PLANI.md`. |
| Yapay zeka ajanı (Faz C–E) | 19 Ekim akşamı kaynakta: AI sekmesinde kullanıcının kendi Claude Code / Codex / Cursor / OpenCode aracıyla düzenleme. Ajan yalnızca öneri yapar; uygulama tek ⌘Z. Codex ile uçtan uca doğrulandı; Claude ve Cursor'da giriş yapılmadığı için gerçek görev testi bekliyor. Son pakette var. Ayrıntı: `docs/YAPAY-ZEKA-AJAN-PLANI.md`. |
| Önceki uygulama yedeği | Yok. 20 Ekim'de kullanıcının isteğiyle eski zip yedekleri Çöp Sepeti'ne taşındı (Çöp boşaltılana kadar oradan geri alınabilir). |
| Geçici paket | Önceki oturum `/private/tmp/screenmovie-pause-package` altında paket üretmişti. 19 Ekim kontrolünde bu yol artık bulunamadı; varlığına güvenilmemeli. |
| Dağıtım imzası | **19 Ekim'den itibaren yerel paketler kullanıcının "Apple Development: Kaan Can BAYRAKTAR (ZW5WY3B7SJ)" sertifikasıyla imzalanıyor** (hash `21FDD181B049213ACB48781BF48F8F838EE21D54`, takım `NSLBXJ98PU`, Nisan 2027'ye kadar geçerli). Ad-hoc imzada macOS'in tanıma kuralı her derlemede değişen cdhash olduğu için ekran kaydı izni her yeni derlemede yeniden isteniyordu; artık kural `identifier "app.screenmovie.desktop" and ... certificate leaf[subject.CN] = "Apple Development: ..."` ve derlemeler arasında sabit. Komut: `npx electron-builder --mac --arm64 --dir --config.mac.identity=21FDD181B049213ACB48781BF48F8F838EE21D54 --config.directories.output=<geçici klasör>` (zaman damgalı imzalama yaklaşık 10 dk sürer). Developer ID / notarization (başka bilgisayarlara dağıtım) hâlâ yok. |

Kaynak kodun, `dist` çıktısının ve kurulu uygulamanın aynı revizyonda olduğu varsayılmamalı. Yeni paket ancak native kayıt kabul testi geçtikten sonra sabit konuma alınmalı. Eski kopya gerekiyorsa geri alınabilir biçimde kaldırılmalı; kullanıcı projeleri, kaynak videoları ve ayarları silinmemeli. İmza değişikliği macOS ekran kaydı iznini etkileyebilir; sabit kimlik ve yayın imzası kalıcı çözüm olarak ele alınmalı.

## 3. Korunmuş kullanıcı çalışması

`projects/Acik-Duzenleme-2026-10-18-1600.screenmovie`

Önceki oturumdaki açık düzenleme bu dosyaya kaydedildi: yaklaşık 7,11 saniyelik video, `backgroundBlur: 3.25`. Dosyanın varlığı devir sırasında kontrol edildi. Kullanıcı çalışması yerine test projesi kaydedilmemeli; kaynak medyası taşınmamalı.

## 4. Mevcut ve doğrulanmış çalışmalar

### Editör ve UI

- Grafit/lila çalışma alanı, gruplu araç çubuğu ve sağ tarafta sekmeli inspector.
- Ana video için belirgin filmstrip/kaynak kanalı, ayrı düzenleme kanalları, timeline boş durumları ve daha okunur zaman etiketleri.
- Undo/redo, mevcut düzenleme kısayolları, stil presetleri, sahne oranları ve sosyal çıktı boyutları.
- Çıktı başlamadan MP4/GIF, çözünürlük ve FPS seçilen export penceresi.
- AI ayarları ile konuya göre yazı oluşturma ve TTS alanlarının ayrılması. Konu yazıları gerçek konuşma transkripti değildir.
- Kaynak seçicide arka plan yenilemesi artık listeyi tamamen loading ekranıyla değiştirmiyor; odak değişiminde ilk tıklamanın kaybolmasına yol açan davranış düzeltildi.
- Dar inspector'da slider etiketi/değeri taşması ve appearance kontrol yerleşimi iyileştirildi.
- Kayıt başlatılırken/finalize edilirken kaynak kontrolleri kilitleniyor; hazırlanıyor durumu görünür.

### Veri koruma ve kurtarma

- Otomatik taslak: yaklaşık 2,5 saniye debounce, 10 saniye checkpoint ve pencere odağı kaybında kayıt.
- Save öncesi yedek, geçici dosya + fsync + rename ile atomik yazma; playhead geri yükleme ve kurtarma arayüzü.
- Browser kayıt parçaları diske journal ile yazılıyor. Renderer kuyruğu sınırlı; disk rezerv kontrolü bulunuyor.
- Browser kayıt süreci zorla kapatılıp gerçek medya ile kurtarma sınandı.
- Native fragment/journal altyapısı mevcut. Pause değişikliklerinden önce video-only kesinti testinde yaklaşık 0,947 saniye kayıp ölçülmüştü; bu sonuç güncel native kodun başarılı olduğu anlamına gelmez.
- Native finalize/mux hatasında ham dosyaların ve kurtarma journal'ının korunması hedefleniyor. Başarı yalnızca açık tamamlanma işaretiyle kabul ediliyor; eski exit-code-0 yanlış başarı yolu kaldırıldı.

### Duraklatma ve zamanlama

- `RecordingClock`: monotonic ortak saat, duraklamaları aktif süreden çıkarma.
- Browser MediaRecorder pause/resume, HUD sayaç durması ve HUD odaktayken Space çalışıyor.
- Native helper komut/ACK protokolü eklendi; fakat video writer hatası nedeniyle native uçtan uca başarı sağlanmadı.
- WGC/native destek bulunmayan yollarda pause kullanılabilir gibi gösterilmiyor.
- Kompakt HUD yaklaşık 220×60; pause/devam ve stop kontrolleri var. Space mevcut durumda global kayıt kısayolu değildir.

## 5. P0 — Önce çözülmesi gereken native video hatası

### Son gerçek cihaz testi

Kanıt: `artifacts/native-pause-report.json` (`passed: false`).

| Ölçüm | Sonuç |
| --- | --- |
| Duraklat/devam sayısı | 10 |
| Aktif süre / HUD | 29,43 saniye / 00:29 |
| Son video zamanı | 5,110 saniye |
| Son sistem sesi zamanı | 29,386 saniye |
| Video frame sayısı | 213 |
| Video writer | Failed, durum 3 |
| Sistem sesi writer | Completed, durum 2 |
| Hata | AVFoundation -11800; altta NSOSStatus -16341 |

Video ilk pause işleminden önce duruyor. Bu nedenle yalnızca pause saatinin düzeltilmesi çözüm olarak kabul edilmemeli. Sistem sesini ayrı M4A writer'a ayırmak da tek başına sorunu çözmedi.

### Denenen ve henüz doğrulanmayan değişiklikler

- Video/ses için ortak host clock origin ve duraklama süresi.
- PCM retime sırasında örnek başına süreleri koruma. Bu bölümün doğrudan Swift regresyon testi başarılı.
- Sistem sesi ve mikrofonu ayrı dosyalarda kaydedip sonradan FFmpeg ile birleştirme.
- Güncel kaynakta video için `AVAssetWriterInputPixelBufferAdaptor`, yinelenen/geriye giden PTS filtreleme ve açık H.264 bitrate/profile/keyframe ayarları.
- Son adaptor/H.264 sürümü fiziksel paket testiyle doğrulanmadı.
- Bağımsız writer fixture hem 3600×2338 hem 1920×1080 / 30 FPS için `AVFoundation -11834 Cannot Encode` verdi. CLI/sandbox/encoder erişimi veya ayarlar incelenmeli; yalnızca çözünürlük sınırı olduğu sonucuna varılmamalı.

### 5.1 — 19 Ekim yeniden test ve düzeltmeler

Kanıt: `artifacts/native-acceptance-2026-10-19.json`. Helper, güncel kaynaktan derlenip uygulamanın verdiği yapılandırmayla terminalden çalıştırıldı. Ekran içeren test videoları gizlilik için silindi; capture JSON özetleri kanıt dosyasında.

| Senaryo | Sonuç |
| --- | --- |
| Writer fixture 1920×1080/30 ve 3600×2338/60 | Geçti. Önceki `-11834 Cannot Encode` hatası test ortamından (sandbox'ta donanım kodlayıcıya erişim yok) kaynaklanıyordu, H.264 ayarlarından değil. |
| Ekran 20 sn ve 40 sn, sistem sesi, pause yok | Geçti. 40 sn'de video ve ses 39,59 sn, 2104 kare. |
| Ekran, 10 pause/resume | Writer geçti, ama ses dosyası 22,34 sn / video 22,67 sn çıktı: pause sınırlarında atılan ses parçalarının boşlukları AAC/M4A'da sıkışıyor, ses her pause'dan sonra videonun önüne kayıyordu (10 döngüde yaklaşık 0,3 sn). **Düzeltildi** (aşağıda). Tekrarında boşluk sessizlikle dolduruldu (0,345 sn), ses ve video aynı zaman çizgisinde. |
| Pencere kaydı, 3400×2100 tam gürültü, 3 pause, 36 sn | Geçti (kare sayacı 161→801 ile hareket doğrulandı, yaklaşık 65 Mbps). İlk denemede kayıt 8,5 sn'de `WINDOW_UNAVAILABLE` ile kesildi: pencere listesindeki tek bir geçici eksiklik kaydı bitiriyordu. **Düzeltildi.** |

Kaynakta yapılan değişiklikler (`ScreenCaptureKitRecorder.swift`):

- `makeSilentAudioBuffer` / `silentFramesBefore`: her ses girişi için beklenen sonraki zaman izleniyor; aradaki boşluk (pause sınırı, writer meşgulken düşen parça, kaydın başı) aynı formatta sessizlikle dolduruluyor. Swift testi `scripts/test-native-audio-timing.py` içinde (interleaved + planar).
- Kayıt başlangıcında saat kökü, örnekler kabul edilmeden önce örnek kuyruğunda tek seferde ayarlanıyor (ayarsız kökle zamanlanmış bir ses parçasının sonraki tüm sesi düşürme yarışı kapatıldı).
- Pencere doğrulaması: kayıt yalnızca pencere art arda 3 kontrolde (yaklaşık 1,5 sn) bulunamazsa bitiyor; küçültülmüş/başka Space'teki pencereler kayda devam ediyor (son kare tutuluyor).
- Teşhis JSON'una `audioEndSeconds` ve `silentAudioSeconds` eklendi.
- Writer "completed" dese bile hiç video karesi yazılmamışsa kayıt artık hata olarak bildiriliyor (oynatılamayan dosya başarı gibi gösterilmiyor). Bölge kaydı denemelerinden birinde bir kez 0 kare / boş dosya görüldü, iki tekrarda oluşmadı; nedeni bilinmiyor, uygulama içi testlerde izlenmeli.

Orijinal hata (video 5,11 sn'de durdu, -16341) hangi koşulda oluştuğu bilinmeden kapanmış sayılmamalı: rapordaki kayıt eski paketle alınmıştı. Uygulama içi gerçek kullanımda tekrar ederse kanıtları koru ve capture JSON'daki `writerError` ile kare sayısını karşılaştır.

### Sonraki oturumun çözüm sırası

1. ~~Son raporu, capture JSON'u ve mevcut Swift writer kurulumunu oku.~~ Yapıldı (19 Ekim).
2. ~~En küçük çalışan AVAssetWriter H.264 baseline.~~ Fixture üretim ayarlarıyla geçiyor.
3. Gerçek kareler ile heartbeat karelerinin PTS/fragment davranışı: terminal testlerinde sorun görülmedi; uygulama içi testte capture JSON ile tekrar kontrol et.
4. ~~Pause olmadan 30 saniyeyi aşan sistem sesli kayıt.~~ Geçti (40 sn).
5. 10 pause/resume, statik ve hareketli ekran: geçti. **Kalan:** pause durumunda stop, mikrofon + sistem sesi (mikrofon izni `not-determined`; kullanıcı onayı gerekir).
6. **Kalan:** HUD, video, ses ve click/cursor olaylarını uygulama içinden alınan kayıtta aynı çıktı zamanında karşılaştır. Hedef en fazla bir çıktı karesi.
7. **Kalan:** Writer hata verirse kullanıcıya başarı gösterilmediğini ve ham kayıt/kurtarma verisinin korunduğunu sına.
8. Faz 0'ı bu adımlar geçmeden tamamlandı işaretleme. (Kullanıcı 19 Ekim'de kendi kabul testini yapmak üzere paketin sabit konuma konmasını istedi; paket teslim edildi ama kabul edilmiş değil.)

### Korunacak hata kanıtları

- `artifacts/native-pause-report.json`
- `artifacts/native-pause-initial-failure.json`
- `artifacts/native-video-writer-test.log`
- `artifacts/native-video-writer-1080-test.log`
- `<demo-recording>.mp4`
- Aynı dosyanın `.system.m4a` ve `.capture.json` yan dosyaları.
- Gerçek uygulama recovery dizinindeki ilgili journal. Rapor oturum kimliği: `c6699226-a1d2-452e-9c1c-d266b9d3a3b1`.

Başarısız kaydı temizleme amacıyla ham dosyaları silme.

## 6. Kalan geliştirme işleri ve teslim sırası

Aşağıdaki liste ana planın özetidir. Detay, özellik ID'leri ve kabul koşulları için onaylı envanteri kullan.

### Faz 0 — Güvenilir temel (devam ediyor)

- [ ] Yukarıdaki native video writer engelini çöz ve gerçek A/V/cursor senkronunu doğrula.
- [ ] Kamera dahil bütün kaynaklarda ortak zaman modeli ve oturum durum makinesi.
- [ ] Cursor/click telemetry için kayıt sırasında checkpoint ve kesinti sonrası geri yükleme.
- [ ] Windows WGC ve Linux kayıt/kurtarma yollarını fiziksel cihazlarda doğrula.
- [ ] Uyku/uyanma, cihaz kopması, düşük disk, disk yazma hatası ve kayıt/export sırasında çıkışı ele al.
- [ ] Varlık kimliği, göreli yollar ve kaynak/çıktı zaman eşlemesi içeren proje v2; v1'i değiştirmeden migration.
- [ ] Eksik dosyayı yeniden bağlama ve çalışma alanı durumunun tam geri yüklenmesi.
- [ ] Sabit sürüm/uygulama kimliği, tek oturum ve resmi imza/notarization/güncelleme akışı.
- [ ] Kurtarma kaybı en fazla 2 saniye hedefini güncel kodla gerçek kesintide tekrar ölç.

### Faz 1 — Kayıt ergonomisi

- [ ] Alan seçimini X/Y/W/H piksel girişi, oran kilidi, monitör ve native crop ile tamamla. **19 Ekim'de kısmen yapıldı:** Cmd+Shift+5 benzeri tam ekran şeffaf seçim penceresi (`RegionSelectorOverlay.tsx`, `regionGeometry.ts`): sürükleyerek çizme, taşıma, 8 tutamaç, oran kilidi (Serbest/16:9/9:16/1:1/4:3), piksel ölçüsü, Tüm ekran, Esc/Enter/ok tuşları, önceki alanı hatırlama. HUD'da "Alan" düğmesi (imlecin olduğu ekranda açılır) ve kaynak seçicide "Ekranda alan seç". macOS native kayıtta kırpma ScreenCaptureKit `sourceRect` ile yapılıyor (yeniden kodlama yok; tam ekran kare yazılmıyor); browser yolu FFmpeg kırpmayı koruyor. Test: `npx electron scripts/region-selector-test.cjs` (8 kontrol), `scripts/region-workflow-test.cjs`, Swift `native-capture-region-test.swift`; terminalden native bölge kaydı 1800×1170 doğrulandı. **Kalan:** X/Y/W/H sayısal giriş, global kısayol, çok monitörde ekranlar arası seçim, uygulama içi uçtan uca alan kaydı testi.
- [ ] Global kayıt kısayolları, yeniden çek, iptal ve durum geri bildirimi.
- [ ] Konuşmacı notları/prompter; kayıt görüntüsüne girmeyen kontrol yüzeyleri.
- [ ] Kaynak odağı, pencere boyut presetleri; masaüstü/Dock değişikliklerini geri alma.
- [ ] Aranabilir komut paleti ve izin ekranında çalışan sürüm/konum bilgisi.

### 19 Ekim — editör: zoom zamanlaması, yazı ve timeline

- **Zoom zamanlaması:** zoom artık timeline'da konduğu yerde başlar ve bölge bitince biter (`zoomRegionUtils.computeRegionStrength`): giriş bölge başından itibaren en fazla 1 sn, çıkış bölge sonunda biten en fazla 1 sn; kısa bölgelerde ikisi de bölge süresine sığar. Bağlı zoom'larda arada zoom-out yapılmaz. Araç çubuğu ve timeline yeni zoom'u oynatma imlecinde başlatır (yer azsa kısaltır, öne kaydırmaz), varsayılan 2 sn. Otomatik zoom bölgeleri buna göre yeniden ayarlandı (tıklamadan 0,9 sn önce başlar, son tıklamadan 2,4 sn sonra biter).
- **Yazı:** gölge (yok/hafif/güçlü), kontur, `**kalın**` / `==vurgu==` satır içi biçim ve vurgu rengi, giriş (belirme/yukarı kayma/büyüyerek/daktilo) ve çıkış (belirme/aşağı kayma/küçülerek) animasyonları, 5 hazır stil (Başlık, Alt yazı, Etiket, Vurgu, Daktilo). Önizlemede: görünür yazıya tıklayınca seçilir (zoom seçiliyken hariç), çift tıklayınca yerinde yazılır (⌘↩ kaydet, Esc iptal), 8 tutamaç, merkez hizalama çizgileri ve bırakınca merkeze yapışma. Önizleme ve dışa aktarma aynı `annotationEffects.ts` mantığını kullanır; `scripts/text-effects-test.cjs` önizleme karesi ile export karesini yan yana üretir (birebir eşleşme görsel olarak doğrulandı).
- **Timeline:** sürükleme/boyutlandırmada oynatma imlecine, video uçlarına ve diğer öğelerin kenarlarına 8 px yapışma ve pembe yapışma çizgisi (⌥ basılıyken kapalı); sağ tık menüsü (Kopyala, İmlece yapıştır, Çoğalt, İmleçte böl, Sil); kısayollar ⌘C/⌘V, ⌘⇧D, ⌘B, ⌥←/→ (⇧ ile 1 sn); yakınlaştırma kaydırıcısı (logaritmik, imleç merkezli) ve varsayılan açık "Takip et" (oynarken imleç görünür alandan çıkınca görünüm kayar). Test: `scripts/timeline-tools-test.cjs` (10 kontrol).
- **Bilinen test kısıtı:** `region-selector-test.cjs` gerçek ekranı kapladığı için test sırasında fare hareket ettirilirse ilk sürükleme bozulur; fare hareketsizken 8/8 geçer.
- **Kalan:** çoklu seçim (kullanıcı bu tur seçmedi), yazıda satır/harf aralığı ve döndürme, görsel/ok öğelerine animasyon, timeline'da sürükleme sırasında canlı yapışma (şu an yapışma bırakınca uygulanır, çizgi önceden gösterilir).

### Faz 2 — Hareket, gizlilik ve timeline

- [ ] Classic/Instant/Loupe zoom, toplu uygulama ve auto zoom yoğunluğu.
- [ ] Gelişmiş cursor stilleri, idle hide, bölüm bazlı görünürlük, tür geçişi ve click efektleri.
- [ ] Kısayol/keycap kanalı; normal yazı veya şifre içeriğini kaydetmeden typing önerileri.
- [ ] Blur/pixelate/solid maske, highlight/spotlight; crop/zoom/oran değişiminde doğru koordinat dönüşümü.
- [ ] Timeline context menu, toplu seçim, snapping, kopyala/yapıştır ve anlaşılır kaydırma.
- [ ] Sosyal safe zone profilleri ve preview/export eşitliği.

### Faz 3 — Ses stüdyosu

- [ ] Mikrofon/sistem/müzik/TTS için bağımsız kaynaklar, waveform, trim offset, mute/solo, gain ve fade.
- [ ] Yerel noise reduction, normalizasyon, ham/işlenmiş karşılaştırma.
- [ ] Müzik döngüsü, konuşmada ducking, kullanım hakkı net varlık kütüphanesi ve click sesi.
- [ ] Mikrofonla sonradan anlatım kaydı.
- [ ] Modelion Ema Lightning TTS: zaman eşlemesi, yeniden üretim, iptal, limit/hata gösterimi, önceki ses sürümü.
- [ ] Mevcut TTS entegrasyonunu koru; belgelenmeyen transkripsiyon API'si varsayma.

### Faz 4 — Kamera ve sahneler

- [ ] Kamerayı ayrı kaynak kaydetme, cihaz/çözünürlük/FPS seçimi.
- [ ] Overlay, yalnız ekran, tam ekran kamera ve split screen; ayrı sahne kanalı.
- [ ] Boyut/konum/ayna/crop ve oran değişiminde yeniden yerleşim.
- [ ] Yerel yüz takibi, konuşma aktivitesi, deneysel arka plan kaldırma ve stil ayarları.
- [ ] 30 dakikalık ekran+kamera+mikrofon testi ve cihaz kopması senaryosu.

### Faz 5 — Gerçek altyazı ve transkriptle kurgu

- [ ] Kelime zaman damgalı transcript modeli; local model indirme/silme ve desteklenen platformlar.
- [ ] İsteğe bağlı, belgelenmiş bulut sağlayıcı; gönderilecek sesi açık gösterme.
- [ ] Elle düzeltilebilir altyazı, kelime vurgusu, animasyon ve SRT/VTT.
- [ ] Kesim/hız sonrası kaynak zamanını çıktı zamanına eşleme.
- [ ] Transkript düzeltme ile videodan konuşma silmeyi ayırma; sessizlik/dolgu kelime önerileri ve tek undo.
- [ ] Türkçe/İngilizce doğruluk ve zamanlama ölçümü. Mevcut AI konu yazısı bu özelliğin yerine geçmez.

### Faz 6 — Görsel kalite, mobil kaynaklar ve çıktı

- [ ] Gelişmiş gölge/inset/border/gradyan ve taşınabilir stil dosyası.
- [ ] Yerel upscale/debanding araştırması; hız/bellek/kalite karşılaştırması.
- [ ] macOS USB iPhone/iPad kaydı ve uyumlu cihaz çerçeveleri; fiziksel test.
- [ ] Ek FPS/export presetleri, dosya boyutu tahmini, panoya sonuç, PNG kare ve ham medya çıkarma.
- [ ] Preview kalite/performance seçimi, Finder/Quick Look ve platform eşdeğerleri.
- [ ] 720p/1080p/1440p/4K × yatay/dikey/kare × MP4/GIF matrisi, iptal ve encoder fallback.

### Faz 7 — Taşınabilir proje ve paylaşım

- [ ] Medya/font/görsel/telemetry/transcript içeren yerel proje paketi; başka bilgisayarda yol bağımsız açma.
- [ ] İsteğe bağlı video/proje linki, streaming, thumbnail ve bağlantı yönetimi.
- [ ] Özel erişim, link iptali/süresi, zamanlı yorum ve isteğe bağlı ölçüm.
- [ ] Upload devam/iptal, kota/saklama/silme ve backend maliyet modeli.
- [ ] Hesap/lisans/takım ürün kararı. Yerel editöre gereksiz hesap zorunluluğu ekleme.

### Faz 8 — Gelecek kapsamı

- [ ] Çoklu video klibi/media bin, bağımsız metin slaytları, giriş/çıkış animasyonları.
- [ ] Ekran görüntülerinden video, genişletilmiş anotasyonlar.
- [ ] Raycast/URL otomasyonu ve takım yönetimi.

## 7. UI/UX için ayrıca takip edilecekler

- [ ] Kaynak yenilenirken kapanmış seçili pencerenin seçimini temizle ve kaydetmeden önce doğrula.
- [ ] Küçük pencere, yüksek DPI, uzun Türkçe etiketler ve klavye focus sırası regresyonları.
- [ ] Timeline'da ana video/efekt/ses ayrımını yeni kamera/maske/altyazı kanalları eklenirken koru.
- [ ] Sağ paneli yeni özelliklerle yeniden yoğunlaştırma; seçili öğe bağlamı ve sekmeler üzerinden ilerle.
- [ ] Hata/kurtarma/iptal durumlarında kullanıcının ne yapabileceğini açık göster; sessiz başarısızlık veya yanlış başarı yok.
- [ ] UI ayarı preview ve gerçek export'ta aynı sonucu vermeli; boş annotation placeholder'ı videoya basılmamalı.
- [ ] Kayıt alanı/HUD/prompter'ın kaynak videoya girmediğini gerçek kayıtta kontrol et.

## 8. Son doğrulama sonuçları

**19 Ekim, ikinci oturum** (önceki raporlar `artifacts/before-2026-10-19/` altına yedeklendi): `npm run typecheck`, `npm test` (21 dosya, 113 test), `npm run i18n:check`, `npm run build:native-helpers`, `python3 scripts/test-native-audio-timing.py`, `git diff --check`, `npx tsc`, `npx vite build` başarılı. Harness'ler: pause workflow 24, kaynak yenileme 3, smoke 40, workspace görsel 6 kontrol başarılı. Writer fixture 1080p30 ve 3600×2338/60 geçti. Native gerçek kayıt sonuçları §5.1'de. Smoke'taki slider-sürükleme undo kontrolü, IPC gecikmesinin 400 ms birleştirme penceresini aşmasıyla zaman zaman başarısız oluyordu; adımlar artık sayfa içinden gönderiliyor.

**19 Ekim, editör turu sonrası:** typecheck, 26 dosyada 146 birim testi, i18n, `git diff --check`, Swift testleri başarılı. Harness'ler: smoke 40, alan akışı 5, duraklatma 24, görsel 6, kaynak yenileme 3, yazı efektleri 4, timeline araçları 10 kontrol başarılı; alan seçimi 8/8 (fare hareketsizken).

Aşağıdaki tablo önceki oturumun sonuçlarıdır.

| Kontrol | Son kayıtlı sonuç | Kanıt |
| --- | --- | --- |
| TypeScript | Başarılı | `artifacts/pause-typecheck.log` varsa; terminal çıktısı da kontrol edilmeli |
| Birim testleri | 21 dosya, 113 test başarılı | `artifacts/pause-unit.log` |
| Dil anahtarları | Başarılı | `artifacts/pause-i18n.log` |
| Native helper derleme | Başarılı; çalışma başarısı değildir | `artifacts/pause-native-build.log` |
| Browser pause workflow | 24 kontrol başarılı; 10 döngü | `artifacts/pause-workflow-report.json` |
| Browser aktif/çıktı süresi | 3,985181 / 3,985333 saniye | Aynı rapor; duvar süresi 6,941 saniye |
| Masaüstü smoke | 40 kontrol başarılı | `artifacts/pause-smoke.log`, `artifacts/smoke-report.json` |
| Workspace görsel | 6 kontrol başarılı | `artifacts/workspace-visual-report.json` |
| Kaynak arka plan yenileme | 3 kontrol başarılı | `artifacts/source-refresh-test.log` |
| Swift PCM timing | Başarılı | `artifacts/native-audio-timing-test.log` |
| Gerçek native pause/video | **Başarısız** | `artifacts/native-pause-report.json` |
| Bağımsız native video writer | **Başarısız**, 1080p dahil | `artifacts/native-video-writer-*.log` |

Browser testinin görüntü/ses kaynağı canvas + WebAudio fixture'dır. Gerçek MediaRecorder ve UI akışı çalışır, fakat bu test native ScreenCaptureKit kaydını veya fiziksel mikrofonu doğrulamaz. Windows/Linux fiziksel testleri ve uzun süreli cihaz matrisi tamamlanmadı.

## 9. Kod haritası

| Dosya/alan | Amaç |
| --- | --- |
| `electron/native/ScreenCaptureKitRecorder.swift` | Native writer, ortak saat, retime, heartbeat, pause ACK, ayrı ses writer'ları ve diagnostics |
| `electron/ipc/handlers.ts` | Kayıt başlat/bitir, pause protokolü, cursor zamanı, native finalize/mux ve hata koruma |
| `electron/recordingClock.ts` | Monotonic aktif kayıt saati |
| `electron/nativeAudioMux.ts` | Video + ayrı sesleri FFmpeg ile birleştirme; hata halinde orijinali koruma |
| `electron/recordingRecovery.ts` | Journal, parçalar ve ses kanallarıyla kurtarma |
| `electron/projectRecovery.ts`, `src/hooks/useProjectDraft.ts` | Proje taslağı/yedek/kurtarma |
| `src/hooks/useScreenRecorder.ts` | Renderer kayıt durumu, pause/resume ve finalizing |
| `src/components/launch/LaunchWindow.tsx` | Kayıt hazırlığı ve kompakt HUD |
| `src/components/launch/SourceSelector.tsx` | Kaynak listesi, izin/yenileme ve seçim |
| `src/components/video-editor/editor-workspace.css` | Yeni editör yerleşimi |
| `src/components/video-editor/timeline/` | Kaynak video, düzenleme kanalları ve zaman çizelgesi |
| `src/components/video-editor/ExportSetupDialog.tsx` | Export öncesi çıktı ayarları |
| `electron/modelion.ts`, `ModelionSettings.tsx`, `VoiceoverPanel.tsx` | AI güvenli ayarları ve seslendirme |

## 10. Devam komutları ve çalışma disiplini

Önce bu belgeyi ve onaylı planı oku; varsa geçerli `AGENTS.md` talimatlarını kontrol et. Ardından mevcut değişiklikleri incele. Aşağıdaki kontroller kaynak kodu doğrular; native fiziksel testin yerine geçmez.

```sh
cd <project-root>
git status --short
npm run typecheck
npm test
npm run i18n:check
npm run build:native-helpers
python3 scripts/test-native-audio-timing.py
git diff --check
```

Açık writer hatasını yeniden üretmek için (şu an başarısız olması beklenir):

```sh
python3 scripts/test-native-video-writer.py
python3 scripts/test-native-video-writer.py 1920 1080 30
```

Masaüstü harness'leri derlenmiş `dist`/`dist-electron` kullanır; önce kaynakla uyumlu çıktı üret. Vite çıktısının üretilmesi native kaydın geçtiği anlamına gelmez.

```sh
npx tsc
npx vite build
npx electron scripts/pause-workflow-test.cjs
npx electron scripts/source-refresh-test.cjs
npx electron scripts/smoke-test.cjs
npx electron scripts/workspace-visual-test.cjs
```

Harness'lerin izole profil kullandığını ve fixture/demo dosyalarının mevcut olduğunu kontrol et. Gerçek kullanıcının `userData`, API ayarları, recovery kayıtları veya projeleri test temizliği kapsamında silinmemeli. Mevcut log/raporları yeni denemeler öncesinde gerekiyorsa farklı adla koru.

**İlk sonraki teslim:** native video hatası giderilmiş, 30 saniyeyi aşan sesli kayıt ve 10 pause döngüsüyle doğrulanmış tek uygulama paketi; ardından Faz 0'ın kalan veri koruma/proje v2 işleri. Yeni özelliklere geçmeden önce bu engel kapatılmalı.
