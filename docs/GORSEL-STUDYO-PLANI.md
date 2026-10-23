# ScreenMovie — Görsel Stüdyo önerisi

Tarih: 22 Ekim 2026. Durum: kullanıcı fikri üzerinden teknik inceleme ve kapsam önerisi; uygulama henüz geliştirilmedi.

> **Güncel uygulama:** [22 Ekim Görsel Stüdyo durumu ve kanıtlar](GORSEL-STUDYO-DURUM-2026-10-22.md). Aşağıdaki ilk plan ve ilk teslim notları tarihsel kayıttır; AI bağlantısı ve gelişmiş yerel araçların güncel durumu bu yeni belgede yer alır. Paket kullanıcının isteğiyle güncellenmedi.

## Hedef akış

Ana ekrandan Görsel Stüdyo açılır. Kullanıcı brief, ürün/referans görseli, logo ve isteğe bağlı web bağlantısı ekler. Sistem Marka Profili, sürümlü Tarz Kilidi ve İş Kartı hazırlar. Kullanıcı prompt'u inceleyip düzenler; görsel üretimini destekleyen bağlı araç üzerinden üretir. Sonuç çalışma alanına gelir, düzeltme istekleri önceki sürümden yeni varyasyon oluşturur. Sonuç PNG/JPEG/WebP olarak veya video projesine görsel öğesi olarak aktarılır.

Ekteki kampanya örneği ScreenMovie içinde üretilecek iş akışına örnektir; bu plan kapsamında kampanya görseli üretilmez ve örnekteki bağlantıdan ürün/fiyat bilgisi doğrulanmış sayılmaz.

## İncelenen kaynaklar

- Kullanıcının `~/Downloads/marka-gorsel-studyo-v1.skill` arşivindeki `marka-gorsel-studyo/SKILL.md` okundu. Arşiv kurulmadı veya çalıştırılmadı.
- Bu dosya prompt hazırlama yöntemini tarif eder, görsel üretim motoru içermez. İçindeki motor sürümü/özellik iddiaları entegrasyon öncesinde resmi belgelerden ayrıca doğrulanmalı.
- `electron/agents/agentRunner.ts`: mevcut video ajanında dosya/shell araçları kısıtlı; Codex başlatılırken `image_generation` kapatılıyor. Mevcut runner'ı gevşeterek bütün video görevlerine görsel üretim yetkisi açmak yerine ayrı görsel oturumu tasarlanmalı.

## Ekran düzeni

- Sol: projeler, marka profilleri, ürün/logolar ve referanslar.
- Orta: büyütülebilir görsel çalışma alanı; önce/sonra ve varyasyon karşılaştırması.
- Sağ: Brief / Marka / Stil / Katmanlar / Çıktı sekmeleri.
- Alt: AI sohbeti ve görev ilerlemesi. Kullanıcı isterse hazırlanan tam prompt'u açar.
- Üretimden önce kullanılacak araç, gönderilecek referanslar, çıktı oranı ve varsa ücretli servis kullanımı görünür.

## İşlevler

### 1. Brief ve prompt hazırlama

- Marka adı, renkleri, ton, hedef kitle ve kaçınılacaklar.
- Referanslara ürün, logo, stil veya düzenlenecek görsel rolü verme.
- Kullanım kanalı: 1:1, 4:5, 9:16, 16:9 ve özel piksel ölçüleri.
- Ürün formu ve logonun korunması; fiyat, kampanya tarihi ve iddiaların kullanıcı girdisine veya doğrulanmış kaynağa dayanması.
- İngilizce üretim prompt'u; görseldeki Türkçe metinler birebir ayrı alanlar.
- Seçilen motorun gerçekten desteklediği ayarlar; prompt, kısıtlar ve varyasyonlar.
- Web sayfası metni dış veri olarak ele alınır; sayfadaki talimatlar uygulama veya ajan yetkilerini değiştirmez. Yerel/özel ağ adresleri ve yönlendirmeler için URL doğrulaması gerekir.

### 2. Görsel üretim ve AI düzenleme

- Araç yetenekleri ayrı gösterilir: prompt, yeni görsel, referansla üretim, edit, maske, şeffaflık.
- Yerel bir ajan istemcisinin kurulu veya giriş yapılmış olması görsel üretimini desteklediğinin kanıtı değildir.
- Her adaptör için gerçek küçük bir denemeyle dosya çıktısı, hata ve iptal davranışı doğrulanır. Destek yoksa yalnız prompt hazırlama/dışarı aktarma kullanılabilir.
- Üretim işi: queued/running/succeeded/failed/cancelled; ilerleme, yeniden deneme ve zaman aşımı.
- Çıktı yalnız yazılı cevap veya dosya yolu değil; gerçek, açılabilen görsel olmalı. Dosya türü, boyut/piksel sınırı ve proje kapsamındaki yol doğrulanmalı.
- Kullanıcı ürün/logo referansları ve önceki görsel sürümü yeni düzenleme işine kontrollü aktarılır.
- Orijinal görsel değişmez; her AI düzenleme yeni sürüm üretir.

### 3. Yerel görsel editörü

- Kırpma, döndürme, yatay/dikey çevirme; ölçek, konum ve oran.
- Logo, metin, fiyat, CTA, şekil ve arka plan katmanları; sıralama, kilit ve görünürlük.
- Hizalama, boşluk ve safe zone; undo/redo.
- Metin/logo mümkün olduğunda AI çıktısına gömülmeden düzenlenebilir tutulur. Kaynak görselde zaten gömülü olan yazının otomatik ayrılması vaat edilmez.
- Seçili alan maskesiyle AI düzenleme yalnız destekleyen adaptörde açılır.
- Önizleme ve export ortak sahne/yerleşim modelini kullanır.

### 4. Proje ve video bağlantısı

- Video projesinden bağımsız görsel proje manifesti; varlık kimlikleri, göreli yollar, prompt geçmişi ve marka/stil sürümleri.
- Otomatik taslak ve kurtarma; API anahtarları manifestte bulunmaz.
- PNG/JPEG/WebP; şeffaf PNG yalnız alpha içeren gerçek sonuç için.
- Videoya ekle: görseli video projesinin yönetilen varlıklarına kopyala, başlangıç ve süre seç; geçici dosyaya bağımlı kalma.

## Teknik yaklaşım

Mevcut Electron/React yapısı korunur. Ayrı `image-studio` ekranı ve bu ekrana özel IPC katmanı eklenir. Video ajanı izinleri değiştirilmez.

Önerilen veri modeli:

- BrandProfile: renk, font, ton, hedef kitle, onaylı logo varlıkları.
- StyleLock: sürüm, ışık, kompozisyon, arka plan ve korunacak kurallar.
- ImageJob: brief, kaynaklar, motor yetenekleri, prompt, oran/ölçü, durum ve sonuç varlıkları.
- ImageDocument: canvas, katmanlar, kaynak görsel, düzenlemeler ve sürüm geçmişi.
- ImageProvider: detectCapabilities / generate / edit / cancel / collectArtifacts.

Ajan istemcisi ile görsel motoru farklı sorumluluklardır. Prompt hazırlayan ajan, üretim yapabilen ayrı bir motor adaptörüne görev verebilir. Görsel üretimi için kullanıcının mevcut araç erişiminin yeterli olduğu varsayılmaz; uygun yol teknik denemeyle seçilir. API adaptörü eklenirse anahtar ayrı güvenli ayarda tutulur; mevcut Modelion anahtarı bu servisler için kullanılmaz.

## Uygulama sırası ve kabul kriterleri

1. **Yetenek denemesi:** mevcut araçları salt okunur tespit et, kullanıcı seçimiyle bir gerçek üretim ve bir edit işi dene. Görsel dosyası ve iptal doğrulanmadan üretim destekleniyor deme.
2. **Çalışma alanı:** yeni ekran, görsel içe aktarma, brief/marka/stil kartları, prompt inceleme. Prompt-only araç için açık alternatif.
3. **Üretim:** kanıtlanmış ilk adaptör, referans aktarımı, görev durumları, varyasyon ve önce/sonra.
4. **Yerel düzenleme:** katmanlar, metin/logo/fiyat, crop/ölçek, undo/redo ve ortak export.
5. **Kalıcılık:** save/open, taslak/kurtarma ve videoya ekleme.
6. **Genişleme:** maske ile edit, ek motorlar, seri kampanya, marka kütüphanesi.

Kabul testi: ürün görseli + logo + brief → incelenebilir prompt → gerçek görsel → metin/logo katmanı → AI düzeltme sürümü → projeyi kapat/aç → 1:1 ve 9:16 export → videoya ekle. Türkçe karakterler, iptal, ağ/oturum hatası, desteklenmeyen motor, bozuk görsel ve eksik varlık senaryoları ayrıca sınanır. Gerçek üretim maliyeti veya hesap gereksinimi varsa kullanıcı eylemi öncesinde gösterilir.

## Mevcut işlerle ilişki

Bu ayrı bir modüldür. Görsel ekranı eklenmesi native ekran kaydı kabul testlerinin tamamlandığı anlamına gelmez. Yeni adaptör geliştirmesi ve kalıcı uygulama değişiklikleri bu plan hazırlanırken yapılmadı.

## İlk uygulama — 22 Ekim 2026

Bağımsız Görsel Stüdyo kaynak koduna eklendi. Ana ekran iki çalışma alanı sunuyor; görsel ekranı video projesi kullanmıyor.

Uygulananlar:
- SVG tabanlı tuval; kare, 4:5, 9:16, 16:9 ve özel ölçü.
- PNG/JPEG/WebP içe aktarma; yazı, logo/görsel, dikdörtgen, daire ve ok katmanları.
- Sürükleme, köşeden boyutlandırma, sayısal konum/ölçü/döndürme, renk ve opaklık.
- Katman görünürlük/kilit, sıralama, çoğaltma/silme ve geri al/ileri al.
- Yerel font ailesi sorgulama; test cihazında 215 aile bulundu.
- Ayrı `.screenimage` JSON proje kaydet/aç; görseller proje içine data URI ile gömülü.
- Ayrı localStorage taslağı; kota dolarsa hata gösteriliyor ve dosyaya kaydetme gerekiyor. Büyük medya için disk tabanlı proje/taslak deposuna geçiş sonraki iştir.
- PNG/JPEG/WebP export; seçim çizgileri dışa aktarılmıyor.

Kanıt: `scripts/image-studio-test.cjs`, `artifacts/image-studio-report.json`, `artifacts/image-studio.png`, `artifacts/image-studio-export.png`. Masaüstü akışı 13 kontrol; 37 test dosyasında 191 birim testi geçti. Yeni manifest doğrulaması bozuk/geçersiz boyutları, yinelenen kimliği ve uzak görsel URL'sini reddediyor.

Henüz yapılmayanlar: AI görsel üretim/edit adaptörü, brief/marka/stil kartları; maske; çoklu seçim ve hizalama; metinde kontur/gölge/kalınlık/hizalama; gelişmiş disk tabanlı proje kütüphanesi. Şu an fontlar aile bazında seçiliyor, tek tek font dosyası/style gömme yok. Görsel katman boyutlandırması serbesttir; oran kilidi henüz yok. Tuval metni elle yeni satırlarla düzenleniyor; otomatik satır kaydırma sonraki iştir.

Yeni kod için mevcut uygulama paketi henüz yeniden üretilmedi; geliştirme derlemesi sınandı. Mevcut imzalı paketin değiştirilmesi ayrı teslim adımıdır.
