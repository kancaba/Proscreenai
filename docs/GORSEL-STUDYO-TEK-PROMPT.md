> Güncel akış: [Marka kütüphanesi ve üretim galerisi](GORSEL-STUDYO-MARKA-KUTUPHANESI.md). Görsel Stüdyo artık önce galeri tabanlı üretim alanını açar; bu belge önceki tek-prompt paneli değişikliğinin kaydıdır.

# Tek promptlu Görsel Stüdyo — 22 Ekim 2026

Kullanıcı testi sonrası uzun marka/renk/tarz/prompt formu kaldırıldı. Önceki teslim raporundaki çok alanlı akış tarihsel kayıttır.

## Güncel akış

1. Tek kutuya istek yazılır; ürün URL'si aynı metne yapıştırılabilir.
2. Görsel/logo aynı panelden eklenir veya görsel panodan yapıştırılır. SVG logo güvenli biçimde rasterize edilerek referansa dönüşür.
3. Oluştur ile tek iş başlar. Marka, ışık, kompozisyon ve tarz kullanıcı isteği ve referanslardan çıkarılır; kullanıcıdan ayrı bir prompt üretip tekrar göndermesi istenmez.
4. Instagram 4:5, Story/Reels 9:16 ve yatay 16:9 ifadeleri otomatik ölçü seçer. Belirtilmezse mevcut tuval korunur.
5. Üretilen görsel tuvalde açılır. Sonraki “rengini değiştir / arka planı değiştir” isteği kaynakla düzenleme işine dönüşür.

İşlem türü tercihi kapalı “Diğer seçenekler” altındadır. Referanslar küçük görsel kartlarıdır; zorunlu marka profili formu yoktur.

## Nano Banana bağlantısı

- Google Gemini API adaptörü, `gemini-3.1-flash-image` (Nano Banana 2), 1K üretim.
- Görsel ve metin birlikte gönderilir; aspect ratio tuval/istekten belirlenir.
- Anahtar yalnız main process'te kullanılır; query string'e, loga, prompt'a veya proje dosyasına eklenmez. Ayarlar penceresinde bir kez kaydedilir ve işletim sistemi safeStorage ile şifrelenir.
- Ayar penceresi normalde kapalıdır. Kayıtlı anahtar geri okunup ekranda gösterilmez; yeniden kaydetmek gerekmez.
- Her iş iptal edilebilir; zaman aşımı ve yanıt boyutu sınırı vardır. Google hata metni aynen yansıtılmaz, güvenli ve anlamlı durum mesajına çevrilir.
- Başka modele/servise otomatik ücretli fallback yoktur.

Resmi şema: [Google görsel üretimi](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), [Google API anahtarları](https://ai.google.dev/gemini-api/docs/api-key).

### Gerçek Google testi: ENGELLİ

Sağlanan anahtarla tek bir gerçek üretim isteği gönderildi. Google HTTP **429** döndürdü. Bu testte görsel üretilmedi. API projesinin kota/faturalandırma durumu kullanıcı tarafından kontrol edilmeli; durum değişmeden aynı gerçek üretim çağrısı tekrarlanmadı.

Anahtar test dosyasına veya loga yazılmadı. Gizli standart girdi üzerinden izole test sürecine alındı; geçici test profilindeki şifreli kayıt test sonunda kaldırıldı. Kanıt: `artifacts/gemini-live-report.json`. Bu rapor başarı değil, kota engeli içerir. Canlı üretim başarılı gibi işaretlenmemeli.

## Codex düzeltmesi

Kullanıcının başarısız üç işi, sadece bu işlere ait oturum kayıtlarından incelendi. Prompt hazırlama işi tamamlanmış; sonraki iki iş gerçek ürün/logo referansı olmadığı için “önce gerçek referans sağlanmalı” metni döndürmüş. Genel “hesabınızda görsel üretimi olmayabilir” mesajı bu durumu yanlış yönlendiriyordu.

- Referans bekleme durumu artık açıklanır; kullanıcıya görsel/logo eklemesi söylenir.
- Araçtaki görsel dosyası olaylarından ve son yanıtındaki dosya ipuçlarından teslim alınamayan çıktı kurtarılabilir.
- Bu ipuçları güvenilir kabul edilmez: yalnız izinli köklerdeki, bu iş sırasında oluşturulmuş, decode edilebilen ve boyut sınırındaki raster dosya içeri alınır.
- Özet tanı kaydı job klasöründe saklanır; anahtar yoktur.
- Codex başarısızsa otomatik Gemini çağrısı yapılmaz; kullanıcı seçtiği sağlayıcıyı kullanır.

## Kanıtlar

- TypeScript ve üretim derlemesi başarılı.
- 41 dosyada **205 birim testi başarılı**.
- `scripts/image-simple-test.cjs`: **9 masaüstü kontrolü başarılı**. Sağlayıcı yanıtı bu UI testinde fixture'dır; Google üretimi başarılı olduğu iddia edilmez.
- Testler: tek textarea, boş istek kontrolü, kayıtlı Gemini seçimi, SVG ekleme, otomatik referans/ölçü, tuval sonucu, follow-up edit ve ayrı anahtar ayarları.
- `artifacts/image-simple-report.json`, `artifacts/image-simple.png`.
- Paket logu: `artifacts/package-2026-10-22-single-prompt.log`.

Sınır: diğer motorlar, serbest fırça maskesi ve ileri fotoğraf rötuşu ayrı kapsam olmaya devam eder. Bu değişiklik ekran kaydı veya video export çalışması değildir.

## Paket teslimi

Güncel paket aynı `release-source-fix/mac-arm64/ScreenMovie.app` konumuna alındı; mevcut Apple Development kimliğiyle deep/strict imza kontrolü geçti. Önceki sürüm geri alınabilir biçimde Çöp Sepeti'ne taşındı. Gerçek pakette tek kutulu ekran açıldı ve kullanıcının mevcut “Bu bir e imza ürünüdür” isteği korundu. Sağlanan Gemini anahtarı gerçek uygulamanın ayrı güvenli ayarına kaydedildi; anahtarı yeniden girmek gerekmiyor. Ayar penceresi kapatılıp Nano Banana seçili olarak bırakıldı. Google 429 kotası nedeniyle gerçek üretim başarısı iddia edilmiyor; bu engel sürmektedir.
