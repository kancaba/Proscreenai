# Editör akışı

- Ana video: gerçek kaynaktan film şeridi, dosya adı, süre ve kesilen bölgeler. Kaynak video korunur; kesme şeridi görünür bölümleri belirler.
- Timeline: sabit şerit adları, +/− yakınlaştırma ve Sığdır; büyütülebilen alt alan. Bağımsız şeritler birbirlerinin sürükleme sınırını oluşturmaz. Ses kanalları üst üste karıştırılabilir.
- Sağ panel: Görünüm, Hareket, Öğe, Ses, AI. Seçilen öğeye uygun sekme açılır.
- Dışa aktar: ayar penceresini açar. MP4/GIF, çözünürlük, FPS ve sıkıştırma seçildikten sonra ayrı başlat düğmesi çalışır.
- AI anahtarı: AI sekmesindeki bağlantı ayarları; işletim sisteminin safeStorage şifrelemesi, güvenli depolama yoksa yalnız oturum. Video yazıları penceresinde anahtar formu yok.
- Seslendirme: Modelion /v1/audio/speech, model tts/ema-lightning, MP3. AI taslağından veya elle girilen metinden üretim, dinleme, oynatma konumuna ses kanalı ekleme. Modelion web sitesi API uygulamasındaki model kimliği ve istek şeması esas alındı. Servis yanıtı ses türü ve boyut açısından doğrulanır; istek iptal edilebilir.

Kısayollar: Space oynat/duraklat; Z zoom; T kes; S hız; A yazı; mod+Z/shift+mod+Z geri/ileri; oklar 0.1 saniye, Shift+oklar 1 saniye; Home/End baş/son; +/− timeline ölçeği; Shift+F sığdır; mod+E çıktı ayarları; ? veya mod+/ kısayollar; mod+, AI bağlantısı. Mod Mac'te Cmd, diğerlerinde Ctrl'dir. Metin alanları ve açık diyaloglar düzenleme kısayollarını durdurur.

Doğrulama: birim testleri şerit çakışmasını ve üst üste öğelerin ayrı satırlara yerleşmesini kapsar. Ayrı Electron profilinde AI anahtar durumu, AI taslağından seslendirmeye geçiş, MP3 önizleme, ses şeridine ekleme ve çıktı onay penceresi test edilir. Bu test Modelion HTTP yanıtını yerel MP3 ile değiştirir; gerçek sağlayıcının çalışma/erişim durumu ayrıca canlı deneme gerektirir.

## Studio workspace refresh — 16 October 2026
The editor now uses a graphite workspace with lilac accents, a dedicated project/status area, grouped editing tools and a prominent export action. The stage contains direct aspect-ratio selection, preview-only composition guides, an inspector toggle and a focus mode (Escape returns to editing). Focus and guide state never enter project data or exports.

The inspector uses icon tabs and larger two-column style cards with active-state feedback. Playback has tenths-of-a-second timecodes plus start/end controls. Timeline track labels carry icons; duplicate add tools are consolidated in the main toolbar, while auto zoom and audio import remain beside the timeline. Slider numeric values are keyboard-accessible buttons; Escape cancels the value edit without committing on blur.

The workspace keeps the existing project, undo, timeline, AI and export behavior. It is checked against the saved Studio Demo project at wide, portrait, focus and compact layouts, including the minimum 800px width. Updates continue at the single authorized application path `release-source-fix/mac-arm64/ScreenMovie.app`; staging bundles are temporary and must be removed after replacement. Never replace an application bundle while its process is still running.
