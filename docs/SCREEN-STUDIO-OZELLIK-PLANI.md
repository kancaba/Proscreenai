# ScreenMovie — Screen Studio özellik eşleme ve geliştirme planı

**Plan tarihi:** 16 Ekim 2026 · **Onay:** 18 Ekim 2026 · **Durum:** Uygulama başladı, Faz 0. İlk teslim: proje taslakları, önceki kayıt yedeği ve oynatma konumu. İkinci teslim: browser kayıt parçalarını diske yazma, yarım kayıt kurtarma arayüzü ve macOS native fragment/journal altyapısı. Windows/Linux native kesinti testleri, telemetry kurtarma, proje v2 ve sonraki fazlar henüz tamamlanmadı.

> Güncel devir (19 Ekim 2026): [Devam planı ve mevcut durum](DEVAM-PLANI-VE-DURUM.md). macOS native video writer hatası açıktır; native pause uçtan uca doğrulanmadı ve Faz 0 tamamlanmadı.

## 1. Hedef ve inceleme yöntemi

Hedef, Screen Studio'nun güncel kayıt → kurgu → çıktı → paylaşım akışındaki yeteneklerini ScreenMovie'de karşılamak; mevcut Electron temelini ve tek uygulama konumunu korumaktır. Tasarım ve uygulama bize ait olacaktır.

Ana sayfa, rehber, dinamik sürüm notları ve yol haritası karşılaştırıldı. Canlı tarayıcıdaki sürüm notlarının en üstünde **4.0.4-4926 / 7 Ekim 2026** bulunuyor. 4.0.0 / 1 Ekim 2026 ile gelen özellikler referansa dahil edildi. Düz HTML sürüm notları boş göründüğünden dinamik sayfa ayrıca tarayıcıda okundu. [Sürüm notları](https://screen.studio/changelog)

Kaynak önceliği: güncel sürüm notu → ilgili rehber → ana sayfa → yol haritası. Örneğin AI seslendirme ana sayfada tanıtılıyor, yol haritasında hâlâ “In progress”; bu nedenle rakipteki kullanılabilirliği belirsiz. Kamera arka planını kaldırma ve bağlantıyla proje paylaşımı sürüm notlarında beta. Çoklu klip, tam metin slaytları ve özel giriş/çıkış animasyonları yol haritasında; bunlar mevcut sürümle eşdeğerlik hesabına katılmıyor. [Yol haritası](https://screen.studio/roadmap)

Bu bir kapalı kaynak algoritma veya bütün donanımlarda performans doğrulaması değildir. Ürün davranışı eşleştirilir; rakibin “3 kat hızlı” veya özel AI büyütme iddiaları ScreenMovie için kabul edilmiş sayılmaz.

ScreenMovie tarafı kaynak kodu, önceki doğrulama raporları ve son canlı uygulama kontrolü üzerinden incelendi. **Var**, özellik temelinin uygulamada bulunmasıdır; kalite ve donanım eşitliği anlamına gelmez. **Kısmi**, çalışan temel var ama davranış/detay eksik. **Yok**, incelemede bir kullanıcı akışı bulunmadı. **Doğrulanacak**, kod desteği veya paketleme var ama uçtan uca donanım kanıtı yetersiz.

## 2. Özellik envanteri

Her satır bir takip maddesidir. Kaynak sütunundaki kodlar belgenin sonundaki resmi bağlantılara gider. Faz sütunu aşağıdaki teslim sırasını gösterir; `Korunur` mevcut yetenek için regresyon kontrolü demektir.

### Kayıt ve kayıt yardımcıları

| ID | Yetenek | ScreenMovie durumu / gerekli iş | Faz | Kaynak |
|---|---|---|---|---|
| R01 | Tüm ekran / çoklu monitör seçimi | Var; Retina, farklı ölçek ve negatif monitör koordinatlarıyla genişletilmiş test | 0–1 | S01/S02 |
| R02 | Tek pencere kaydı | Var; yeniden boyutlanan, taşınan ve tam ekran pencere senaryoları doğrulanacak | 1 | S02 |
| R03 | Alan seçimi ve kesin ölçü | Kısmi: küçük önizlemede yüzde ile seçiliyor, kayıt bitince kırpılıyor. Masaüstü seçim katmanı, piksel ölçüsü ve kaynakta kırpma eklenecek | 1 | S03 |
| R04 | Mikrofon + sistem sesi | Var; sonradan ayrı yönetim için bağımsız kanallar eksik | 3 | S01/S04 |
| R05 | Webcam ile eşzamanlı kayıt | Yok; kamera kaynağı, kalite seçimi ve ortak saatle ayrı kayıt | 4 | S04 |
| R06 | Küçülen kayıt kontrolü | Var; durdurma mevcut, diğer eylemler eksik | 1 | S05 |
| R07 | Kaydı duraklat / devam et | Kısmi (18 Ekim): macOS helper ve browser pause/resume, ortak monotonic kurgu saati, HUD ve Space; WGC/Linux native ve fiziksel A/V/cursor kare senkron matrisi eksik | 0–1 | S05 |
| R08 | Yeniden başlat / çekimi iptal et | Yok; bitirme ile karıştırılmayan eylemler, kurtarılabilir taslak | 1 | S05 |
| R09 | Geri sayım | Var | Korunur | S02 |
| R10 | Uygulama dışından kayıt kısayolu | Yok; global kısayol ve çakışma geri bildirimi | 1 | S01/S02 |
| R11 | Konuşmacı notları / prompter | Yok; hız, yazı boyutu, saydamlık; çıktıya girmeyen pencere | 1 | S06 |
| R12 | Kaydedilen pencereyi kesin boyuta getirme | Yok; izin kontrollü yeniden boyutlandırma ve geri alma | 1 | S01 |
| R13 | Masaüstü simgeleri / Dock görünürlüğü | Yok; kayıt sonunda ve hata sonrasında eski duruma dönüş | 1 | S01/S02 |
| R14 | Çökme sonrası çekim kurtarma | Yok; browser kaydı parçaları bellekte birikiyor. Parçalı disk kaydı, oturum manifesti ve açılış kurtarma akışı | 0 | S01 |
| R15 | Kayıt öncesi kaynak, disk ve cihaz kontrolü | Kısmi; izin/kaynak kontrolleri var. Alan, cihaz kopması ve disk dolması için bütünleşik kontrol eksik | 0 | S07 |
| R16 | iPhone/iPad USB ve ses kaydı | Yok; macOS cihaz kaynağı adaptörü | 6 | S08 |
| R17 | iPhone Mirroring pencere desteği | Genel pencere kaydı temel; özel tanıma / çerçeve davranışı doğrulanmadı | 6 | S02/S07 |
| R18 | Video içe aktarma | Var; desteklenen formatlar/codec'ler gerçek dosyalarla listelenecek | Korunur | S02 |

### Zoom, hareket ve imleç

| ID | Yetenek | ScreenMovie durumu / gerekli iş | Faz | Kaynak |
|---|---|---|---|---|
| M01 | Click tabanlı otomatik zoom | Var; gruplama ve odak kalitesi karşılaştırılacak | 2 | S09 |
| M02 | Manuel zoom ve sahnede odak seçimi | Var | Korunur | S09 |
| M03 | Glass Loupe / büyüteç | Yok; ekranın tamamını taşımayan büyüteç efekti | 2 | S07 |
| M04 | Anlık zoom seçeneği | Yok; animasyonsuz bölge geçişi | 2 | S10 |
| M05 | Zoomu kapatmadan devre dışı bırakma / çoğaltma | Kısmi: ekle, süre değiştir, sil var. Bölgeyi disable/duplicate ve toplu uygulama eksik | 2 | S09/S07 |
| M06 | Animasyon ayarları | Kısmi: bağlı zoom/pan ve blur var. Seçilebilir geçiş davranışı ve kamera geçişleri eksik | 2/4 | S11 |
| M07 | Oran değişince akıllı yeniden kadraj | Kısmi: oran ve zoom sınırları var; kamera/yazı/imleç çakışmasını birlikte çözmüyor | 2/4/5 | S01 |
| M08 | Keskin büyütme / yerel super resolution | Yok; kalite ve hız prototipi sonrası kullanılabilir mod | 6 | S01/S07 |
| C01 | İmleci sonradan işleme, boyut, yumuşatma | Var; native cursor assets + telemetry | Korunur | S12 |
| C02 | İmleç/hareket blur | Var; farklı FPS ve oranlarda görsel karşılaştırma | 2 | S01 |
| C03 | Click halkası / bounce | Var; efekt tipi, renk ve kuvvet seçimi kısmi | 2 | S12/S07 |
| C04 | Click sesleri | Yok; ses türü ve seviye, mikrofonla çifte click kontrolü | 3 | S13 |
| C05 | Hareketsizken imleci gizleme | Yok; bekleme eşiği, fade ve hareketle dönüş | 2 | S12 |
| C06 | Bölüm bazında imleci gizleme | Yok; global aç/kapat var, zaman aralığı ayarı yok | 2 | S02 |
| C07 | Döngü için imleci başlangıca döndürme | Var; kesmeler ve hız değişimleriyle tekrar test | 2 | S12 |
| C08 | Stil seçimi / touch / sabit sistem imleci | Kısmi: kayıtlı türler çiziliyor; kullanıcı stil seçicisi ve sabit tür eksik | 2 | S12 |
| C09 | İmleç salınımı, tür değişimi ve kayıt sonu hareket kontrolü | Kısmi: kararlı tür çözümü var; ayrı ayarlar ve son hareket bastırma eksik | 2 | S12 |
| C10 | Basılan kısayolları videoda gösterme | Yok; mevcut editör kısayollarıyla farklı özellik. Olay toplama, keycap tasarımı ve düzenlenebilir zaman kanalı | 2 | S14 |
| C11 | Yazı yazılan bölümleri otomatik hızlandırma | Yok; metnin kendisini saklamadan aktivite aralıkları ve onaylanabilir öneriler | 2 | S15 |

### Kamera ve yerleşim

| ID | Yetenek | ScreenMovie durumu / gerekli iş | Faz | Kaynak |
|---|---|---|---|---|
| K01 | Kamera seçimi, önizleme ve kalite | Yok | 4 | S04 |
| K02 | Boyut, konum, oran, kırpma ve aynalama | Yok | 4 | S04/S16 |
| K03 | Kamera overlay / screen only / fullscreen | Yok | 4 | S16 |
| K04 | Split screen yatay/dikey | Yok | 4 | S07 |
| K05 | Timeline'da dinamik kamera düzeni / geçiş | Yok | 4 | S16 |
| K06 | Yüzü takip eden kadraj | Yok | 4 | S07 |
| K07 | Sessizlikte kamerayı gizleme | Yok; ses aktivitesi altyapısına bağlı | 4 | S07 |
| K08 | Kamera arka planını kaldırma | Yok; rakipte beta. Yerel model, saç/kenar kalite kontrolü ve kapatma seçeneği | 4 | S07 |
| K09 | Kamera renk stilleri / LUT / keskinlik | Yok | 4/6 | S07/S01 |
| K10 | İşletim sistemi kamera efektleri / tepkiler | Yok; platform ve kamera desteğine göre gösterilecek | 4 | S17/S02 |

### Konuşma, ses ve altyazı

| ID | Yetenek | ScreenMovie durumu / gerekli iş | Faz | Kaynak |
|---|---|---|---|---|
| A01 | Ses dosyası ekleme, konum, seviye, mute | Var | Korunur | S18 |
| A02 | Mikrofon / sistem / müzik ayrı miks | Kısmi: ek ses kanalları var; kayıt sesi birleşebiliyor, ayrı stems gerekir | 3 | S04/S07 |
| A03 | Ses dalga formu ve scrub sırasında dinleme | Yok | 3 | S07/S02 |
| A04 | Müzik kütüphanesi / önizleme / döngü | Kısmi: dosya ekleniyor; lisanslı kütüphane ve fit-to-duration loop yok | 3 | S18/S01 |
| A05 | Noise reduction / ses iyileştirme | Kısmi: browser mikrofonda capture noiseSuppression var; native kayıt sonrası yerel işleme yok | 3 | S01/S07 |
| A06 | Konuşma ses seviyesi normalizasyonu | Yok; tepe ve loudness ölçümüyle işleme | 3 | S07 |
| A07 | Podcast tipi gelişmiş ses modu | Yok; rakibin beta/tanıtım özelliği, ayrı deneysel mod | 3 | S01/S20 |
| A08 | AI seslendirme | Var: Modelion Ema Lightning. Metin/ses bağlantısı, yeniden üretim ve sürümleme kısmi | 3 | S01/S20 |
| A09 | Mikrofonla sonradan anlatım kaydı | Yok; TTS ve dosya içe aktarma bunun yerine sayılmaz | 3 | S20 |
| T01 | Konuşmadan zaman damgalı gerçek altyazı | Yok. Mevcut AI video yazıları yalnızca konuya göre metin üretir | 5 | S19 |
| T02 | Yerel ve isteğe bağlı bulut transkripsiyon | Yok; ortak çıktı şeması, model indirme ve açık veri gönderim bilgisi | 5 | S19/S07 |
| T03 | Altyazı düzenleme, stil ve kelime/satır animasyonu | Kısmi: elle yazı öğesi var; sesle hizalı altyazı sistemi yok | 5 | S19/S07 |
| T04 | SRT dışa aktarma | Yok; kesilmiş/hızlanmış çıktı zamanına göre üretilmeli | 5 | S19/S01 |
| T05 | Transkript üzerinden video kesme | Yok; metni düzeltme ile videoyu kesme farklı eylemler olacak | 5 | S07 |
| T06 | Dolgu kelime ve uzun sessizlik önerileri | Yok; öneri önizlemesi, toplu onay, tek geri alma | 5 | S07 |

### Görünüm, gizlilik ve editör ergonomisi

| ID | Yetenek | ScreenMovie durumu / gerekli iş | Faz | Kaynak |
|---|---|---|---|---|
| G01 | Duvar kâğıdı, renk, gradyan, özel görsel | Var | Korunur | S21 |
| G02 | Padding, köşe ve gölge | Var; gölge yönü/mesafe/yumuşaklık ayrı değil, ayrı inset/çerçeve kontrolü kısmi | 6 | S21/S01 |
| G03 | Unsplash arama | Yok; görsel kaynağı/atıf ve ağ gereksinimi açık olacak | 6 | S07/S20 |
| G04 | Hazır stiller ve kişisel stil kaydetme | Var | Korunur | S22 |
| G05 | Görsel varlıklarıyla taşınabilir stil paylaşma | Yok; localStorage'daki stil listesi paylaşım paketi değildir | 6 | S22 |
| G06 | Oran, sosyal medya boyutları ve özel oran | Var | Korunur | S01/S02 |
| G07 | Reels/TikTok arayüz güvenli alanı | Kısmi: genel hizalama kılavuzu var; platform arayüzü örtüşme önizlemesi yok | 2 | S01 |
| G08 | Hassas veri maskesi / blur / kapatma | Yok; arka plan blur'u gizlilik maskesi değildir | 2 | S23 |
| G09 | Spotlight / highlight | Yok; ok şekli eklemek spotlight sayılmaz | 2 | S23 |
| G10 | Kesme, hız, crop | Var; ayrı kaynak parçaları, kesimde bölme ve toplu reset ergonomisi geliştirilecek | 2 | S02 |
| G11 | Komut paleti / Cmd+K | Yok; menüde arama, eyleme/ayara gitme | 1 | S24 |
| G12 | Geri/ileri, editör kısayolları | Var | Korunur | S02 |
| G13 | Panel gizleme / odak modu | Var | Korunur | S07 |
| G14 | Mevcut kareyi görsel olarak kopyalama | Yok; çıktıyla eşleşen PNG üretimi ve pano/dosya | 6 | S25 |
| G15 | Renk banding azaltma | Yok; gradient çıktısında görsel karşılaştırma | 6 | S07 |

### Çıktı, proje, paylaşım ve platform

| ID | Yetenek | ScreenMovie durumu / gerekli iş | Faz | Kaynak |
|---|---|---|---|---|
| E01 | MP4 çözünürlük/kalite/FPS seçimi | Var: source/720/1080/1440/2160, özel ölçü, 30/60 FPS. Referanstaki 24 FPS gibi ek seçenekler eksik | 6 | S26 |
| E02 | GIF boyutu/FPS/döngü | Var; sıkıştırma, süre ve boyut geri bildirimi genişletilecek | 6 | S26 |
| E03 | Donanım encode / yazılım fallback | Var; WebCodecs tercihleri var. Üretim donanım matrisi doğrulanacak | 6 | S01 |
| E04 | Çıktı öncesi tahmini boyut / süre | Kısmi: ölçüler görünür, güvenilir boyut ve süre tahmini yok | 6 | S07 |
| E05 | Bitmiş videoyu panoya kopyalama | Yok; platforma uygun dosya pano formatı | 6 | S01/S07 |
| E06 | Kayıttan sonra hızlı paylaş/düzenle alanı | Kısmi: doğrudan editöre açılıyor; hızlı teslim bileşeni yok | 7 | S27 |
| E07 | Ham video/kamera/ses dosyalarını dışarı alma | Kısmi: kaynak dosyalar mevcut; kullanıcıya sunulan ham varlık çıkarma akışı yok | 6 | S02/S07 |
| P01 | Yerel proje kaydet/aç ve son projeler | Var | Korunur | S07/S28 |
| P02 | Projeyi kaldığı oynatma konumunda açma | Var (18 Ekim): kayıt ve taslaklarda oynatma konumu saklanıp yükleniyor; diğer panel görünüm tercihleri sonraki adım | 0 | S07 |
| P03 | Otomatik taslak ve kayıt sürümü yedeği | Var (18 Ekim): otomatik taslak, önceki sağlam kayıt yedeği ve açılıştan kopya kurtarma; gerçek süreç kesintisiyle test edildi | 0 | S07 |
| P04 | Projeyi varlıklarıyla tek paket taşıma | Yok; mevcut JSON mutlak medya yoluna bağlı | 0/7 | S28 |
| P05 | Finder / Quick Look proje önizlemesi | Yok; Windows shell ve Linux thumbnail eşdeğerleri platform işi | 6 | S07 |
| P06 | Tarayıcıda izlenen paylaşım bağlantısı | Yok; upload, streaming, iptal ve bağlantı yönetimi | 7 | S27 |
| P07 | Özel bağlantı, erişim kaldırma | Yok; kimlik doğrulama ve sunucu taraflı yetkilendirme | 7 | S01/S27 |
| P08 | Zaman damgalı yorumlar / izlenme sayısı | Yok; izleyici paneli ve isteğe bağlı ölçüm | 7 | S01/S02 |
| P09 | Bağlantıyla düzenlenebilir proje paylaşma | Yok; rakipte beta, taşınabilir yerel paket önce tamamlanmalı | 7 | S07 |
| P10 | Çevrimdışı çalışma / açık bulut ayrımı | Kısmi: kayıt/kurgu yerel, Modelion isteğe bağlı. Yeni yerel AI araçları ve tutarlı gizlilik bilgisi eksik | Tüm fazlar | S01 |
| P11 | Platform uyumluluğu | macOS Apple Silicon canlı doğrulandı; Windows/Linux kod ve paket tanımları var, gerçek cihaz doğrulaması eksik. Referans ürün Mac odaklı | 0/6 | S01 |
| P12 | Güncelleme, imza ve tek uygulama | Kısmi: tek kopya korundu; geliştirme ad-hoc imzası güncellemede izinleri bozabiliyor. Kalıcı yayın imzası ve güvenilir güncelleme düzeni gerekiyor | 0 | Yerel inceleme |
| P13 | Lisans/hesap/ekip yönetimi | Yerel uygulamada yok; ürünün ticari modeli belirlenmeden rakibin lisans ekranları kopyalanmayacak. Teknik plan kapsamına ayrı iş paketi olarak alındı | 7+ | S20 |

### Rakibin yol haritasındaki ek işler

Bunlar güncel sürümde varmış gibi gösterilmeyecek. [Yol haritası](https://screen.studio/roadmap)

| ID | İş | ScreenMovie durumu | Konum |
|---|---|---|---|
| X01 | Bir projede birden fazla video klibi | Yok; çoklu ses/annotation kanalı, çoklu video klibi değildir | Faz 8 |
| X02 | Tam ekran metin slaytları | Kısmi; mevcut video üstüne yazı var, video süresini uzatan bağımsız slayt yok | Faz 8 |
| X03 | Özelleştirilebilir giriş/çıkış animasyonları | Yok; mevcut zoom geçişlerinden ayrı | Faz 8 |
| X04 | Ekran görüntülerinden video | Yok | Faz 8 |
| X05 | Gelişmiş açıklama/anotasyon düzeni | Metin, görsel ve ok var; animasyon ve kapsam genişletilebilir | Faz 8 |
| X06 | Takım abonelik/membership altyapısı | Yok; bulut ve ürün modeli sonrası | Faz 8 |
| X07 | Raycast / dış otomasyon entegrasyonu | Yok; kontrollü URL şeması ve komut listesi | Faz 8 / macOS |

## 3. Uygulama sırası ve kabul kriterleri

### Faz 0 — Güvenilir temel ve proje v2 · Zorluk: yüksek

- Tek uygulama konumu, tek çalışan oturum ve sürüm kimliği; paket yerine koymadan önce süreç kapanış kontrolü.
- Yayın imzası/notarization yolu ve güncellemeler arası izin regresyonu. Gerçek dağıtım için geliştirici sertifikası/hesabı dış bağımlılıktır; kullanıcıya ait sertifika veya hesap varsayılmaz.
- Kayıt oturumu durum makinesi; pause/resume, kamera, mikrofon, sistem sesi ve cursor için ortak monotonic saat.
- Parçaları diske yazan journal, açılışta kurtarma, disk alanı kontrolü, cihaz kopması ve uyku/uyanma yönetimi.
- Varlık kimliği, göreli yol, kaynak/çıktı zaman eşlemesi ve migration içeren proje v2. İlk migration mevcut v1 dosyayı değiştirmeden kopya açar.
- Otomatik taslak, save öncesi yedek, eksik dosyayı yeniden bağlama, playhead ve görünüm durumunu geri yükleme.

**Bitti sayılması:** Kayıt süreci zorla kapatılır; tamamlanmış parçalar, ses ve telemetry geri gelir. Hedef kurtarma kaybı en fazla 2 saniyedir ve gerçek kesinti testiyle ölçülür. Kayıt/export sırasında çıkış davranışı açık; save kesintisi önceki sağlam dosyayı bozmuyor. v1 demo projeleri açılıyor. Güncellemede yanlış uygulama kopyası açılmıyor.

### Faz 1 — Kayıt ergonomisi · Zorluk: orta–yüksek · Bağımlılık: 0

- Ekran üstünde taşıma/boyutlandırma, X/Y/W/H piksel girişi, oran kilidi ve monitör seçimi; native kaynakta crop.
- Pause/devam, yeniden çek ve iptal; kısa kontrol çubuğu, görünür durum ve global kısayol.
- Konuşmacı notları, prompter; otomatik kaynak odağı, pencere boyutu presetleri; masaüstü/Dock ayarlarını güvenle geri alma.
- Aranabilir Cmd/Ctrl+K komut paleti; izin akışında durum ve çalıştırılan uygulama sürümü aynı yerde gösterilir.

**Bitti sayılması:** 10 kez pause/resume sonrası video, ses ve tıklama olayı aynı karede kalır; hedef fark en fazla bir çıktı karesidir. İkinci ekran/Retina/ölçekli Windows ve uygun Linux kaynaklarında alan doğru kaydedilir. Notlar ve kayıt kontrolü kaynak videoda görünmez. İptal/disk dolması sonrasında masaüstü ayarları eski haline döner.

### Faz 2 — Hareket, gizlilik ve timeline · Zorluk: yüksek · Bağımlılık: 0–1

- Classic/Instant/Loupe zoom; enable/disable, çoğaltma ve toplu değer uygulama. Auto zoom yoğunluğu ve geçiş davranışları.
- Imleç stilleri, idle hide, bölüm bazlı görünürlük, tür geçişleri, son hareket bastırma; renkli click efektleri.
- Kısayol olay kanalı ve keycap overlay. Yazı içeriği saklanmadan typing segment önerileri; kullanıcı tek tek/toplu uygulayabilir.
- Maske: blur/pixelate/solid; highlight/spotlight; timeline süreleri ve sahnede alan düzenleme. Hassas bilgi için kaynak koordinatı + crop/zoom/çıktı dönüşümü ortak çalışır.
- Sosyal arayüz safe zone önizlemesi; platforma göre profil değişebilir. Bölge context menu, toplu seçim, snapping, kopyala/yapıştır ve görünür kaydırma.

**Bitti sayılması:** Maske tüm etkin karelerde bilgi alanını örter; zoom, crop, 1:1 ve 9:16 export testleri sızıntısızdır. Preview/export aynı animasyon örneklerini üretir. Kısayol yakalama tuş kombinasyonlarını gösterir; şifre veya normal yazı içeriğini kaydetmez. Typing önerisi mevcut kesimlerle çakışmaz ve tek undo ile geri alınır.

### Faz 3 — Ses stüdyosu ve anlatım · Zorluk: yüksek · Bağımlılık: 0–1

- Mikrofon/sistem/müzik/TTS ayrı kaynak ve kanallar. Waveform, trim offset, mute/solo, gain, fade-in/out ve ses seviyesi ölçümü.
- Yerel noise reduction ve normalizasyon; deneysel gelişmiş konuşma modu. İşlenmiş/ham karşılaştırma ve kaynak koruma.
- Süreye uyan müzik döngüsü, konuşmada müziği azaltma; yalnızca kullanım hakkı net varlıklardan kütüphane.
- Click sesi; manuel mikrofonla sonradan anlatım.
- Modelion Ema Lightning korunur. Metin ve ses eşleştirilir; yeniden üretim, iptal, hata/limit açıklamaları ve önceki ses sürümü. Mevcut anahtar bir daha proje dosyalarına taşınmaz.

**Bitti sayılması:** Hız/kesim içeren videoda bütün kanallar senkron; mute edilmiş kanal export'ta duyulmaz. Döngü/fade sınırında patlama yok. İşleme karşılaştırması anlaşılır; native ve browser kayıt aynı seçenekleri doğru raporlar. Modelion kapalı/ağsızken yerel kurgu çalışır.

### Faz 4 — Kamera ve dinamik sahneler · Zorluk: çok yüksek · Bağımlılık: 0 ve 3

- Kamerayı bağımsız kaynak olarak kaydetme; kaynak seçimi, çözünürlük/FPS, preview gizleme.
- Overlay, screen only, fullscreen camera ve split screen. Kamera düzeni kanalı, boyut/konum/ayna/crop, oran değişince yeniden yerleşim.
- Yerel yüz takibi ve konuşma aktivitesine göre görünürlük. Arka plan kaldırma önce deneysel modda sunulur.
- Kamera stil presetleri, LUT gücü ve keskinleştirme. OS kamera efektleri, destekleniyorsa ayrıca gösterilir.

**Bitti sayılması:** 30 dakikalık ekran+kamera+mikrofon kaydında senkron kayması sınırı ölçülür. Kamera cursor/yazı alanını kapatmaz. Aynı proje 16:9, 1:1 ve 9:16 açılıp export edilir. Cihaz kopması bozuk proje yaratmaz. Yüz takibi ve cutout başarısız olursa kapatılabilir; sahte “destekleniyor” gösterilmez.

### Faz 5 — Gerçek altyazı ve transkriptle kurgu · Zorluk: çok yüksek · Bağımlılık: 0 ve 3

- Ayrı kelime zaman damgalı transcript modeli; local model indirme/silme ve donanıma göre seçenek. macOS yerel konuşma API'si sadece desteklenen sürümde gösterilir; ortak platform alternatifi ayrıca değerlendirilir.
- İsteğe bağlı bulut sağlayıcı; gönderilecek ses açıkça gösterilir. Modelion'un transkripsiyon endpoint'i olduğu varsayılmaz; entegrasyon yalnızca belgelenen yetenekle yapılır.
- Altyazıda font, boyut, renk, konum, satır/kelime gösterimi, highlight ve animasyon; elle düzeltme. Konu yazıları ayrı AI aracı olarak kalır.
- SRT ve hedeflenirse VTT; kaynak zamanını kesim/hız sonrası çıktıya eşleme.
- Transkriptte metin düzeltme ile “seçili konuşmayı videodan kaldır” ayrılır. Dolgu kelimeler ve sessizlikler önce önerilir, kullanıcı uygular.

**Bitti sayılması:** Türkçe ve İngilizce sabit test kümesinde doğruluk ve zaman hatası raporlanır. Kesilmiş, hızlandırılmış ve yavaşlatılmış aynı projede SRT ile yanmış altyazı uyumludur. Metin silme ekran/kamera/ses/zoom/maskeleri birlikte günceller; tek undo ile geri döner. Çevrimdışı mod ağ isteği yapmaz.

### Faz 6 — Görsel kalite, mobil kaynaklar ve çıktı · Zorluk: yüksek · Bağımlılık: 2–5

- Gölge yönü/mesafe/yumuşaklık, ayrı inset/border, gelişmiş gradyan, Unsplash arama ve portable stil dosyası.
- Yerel upscale ve debanding araştırması; görüntü kalitesi/hız/bellek ölçümü. Özel eğitimli rakip modelin aynısını vaat etmeyen, ölçülen kalite seçenekleri.
- macOS USB iPhone/iPad kaydı, model/orientasyon uyumlu frame'ler; cihaz kaydında otomatik touch/click telemetry vaat edilmez.
- Ek FPS değerleri, export presetleri, tahmini dosya boyutu, sonucun panoya kopyalanması, PNG kare alma, ham medya çıkarma, performans/preview kalitesi ayarı.
- Finder/Quick Look ve platform eşdeğerleri; tek uygulama üzerinden güncelleme.

**Bitti sayılması:** 720p/1080p/1440p/4K, yatay/dikey/kare MP4 ve GIF matrisi gerçek dosyalarla incelenir; donanım encode yokken doğru fallback vardır. İptal sıfır baytlık hedef üretmez. Kaynak kalitesi ile yapay iyileştirme ayrımı görünür. USB cihazlar fiziksel test edilir; platform kısıtları ayarda açıklanır.

### Faz 7 — Taşınabilir proje ve isteğe bağlı paylaşım · Zorluk: çok yüksek · Bağımlılık: 0 ve 6

- Medya/görseller/fontlar/telemetry/transcript ile paketleme; dışa taşıma öncesi eksik dosya kontrolü. Yerel paket bulutsuz çalışır.
- Kayıt sonunda hızlı teslim, video linki, streaming oynatıcı, başlık/thumbnail, bağlantı yönetimi.
- Özel erişim, süre/erişim iptali; zamanlı yorumlar, açılıp kapanabilir izlenme ölçümü; düzenlenebilir proje linki.
- Upload devam/iptal, kota, saklama süresi ve silme; backend depolama/bant genişliği maliyeti. Bulut altyapısı veya ücretli servis bu planla kurulmuş sayılmaz.
- Hesap/lisans/takım konusu ürün kararı olarak ayrı tasarlanır; yerel editörün gereksiz hesap zorunluluğuna dönüşmesi önerilmez.

**Bitti sayılması:** Paket başka bilgisayarda mutlak yol gerektirmeden açılır ve aynı çıktıyı üretir. Proje/asset arşivinde API anahtarı ve yerel kullanıcı sırrı yoktur. Yetkisiz istek özel linke erişemez; iptal edilmiş link tekrar izlenemez. Yorum zamanı çıktı zamanıdır. Ağ kesintisi yerel projeyi bozmaz.

### Faz 8 — Referansın gelecek kapsamı · Zorluk: çok yüksek · Bağımlılık: 0–7

Çoklu klip/media bin, bağımsız slaytlar, giriş/çıkış animasyonları, ekran görüntüsünden video, daha gelişmiş anotasyon, Raycast/URL otomasyonu ve takım yönetimi ayrı epiklerdir. Güncel özellik eşdeğerliğinin tamamlandığını göstermek için bunları bitmiş gibi işaretlemeyeceğiz; envanterde unutulmadan takip edilecekler.

## 4. Mimaride korunacak kararlar

1. Electron korunur. Capture, cihaz, yerel AI ve OS entegrasyonları native adaptörler üzerinden ilerler; yeni framework göçü bu planın parçası değildir.
2. Preview ve export için ortak sahne/timing değerlendirmesi kullanılır. Etkiler sadece CSS önizlemesine eklenmiş sayılmaz.
3. Kamera/ses/ekran dosyaları yeniden işlenebilir kaynaklar olarak korunur; maske, zoom ve stil proje tanımıdır.
4. Mutlak dosya yolları yerine taşınabilir manifest ve varlık kimlikleri; eski projeler için açık migration.
5. Üç platformda capability tablosu: desteklenmeyen işlev gizlenir veya neden kullanılamadığı açıklanır. Windows/Linux gerçek cihaz testinden geçmeden “tam destek” denmez.
6. Kayıt ve kurgu offline çalışır. Model indirme, TTS, cloud transcript, Unsplash ve paylaşımın ağ/veri gönderme davranışı ilgili eylemde anlaşılır olmalıdır.
7. Tek uygulama kopyası ve sabit konum devam eder. Ad-hoc geliştirme imzasının izin sorununu tekrar tekrar kullanıcıya taşıyan yayın düzeni kalıcı çözüm sayılmaz.

## 5. UX yerleşimi

Mevcut yeni grafit/lila tasarım korunur. Özellik sayısı arttıkça sağ tarafa sonsuz kontrol eklenmez:

- **Kayıt:** kaynak, alan, kamera, mikrofon ve sistem sesi tek hazırlık alanı; kayıt sırasında yalnızca çekim kontrolü. Prompter ayrı, kayda girmeyen yüzey.
- **Kurgu:** seçili öğenin ayarları; medya/metin eklemek için açılır varlık alanı. Kamera, altyazı, maske ve kısayol kanalları kullanıldığında timeline'a gelir.
- **Ses:** dalga formu ve kanal bazlı kontroller; ham/işlenmiş karşılaştırması.
- **Transkript:** altyazı düzenlemesi ile video kesimi ayrı eylemler; öneriler uygulanmadan önce önizlenir.
- **Paylaş:** dosya export, panoya kopya, link ve proje paketi tek teslim penceresinde farklı seçenekler. Çıktı ölçüsü ve tahmini sonuç başlamadan görünür.
- **Komut paleti:** araç/ayar arama; kısa yol ve mevcut seçim bağlamını gösterme. Klavye ile erişilebilir durumlar, focus sırası ve reduced motion korunur.

## 6. Test ve tamamlanma kapıları

- Mevcut 96 birim ve 64 masaüstü/görsel kontrol korunacak; yeni algoritmalar anlamlı veri kümeleri ve gerçek çıktı dosyalarıyla sınanacak.
- Capture matrisi: Mac Apple silicon; hedefe alınırsa Intel; Windows 11; Linux X11 ve Wayland. Harici ekran, farklı DPI, pencere taşıma, cihaz kopması, düşük disk ve uyku/uyanma dahil.
- 5/30/60 dakika senaryoları; bellek, CPU/GPU, dropped frame, disk kullanımı ve senkron kayması kayda alınacak. Gerçek donanım olmadan başarılı etiketlenmeyecek.
- Görsel matris: 16:9, 9:16, 1:1, 4:5; farklı çözünürlük ve FPS; aynı proje preview/export karşılaştırması.
- Özellikle maske sızıntısı, çift imleç, altyazı/ses kayması, export'ta yanlış kanal, iptal sırasında hasarlı dosya ve güncellemede izin kaybı negatif testleri.
- Her fazın teslimi çalışan UI, geriye uyumlu kaydet/aç, gerçek export ve kısa kanıt raporu gerektirir. Yalnızca buton eklenmesi “bitti” sayılmaz.

## 7. Efor, bağımlılıklar ve onay sınırı

Takvim taahhüdü şu aşamada verilmez. Kamera/cutout, yerel STT/upscale, üç platformun capture davranışı ve bulut paylaşımı ayrı büyük iş paketleridir. İlk fazın prototip/ölçüm çıktıları sonrasında daha güvenilir efor aralığı çıkarılır. Sabit gün sayısı verip donanım ve servis belirsizliklerini saklamak doğru olmaz.

Dış bağımlılıklar: yayın sertifikaları, test cihazları, yerel model lisansları/dağıtım boyutları, müzik ve font hakları, varsa Unsplash anahtarı ve bulut depolama/kimlik sağlayıcısı. Bunlar ihtiyaç duyulan fazda somutlaştırılacak; bu plan hesap açma, ücretli hizmet satın alma, kayıt yükleme veya yayına alma işlemlerini gerçekleştirmez.

**Önerilen onay:** Önce Faz 0–2 ile güvenilir kayıt, hareket ve gizlilik; ardından Faz 3–5 ile ses/kamera/transkript; sonra Faz 6–7 ile kalite, mobil ve teslim. Faz 8 gelecek kapsamı olarak takip edilir. Kullanıcı 18 Ekim 2026 tarihinde kapsamı onayladı; Faz 0 uygulaması başladı. Tamamlanan işler kabul kanıtlarıyla güncellenecek.

## 8. Resmi kaynaklar

- **S01:** [Ana sayfa / güncel ürün tanıtımı](https://screen.studio/)
- **S02:** [Rehber konu dizini](https://screen.studio/guide)
- **S03:** [Alan kaydı](https://screen.studio/guide/recording-area)
- **S04:** [Webcam ve mikrofon](https://screen.studio/guide/webcam-microphone)
- **S05:** [Kayıt sırasında yönetim](https://screen.studio/guide/managing-recording-in-progress)
- **S06:** [Konuşmacı notları](https://screen.studio/guide/speaker-notes-)
- **S07:** [Dinamik sürüm notları — tarayıcıda okundu](https://screen.studio/changelog)
- **S08:** [iPhone/iPad kaydı](https://screen.studio/guide/recording-iphone-ipad)
- **S09:** [Zoom ekleme ve düzenleme](https://screen.studio/guide/adding-editing-zooms)
- **S10:** [Anlık zoom](https://screen.studio/guide/instant-zoom)
- **S11:** [Animasyonlar](https://screen.studio/guide/animations)
- **S12:** [İmleç ayarları](https://screen.studio/guide/cursor)
- **S13:** [Click sesi](https://screen.studio/guide/mouse-click-sound)
- **S14:** [Videoda kısayol gösterimi](https://screen.studio/guide/shortcuts)
- **S15:** [Typing bölümlerini hızlandırma](https://screen.studio/guide/speed-up-typing-segments)
- **S16:** [Dinamik kamera düzenleri](https://screen.studio/guide/dynamic-camera-layouts-)
- **S17:** [Kamera ayarları](https://screen.studio/guide/camera-settings)
- **S18:** [Arka plan müziği](https://screen.studio/guide/background-music)
- **S19:** [Altyazılar](https://screen.studio/guide/captions)
- **S20:** [Yol haritası / beta ve gelecek işler](https://screen.studio/roadmap)
- **S21:** [Arka plan ve çerçeve](https://screen.studio/guide/background)
- **S22:** [Stil paylaşma](https://screen.studio/guide/sharing-preset)
- **S23:** [Maske ve highlight](https://screen.studio/guide/adding-a-mask-and-highlight)
- **S24:** [Komut menüsü](https://screen.studio/guide/command-menu)
- **S25:** [Kareyi görsel kopyalama](https://screen.studio/guide/copy-current-frame-as-an-image)
- **S26:** [Çıktı ayarları](https://screen.studio/guide/explanation-of-export-settings)
- **S27:** [Paylaşım bağlantıları](https://screen.studio/guide/shareable-links)
- **S28:** [Proje paylaşma](https://screen.studio/guide/sharing-your-project)

Yerel kanıtlar: `docs/VERIFICATION.md`, `docs/EDITOR-REFRESH.md`, `src/hooks/useScreenRecorder.ts`, `electron/ipc/handlers.ts`, `electron/native/ScreenCaptureKitRecorder.swift`, `src/components/video-editor/types.ts`, `projectPersistence.ts`, `autoZoom.ts`, `videoPlayback/cursorRenderer.ts`, `AudioInspector.tsx`, `StylePresets.tsx`, `src/lib/exporter/`, `src/lib/video/outputSettings.ts`. Yeni plana “var” işareti, yalnızca ilgili UI/kod temelinin bulunmasıyla verildi; platform ve kalite kapıları ayrıca korunuyor.
