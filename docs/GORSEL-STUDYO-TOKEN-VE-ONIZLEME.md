# Görsel üretimi: token, aşamalar, büyük önizleme

22 Ekim 2026

## Kullanım raporu

Yeni üretimlerin token ve süre bilgileri görselin galeri kaydıyla saklanır. Kart ve büyük önizleme altında toplam token/süre görünür; açıldığında girdi, çıktı, önbellek ve varsa akıl yürütme ayrıntıları gösterilir. Önbellek girdi sayısının içindedir; toplama ikinci kez eklenmez. Hata halinde de sağlayıcı tüketim bildirmişse formda gösterilir.

- **Codex:** var olan CLI JSON olay ayrıştırıcısının `usage` olayları toplanır. Bu rapor Codex oturumunun tokenlarıdır; görsel aracının ayrı tüketimini kapsamayabilir. UI bunu açıkça söyler. Hesap kotası veya fatura olarak sunulmaz.
- **Gemini:** `usageMetadata` içindeki gerçek değerler alınır. Varsa sağlayıcının `totalTokenCount` değeri korunur. Toplam yoksa yalnız girdi ve çıktı birlikte biliniyorsa hesaplanır. Eksik alanlar sıfır gibi gösterilmez.
- Eski galeri kayıtları değişmez; geçmiş işlemlerde rapor kaydedilmediği için bilinmeyen tüketim uydurulmaz.
- API anahtarı ya da prompt token raporuna eklenmez. Sayısal kullanım, süre ve sağlayıcı bilgisi saklanır.

## Üretim animasyonu

Gerçek backend aşamaları: hazırlık / bağlantı / AI üretimi / görseli al. Bağlantı okuma hazırlık içinde gösterilir. Sağlayıcı mesajları aşama açıklamasında kalır. İşlem sürerken animasyon ve geçen dakika:saniye görünür; tahmini yüzde veya bitiş süresi üretilmez. İptal düğmesi korunur. Hareket azaltma tercihi varsa animasyon durur, durum metni görünmeye devam eder.

Bu, sağlayıcı tarafındaki gerçek görsel üretim süresini kısaltan bir değişiklik değildir.

## Büyük önizleme

Galeride görsele tıklanır. Pencere içinde ekrana sığdır, %100 / %200, indirme, editöre geçiş ve önceki/sonraki görsel bulunur. Sol/sağ ok tuşları görseller arasında dolaşır; Esc kapatır. Yakınlaştırılmış görsel kaydırılabilir. Prompt ve rapor görselin altında bulunur. Kullanıcı istemedikçe tuval açılmaz.

## Doğrulama

- TypeScript ve Vite build başarılı.
- 44 dosyada 221 birim testi geçti.
- `scripts/image-feedback-test.cjs`: 11 masaüstü kontrolü geçti. Animasyon/süre, gerçek rapor alanlarının UI'ye taşınması, büyük modal, %200 ve ekrana sığdır, rapor kapsamı, eksik veride sıfır üretmeme, görseller arası geçiş, Esc, rapor kalıcılığı ve başarısız isteğin raporu test edildi. Bu UI testinde sağlayıcı yanıtı taklittir, kullanıcı verisi değiştirilmedi.
- Marka/ürün/galeri akışının 9 masaüstü kontrolü tekrar başarılı.
- Gerçek Codex test isteğinde 38.704 girdi (32.000 önbellek dahil), 152 çıktı, 38.856 toplam token raporu alındı. Yapay test markasına yönelik metin isteğiydi; görsel veya Gemini çağrısı yapılmadı. Rapor `artifacts/brand-extraction-live-report.json` içinde.
- Gemini metadatası sahte HTTP yanıtıyla test edildi; gerçek Gemini kotası tekrar kullanılmadı.

Kod: `src/lib/imageUsage.ts`, `electron/imageStudio.ts`, `electron/geminiClient.ts`, `UsageDetails.tsx`, `GenerationProgress.tsx`, `ImageLightbox.tsx`.

## Kurulum

İmzalı paket 22 Ekim 2026 16:38'de aynı `release-source-fix/mac-arm64/ScreenMovie.app` konumuna taşındı; imza tekrar doğrulandı. Önceki ikili `~/.Trash/ScreenMovie-before-image-feedback-20261022-163859.app` konumunda geri alınabilir durumdadır. İkinci aktif uygulama bırakılmadı.

Paket gerçek kullanıcı profiliyle açıldı. Mersel ve Modelion.AI markaları, dört eski galeri görseli korundu. Eski görsellerde ölçülmemiş token sayısı açıkça bilinmiyor olarak göründü. Gerçek galerideki ilk görsele tıklanınca büyük önizleme açıldı; ekrana sığdır, önceki/sonraki, indir ve düzenle kontrolleri doğrulandı. Uygulama önizleme açık bırakıldı. Yeni canlı görsel üretimi yalnız test için başlatılmadı.
