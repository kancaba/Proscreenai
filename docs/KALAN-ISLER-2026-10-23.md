# Güncel kontrol ve kalan işler — 23 Ekim 2026

> **Sonraki teslim:** [Marka silme, çözünürlük ve token düzenlemesi](MARKA-SILME-COZUNURLUK-TOKEN-2026-10-23.md). Geri alınabilir marka silme ve 1K/2K/4K seçimi eklendi; Codex boyutu hedef olarak iletiliyor. Genel bağlam tekrarı azaltıldı; gerçek tasarruf yüzdesi henüz ölçülmedi. Aşağıdaki kontrol listesi bu teslim öncesindeki tabandır.

Bu belge kaynak kodu, son paketleme günlüklerini ve test raporlarını birlikte değerlendirir. Eski planlardaki “paketlenmedi”, “logo çekilmiyor” veya “görsel üretimi yok” satırları tarihsel kayıttır; bugünkü durumu temsil etmez.

## Bugün yeniden doğrulananlar

- `npx tsc --noEmit`: başarılı.
- `npm test`: 44 dosyada 221 test başarılı.
- `scripts/home-workspaces-test.cjs`: ayrı geçici profilde 16 kontrol başarılı. İlk açılış, iki stüdyo kartı, üç pencere boyutu, kayıt IPC'si, son projeler/görseller, taslak açma, doğrudan büyük önizleme ve galeri/üretim geçişi kapsandı.
- `git diff --check`: başarılı.
- AI yanıtı, gerçek ekran kaydı, GPU MP4 dışa aktarımı ve uzun süreli kayıt bu kontrolde çalıştırılmadı. Ücretli AI isteği yapılmadı. Kullanıcı kayıtları/markaları değiştirilmedi.
- Son kurulu uygulama 22 Ekim “workbench” paketidir: `release-source-fix/mac-arm64/ScreenMovie.app`. O teslimde imza ve gerçek paket açılışı doğrulandı; paket günlüğünde notarization atlandığı açık. Bugün yeniden paketleme yapılmadı.

## Öncelik 1 — Görsel tarafının tamamlanması

### 1. Marka ve galeri yedekleme / içe aktarma

**Eksik:** Marka, ürün, logo ve galeri için uygulama içinden toplu dışa aktarma/içe aktarma yok. `creative-studio/database.ts` kalıcı kayıtları IndexedDB'de saklıyor; bu, taşınabilir yedek değil. Katmanlı editörün `.screenimage` dosyası bu kayıtların tamamını kapsamıyor.

**Yapılacak:** Sürümlü tek arşiv, doğrulanmış varlıklar, çakışma önizlemesi ve mevcut kayıtları bozmadan içe aktarma. Kabul: marka + ürün + logo + sonuçlar temiz test profilinde geri açılır; sır/anahtar arşive girmez.

### 2. Gerçek çıktı oranı ve çözünürlüğü

**Kısmi:** İstek boyutu AI'a iletiliyor; galeride gerçek dönen ölçü gösteriliyor. Bu, her motorun tam istenen ölçüyü ürettiği anlamına gelmiyor. Gemini hattı `imageSize: "1K"` kullanıyor; kullanıcıya kalite/çözünürlük seçimi sunmuyor. Codex hattında oran ağırlıklı olarak prompt üzerinden isteniyor. Önceki gerçek kullanıcı galerisinde geniş görsel isteğine rağmen kare sonuçlar görülmüştü.

**Yapılacak:** Motor yeteneğine göre oran/kalite ayarı; dönen dosyada oran kontrolü; sapmayı açık gösterme; kullanıcı kontrollü kırp/sığdır/dışa aktarma. Yeniden boyutlandırmayı yeni ayrıntı üreten kalite artışı gibi sunmama. Kabul: 1:1, 4:5, 9:16, 16:9 istek ve gerçek dosya matrisi.

### 3. Gemini canlı kabulü ve üretim süresi

**Doğrulanacak:** Son kayıtlı canlı Gemini denemesi 429 kota/hız sınırına takılmıştı. Yeni UI testlerinin geçmesi bu kotanın düzeldiğini kanıtlamaz. Model/kota erişimi güncel hesapta gerçek küçük üretim ve edit ile ayrıca doğrulanmalı.

**Kısmi:** Animasyon, aşama ve toplam süre var; bunlar sağlayıcıyı hızlandırmıyor. Hazırlık/oturum/model/dosya alımı süreleri ayrı kalıcı metrik değil. Önceki iki gerçek Codex işi yaklaşık 2–2,5 dakika sürmüştü; bu evrensel süre taahhüdü değil.

**Yapılacak:** Her aşamaya süre ölçümü, büyük referansları kontrollü küçültme ve gereksiz bağlamı azaltma. Prompt kalitesi/ürün sadakati korunarak karşılaştırmalı ölçüm. Kullanıcı üretim süresinin nerede geçtiğini görebilmeli.

### 4. Kütüphane yönetimi

**Eksik:** Galeride yeniden adlandırma, etiket/klasör ve geri alınabilir silme; marka kaydını arşivleme/silme akışı. Görseller indirilebilir ve referans alınabilir; kütüphaneyi yönetmek ayrı iş.

**Yapılacak:** Önce yedekleme; sonra çöp kutusu/geri alma ve referans bütünlüğü. Galeri büyüdüğünde sayfalama/thumbnail deposu. Ana sayfa yalnız dört son görseli tutuyor ancak galeri şu an tüm kayıtları okuyor.

### 5. İleri görsel düzenleme (isteğe bağlı)

- Marka kurumsal kimliğini doğrudan PDF'den okuma; şu an kılavuz sayfaları görsel olarak eklenebiliyor.
- Gerçek AI inpainting maskesi / gerçek alfa kanallı dekupe. Mevcut geometrik maske bunları sağlamıyor.
- Katman grupları ve taşınabilir fontlar; yerel font ailesinin başka cihazda bulunacağı garanti değil.
- Seri üretim, iş kuyruğu, varyasyon grupları ve galeride önce/sonra karşılaştırma. Katmanlı editörde mevcut sürümleri koruma/karşılaştırma bunun tam galeri karşılığı değil.
- Skill rehberlerinin bağlamda kullanılması mevcut; tam BrandProfile/StyleLock/JobCard iş akışını ayrı yapılandırılmış prompt motoruna dönüştürme daha ileri geliştirme.

## Öncelik 2 — Video tarafında açık kabul kapıları

Bunlar önceki video planından taşınır. Eski writer hatası helper testlerinde yeniden üretilemedi; “halen kesin bozuk” diye sınıflandırılmamalı. Ancak tamamlandı olarak kapatacak uygulama içi kanıt da eksik.

1. Paketlenmiş uygulamada ekran + mikrofon + sistem sesi, pause/devam, pause sırasında stop; HUD/video/ses/cursor/tıklama senkronu.
2. Kayıt alanı, çoklu monitör/Retina, düşük disk, kesinti ve ham kayıttan kurtarma.
3. Güncel MP4/GIF çözünürlük–oran–FPS matrisi, iptal ve encoder fallback. Bazı eski testler kaldırılan kayıt penceresini bekliyor; test akışı güncellenmeli.
4. Gerçek konuşmayla altyazı doğruluğu ve zamanlama; SRT/VTT. Otomatik altyazı mevcut, SRT/VTT teslimi tamamlanmış değil.
5. Referans eşdeğerliği için ayrı geliştirmeler: bağımsız webcam/sahne düzeni, gizlilik maskeleri/spotlight, gelişmiş ses işleme/ducking, çoklu video klibi ve taşınabilir video proje paketi.

Son görsel odaklı kullanıcı talebi nedeniyle bu kontrolde video kaydı/dışa aktarımı başlatılmadı.

## Öncelik 3 — Dağıtım ve platformlar

- Şu an yerel Apple Development imzası kullanılıyor. Developer ID, hardened runtime, notarization ve güvenilir otomatik güncelleme henüz dağıtım hattı değil.
- Güncel macOS paket hedefi arm64. Intel Mac, Windows ve Linux üzerinde gerçek cihaz kabulü yok; “tüm cihazlarda sorunsuz” denemez.
- Birçok kaynak dosyası Git'te değiştirilmiş/izlenmiyor. Sürüm etiketi ve kullanıcı verisinden ayrı kaynak yedeği teslim öncesi gerekli. Bu kontrol commit veya temizlik yapmadı.

## Önerilen devam sırası

1. Marka/galeri yedeği ve geri yükleme.
2. Gerçek çıktı ölçüsü/kalite kontrolleri.
3. Gemini canlı kabulü ve üretim süresi ölçümü.
4. Kütüphane yönetimi ve büyük galeride performans.
5. Video kabul testleri; ardından kalan referans özellikleri.
6. Başka cihazlara dağıtım öncesi yayın imzası ve platform kabulü.

Bu sıralama yeni özelliklerin otomatik olarak uygulanması veya ücretli servis çağrısının başlatılması değildir; kontrol sonucunda çıkarılan iş listesidir.
