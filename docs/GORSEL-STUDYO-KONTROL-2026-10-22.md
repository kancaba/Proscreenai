# Görsel stüdyo kontrolü — 22 Ekim 2026

## Düzeltilenler

- Büyük önizleme üst araçları, arkadaki Electron pencere sürükleme alanıyla çakışabiliyordu. Açık bir diyalog varken ana üst çubuğun sürükleme alanı kapatılıyor; diyalog ve arka perdesi açıkça `no-drag`. Diyalog kapatıldığında normal pencere sürükleme geri geliyor. Aynı koruma marka ve bağlantı ayarları diyaloglarına uygulanıyor.
- Önizleme yakınlaştırma seçicisindeki sağ/sol tuşları galeri gezinmesine taşınıyordu. Form kontrollerinde yerel klavye davranışı korunuyor.
- Eski katmanlı editör regresyon testi kaldırılmış çok alanlı prompt formunu ve eski ana ekran geçişini bekliyordu. Test tek prompt ve ayrı görsel stüdyo akışına güncellendi; ayrı geçici profil kullanıyor.

## Doğrulama

- TypeScript ve Vite üretim derlemesi başarılı.
- 44 test dosyası, 221 birim testi başarılı.
- 16 görsel geri bildirim kontrolü: gerçek aşamaya bağlı animasyon, süre, token raporu ve kapsamı, eksik rapor, hata tüketimi, yeniden açılışta kalıcılık, büyük önizleme, %200/yakınlaştırma, Esc, görsel gezinmesi, 920×680 ve 1796×1055 araç çubuğu erişimi, modal sürükleme alanı ve klavye davranışı.
- 9 marka/ürün/galeri kontrolü: seçili kimlik/referans aktarımı, format iletimi, doğal çıktı boyutu, editöre geçiş, JSON taslağı, kalıcı kayıtlar.
- 8 site kimliği kontrolü: normalize bağlantı, mevcut alanları koruma, renk/logo adayları, aktif SVG reddi, güvenli SVG indirme, seçili logoyu kalıcılaştırma, metni AI'a iletme. Site sonucu fikstürü kullanıldı; bu tur yeni canlı site isteği yok.
- 12 katmanlı editör kontrolü: yazı hizalama/kalınlık/satır kırma, çevirme, gerçek pointer sürüklemesi, tek adım geri alma, AI sonucunu ekleme, mevcut yazıyı koruma, referansla düzenleme, proje kaydı/taslak geri yükleme, geçerli PNG indirme.
- Gerçek IPC üzerinde anında iptal ve yerel ağ URL'si reddi başarılı.
- `git diff --check` başarılı.

Toplam 45 masaüstü arayüz kontrolü. AI üretim yanıtları bu testlerde kontrollü fikstürdür; bu tur ücretli görsel üretimi ve canlı sağlayıcı performans testi yapılmadı. Eski görseller için token verisi uydurulmaz. Bu çalışma görsel tarafına odaklanır; ekran kaydı ve MP4 dışa aktarımı yeniden test edilmiş değildir.

## Kanıtlar

- artifacts/image-feedback-report.json
- artifacts/creative-studio-report.json
- artifacts/brand-website-ui-report.json
- artifacts/image-studio-extended-report.json
- artifacts/image-cancel-report.json
- artifacts/package-2026-10-22-controls.log

## Kurulu uygulama doğrulaması

İmzalı paket mevcut `release-source-fix/mac-arm64/ScreenMovie.app` yerine kuruldu; imza doğrulaması geçti. Önceki sürüm `~/.Trash/ScreenMovie-before-controls-20261022-171237.app` içinde geri alınabilir.

Kurulu uygulamada bilgisayar kullanım aracıyla önizleme açma, yakınlaştırma menüsünü açma/%100 seçme, sonraki görsele geçme, kapatma, Markalar ve Galeri sekmeleri doğrulandı. Mevcut 2 marka ve 4 görsel yerinde. Uygulama galeri ekranında açık bırakıldı.

## 23 Ekim — üretim konsolu yenilemesi

Model, bağlantı ve oran kontrolleri ortak araç çubuğuna alındı. Tek prompt alanı görünür etiket, kısa örnek, ayrı bağlantı yardım metni ve karakter sayacıyla yenilendi. Metin alanı içerikle büyür (üst sınırda kaydırılır); uzun metnin son satırına erişilebilir. Görsel ekleme ve oluşturma aynı eylem satırında; boş promptta isteğe bağlı üç başlangıç fikri var. Cmd/Ctrl+Enter aynı üretim akışını tetikler. Mevcut sağlayıcı, referans, marka ve token mantığı korunur.

13 yeni konsol kontrolü, 16 üretim/önizleme regresyonu ve 9 marka/galeri kontrolü başarılı (38 masaüstü kontrolü). TypeScript/Vite ve 221 birim testi başarılı. Yapay sağlayıcı yanıtları ayrı profillerde kullanıldı; ücretli üretim yapılmadı.

Kanıtlar: `artifacts/prompt-composer-report.json`, `artifacts/prompt-composer.png`, `artifacts/package-2026-10-23-composer.log`.
