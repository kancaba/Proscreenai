# Siteden marka kimliği alma — 22 Ekim 2026

Marka penceresine **Siteden bilgileri getir** eklendi. `mersel.io` gibi protokolsüz adresler HTTPS olarak normalleştirilir. Adres bir alt sayfa olsa da marka bilgisi için sitenin ana sayfası okunur.

## Alınan bilgiler

- Site adı, meta açıklaması ve ana sayfanın okunabilir metni.
- Sayfanın gömülü CSS'i ve en fazla üç stil dosyasından renk/font adayları. Marka/primary/accent değişkenleri önceliklendirilir. CSS kullanımları kesin kurumsal palet olarak sunulmaz.
- Logo adı/alt metni taşıyan görseller, logo olarak işaretlenmiş sayfa içi SVG'ler ve ayrı etiketlenmiş site simgeleri. İlk adayların gerçek dosyaları indirilir; farklı bir ürünün/iş ortağının logosu da aday olabilir. Bu yüzden kullanıcı uygun olanı seçer.

Tarama AI gerektirmez ve API anahtarı kullanmaz. AI ile kimlik çıkarma seçilirse alınan ana sayfa metni, gözlenen renk/font bilgileri ve kullanıcının eklediği referanslar Codex'e gönderilir. Sayfa bir kez tarandıysa AI aşamasında tekrar ağdan alınmaz.

## İnceleme ve kayıt

Dolu marka alanları korunur; yalnız boş ad/açıklama/renk/font alanları doldurulur. Ana sayfa metni marka kaydına eklenir ve sonraki üretim bağlamında sınırlı uzunlukla kullanılır. Renkler önizlenir ve palete eklenebilir. Her logo adayı açıkça seçilerek marka varlıklarına eklenir. Kullanıcı Kaydet demeden veritabanına marka yazılmaz.

SVG dosyaları mevcut güvenli içe alma hattından geçirilir: aktif içerik/dış kaynak reddedilir. Editör/AI için PNG raster kopyası; indirmek için temizlenmiş özgün SVG saklanır. PNG/JPEG/WebP kaynakları da doğrulanır. Site simgesi logo diye otomatik atanmaz.

## Ağ sınırları

Her HTML/CSS/logo ve yönlendirmede HTTP/HTTPS, DNS ve özel/yerel ağ kontrolleri uygulanır. DNS çözümü isteğe sabitlenir. Çerez veya kullanıcı oturumu gönderilmez; sayfa JavaScript'i çalıştırılmaz. Yönlendirme, dosya boyutu ve istek süresi sınırlıdır. JavaScript ile sonradan oluşan veya giriş gerektiren sayfalarda sonuç eksik kalabilir; elle giriş yolu korunur.

## Doğrulama

- TypeScript ve Vite build başarılı.
- 43 dosyada **216 birim testi** başarılı.
- Yeni izole Electron akışında **8 kontrol**: protokolsüz adres, dolu alanların korunması, gerçek site verisi önizlemesi, aktif SVG reddi, özgün temizlenmiş SVG indirme bağlantısı, logo ekleme, AI bağlamı ve yeniden açmada kalıcılık.
- Önceki marka/ürün/galeri masaüstü akışının **9 kontrolü** de tekrar başarılı.
- `mersel.io` üzerinde gerçek ağ denemesi başarılı: ana sayfa açıklaması, sekiz CSS renk adayı, Plus Jakarta Sans fontu ve üç tekilleştirilmiş SVG logo/simge adayı alındı. Rapor `artifacts/brand-website-mersel.json`.
- Masaüstü testinde gerçek sayfadan alınmış örnek veri kullanıldı; AI yanıtı taklitti, ücretli üretim yapılmadı. Gerçek kullanıcı marka kaydı test sırasında değiştirilmedi.

## Paket kurulumu

Güncelleme öncesinde kullanıcının açık Codex görsel üretiminin bitmesi beklendi; ikinci sonuç galeride kaydedildikten sonra uygulama normal menüyle kapatıldı. İmzalı paket aynı `release-source-fix/mac-arm64/ScreenMovie.app` konumuna alındı. Önceki ikili `~/.Trash/ScreenMovie-before-website-import-20261022-161006.app` konumunda geri alınabilir durumdadır. Geçici pakette ikinci aktif uygulama kalmadı. Yeni paketin imzası ve ASAR kod işaretleri doğrulandı.

Gerçek uygulama açıldı; Mersel kaydı ve iki galeri görseli korunduğu görüldü. Mersel düzenleme penceresinde Siteden bilgileri getir düğmesi kontrol edilip gerçek site taraması başlatıldı. Kullanıcının dolu kimlik alanları ve mevcut logosu korunur; yeni palet/font taslağı kullanıcı Kaydet diyene kadar kalıcı yazılmaz.

Paket içinden yapılan gerçek tarama da başarılı: Mersel açıklaması, sekiz renk adayı, Plus Jakarta Sans ve üç SVG logo/simge adayı pencerede göründü. Pencere kullanıcı incelemesi için açık bırakıldı; yeni taslak kaydedilmedi.
