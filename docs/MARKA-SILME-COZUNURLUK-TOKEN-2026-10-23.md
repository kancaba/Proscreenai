# Marka silme, üretim çözünürlüğü ve token düzenlemesi

23 Ekim 2026

## Silme

Marka düzenleme penceresinde “Markayı sil” düğmesi ve sonuçlarını açıklayan onay alanı var. İşlem `deletedAt` ile geri alınabilir silmedir: ürünler ve logolar saklanır. Galeri sonuçları, marka ilişkileri ve API anahtarları silinmez. Markalar sekmesindeki “Silinen markalar” alanından yeniden açılış sonrasında da geri yüklenebilir. Aktif marka silinirse sonraki üretim serbest moda döner; silinmiş kimlik sessizce kullanılmaz. Eski galeride marka adı korunur.

## 1K / 2K / 4K

Üretim konsoluna çözünürlük seçimi eklendi. Varsayılan 1K, eski davranışla uyumlu.

- Gemini: seçilen değer `generationConfig.imageConfig.imageSize` alanına doğrudan aktarılır. Model değiştirilmedi. Resmî belgelerde mevcut `gemini-3.1-flash-image` için bu üç boyut destekleniyor.
- Codex CLI: hedef çözünürlük üretim isteğine aktarılır; motorun bunu aynen uyguladığı garanti edilmez. Bu sınır arayüzde belirtilir. Çıktı sırf 4K etiketi için yeniden boyutlandırılmaz.
- Gerçek dosya ölçüsü galeride kalır; istenen çözünürlük ayrıca “Hedef 2K” gibi kaydedilir. Oran ile çözünürlük ayrı ayarlardır.
- IPC geçersiz değerleri sağlayıcı çağrısından önce reddeder. Görsel belge ayarı eski projeleri bozmadan saklanır.

## 72 bin token incelemesi

Kullanıcının kendi image-jobs özetindeki son işlem (yalnız kullanım sayıları okundu):

| Alan | Değer |
|---|---:|
| Girdi | 71.619 |
| Önbellekten, girdi içinde | 61.824 |
| Yeni girdi | 9.795 |
| Çıktı | 652 |
| Toplam | 72.271 |
| Süre | yaklaşık 60 sn |

Bu Codex oturum raporudur, yalnız görsel piksel üretiminin tüketimi veya hesap faturası değildir. Görsel aracının ayrı tüketimi bu rapora dahil olmayabilir. Yeni girdi de artık ayrıntıda ayrıca gösterilir. Toplam azaltılarak veya önbellek saklanarak tasarruf varmış gibi sunulmaz.

## Yapılan azaltmalar

- Her üretime taşınan genel rehber/başlık tekrarları yerine kısa, anlamlı üretim kuralları. Ürün şekli, etiket, malzeme, renk/logo sadakati ve Türkçe metni koruma kuralları saklanır. Dekupe isteğinde ilgili alfa/izolasyon kuralları eklenir. Asıl skill kaynakları depoda kalır; marka kimliği analizi değişmez.
- Codex'e zaten komut satırında eklenen referansı tekrar MCP üzerinden okutacak `get_reference` aracı gösterilmez. Referans dosyaları küçültülmez veya yeniden sıkıştırılmaz.
- Görsel görevinde yalnız `publish_image`, prompt görevinde `submit_prompt` gösterilir; gereken diğer istemcilerin referans alma yolu korunur. İlgisiz araç şemaları her turda bağlama eklenmez.
- Tek doğrudan görsel çağrısı ve teslim istenir; ayrı plan/eleştiri döngüsü istenmez. Model veya akıl yürütme düzeyi değiştirilmedi.
- Web kaynaklarında aynı satırın tekrarları çıkarılır; özgün ürün bilgileri özetlenip atılmaz.

Codex'in kendi sistem bağlamı ve iç araç adımları uygulamanın tam denetiminde değildir. Gerçek görsel kalitesi aynı brief/referanslarla karşılaştırılmadan ve canlı tüketim ölçülmeden tasarruf yüzdesi veya mutlak kalite eşitliği iddia edilmez. Bu tur ek ücretli görsel üretimi yapılmadı.

## Doğrulama

- TypeScript ve Vite başarılı; 45 dosyada 225 birim testi başarılı.
- Yeni marka/kalite akışı: 11 ayrı geçici profil kontrolü.
- Prompt konsolu: 13 kontrol.
- Token/önizleme: 16 kontrol.
- Marka/galeri regresyonu: 9 kontrol.
- Toplam 49 masaüstü kontrolü. Sağlayıcı yanıtları kontrollü fikstür; gerçek kullanıcı markası testte silinmedi.
- Birim testleri 1K/2K/4K'nin tam sağlayıcı alanına aktarımını, referans/tekst/oran korunmasını, geçersiz çözünürlüğü, kaynak tekilleştirmeyi ve kısa rehberde koruma kurallarını denetler.

Kanıtlar: artifacts/brand-quality-report.json, artifacts/prompt-composer-report.json, artifacts/image-feedback-report.json, artifacts/creative-studio-report.json, artifacts/package-2026-10-23-brand-quality.log.

Resmî kaynaklar:
- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image
- https://ai.google.dev/gemini-api/docs/image-generation
- https://developers.openai.com/api/docs/guides/image-generation

## Paket teslimi

23 Ekim 16:04'te imzalı paket tek sabit uygulama konumuna kuruldu; deep/strict imza kontrolü başarılı. Önceki sürüm `~/.Trash/ScreenMovie-before-brand-quality-20261023-160449.app` konumunda geri alınabilir. Kurulu uygulamada 3 marka ve 5 galeri görseli korundu; gerçek marka düzenleme penceresinde silme düğmesi görüldü (kullanıcı markası silinmedi). Üretim konsolunda çözünürlük seçimi ve Codex boyut sınırı açıklaması doğrulandı. Uygulama üretim ekranında açık.
