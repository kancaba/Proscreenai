# Görsel Stüdyo — Uygulama ve doğrulama

22 Ekim 2026. **Son kullanıcı talebiyle paket güncellendi.** Güncel uygulama: `release-source-fix/mac-arm64/ScreenMovie.app`. Mevcut Apple Development kimliği korundu; deep/strict imza kontrolü geçti. Görsel Stüdyo ve Marka & AI ekranları gerçek paket üzerinden açıldı; Codex hazır ve görsel aracı etkin göründü. Önceki sürüm geri alınabilir biçimde Çöp Sepeti’ne taşındı. Paket logu: `artifacts/package-2026-10-22-image-studio.log`.

> **Son güncelleme:** [Tek promptlu arayüz, Nano Banana ve gerçek kota testi](GORSEL-STUDYO-TEK-PROMPT.md). Uzun AI formu kaldırıldı; aşağıdaki eski çok alanlı açıklamalar önceki teslimi anlatır.

## Çalışan kapsam

- Ana ekrandan bağımsız Video Stüdyo / Görsel Stüdyo seçimi. Görsel belge video projesine bağlı değildir.
- Kare, yatay, dikey ve özel ölçülü tuval; yakınlaştırma, şeffaf tuval, arka plan rengi.
- Yazı, resim/logo, dikdörtgen, daire ve ok katmanları.
- Taşıma, boyutlandırma, döndürme, konum/ölçü, oran kilidi, yatay/dikey çevirme, tuvale hizalama ve merkez/kenar snapping.
- Çoklu seçim (Shift/Cmd/Ctrl), birlikte taşıma, görünürlük/kilit, çoğaltma, sıralama ve silme. Cmd/Ctrl+A, Cmd/Ctrl+D, oklarla taşıma (Shift ile 10 px), Cmd/Ctrl+Z / Shift+Z.
- Bilgisayardaki font aileleri; kalın/italik/altı çizili, hizalama, satır/harf aralığı, otomatik satır kaydırma, kontur ve gölge. Font listesinin gerçek cihaz kontrolünde 215 aile bulundu.
- Görselde kaynak koordinatına göre geri alınabilir kırpma ve elips/dikdörtgen maske. Kaynak görsel korunur.
- Ana görsel / logo-üst katman ayrımı: AI sonucu yeni ana görsel olur; önceki ana görsel gizlenerek korunur. Yazı ve logo üstte kalır.
- Ayrı `.screenimage` proje dosyası; resimler içinde taşınır. IndexedDB ile ayrı taslak ve görsel proje kütüphanesi; localStorage'ın küçük görsel kotası kullanılmaz. Eski taslak ilk açılışta okunabilir.
- PNG/JPEG/WebP çıktı. Preview ve export aynı SVG sahnesini kullanır; seçim tutamaçları dışa aktarılmaz. JPEG şeffaflığı desteklemediği için tuval rengiyle düzleştirilir.

## Marka, prompt ve gerçek görsel üretimi

- Ayrı Marka & AI sekmesi: marka/ürün, renk, brief, sürümlü tarz kilidi, görünecek metin, referanslar ve düzenlenebilir üretim prompt'u.
- Marka/brief/prompt/tarz bilgileri görsel proje ve taslakla saklanır.
- Ürün URL'sinden metin alma ve kullanıcı tarafından düzeltilebilir kaynak alanı. Özel/yerel ağ adresleri reddedilir, yönlendirmeler yeniden kontrol edilir, yanıt boyutu ve süre sınırlıdır. Kaynak metin ajan talimatı sayılmaz.
- Mevcut Claude Code, Codex, Cursor ve OpenCode araçlarının kurulum/oturum durumunu gösterir. Hazır araçlarla prompt hazırlama yolu vardır.
- **Gerçek görsel üretimi ve düzenleme için doğrulanan adaptör Codex'tir.** Diğer araçlarda üretim destekleniyor gibi gösterilmez; yalnız prompt yolu sunulur.
- Video ajanının kısıtları korunur. Görsel işi ayrı oturum açar; shell/browser/apps/multi-agent kapalı, görsel üretim modu yalnız bu işte açılır. Referanslar açıkça seçilir.
- MCP üzerinden hazırlanmış prompt ve gerçek görsel dosyası teslim alınır. Görsel dosyası izinli çıktı klasöründen okunur, boyut ve decode kontrolü yapılır. Sadece metin dönmesi görsel üretim başarısı değildir.
- Üretilen/düzenlenen görsel tuvale gelir; önceki kaynak korunur. Üretim geçmişinde önce/sonra karşılaştırması bulunur.
- İlerleme, hata, iptal ve pencere kapanınca işi sonlandırma. Hesap limitleri geçerlidir; API anahtarı veya ücretli API fallback yoktur.

## Doğrulama kanıtları

| Kontrol | Sonuç |
| --- | --- |
| TypeScript / üretim derlemesi | Başarılı; son biçim/guard değişikliklerinde typecheck yeniden çalıştırıldı |
| Birim testleri | 39 dosya, 197 test başarılı |
| İlk görsel masaüstü akışı | 13 kontrol başarılı: tuval, katmanlar, undo, fontlar, PNG, taslak ve ana ekrana dönüş |
| Genişletilmiş görsel akışı | 13 kontrol başarılı: tipografi, gerçek pointer sürükleme/undo, AI UI bağlantısı, katmanların korunması, kütüphane, tekrar açma, brief/prompt ve PNG |
| Gerçek Codex üretim | Başarılı: 1254×1254 raster dosya |
| Gerçek Codex düzenleme | Başarılı: referans küpün rengi yeşilden maviye değiştirildi; ayrı 1254×1254 dosya |
| Gerçek Codex prompt hazırlama | Başarılı: İngilizce prompt, birebir Türkçe kampanya yazısı |
| Video editörü regresyonu | 41 kontrol başarılı, gerçek MP4 export dahil |
| Anında iptal ve yerel URL reddi | Başarılı; görsel üretim başlamadan iptal edildi |

Genişletilmiş UI testinde AI yanıtları sabit fixture'dır; gerçek Codex üretim/düzenleme/prompt testleri ayrı çalıştırılmıştır. Bu ayrım korunmalı.

Video smoke regresyonunda önce export adımı bekledi; bilgisayar kullanım aracı bu sırada Mac'in kilitli olduğunu bildirdi. İzole yeni profildeki son koşu daha sonra tamamlandı: **41/41 kontrol başarılı**, hata listesi boş ve gerçek MP4 üretildi. Son kanıt: `artifacts/smoke-report.json`, `/tmp/screenmovie-image-video-clean.log`. Kilit açma isteği test tamamlandığı için artık gerekli değildir.

### Dosyalar

- `artifacts/image-studio-report.json`
- `artifacts/image-studio-extended-report.json`
- `artifacts/image-ai-real-report.json`, `image-ai-edit-report.json`, `image-ai-prompt-report.json`
- `artifacts/image-cancel-report.json`
- `artifacts/image-ai-real.png`, `image-ai-edited.png`
- `artifacts/image-studio-extended.png`, `image-extended-export.png`

## Çalıştırma

```sh
npm run typecheck
npm test
npx tsc
npx vite build
npx electron scripts/image-studio-test.cjs
npx electron scripts/image-studio-extended-test.cjs
npx electron scripts/image-cancel-test.cjs
# Gerçek hesap limitini kullanır; gereksiz tekrar çalıştırma:
npx electron scripts/image-ai-test.cjs
npx electron scripts/image-ai-test.cjs --edit
npx electron scripts/image-ai-test.cjs --prompt
```

Masaüstü/GPU testlerini sırayla, Mac açıkken çalıştır. İzole test profilleri kullanıcı projeleri veya mevcut API ayarları değildir. Test temizlikleri gerçek kullanıcının verisine uygulanmamalı. Takılı kalan testin profil kilidi için smoke betiğine `SCREENMOVIE_TEST_PROFILE_SUFFIX` desteği eklendi.

## Sınırlar / sonraki kapsam

Bu çalışma tam Photoshop eşdeğeri değildir. Serbest fırça ile maske boyama, gelişmiş fotoğraf retuşu, PSD, katman grupları, taşınabilir font dosyası gömme, diğer üretim motorlarına gerçek adaptörler ve seri kampanya üretimi ek geliştirmedir. Mevcut maske geometrik kırpmadır; AI'ya piksel maskesi gönderme değildir. Yerel font ailesi başka bilgisayarda bulunmazsa eşdeğer font gerekir.

Native ekran kaydı kabulü ve ana özellik envanterinin diğer fazları bu ayrı görsel modülle tamamlanmış sayılmaz. Son paketleme kullanıcının açık talebiyle yapıldı.
