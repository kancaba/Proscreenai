# ScreenMovie geliştirme doğrulaması

Tarih: 15 Ekim 2026. Ortam: Apple Silicon, macOS 27.0.1, Xcode 26.2, Node 26.8.1, Electron 39.8.10.

Kullanıcı akışı: açılış ekranı → video içe aktarma → cursor olaylarından otomatik zoom → düzenleme → yerel proje kaydı → MP4 export → son projeden yeniden açma.

## Doğrulananlar

| Kontrol | Sonuç / kanıt |
| --- | --- |
| TypeScript | `npm run typecheck` başarılı |
| Birim testleri | 5 dosyada 47 test başarılı |
| Dil yapısı | `npm run i18n:check` başarılı |
| Native yardımcılar | Dört Swift capture/cursor yardımcısı bu makinede derlendi |
| Üretim build | Vite renderer, main ve preload build başarılı |
| Masaüstü akışı | İzole Electron profilinde 10 kontrol başarılı; `artifacts/smoke-report.json` |
| İçe aktarma | 1280×720, 6 saniyelik H.264/AAC test videosu çözüldü |
| Otomatik zoom | Sentetik click/cursor metadata'sından iki zoom bölgesi üretildi ve projeye kaydedildi |
| İptal / veri koruma | Yeni projede Kaydet ve kapat → kayıt penceresinden vazgeçme editörü kapatmadı |
| Proje kitaplığı | Kaydedilen proje listelendi; tekrar açıldı ve medya geri yüklendi |
| MP4 export | Editördeki iki zoom ve çerçeve efektleriyle gerçek çıktı üretildi |
| Çıktı özellikleri | ffprobe: H.264, 960×540, 60 fps, video 6.000 s; AAC ses 5.980 s; container 6.000 s |
| macOS paketi | `release/mac-arm64/ScreenMovie.app` üretildi; ad-hoc imza `codesign --verify --deep --strict` kontrolünden geçti |
| Paket içeriği | ScreenMovie adı, AAC export kodu ve dört lisans/bildirim dosyası app.asar içinde doğrulandı |
| Paketli açılış | Gerçek ScreenMovie.app açıldı; Türkçe açılış ekranı erişilebilirlik ağacında doğrulandı |

Test çıktısının 960×540 olması mevcut Orta kalite ayarının kaynak çözünürlüğünü %75'e ölçeklemesinden gelir. Bu test 1080p/4K kalite doğrulaması değildir. Ses/video bitiş farkı 20 ms'dir; uzun kayıt senkronizasyon ölçümü yapılmadı.

## Düzeltilen sorunlar

- Yeni projeler kaydedilmemiş değişiklik kontrolünün dışında kalıyordu.
- Kayıt penceresinden vazgeçilse bile preload kapanış onayı gönderiyordu.
- HUD/açılış ekranından editöre geçişte zorla kapatma bayrağı açık kalabiliyordu.
- Proje kaydı doğrudan dosyanın üzerine yazıyordu; artık geçici dosyadan atomik değiştirme kullanılıyor.
- Eski kaynaklar 14 gün / 20 kayıt politikasıyla otomatik silinebiliyordu; bu davranış kaldırıldı.
- MP4 içinde Opus ses üretiliyordu; son kayıt adımında AAC ve faststart oluşturuluyor. Video tekrar kodlanmıyor.
- Kullanılmayan eski ikon/rebuild bağımlılıkları kritik güvenlik bulguları taşıyordu; kaldırıldı ve uyumlu güncellemeler uygulandı.

## Henüz doğrulanmayan / kalan işler

- Canlı ekran kaydı: test profilinde macOS Ekran Kaydı izni `denied`, Erişilebilirlik `false`. Sistem izinleri değiştirilmedi. Mikrofon durumu `granted`.
- Çoklu monitör, Retina koordinatları, uzun kayıt, 4K/60, GIF, sistem sesi ve gerçek cursor telemetrisi uçtan uca test bekliyor.
- Windows ve Linux paketleri test edilmedi.
- Webcam, transkript/altyazı, gelişmiş kamera düzenleri ve bulut paylaşımı uygulanmadı.
- Projeler kaynak medyaya referans verir; taşınabilir paket ve medya yeniden bağlama henüz yok.
- Bağımlılık denetiminde 20 bulgu (11 orta, 9 yüksek) kaldı; Electron/Vite/Tailwind ve toolchain ana sürüm yükseltmesi kamuya dağıtımdan önce ele alınmalı.
- Apple notarization yapılmadı; paket yerel geliştirme önizlemesidir. FFmpeg ve devralınan medya varlıklarının dağıtım lisans kontrolü tamamlanmadı.

Ekran görüntüleri: `artifacts/welcome.png`, `artifacts/editor.png`, `artifacts/editor-restored.png`. Gerçek test çıktısı: `artifacts/smoke-export.mp4`.


## Kayıt çubuğu ve editör güncellemesi — 15 Ekim 2026, 16:10

- Kayıt sırasında HUD gerçek native pencere boyutu 176×60; yalnızca timer, sürükleme tutacağı ve durdurma kontrolü gösterir. Durdurunca 660×170 hazırlık boyutuna döner. Ardışık kayıt durumu bildirimleri boyut geri yüklemeyi bozmaz.
- macOS ScreenCaptureKit yapılandırmasına uygulamanın PID ve pencere ID'leri eklenir; ekran filtresi bu pencereleri dışlar. Native Swift yardımcısı yeniden derlendi. Bu filtre için gerçek canlı kayıt görüntüsü karşılaştırması henüz yapılmadı; UI boyutu testi canlı capture başlatmadan uygulandı. Windows için HUD content protection etkinleştirildi; Windows doğrulanmadı.
- Üst araç çubuğu: Zoom, Kes, Hız, Metin, geri al/ileri al, Kaydet ve Dışa aktar.
- Zoom/kesme/hız bölgesinin başlangıç ve bitişini saniye hassasiyetinde düzenleyen inspector; geçersiz/çakışan aralıklar reddedilir.
- Dört hazır görünüm: Stüdyo, Gece, Sade, Dikey. Altı adede kadar özel görünüm yerel olarak kaydedilebilir.
- Undo/redo artık arka plan, padding, köşe, gölge, cursor ve tuval oranını kapsar. Yalnızca seçim değiştirmek undo geçmişini doldurmaz; farklı proje açınca geçmiş sıfırlanır.
- Yeni içe aktarmalarda varsayılan export kalitesi Orijinal; kayıtlı projelerin kalite tercihi korunur.
- Varsayılan wallpaper'ın asenkron yüklenmesinin açılan proje/preset arka planını ezmesi engellendi.

Son kontroller: TypeScript ve dil yapısı başarılı; 6 test dosyasında 51 test geçti. Gerçek Electron regresyonunda 23 kontrol başarılı: preset uygulama, görünüm undo/redo, özel preset kaydı, araçlardan kesme/hız/metin ekleme, hatalı zaman reddi, 0.20–1.20 saniye kesme kaydı, düzenlenmiş MP4, proje geri yükleme, compact HUD ve eski boyuta dönüş.

Yeni çıktı ffprobe: 1280×720 H.264 / 60 fps, 4.866667 sn video ve 4.864 sn AAC ses. Kaynak 6 sn; kesme ve 1.5× hız uygulanmıştır. Test ekran görüntüleri `artifacts/editor-tools.png` ve `artifacts/recording-compact.png`.

## Marka / metin ipucu düzeltmesi — 15 Ekim 2026

Editör altındaki kaynak proje bağlantısı kaldırıldı; gerekli telif/lisans dosyaları korundu. Yeni metin anotasyonları boş içerik ve boş textContent ile başlıyor. Textarea ipucu gerçek içerik değil. Boş/yalnızca boşluk içeren anotasyonlar export renderer'ında çizilmiyor. Eski otomatik metin ipuçları, yalnızca kullanıcı tarafından textContent alanına açıkça yazılmamışsa proje yüklemede ve önizleme/export sırasında temizleniyor. Türler arasında geçiş boş metni yeniden doldurmuyor.

56 birim testi ve 26 masaüstü kontrolü başarılı. Yeni metnin içeriğinin boş olması, placeholder'ın sadece input hint olması, arayüzde kaynak proje etiketinin bulunmaması ve MP4 export doğrulandı. Güncel paket kanonik konuma yerleştirildi; kullanıcının kaydedilmiş 11 saniyelik projesi yeniden açıldı ve alt marka etiketinin artık görünmediği erişilebilirlik ağacında doğrulandı.

## 15 Ekim — ses kanalı kontrolleri ve oynatma düzeltmeleri

- Ek ses kanalı seçildiğinde yüzde ses seviyesi, sessize alma/açma ve kesin başlangıç/bitiş kontrolleri eklendi. Sessizden çıkınca önceki seviye geri gelir. Ses bölgeleri üst üste kullanılabilir.
- Seviye değişiklikleri artık önizleme ses öğelerini silip yeniden yüklemez. Harici sesin önizleme hızı video hızına eşlenir.
- MP4 export callback bağımlılıklarına ses bölgeleri eklendi; son ses ayarları kullanılır.
- Video sonundan tekrar oynatma, sarma tamamlanmasını bekler. Önceki seek/play yarışı masaüstü testinde tekrarlandı ve düzeltildi.
- Görsel anotasyon önizlemesi yanlışlıkla textContent okuyordu. Önizleme ve export artık aynı imageContent/legacy content çözümünü kullanır.
- 58 birim testi, typecheck ve i18n yapı kontrolü başarılı. 30 gerçek Electron kontrolü başarılı; ses seviyesi, mute/unmute, video sonundan yeniden oynatma, proje kaydet/aç, MP4 export ve mini HUD kontrolleri dahil.
- Dolu 12 saniyelik sentetik demo önceki çalışmada MP4 (H.264/AAC, 1280×720, 11.9 saniye) ve GIF olarak üretildi. Kaynaklar projects/Studio-Demo altında. Bu turun MP4 testi güncel ses kontrollerini içerir.
- Windows/Linux cihaz testi ve canlı kayıt esnasında HUD'un yakalanmadığının piksel kontrolü bu turda yapılmadı. Webcam, otomatik altyazı ve AI özellikleri bu sürümde henüz yok.
- Ek paket kontrolü: macOS Çık → Kaydet ve kapat akışında pencere kapanırken uygulamanın çıkış isteği kayboluyordu. Çıkış isteği kaydetme tamamlanana kadar tutulur; kaydetmeden vazgeçildiğinde temizlenir. scripts/smoke-test.cjs SCREENMOVIE_TEST_QUIT=1 modu gerçek will-quit olayı ve kaydedilen görünümü doğrular.

## 16 Ekim — timeline, sekmeli düzenleme, çıktı onayı ve Ema Lightning

Ana video şeridi gerçek kaynaktan oluşturulan küçük kareler, dosya adı, süre ve kesilen alanlarla gösterilir. Şerit adları sabittir. Çakışan yazı/görsel ve sesler ayrı alt satırlara yerleştirilir. Komşu sınırlaması yalnız aynı şeritte uygulanır; sesler üst üste karıştırılabilir. Timeline yakınlaştırma, uzaklaştırma ve sığdırma düğmeleri eklendi.

Sağ panel Görünüm/Hareket/Öğe/Ses/AI sekmelerine ayrıldı. Klavye kısayolları araç çubuğundan açılır; metin alanlarında ve diyaloglarda editör kısayolları çalışmaz. Çıktı ayarları sağ panelden ayrı bir onay diyaloğuna taşındı; render yalnız başlat düğmesine basılınca çalışır.

Modelion anahtarı ayrı bağlantı diyaloğunda yönetilir; mevcut safeStorage şifreleme yöntemi korundu. AI video yazıları penceresinde her seferinde anahtar kaydetme formu gösterilmez. Ema Lightning model kimliği, Modelion web projesinin yapılandırmasındaki `tts/ema-lightning` değeridir; istek biçimi `/v1/audio/speech`, MP3, input/language/model/response_format alanlarıdır. Taslaktan veya yazılan metinden ses üretme, dinleme ve oynatma konumuna ses şeridi ekleme uygulandı.

Doğrulama:
- 92 birim testi, typecheck, i18n dosya yapısı ve diff boşluk kontrolü başarılı.
- 40 masaüstü regresyon kontrolü başarılı; gerçek MP4 aktarımı, proje kaydet/aç, undo/redo, özel ölçüler, ses ve mini kayıt penceresi dahil.
- 13 yeni iş akışı kontrolü başarılı: API anahtarı ayarları, AI taslağını seslendirmeye taşıma, ses önizleme/ekleme, çıktı onayı, klavye kontrolü ve klip-zaman sıfırı piksel hizalaması. Bu testte Modelion HTTP yanıtları yerel MP3 ve metin yanıtıyla değiştirilir.
- Seslendirme şeridi içeren iş akışı MP4 çıktısı ffprobe ile 1280×720, 30 FPS, H.264/AAC olarak doğrulandı.
- Gerçek kayıtlı anahtarla kısa, kamuya açık bir Türkçe metnin canlı seslendirmesi denendi. Servis 401/403 erişim reddi verdi; gerçek Modelion ses üretimi başarılı olarak işaretlenmedi. Anahtar veya ses modeli yetkisi dış tarafta düzeltilmelidir. Hata kullanıcıya Türkçe ve IPC ayrıntıları olmadan gösterilir.
- macOS uygulama paketi ad-hoc imzalanıp doğrulandı. Windows/Linux donanım testi bu turda yapılmadı.

## 2026-10-16 — Recording regions and social layouts
- Source selection: choose a display, enable “Belirli bir alanı kaydet”, drag on its preview; percentage controls refine the normalized selection. Full-screen reset and window capture remain available. Preview is bounded and confirmation stays visible.
- Region is validated in the main process; changing source during capture is rejected. Cursor coordinates are normalized relative to the chosen area, including monitor origin. FFmpeg crops the completed recording on all capture backends; original stays intact until processing succeeds. This adds processing time after stopping. This is a preview-based area selector, not an on-desktop overlay.
- Editor ratio menu includes named YouTube, Instagram Reels/Story, Snapchat/TikTok/Shorts, square and portrait feed, Facebook/LinkedIn and presentation layouts, plus existing custom ratios. Dimensions shown are example targets; resolution/FPS are set in export settings.
- 96 tests passed; typecheck passed. Isolated Electron integration invokes actual recording finalization: 1280×720 with a 50%×50% selection produces a 640×360 MP4, retaining audio; invalid region rejected. Region picker and confirmation visibility checked in isolated UI. Existing 13-step editor workflow/export regression passed. Physical Windows/Linux recording was not tested.

### Source selector window access fix
- Added a draggable title bar, including during source loading; close control explicitly excludes dragging.
- Source selector no longer stays above System Settings. Window can be resized; scrollable content and fixed footer keep confirmation reachable.
- Isolated Electron check passed for normal window stacking, resize support, CSS drag/no-drag regions, and confirmation within a 620×400 viewport; typecheck and production build passed.

### Empty source list recovery
- Enumerate Chromium display and window sources independently; if both fail, retry without thumbnails. On macOS, native capture can select real Electron screen display IDs when Chromium supplies no sources. Native window entries no longer require Chromium preview images.
- Source chooser displays real permission status and actionable errors, offers refresh, and refreshes after returning from System Settings. Thumbnail-free screens show a placeholder; region selection cannot silently record full display without its required preview.
- Isolated integration forces Chromium getSources to throw and verifies actual OS display IDs remain listed. Refresh and thumbnail-free placeholder checks pass. 96 unit tests and typecheck pass. The user's macOS permission state is not changed by these tests.

### Studio editor workspace — 16 October 2026
- Graphite/lilac layout, grouped toolbar, project dirty status, icon inspector tabs, two-column active style cards, clear timeline icons and reduced duplicate actions.
- Functional canvas aspect selector, preview composition guides, collapsible inspector, focus mode with Escape return, readable tenths timecodes and jump-to-start/end controls. Numeric sliders now support keyboard focus and cancel-safe edits.
- 96 unit tests, typecheck, locale structure check and production build pass. 40 desktop smoke checks and 18 editing workflow checks pass with actual MP4 exports. Six visual/geometry checks pass against the saved demo project, including true 9:16 preview ratio and visible export at 800px width. Screenshots: workspace-studio.png, workspace-portrait.png, workspace-focus.png, workspace-compact.png under artifacts.
- Installed at the existing single app path and opened the real Editor-Demo project in the new packaged editor. Renewed the same macOS screen permission under the user's prior authorization after ad-hoc signature replacement; live chooser then showed granted status, one display and 16 windows with thumbnails. Left the new editor open on the demo. No project file was saved by this verification.
