# BytePlus ModelArk API ile görsel ve poster entegrasyon planı

Tarih: 27 Ekim 2026

Durum: İlk görsel/poster API entegrasyonu uygulandı. Oluştur ekranında BytePlus seçimi, model/boyut/poster ayarları, anahtar yönetimi, ücretsiz istek önizlemesi, yerel bütçe ve sonuç kurtarma mevcut. Birim testleri ve izole Electron testi sahte API yanıtlarıyla doğrulandı. Gerçek üretim API'si çağrılmadı; deneme kredisi kullanılmadı. Kullanım: `docs/BYTEPLUS_KULLANIM.md`.

Bu belgenin aşağıdaki bölümleri uygulamanın tasarım kararlarını ve sonraki aşamaları korur. Canlı kalite karşılaştırması, katman ayırma, toplu üretim ve Seedance video henüz yapılmadı.

## 1. Hedef ve karar

Mevcut Marka/Creative Studio akışına BytePlus Seedream sağlayıcısı eklemek; marka bilgisi, ürün referansları ve mevcut tasarım kurallarından tek bir poster üretmek. İlk sürümde Seedream 5.0 Flash aday varsayılanıdır; kalite ve hesap erişimi canlı denemeyle doğrulanmadan kesin varsayılan yapılmaz. Yerel araçlarla kullanılan mevcut akış korunur ve ücretli sağlayıcıya sessiz geçiş yapılmaz.

Seçilen yol doğrudan ModelArk REST API'sidir. Lumina, Canvas Pro, AI MediaKit proxy'si ve ECS SDK'sı entegrasyon kapsamı dışındadır. Poster tasarım bilgisini projedeki skill sağlar; üretimi Seedream yapar. Lumina'nın hazır poster aracına erişim bu projenin bağımlılığı veya araştırma engeli değildir.

Uçtan uca akış:

`Creative Studio → marka/ürün + poster kuralları → Electron IPC → ModelArk API → yerel dosya → galeri/proje`

Poster üretimi için yerel agent/CLI çalıştırılması zorunlu olmayacak. Mevcut diğer sağlayıcılar ayrı seçenekler olarak korunacak.

## 2. Gönderilen SDK ekranının değerlendirmesi

Ekranda BytePlus Elastic Compute Service, API sürümü 2020-04-01, Java/Maven bağımlılığı `byteplus-java-sdk-v2-ecs`, AK/SK kimlik doğrulaması ve `DescribeInstances` örneği görülüyor. Bu SDK sanal sunucu yönetimi içindir. Görsel üretimini sağladığına dair bir bilgi içermiyor.

Bizim Electron/TypeScript uygulamasında bu Java SDK'sı kurulmayacak. Seedream için ModelArk'ın belgelenmiş HTTP API'si kullanılacak:

`POST https://ark.ap-southeast.bytepluses.com/api/v3/images/generations`

Kimlik doğrulama ModelArk API anahtarıyla `Authorization: Bearer ...` olacaktır. ECS ekranındaki AccessKey/SecretKey ile bu API anahtarı birbirinin yerine kullanılmayacak. İlk sürüm için yeni SDK bağımlılığına veya ECS sunucusu açmaya ihtiyaç yok.

## 3. Mevcut projedeki dayanaklar

- `electron/imageStudio.ts`: Üretim IPC işleyicisi, çalışan iş yönetimi, iptal ve Codex/Gemini yönlendirmesi var.
- `electron/geminiClient.ts`: Sağlayıcıya özel istek/yanıt dönüşümü örneği var.
- `electron/geminiKeys.ts`: Electron safeStorage ile anahtar saklama örneği var.
- `src/components/image-studio/AIStudioPanel.tsx`: Sağlayıcı, referans, çözünürlük ve üretim arayüzü var.
- `src/components/creative-studio/CreativeStudio.tsx`: Marka ve ürün bağlamı ile `imageSkillContext()` üretim paneline aktarılıyor.
- `src/lib/imageGenerationSettings.ts`: Ortak 1K/2K/4K seçenekleri ve kısa tasarım kuralları var.
- `src/lib/imageUsage.ts`: Codex/Gemini için token kullanım türleri var; görsel adedi ve para birimi için genişletilmeli.
- `src/components/creative-studio/skill/`: Format, marka kimliği, motor profilleri ve dekupe rehberleri bulunuyor.

Bu incelemede tüm Markdown rehberlerinin çalışma sırasında otomatik yüklendiği doğrulanmadı. Entegrasyonda etkin prompt zinciri izlenmeli; kuralların yalnızca dosyada bulunması yeterli sayılmamalı.

## 4. Poster skill'inin tasarımı

Kullanıcı girdisi: poster türü, ürün, amaç, hedef kanal/oran, görünür metinler, varsa teklif/fiyat ve referanslar.

İlk poster türleri:

1. Ürün tanıtımı: Ürün odakta, kısa başlık, sınırlı destek metni.
2. Kampanya/indirim: Kullanıcının verdiği teklif önde; tarih ve koşullar yalnızca sağlandıysa kullanılır.
3. Etkinlik: Başlık, tarih, yer ve çağrı hiyerarşisi.
4. Serbest marka posteri: Kullanıcının brief'i ve marka görsel dili.

Prompt hazırlama sırası:

1. Kullanıcı talimatı ve kesin görünür metinler.
2. Marka renkleri, ton ve ürün bilgisi.
3. Sırası ve rolleri belirlenmiş ürün/logo/stil referansları.
4. Seçilen poster türünün kompozisyon ve yazı hiyerarşisi kuralları.
5. Seedream modelinin desteklediği boyut ve çıktı ayarları.

BytePlus yolunda prompt, uygulama içindeki deterministik şablonlarla hazırlanır; üretim için Codex/Gemini agent oturumu veya ek bir metin modeli çağrısı gerekmeyecek. Kullanıcı isterse mevcut prompt hazırlama araçlarını önceden kullanabilir. Uzun rehberlerin tamamı her isteğe eklenmez; ilgili kurallar seçilir, fakat ürün bilgileri ve kullanıcı kısıtları özet sırasında kaybedilmez.

İki çıktı yaklaşımı planlanır:

- İlk sürüm: Metin dahil tek raster poster. Türkçe, fiyat ve logo doğruluğu kullanıcı incelemesine sunulur; prompt koruma talimatı doğruluk garantisi sayılmaz.
- Sonraki sürüm: AI arka plan/ürün sahnesi üretir, kesin başlık ve fiyat uygulamada düzenlenebilir metin katmanları olarak yerleştirilir. Metin düzeltmesi için yeniden üretim ihtiyacını azaltır. Mevcut editör katman yetenekleri uygulamadan önce incelenir.

## 5. Teknik uygulama adımları

### A. Sağlayıcı ve anahtar

- `electron/byteplusClient.ts`: Saf payload hazırlama, yanıt doğrulama, hata eşleme ve tek üretim isteği.
- `electron/byteplusKeys.ts`: safeStorage tabanlı kaydetme/durum/silme. Güvenli saklama yoksa düz metne düşmeden oturum belleği kullanma.
- IPC kayıtları, preload, global Electron tipleri ve ayarlar güncellenir. Anahtar loglara, proje dosyasına veya prompt'a yazılmaz; üretim anahtarı renderer'a geri verilmez.
- İlk kullanım kişisel ModelArk anahtarıyla olur. Ortak ücretli anahtarla çok kullanıcılı dağıtım gerekirse sunucu üzerinden kota ve kimlik kontrolü ayrı aşamadır.

### B. Modele göre yetenekler

İlk uygulanacak API sözleşmesi:

- Adres: `POST /api/v3/images/generations`, sabit ModelArk HTTPS ana adresi üzerinden Electron ana sürecinden çağrılır.
- Başlıklar: `Authorization: Bearer <ModelArk API key>` ve `Content-Type: application/json`.
- Alanlar: `model`, birleştirilmiş `prompt`, modele uygun `size`, varsa `image`, `response_format: "url"`, `stream: false` ve açık watermark tercihi.
- İlk model adayı: `dola-seedream-5-0-flash-260915`; hesap erişimi yoksa kullanıcıya bildirilir, otomatik olarak başka ücretli modele geçilmez.
- İlk işlem çeşitleri: metinden tek görsel, referanslardan tek görsel, mevcut görseli talimatla düzenleme. Düzenleme isteğinde en az bir kaynak referans zorunludur.
- Başarı: dönen görsel verisi ve kullanım bilgisi doğrulanır; çıktı indirilir ve mevcut proje varlık biçimine dönüştürülür.
- Fatura görsel tarifesine göre tahmin edilir; yanıtta token sayısının bulunması token bazlı ücret varsayımı oluşturmaz.

- Sağlayıcı/model yetenek tablosu oluşturulur; ortak 1K/2K/4K listesi Seedream'e körlemesine gönderilmez.
- Flash/Pro ve Lite'ın boyut, çoklu üretim ve düzenleme farkları arayüze yansıtılır. Desteklenmeyen ayar açıkça gösterilir; sessiz boyut/model değiştirilmez.
- İlk sürüm tek çıktı ve mevcut uygulamanın referans sınırıyla başlar. Flash'ta desteklenmeyen seri üretim parametreleri gönderilmez.
- Referanslar mevcut data URL girdilerinden, dosya türü ve boyut kontrolleri sonrası API'ye aktarılır. Görsel rolü prompt'ta sırasıyla açıklanır.
- Dönen gerçek boyut, istenen boyuttan ayrı kaydedilir. Önizleme için küçültme veya sonradan büyütme native üretim olarak gösterilmez.

### C. Üretim ve dosya teslimi

- Mevcut üretim handler'ına açık `byteplus` dalı eklenir; seçilmeyen sağlayıcı çağrılmaz.
- İş durumları: hazır, gönderiliyor, sonuç alınıyor, kaydediliyor, tamamlandı, başarısız, sonucu belirsiz.
- Tek requestId için eşzamanlı/tekrar gönderim engellenir; işlem kaydı uygulama yeniden açıldığında da korunur. Bu yerel kontrol, sağlayıcı tarafında belgelenmemiş idempotency desteği varmış gibi sunulmaz.
- Ağ zaman aşımı/bağlantı kopması sonrası otomatik yeni üretim yapılmaz. Görsel API'sinde geçmiş sonucu requestId ile sorgulama desteği ayrıca doğrulanmadığından, belirsiz sonuç açıkça gösterilir.
- İptal, sağlayıcının işlemi durdurduğu veya ücretin iptal edildiği anlamına gelmez. Dönen ücretli sonuç mümkünse kurtarılabilir varlık olarak saklanır.
- Sonuç hemen yerel proje/galeri depolamasına alınır; geçici URL tek kalıcı kayıt olarak tutulmaz. İndirme başarısızsa önce indirme yeniden denenir, üretim çağrısı değil.
- Görsel indirme boyut/tür/süre sınırlarıyla yapılır; API anahtarı çıktı indirme adresine gönderilmez.

### D. Maliyet ve deneme koruması

- Üretim öncesinde model, çıktı adedi ve tahmini USD bedeli gösterilir.
- Kullanım kaydı: model ID, fiyat kaynağı/tarihi, istek kimliği, çıktı adedi, gerçek boyut, süre, raporlanan tokenlar, tahmini maliyet ve varsa sağlayıcının bildirdiği kullanım.
- Hesapta kalan deneme kredisi okunamıyorsa bilinmiyor gösterilir; uygulama tahmini sağlayıcının kesin faturası veya gerçek bakiye gibi sunulmaz.
- Oturum bütçesinde eşzamanlı işler için tutar ayrılır; belirsiz sonuçlarda rezerv hemen serbest bırakılmaz.
- Başarılı eski sonucu yeniden açmak ücretli üretim yapmaz. Bilerek yeni varyasyon istemek ayrı üretimdir.
- Yerel önizleme ve doğrulama modu hiçbir üretim endpoint'ine bağlanmaz. Anahtar kaydetme veya ayarlar ekranı açma üretimi tetiklemez.

## 6. Doğrulama ve küçük canlı test planı

Önce ücretsiz/sahte yanıtlarla:

- Sağlayıcıya göre boyut ve payload doğrulaması.
- Türkçe görünür metinlerin ve referans sırasının korunması.
- 401/403, kota, güvenlik filtresi, bozuk yanıt ve zaman aşımı durumları.
- Çift tıklama ve uygulama yeniden açılışında tekrar gönderim engeli.
- İndirme hatasının yeni üretim başlatmaması.
- Kullanım ve bütçe hesabının doğru gösterilmesi; anahtarın log/proje dosyasına sızmaması.
- Codex/Gemini akışının korunması.

Canlı test yalnızca kullanıcı bu araştırma aşamasından üretim testine geçilmesini istediğinde yapılır. Önce konsoldan kredi tutarı, son kullanım tarihi, geçerli model/bölge/API ve paket bitince ücretlendirme koşulları kontrol edilir.

Önerilen ilk paket:

1. Üç brief: ürün tanıtımı, Türkçe başlıklı kampanya, referansla düzenleme.
2. Her brief için Flash ve Lite'ta birer sonuç: toplam altı görsel.
3. Mevcut araştırma liste fiyatlarıyla yaklaşık $0,159 çıktı bedeli; hesap koşulları ve güncel fiyat üretimden önce yeniden doğrulanır.
4. Ölçütler: Türkçe metin, ürün/logo sadakati, yerleşim, süre ve kullanılabilir sonuç başına toplam maliyet. Farklı çözünürlüklerin kalite karşılaştırmasına etkisi kaydedilir.
5. Otomatik varyasyon/yeniden deneme yok. Sonuçlar değerlendirilmeden test genişletilmez.

Çıkış ölçütü: Çıktı projeye kaydedilebiliyor, tüketim izleniyor, tekrar gönderim kontrolü çalışıyor ve hangi işlerde hangi modelin seçileceği ölçülen sonuçlarla belirleniyor.

## 7. Video: ikinci aşama

Görsel akışı doğrulandıktan sonra seçilmiş görseli Seedance ile hareketlendirme eklenir. Video ayrı bir sağlayıcı iş türüdür; görsel API'si üzerinden yapılmaz.

- Açık model seçimi, kısa süre, düşük çözünürlük ve mümkünse sessiz başlangıç.
- Asenkron görev oluşturma, task ID'yi kalıcı saklama, durum sorgulama ve sonucu indirme.
- Yeniden açılışta mevcut görevi sorgulama; yeni görev oluşturmama.
- Video girdisi uzunluğu, çıktı süresi/çözünürlüğü ve model tarifesine göre maliyet tahmini.
- Yüz içeren referansların erişim koşulları ve çıktı codec uyumluluğu kontrolü.
- İndirilen videoyu mevcut medya/timeline akışına aktarma.

İlk görsel test bütçesine video üretimi dahil değildir; video denemesi ayrıca planlanır.

## 8. Açık kalan konular

- Hesaptaki deneme hakkının tam kapsamı ve uygun modeller.
- ModelArk model erişimi, bölge ve hız sınırları.
- Flash'ın bizim marka/ürün örneklerimizde Lite/Pro'ya göre gerçek kalite farkı.

Bu konular uygulamanın sahte yanıtlarla geliştirilmesini engellemez; canlı test öncesi hesap koşulları doğrulanır.

## 9. Uygulama sırası ve teslimler

1. API istemcisi, model yetenek tablosu ve anahtar saklama: test doubles ile çalışır; canlı çağrı yok.
2. Poster prompt birleştiricisi: marka, ürün, görünür metin ve referans rollerinden son isteği hazırlar. Anahtarsız istek önizlemesi sağlar.
3. Arayüz/IPC bağlantısı: BytePlus seçimi, modele uygun boyutlar, tahmini maliyet ve mevcut galeriye çıktı aktarımı.
4. İş kaydı ve bütçe kontrolleri: çift istek, zaman aşımı ve indirme hatası senaryoları doğrulanır.
5. Sahte API ile uçtan uca doğrulama ve mevcut sağlayıcılarda ilgili gerileme kontrolleri.
6. Kullanıcı canlı denemeye geçilmesini istediğinde sınırlı gerçek API testi ve kalite/maliyet raporu.

İlk teslim kapsamı tek görsel/poster üretimi ve düzenlemedir. Katman ayırma, toplu üretim, uygulamada düzenlenebilir metin yerleşimi ve Seedance video API'si sonraki aşamalardır.

## 10. Resmi kaynaklar

- Doküman merkezi: https://docs.byteplus.com/en/docs
- Görsel API sözleşmesi: https://docs.byteplus.com/en/docs/modelark/image-generation-api
- Model karşılaştırması ve kullanım: https://docs.byteplus.com/en/docs/modelark/image-generation-tutorial
- Güncel ücretler: https://docs.byteplus.com/en/docs/modelark/model-pricing
- Video rehberi: https://docs.byteplus.com/en/docs/modelark/video-generation-tutorial

Doküman merkezi bazı sayfalarda JavaScript gerektiriyor; arama dizinindeki resmi sayfa metinleriyle birlikte incelendi. Hesaba özgü erişim ve canlı davranışlar test edilmedi.
