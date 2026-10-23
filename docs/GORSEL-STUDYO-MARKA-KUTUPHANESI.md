# Görsel Stüdyo — Marka kütüphanesi ve üretim galerisi

22 Ekim 2026

## Yeni akış

Ana ekrandaki Görsel Stüdyo artık katmanlı tuval yerine üretim çalışma alanını açar.

- **Oluştur:** tek istek, AI aracı (Nano Banana / Codex), isteğe göre otomatik veya elle oran seçimi, ek referanslar.
- **Markalar:** kalıcı marka profilleri; marka altında ayrı ürünler; logo, ürün ve tarz referansları.
- **Galeri:** üretilen gerçek raster dosyalar kendi oranında görünür, aranır, indirilir, yeniden referans alınır.
- **Düzenle:** yalnız kullanıcı seçtiğinde mevcut katmanlı editör açılır. Görsel gerçek piksel ölçüsüyle aktarılır. Önceki dolu editör taslağı proje kütüphanesine yedeklenir.

Örnek marka isimleri kullanıcı verisi gibi önceden doldurulmaz. Kullanıcı kendi Mersel/Finsel/Maestro veya Garajhub profillerini oluşturabilir.

## Kimlik ve ürün mirası

Marka alanları: ad, açıklama/hedef kitle, site, renkler, tipografi, ton, görsel dil/tarz kilidi, kaçınılacaklar. Ürünler ek açıklama ve referans görselleri tutar. Marka logosu ve kimliği otomatik miras alınır. Motorun dört referans sınırında ürün görselleri önceliklidir; fazlası varsa açık uyarı gösterilir. Referanslar üretim öncesinde görülebilir ve kaldırılabilir.

Marka/ürün kimliği tek isteğe bağlam olarak eklenir. Yeni üretim için aynı logoyu yeniden yüklemek gerekmez. Marka değiştirilince önceki markanın referansları taşınmaz. Serbest üretim marka bağlamı içermez.

## AI ile taslak çıkarma

Marka penceresindeki **Codex ile kimliği çıkar**, verilen bağlantıyı ve ilk dört kimlik görselini kullanır. Codex oturumu gereklidir; gönderim düğmenin yanında belirtilir. Model sadece izin verilen metin alanlarını içeren JSON döndürür. Dosya/kimlik/id veya ürün kayıtlarını modelden otomatik devralmayız. Bilinmeyen bilgiler boş kalmalı, çıkarımlar yaklaşık olarak işaretlenmelidir. Taslak alanlara gelir, ancak **Markayı kaydet** ile kullanıcı onaylamadan kalıcı yazılmaz.

Bağlantıdan logo dosyası otomatik indirilmez. PNG/JPEG/WebP/SVG yüklenebilir; SVG mevcut güvenli içe alma hattında rasterleştirilir. PDF dosyası doğrudan okunmaz; kurumsal kılavuz sayfaları görsel olarak eklenebilir.

## Skill bağlantısı

Kullanıcının verdiği `marka-gorsel-studyo-v1.skill` paketinden marka kimliği, motor profilleri, dekupe ve format rehberleri kaynak olarak `src/components/creative-studio/skill/` içine alındı. Marka taslağında marka kimliği rehberi; üretim talebinde motor rehberi ve ilgili dekupe kuralları kullanılır.

Bu sürüm skill rehberlerini uygulamanın bağlam hazırlama katmanında kullanır. Her üretim öncesinde ayrı bir metin modeli çalıştırıp tam Skill.md iş akışını yürüttüğümüz anlamına gelmez. Doğrudan görsel üretimi seçilen motordadır. Gemini gizlice Codex'e veya başka ücretli sağlayıcıya yönlendirilmez.

## Kalıcılık ve koruma

Marka ve galeri için ayrı `screenmovie-creative-library` IndexedDB veritabanı kullanılır. Eski `screenmovie-image-studio` belgeleri değiştirilmez veya silinmez. Galeriye yazma başarısızsa görüntü oturumda tutulur ve indirme uyarısı gösterilir. API anahtarı marka/proje/galeri kaydına yazılmaz; mevcut işletim sistemi şifrelemeli anahtar deposu kullanılır.

## Sınırlar

- Oran motor talebine gönderilir; galeri ve editör gerçek dönen dosyanın ölçülerini gösterir. Görsel esnetilmez.
- Gerçek alfa kanalı her motor tarafından sağlanmaz. Dekupe/şeffaflık isteğinde uyarı vardır; çıktı şeffaflığı garanti edilmez.
- Mevcut Gemini hesabında son canlı deneme 429 kota hatasıyla sonuçlanmıştı. Bu değişiklikte yeni ücretli Gemini isteği yapılmadı; kota çözülmüş gibi raporlanmadı.
- Marka/galeri yerel bilgisayardadır; bulut senkronizasyonu yoktur.

## Doğrulama

- TypeScript derlemesi başarılı.
- 42 dosyada 209 birim testi geçti.
- `scripts/creative-studio-test.cjs`: ayrı profilde 9 Electron akış kontrolü geçti. Marka + iki ürün kaydı, referansların yeniden yüklenmeden kullanılması, marka bağlamı ve 9:16 aktarımı, galeride gerçek dosya, isteğe bağlı editör, kaydedilmeden önce AI taslağının incelenmesi, yeniden yüklemede kayıtların korunması.
- Masaüstü testinde görsel ve marka çıkarımı sağlayıcı yanıtları taklittir; gerçek dosya gösterimi ve kalıcı kayıt/arayüz çalıştırılmıştır.
- Görüntüler: `artifacts/creative-studio.png`, `artifacts/creative-studio-gallery.png`. Raporda test kapsamı açıkça yazılıdır.

## Gerçek Codex doğrulaması ve paket

`brand-extraction-live-test.cjs` ile yapay test markasında gerçek Codex isteği başarılı: JSON adı ve doğrulanmış renkleri korudu, bilinmeyen font ve tarz alanlarını boş bıraktı. Gerçek kullanıcı marka kaydı oluşturulmadı. Rapor: `artifacts/brand-extraction-live-report.json`.

İmzalı son paket `/private/tmp/screenmovie-creative-stage-20261022/mac-arm64/ScreenMovie.app` konumunda hazırlandı; `codesign --verify --deep --strict` başarılı. ASAR içinde marka kütüphanesi, galeri ve marka çıkarımı kodları doğrulandı. Mac kilitli olduğundan açık mevcut uygulamayı kapatma, tek kalıcı uygulama konumuna taşıma ve yeni paketi CUA ile açma adımları henüz tamamlanmadı. Mevcut kalıcı kopya `release-source-fix/mac-arm64/ScreenMovie.app`; kullanıcıya ikinci kalıcı kopya oluşturulmadı. Kilit açılınca mevcut kopyayı geri alınabilir biçimde Çöp Sepeti’ne taşıyıp hazır paketi aynı kalıcı konuma alın; kullanıcı verisi/anahtar deposunu değiştirmeyin.

## Paket kurulumu tamamlandı — 22 Ekim 2026 15:13

Kilit açıldıktan sonra mevcut görsel taslağı Ana ekran düğmesiyle diske kaydedildi. Eski uygulama normal Quit menüsüyle kapatıldı. Hazır imzalı paket aynı `release-source-fix/mac-arm64/ScreenMovie.app` konumuna alındı ve imzası yeniden doğrulandı. Önceki ikili geri alınabilir biçimde `~/.Trash/ScreenMovie-before-creative-library-20261022-151301.app` konumuna taşındı; ikinci aktif uygulama kopyası oluşturulmadı. Geçici paket konumundaki uygulama taşındığı için orada ikinci kopya kalmadı.

Güncel uygulama CUA ile açıldı. Ana ekran → Görsel Stüdyo → Markalar → Oluştur geçişleri gerçek paket üzerinde doğrulandı. Marka kütüphanesi açıldı; sahte örnek marka veya test görseli gerçek kullanıcı verisine eklenmedi. Uygulama Oluştur ekranında, mevcut hesap durumuna göre Codex seçili şekilde bırakıldı. Kullanıcı verisi ve anahtar deposu yeniden yazılmadı.
