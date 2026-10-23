# ScreenMovie — araştırma ve geliştirme planı

Tarih: 15 Ekim 2026

## 1. Hedef ve mevcut durum

Screen Studio ile benzer kayıt, düzenleme ve çıktı deneyimi sunan masaüstü uygulaması geliştirmek. Çalışma adı ScreenMovie. İlk teslim gerçek kayıt → düzenleme → dışa aktarma akışını tamamlamalıdır.

Çalışma klasörü boş; mevcut uygulama veya taşınacak kod bulunmuyor. Bu aşama araştırma ve planlamadır, uygulama henüz geliştirilmedi. Web sitesi ve depoların belgeleri, Recordly paket tanımı ve erişilebilen lisans metinleri incelendi. Uygulamalar kurulup denenmedi; kaynak kodunun tamamı denetlenmedi. Performans ve özelliklerin çalışırlığı sonraki teknik doğrulamada ölçülecek.

Varsayım: macOS ilk doğrulanacak platform; Windows/Linux için ortak editör korunacak. İlk aşamada hesap ve sunucu gerekmeyecek. Marka, metinler ve görsel varlıklar ScreenMovie için hazırlanacak.

## 2. Referans ürünün kapsamı

Screen Studio'nun güncel 4.0 sayfası klasik/loupe zoom, otomatik kadraj, cursor efektleri, kamera yerleşimleri, metinden düzenleme, yerel altyazı/ses iyileştirme, stil presetleri, cihaz kaydı ve paylaşım sunuyor. Dolayısıyla yalnızca auto-zoom ve gradient eklemek tam özellik eşitliği sağlamaz. Ürünün yayımlanan özellik beyanları ile ölçülmüş kalite eşitliği ayrı tutulacak.

Kaynak: https://screen.studio/

## 3. Açık kaynak adayların değerlendirilmesi

| Aday | İncelenen durum | Projedeki rolü |
| --- | --- | --- |
| Recordly | Electron, React, TypeScript, PixiJS; native capture yardımcıları; MIT | İlk teknik deneme ve olası temel |
| OpenScreen Studio | Tauri 2, React, Rust; macOS capture; AGPL-3.0 | Mimari karşılaştırma; doğrudan kod aktarımı varsayılmıyor |
| Orbit | SwiftUI, ScreenCaptureKit, AVFoundation; README macOS 15.2+ ve MIT belirtiyor | Native yaklaşımı karşılaştırma |
| ScreenBoom | Swift 6.2, CoreImage; README macOS/Xcode 26+ ve MIT belirtiyor; ses/webcam yol haritasında | Render ve timeline yaklaşımını karşılaştırma |
| Cap | Tauri/Solid/Rust ve geniş web altyapısı; çoğunluk AGPLv3, belirli capture/camera aileleri MIT | Paylaşım mimarisi referansı |

Recordly'nin README ve paket bilgileri webadderall/Recordly deposuna yöneliyor; verilen DougNix deposunun upstream farkları commit düzeyinde kontrol edilecek. Orbit de başka upstream ve release adresleri gösteriyor. Temel alınacak tam depo ve commit sabitlenmeden fork kararı kesinleştirilmeyecek.

Kaynaklar:
- https://github.com/DougNix/recordly
- https://github.com/DougNix/recordly/blob/main/package.json
- https://github.com/DougNix/recordly/blob/main/LICENSE
- https://github.com/Glyph-Software/OpenScreenStudio
- https://github.com/Glyph-Software/OpenScreenStudio/blob/main/LICENSE
- https://github.com/YvanKOB/orbit
- https://github.com/rajatady/ScreenBoom
- https://github.com/CapSoftware/Cap#license

Lisans envanteri dosya ve bağımlılık düzeyinde tutulacak. Recordly'nin MIT bildirimleri korunacak. FFmpeg binary'sinin gerçek build seçenekleri ve beraber dağıtılan asset/font lisansları ayrıca incelenecek. Cap için geçmişteki ticari koşulları güncel deponun lisansı gibi varsaymayacağız.

## 4. Teknoloji kararı

Öneri: önce Recordly üzerinde sınırlı bir teknik doğrulama; başarılıysa Electron + React + TypeScript + PixiJS editörünü ve macOS native capture katmanını temel almak.

Gerekçe: ortak editör, mevcut motion yaklaşımı ve daha kısa ilk uçtan uca teslim yolu. Bedeli Electron'un bellek/paket yükü ve native yardımcıların bakımıdır. SwiftUI'ya veya Tauri'ye ilk günden yeniden yazmak mevcut sistemi doğrulamadan gereksiz ikinci bir uygulama geliştirmemize yol açar.

Teknik deneme başarısızsa önce sorunun yalıtılabilirliği değerlendirilecek. Capture değiştirilebilir bir adaptör olacak; tüm editör otomatik olarak yeniden yazılmayacak. macOS minimum sürümü sistem sesi, mikrofon ve kullanılan capture API'leri test edildikten sonra belirlenecek.

## 5. Özellik teslim sırası

### V0 — çalışan temel akış

- Ekran/pencere seçimi, geri sayım, kayıt ve durdurma.
- İzin durumu ve anlaşılır hata ekranları.
- Mikrofon ve sistem sesinin ayrı kontrolü.
- Ayrı cursor/click metadata; ham videoda çift cursor oluşmaması.
- Cursor smoothing, click animasyonu, otomatik ve manuel zoom.
- Timeline üzerinde trim ve zoom aralığı düzenleme.
- Gradient/solid/görsel arka plan, padding, köşe ve gölge.
- Yerel proje kaydı, yeniden açma ve 1080p MP4 export.

### V1 — günlük kullanıma uygun editör

- Bölme/silme, hız bölgeleri, undo/redo ve klavye kısayolları.
- Ayrı webcam katmanı, boyut/konum/şekil ayarı ve ses track kontrolleri.
- Motion blur, cursor boyutu/stili ve boşta gizleme.
- 16:9, 9:16 ve 1:1 tuval; preset kaydetme.
- GIF, 4K/60 fps hedefi, export ilerlemesi/iptali ve hata kurtarma.
- Otomatik kayıt, taşınabilir proje paketi ve eksik medyayı yeniden bağlama.

### V2 — ileri özellikler ve eşitlik çalışması

- Maske, blur, highlight ve anotasyon.
- Yerel transkript, altyazı, sessizlik temizleme ve ses iyileştirme.
- Loupe zoom, gelişmiş kamera yerleşimleri, yüz takibi/cutout.
- Cihaz kaydı ve cihaz çerçeveleri.
- İsteğe bağlı paylaşım linkleri ve ortak proje aktarımı.

Bu aşamalar sonunda da kalite eşitliği, referans videolarla karşılaştırılarak ayrıca değerlendirilecek. AI upscaler gibi özel model gerektiren özellikler bağımsız araştırma işidir.

## 6. Uygulama mimarisi

- Capture: kaynak seçimi, izinler, video/ses kaydı, timestamp ve güvenli durdurma.
- Telemetry: cursor konumu/şekli ve tıklamalar. İlk sürümde yazılan metin kaydedilmeyecek.
- Project: sürümlenmiş manifest, orijinal medya, cursor olayları ve tahribatsız düzenleme kararları.
- Motion: click kümelerini zoom önerilerine dönüştürme, hareket filtreleme, easing ve kadraj sınırları.
- Composition: arka plan → ekran/kadraj → cursor → kamera → anotasyon/altyazı katmanları.
- Editor: proje kitaplığı, preview, timeline ve özellik paneli.
- Export: kare üretimi, encoding, ses zaman eşleme, ilerleme ve çıktı doğrulama.

Preview ve export aynı zaman örnekleme ve sahne hesaplarını kullanacak. Ekranda güzel görünen fakat çıktıda farklılaşan animasyonlar kabul edilmeyecek. Trim/speed işlemleri için kaynak zamanından çıktı zamanına ortak eşleme fonksiyonu kullanılacak; ses, cursor ve kamera bu eşlemeye bağlanacak.

Önerilen proje paketi:

```text
Demo.screenmovie/
  manifest.json
  media/screen.mp4
  media/microphone.m4a
  media/system.m4a
  media/camera.mov
  telemetry/cursor.json
  edits/timeline.json
  assets/
```

Dosya adları ve codec'ler capture denemesinden sonra kesinleşecek. Cache dosyaları yeniden üretilebilir olacak. Manifest atomik yazılacak; orijinal medya düzenleme sırasında değiştirilmeyecek.

## 7. Arayüz planı

1. Proje kitaplığı: yeni kayıt, video içe aktar, son projeler.
2. Kayıt çubuğu: kaynak, mikrofon, sistem sesi, kamera, geri sayım ve kayıt durumu.
3. Editör: ortada önizleme, sağda görünüm/cursor/zoom/ses ayarları, altta track'ler ve timeline.
4. Export penceresi: format, çözünürlük, fps, kalite, hedef dosya ve ilerleme.

İlk dil Türkçe olacak; kullanıcıya görünen metinler ileride İngilizce eklenebilecek şekilde ayrı tutulacak.

## 8. İş paketleri ve tamamlanma koşulları

| Sıra | İş | Somut çıkış koşulu |
| --- | --- | --- |
| 1 | Recordly/upstream incelemesi ve kurulum | Sabit commit, bağımlılık/lisans envanteri, tekrar edilebilir build |
| 2 | Capture/export teknik denemesi | 60 saniyelik gerçek ekran kaydı, ses ve cursor ile MP4 çıktı |
| 3 | Proje modeli ve ilk uygulama kabuğu | Kayıt/import sonrası kaydet-kapat-aç akışı |
| 4 | Motion ve ortak render | Manuel/otomatik zoom ve stilin preview/export tutarlılığı |
| 5 | Timeline ve medya track'leri | Kesme/hız sonrası video-ses-cursor-kamera eşleşmesi |
| 6 | Export ve dayanıklılık | İptal, disk dolması, eksik dosya ve yeniden açma senaryoları |
| 7 | Dağıtım | Yerel .app/.dmg, ardından uygun imza ve notarization |

Her paket bir öncekinin doğrulanmış çıktısı üzerine kurulacak. Takvim, ilk native build ve export ölçümleri sonrasında tahmin edilecek.

## 9. Doğrulama planı

- Gerçek kayıt: ekran ve pencere; Retina ölçekleme, çoklu monitör ve ekran kenarındaki tıklamalar.
- İzinler: ilk açılış, reddetme, sonradan verme ve yeniden başlatma.
- Zaman: 30/60 fps, pause/resume, kesme ve hız değişimleri; 10 dakikalık kayıtta ses drift hedefi en fazla bir çıktı karesi.
- Render: seçilmiş timestamp'lerde preview/export kare karşılaştırması; bit düzeyinde eşitlik yerine codec toleransı.
- Motion: yakın tıklamalar birleşiyor mu, zoom kenarlarda boşluk gösteriyor mu, cursor kesmelerde sıçrıyor mu?
- Çıktı: ffprobe ile çözünürlük/fps/süre/ses track kontrolü ve bağımsız oynatıcıda izleme.
- Performans: aynı makinede kayıt CPU/bellek, dropped frame ve export süresini kaydetme. 4K/60 desteği ölçümden önce tamamlandı sayılmayacak.
- Dayanıklılık: uygulama kapanması, eksik medya, disk dolması, export iptali ve projeyi başka klasöre taşıma.

## 10. İlk yapılacak geliştirme

Recordly'nin doğru upstream ve commit'ini seçip kaynak kodunu çalışma alanına almak; yerel talimatları okumak; kurulum scriptlerini incelemek; bağımlılıkları kurmak; macOS build almak. Ardından kısa gerçek kayıtla otomatik zoom, cursor, ses ve MP4 export akışını doğrulamak. Bu sonuçtan sonra ScreenMovie arayüzü ve eksik işlevler uygulanacak.

## Uygulama durumu — 15 Ekim 2026

İlk geliştirme önizlemesi hazır. Recordly kodu sabit commit'ten alındı; ScreenMovie kimliği, Türkçe başlangıç, son projeler, atomik proje kaydı, kapanışta veri koruma ve AAC MP4 son işleme eklendi. Native yardımcılar ve macOS arm64 uygulaması üretildi. 47 test ve 10 masaüstü akış kontrolü geçti. Ayrıntılı kanıtlar `docs/VERIFICATION.md` içinde. Canlı kayıt, macOS Ekran Kaydı/Erişilebilirlik izinleri kapalı olduğu için henüz doğrulanamadı; V1/V2 kapsamı devam ediyor.
