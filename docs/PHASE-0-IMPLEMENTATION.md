# Faz 0 uygulama günlüğü — 18 Ekim 2026

## İlk teslim: proje koruma

- Düzenlemeler 2,5 saniyelik debounce ile cihazdaki recovery dizinine yazılır. Sürekli düzenleme sırasında 10 saniyelik checkpoint, pencere odağı kaybında ek kayıt vardır. Taslak durumu araç çubuğunda gösterilir; hata olursa elle kaydetme ve tekrar deneme gerekir.
- Manuel kayıt, hedefi değiştirmeden önce önceki sağlam projeyi ayrı yedekte saklar. Aynı projeye ait yazma işlemleri sıraya alınır. Dosya verisi sync edildikten sonra atomik rename yapılır; API çağrısının tamamlanması beklenir.
- Açılış ekranındaki “Taslaklar ve yedekler” alanı cihazdaki kayıtları listeler. Kurtarma kopya olarak açılır, kaydedilmemiş sayılır ve özgün dosyanın üzerine kendiliğinden yazılmaz. Kaynak medya taşınmışsa açıklayıcı hata gösterilir.
- Kaydedilen projeye ve taslağa opsiyonel oynatma konumu eklendi. Var olan v1 projeler bu alan olmadan açılır; henüz proje v2/taşınabilir manifest geçişi yapılmadı.
- Başarılı kayıt ilgili taslakları temizler. Bozuk bir mevcut dosya son sağlam yedeği ezmez. Kurtarma dosyalarına erişim kimlik formatıyla sınırlı; dosya adı renderer'dan alınmaz. Proje dışındaki oturum alanları kaydedilmez.

## Kanıt

- 103 birim testi geçti; tip kontrolü başarılı. Büyük projelerin manuel kaydı ve önceki sürüm yedeği, otomatik taslağın 40 MB sınırından etkilenmez.
- 40 masaüstü smoke kontrolü geçti; MP4 dışa aktarım, proje kaydetme/açma ve temel kurgu akışları doğrulandı.
- `scripts/phase0-recovery-runner.cjs` üretim UI'sında ayrı test profiliyle proje kaydeder, değiştirir, otomatik taslak bekler ve test sürecini **SIGKILL** ile kapatır. İkinci süreç açılışta taslağı bulur; kopyayı kurtarır, 2,5 sn oynatma konumunu geri yükler, yeni proje kaydeder ve özgün dosyanın byte düzeyinde aynı kaldığını doğrular. Sonraki kayıt önceki sürümü yedekler; kurtarılan taslak temizlenir.
- Bu test, **kurgu taslağının süreç çökmesinden kurtarılmasıdır**. Kayıt sürerken ham ekran/kamera/ses dosyalarının kurtarılması ve elektrik kesintisine dayanıklılık henüz sağlandı sayılmaz.

## Yerel teslim

- Güncel paket aynı `release-source-fix/mac-arm64/ScreenMovie.app` konumuna yerleştirildi; önceki paket Çöp Sepeti'ne taşındı. Proje klasöründe ikinci uygulama kopyası oluşturulmadı.
- Paket imzası `codesign --verify --deep --strict` ile doğrulandı. Ad-hoc imza kullanılıyor; kalıcı geliştirici sertifikası ve noterleme tamamlanmadı.
- macOS arayüzünde aynı uygulamanın mevcut ekran kaydı erişimi yenilenip yeniden başlatıldı. Kaynak seçicide “Ekran kaydı izni açık”, 1 ekranın önizlemesi ve 15 pencere görüldü.

## Sıradaki Faz 0 işleri

- Kayıt oturumu journal'ı ve browser kayıt parçalarının bellekte biriktirilmeden diske yazılması.
- Native dosya/kamera/ses kurtarma ve ortak pause/resume zaman modeli.
- Eksik medyayı yeniden bağlama, taşınabilir varlık manifesti ve proje v2 migration.
- Kalıcı dağıtım imzası/güncelleme; sertifika dış bağımlılığı ve gerçek platform/donanım matrisi.

## İkinci teslim: kayıt parçaları ve kesintiden kurtarma

- Browser/MediaRecorder akışı bütün videoyu RAM'de biriktirmek yerine yaklaşık saniyelik parçaları ana sürece iletir. Yazımlar sıralıdır; sıra numarası, parça boyutu ve gönderen pencere doğrulanır. Ham dosya fsync edildikten sonra byte uzunluğu ve sıra numarası atomik journal'a yazılır. Onaylanmamış bir kuyruk kuyruğu kurtarılmış sayılmaz.
- Renderer'da bekleyen parça verisi 32 MB ile sınırlandırılır. Disk yetişmezse, yazım başarısızsa veya boş alan 64 MB altına düşerse browser kaydı durdurulur; diske ulaşmış görüntü korunur. Bu eşik bir işletim sistemi disk kotası değildir.
- Açılış ekranındaki **Yarım kalan kayıtlar**, aktif çekimleri dışarıda bırakarak kesilen kayıtları sunar. Kurtarma yalnızca onaylanan byte önekini işler, MP4/H.264 + AAC üretir ve ilk video karesini decode ederek kontrol eder. Bölge seçimi oturumda saklanır; sonradan seçilen başka bir kaynağın crop'u uygulanmaz. Ham dosyalar işlem hatasında ve başarılı kurtarma sonrasında korunur.
- macOS ScreenCaptureKit yardımcısı 1 saniyelik movie fragment ve en fazla 1 saniyelik keyframe aralığıyla yazar. Ayrı mikrofon dosyası varsa o da fragment kullanır; journal video/mikrofon yollarını ve kayıt bölgesini saklar. Ana sürecin stdin bağlantısı kapanınca yardımcı kaydı finalize edip çıkar. Uygulama yeniden açıldığında mevcut okunabilir fragmanlar kurtarmaya sunulur.
- Apple'ın [movieFragmentInterval belgesi](https://developer.apple.com/documentation/avfoundation/avassetwriter/moviefragmentinterval), yarıda kalan dosyanın okunabilmesi için fragment yazımını açıklar. Bu mekanizma her donanımda en fazla 2 saniye kayıp garantisi değildir; gerçek native kesinti testinde ölçülmesi gerekir.

- Gerçek kayıt kontrolünde bulunan izin bağımlılığı giderildi: erişilebilirlik izni ekran kaydının ön koşulu olmaktan çıkarıldı. İzin yoksa native kaynak standart imleci içerir; ayrı cursor telemetry toplama başlatılmaz. Ekran kaydı izni zorunluluğu korunur.

- Native gerçek kesinti testinde sabit ekranda son görüntü zamanının ilerlemediği görüldü. Son kareyi monotonic saatte 500 ms aralıklarla tekrar yazan heartbeat eklendi; endSession artık ham host timestamp yerine videonun sıfırdan başlayan zamanını kullanır.

### İkinci teslimin doğrulamaları

- 108 birim testi: sıralı append, yeni instance ile journal okuma, sıra ihlalinde mevcut verinin korunması, bozuk/boş journal, aktif oturumun gizlenmesi, hatalı kurtarmada ham dosyaların korunması ve native ses/video dosyalarının saklanması dahil.
- `scripts/recording-recovery-runner.cjs`: üretim arayüzünde canvas videosu + gerçek WebAudio sesinden MediaRecorder kaydı başlatır. En az 5 parça diskte onaylandıktan sonra süreç **SIGKILL** ile kapanır; recorder.stop çağrılmaz. Yeni süreçte açılış panelinden kurtarma yapılır; editörde en az 4 saniyelik 640×360 video ve MP4'te AAC ses kanalı doğrulanır. Kurtarma listesi temizlenir, ham WebM saklanır.
- Swift yardımcıları yeni fragment ayarlarıyla başarıyla derlendi. Windows WGC ve Linux native FFmpeg yollarının journal entegrasyonu bu teslimde tamamlanmadı; tüm platformlar için kesinti dayanıklılığı iddia edilmiyor.
- Kamera ayrı kanal kurtarması, devam eden cursor telemetry checkpoint'leri, ortak monotonic pause/resume saati, uyku/uyanma ve tam proje v2 hâlâ Faz 0 kapsamındadır. Önceki “sıradaki” listesinin journal/browser maddesi bu teslimle kısmen uygulandı.

### Gerçek macOS kesinti ölçümü

- Son paket gerçek ScreenCaptureKit kaydıyla test edildi. Erişilebilirlik izni verilmeden, mevcut ekran kaydı izniyle çekim başladı ve HUD küçüldü.
- Yalnızca testin native yardımcısı SIGKILL ile kapatıldı. 26,947 saniyelik journal başlangıcı→kesinti aralığında ham MP4'ün 26,000 saniyesi FFmpeg tarafından okunabildi. Bu denemede yaklaşık 0,947 saniye fark ölçüldü; başlangıç gecikmesini de içerir ve bütün cihazlar için garanti sayılmaz.
- Ölçüm: `artifacts/native-recovery-cut.json`. İlk native denemede statik ekranda kısa kalan süre bu ölçümden önce heartbeat ile düzeltildi.

- Ölçülen native kayıt açılıştaki “Kaydı kurtar” düğmesinden başarıyla açıldı; editör süresi 26,0 sn. Sonraki normal başlat→durdur denemesi de 7,1 sn video olarak editörde açıldı. Tamamlanan her iki oturumun journal kaydı temizlendi; ham dosyalar korunuyor. Rapor: `artifacts/native-recovery-report.json`.
- Son paket aynı tek uygulama konumunda; mevcut ekran kaydı izni yenilendi. 108 birim testi ve 40 masaüstü smoke kontrolü başarılı.

## Üçüncü teslim: duraklatma, ortak zaman ve UI düzeltmeleri

- Ana süreçte `RecordingClock`, duvar saati yerine monotonic saatle aktif süreyi hesaplar. HUD ve cursor/click zamanları bu saati kullanır; duraklamada olay örnekleri alınmaz. Native ACK'inde helper'ın ölçtüğü aktif süreye hizalanır. Kayıt sırasındaki geri alınan sistem saati değişiklikleri timeline'a eklenmez.
- macOS helper video, sistem sesi ve ayrı mikrofonu aynı host-clock başlangıcına göre yeniden zamanlar; önceki bağımsız audio başlangıçları kaldırıldı. Duraklama aralığında buffer ve heartbeat yazılmaz, devam edildiğinde toplam duraklama süresi bütün kanallardan düşülür. Geçişler capture queue üzerinde onaylanır; resume'dan eski queued buffer'lar elenir.
- Browser akışında gerçek MediaRecorder pause/resume olayları beklenir. Aynı anda iki geçiş engellenir; geçiş başarısızsa iki farklı zaman çizelgesiyle yazmaya devam etmek yerine çekim durdurulur. Hızlı çift tıklamalar ve geç kalan HUD sorguları geçişi geri çeviremez.
- Kompakt kayıt çubuğuna pause/play düğmesi, amber duraklama göstergesi ve HUD odaktayken Space kısayolu eklendi. Stop, duraklatılmış kaydı da tamamlar. WGC ve bağımsız native FFmpeg motorlarında düğme desteklenmediği açıklanarak devre dışıdır; bu motorlar için pause desteği tamamlandı sayılmaz.
- Kayıt hazırlanırken işlem göstergesi gösterilir, kaynak/çözünürlük/ses/içe aktarma ayarları kilitlenir; native durdurmada pencere işlem mesajını kesmeyecek boyuta döner.
- Dar inspector'da köşe/gölge/padding değerleri tek sütuna alındı; sayısal değerler sıkışmaz. Timeline boş lane ipuçları daha okunaklı; boş video/ses ipuçları çevrildi. Birbirine yakın son zaman etiketleri birleştirildi, son süre ondalıklı gösterilir. Başlık ana videoyu da sayar: “1 video · N düzenleme”.
- Kurtarma listesinde uzun adlar, işlem düğmesi, spinner, hata yenileme ve klavye odağı iyileştirildi. Details aç/kapa tercihi yeniden render'da zorla sıfırlanmaz.

### Üçüncü teslim doğrulaması

- 110 birim testi ve dil dosyası yapısal kontrolü geçti. Monotonic saat testi 10 duraklama ve tekrarlanan geçişleri kapsıyor.
- Gerçek üretim renderer/hook'u ile canvas videosu + WebAudio ses kaynağı kullanıldı (`scripts/pause-workflow-test.cjs`). 10 pause/resume, 20 sayaç/HUD donma kontrolü ve Space kısayolu geçti. Yaklaşık 6,941 sn wall akışında aktif saat 3,985181 sn, çıktı 3,985333 sn; H.264 + AAC doğrulandı. Bu sonuç fiziksel mikrofon/system-loopback/cursor kare senkron testi yerine geçmez.
- Altı görsel yerleşim kontrolü: 1200/960/800 px pencerede export düğmesi erişimi, inspector okunabilirliği, önizleme sınırları ve portrait oranı geçti.
- Güncellemeden önce açık, kaydedilmemiş kullanıcı düzenlemesi `projects/Acik-Duzenleme-2026-10-18-1600.screenmovie` dosyasına kaydedildi; UI “Değişiklik yok” durumunda kapatıldı.
- Fiziksel Windows/Linux, ayrı kamera ve çoklu cihaz gecikme matrisi bu teslimde tamamlanmadı. Faz 0 bütünü tamamlandı olarak işaretlenmedi.
- Ekran seçicinin odak yenilemesinde listeyi kaldırıp ilk tıklamayı kaybettirmesi giderildi. İlk açılış dışındaki yenileme mevcut liste/seçim üstünde çalışır; in-flight odak istekleri birleşir, yenileme düğmesi bekleme sırasında kilitlenir. Ayrı üretim UI testi (`scripts/source-refresh-test.cjs`) bunu doğrular.
- Son smoke koşusunda 40 masaüstü kontrolünün tamamı ve 24 pause-workflow kontrolü geçti; görsel kontroller 6/6. Paket aynı uygulama konumunda güncellenir; yeni bir aktif uygulama kopyası oluşturulmaz.

### Native ses zamanlaması regresyon kontrolü

- İlk sistem sesli native denemede kontrol düğmeleri çalışmasına rağmen çıktı süresi aktif sayaçtan kısa kaldı; bu deneme başarı olarak sayılmadı (`artifacts/native-pause-initial-failure.json`).
- Audio retiming, toplam PCM buffer süresini tek örnek süresi olarak kullanmak yerine bütün `CMSampleTimingInfo` girdilerini ve örnek sürelerini korur; yalnızca PTS/DTS kaydırılır. Audio girişlerinde geri giden/tekrarlanan PTS elenir. Host zamanı CoreMedia host clock'tan alınır. [Apple örnek zamanları belgesi](https://developer.apple.com/documentation/coremedia/cmsamplebuffergetsampletiminginfoarray(_:entrycount:arraytofill:entriesneededout:)).
- `python3 scripts/test-native-audio-timing.py`, üretimdeki Swift fonksiyonunu doğrudan alıp gerçek 48 kHz/stereo/960 frame PCM CMSampleBuffer üzerinde çalıştırır. 10 kaydırmada 20 ms toplam süre ve örnek başına 1/48000 sn korundu; özgün buffer değişmedi.
- Writer tamamlanmadığında mevcut ham dosyanın varlığı artık “başarılı tam kayıt” sayılmaz. Oturum kurtarmaya bırakılır. Sayısal capture tanılama bilgileri video yanındaki `.capture.json` dosyasına yazılır; ağ üzerinden iletilmez.
