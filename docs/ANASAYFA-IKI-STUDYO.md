# İki stüdyolu ana sayfa — 22 Ekim 2026

Ana ekran Video Stüdyo ve Görsel Stüdyo'yu eşit büyüklükte iki bağımsız giriş kartıyla sunar. Ortak başlık “Bir fikir. İki stüdyo.” Her kart kendi açıklaması, görseli ve çağrısıyla çalışır.

- Video kartı mevcut kayıt penceresini açar; hızlı video içe aktarma ve proje açma eylemleri altta korunur.
- Görsel kartı bağımsız görsel üretim/marka/galeri alanına geçer.
- Son video projeleri, izin kurulumu ve taslak kurtarma korunur.
- Yeni metinler Türkçe/İngilizce dil seçimine uyar.
- Kart stilleri WelcomeWindow.css içindedir. İlk açılışta lazy yüklenen görsel editörünün CSS dosyasına bağımlı değildir. Bozulmanın nedeni bu bağımlılıktı.

TypeScript ve Vite üretim derlemesi başarılı. Ayrı Electron profilinde 7 kontrol geçti: soğuk başlangıç, 920×680 / 1180×820 / 1796×1055'te ayrı kartlar, video kayıt IPC'si, görsel alanına geçiş, yeniden yükleme. Kayıt IPC'si testte sayılır; test gerçek ekran kaydı başlatmaz. Yapay zekaya istek gönderilmez.

Kanıt: artifacts/home-workspaces-report.json, artifacts/home-workspaces.png, artifacts/package-2026-10-22-home-redesign.log.

## Alt bölüm — Çalışma masan

- Kompakt hızlı işlemler: video içe aktar, proje aç, görsel galerisi.
- Yan yana iki kütüphane: en son 5 video projesi ve en son 4 üretilmiş görsel. Görseller oranı bozulmadan gösterilir.
- Görsel kartı doğrudan ilgili büyük önizlemeyi açar; Tümü ve galeri kısayolu galeri sayfasını açar. Ana üst kart serbest üretime girmeye devam eder.
- IndexedDB taraması yalnızca en yeni 4 sonucu bellekte tutar; şema ve mevcut kayıtlar değişmez.
- Taslaklar/yedekler ana sayfada kapalı bir özetle sunulur. Açılarak kurtarma yapılabilir. Kurtarma hatası olduğunda içerik açılır. Yarım kalan kayıt ve izin uyarıları gizlenmez.
- İlk açılış stili, üç ekran boyutu, iki stüdyo girişi ve yeniden yükleme dahil 16 ayrı Electron kontrolü başarılı. Yapay örnek kayıtlar yalnızca geçici test profilinde oluşturulur.
- TypeScript, Vite üretim derlemesi ve mevcut 221 birim testi başarılı.
- Kanıtlar: artifacts/home-workspaces-report.json, artifacts/home-workbench.png, artifacts/package-2026-10-22-workbench.log.
