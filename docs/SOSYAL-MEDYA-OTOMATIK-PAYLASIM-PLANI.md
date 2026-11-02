# Sosyal medyada otomatik paylaşım — araştırma ve plan

Tarih: 31 Ekim 2026
Durum: Yalnızca araştırma. Kod yazılmadı, hiçbir hesaba bağlanılmadı, paylaşım yapılmadı.

## Bugün olan (1. aşama)

Görsel Stüdyo'daki **Plan** sekmesi şunları yapabiliyor:

- Galeriden bir görseli tarihe ve saate planlama
- Platform seçimi ve paylaşım metni ekleme
- Masaüstü hatırlatıcıları
- Paylaşım anında görseli indirme veya kopyalama, metni kopyalama, platform sayfasını açma ve "paylaşıldı" işaretleme

Kayıtlar ana süreçte `userData/share-calendar.json` dosyasında tutuluyor. İlgili dosyalar:

- `electron/shareCalendarStore.ts`
- `electron/shareCalendar.ts`
- `src/lib/shareCalendar.ts`

Otomatik paylaşım bu yapının üzerine kurulacak. Kayıt modeli genişletilecek: kayda hesap kimliği, paylaşım durumu (`publishing`, `published`, `failed`) ve platformun döndürdüğü gönderi kimliği eklenecek.

## 1. LinkedIn

### Hangi API?

- Gönderi oluşturmak için **Posts API** kullanılır: `POST https://api.linkedin.com/rest/posts`. Eski `ugcPosts` API'sinin yerini almıştır.
- Görselli gönderide iki adım vardır. Önce **Images API** ile görsel yüklenir (`initializeUpload` → dönen adrese yükleme → `urn:li:image:{id}`). Sonra bu URN, gönderinin `content.media.id` alanına yazılır. Birden çok görsel için MultiImage API kullanılır.
- Her istekte iki başlık zorunludur:
  - `Linkedin-Version: YYYYMM`
  - `X-Restli-Protocol-Version: 2.0.0`
- Sürümler belirli bir tarihte kapatılıyor. Örneğin 202511 sürümü 16 Kasım 2026'da kapanıyor. Bu yüzden sürüm numarası tek bir sabitte tutulmalı ve düzenli olarak güncellenmeli.
- **Zamanlanmış gönderi desteği yok.** Gönderi oluşturulurken `lifecycleState` için yalnızca `PUBLISHED` kabul ediliyor. Gönderiyi zamanı gelince bizim göndermemiz gerekiyor.

### İzinler ve uygulama onayı

| Hedef | Gereken izin | Nasıl alınır |
| --- | --- | --- |
| Kişisel profil | `w_member_social` (+ kimlik için `openid profile`) | Geliştirici portalındaki self-servis **Share on LinkedIn** ürünü. İnceleme yok. |
| Şirket sayfası | `w_organization_social` | **Community Management API** ürünü. Başvuru ve inceleme gerekir. Kayıtlı bir tüzel kişilik ve ticari kullanım senaryosu isteniyor, bireylere verilmiyor. Onay süresi açıklanmıyor. |

- Şirket sayfası adına paylaşım yapabilmek için yetkiyi veren kişinin o sayfada şu rollerden biri olmalı: `ADMINISTRATOR`, `CONTENT_ADMIN` ya da `DIRECT_SPONSORED_CONTENT_POSTER`. Rolü yoksa API 403 döner.
- Kişinin kendi gönderilerini okuma izni (`r_member_social`) kısıtlı. Bu yüzden "paylaşıldı mı?" kontrolü, gönderi oluştururken dönen `x-restli-id` değerinin saklanmasına dayanmalı.

### OAuth ve token'lar

- Akış: Authorization Code. Varsayılan olarak access token 60 gün geçerli.
- Programatik refresh token (1 yıl) yalnızca onaylı Marketing Developer Platform ortaklarına veriliyor. Bu yüzden Share on LinkedIn ile başlarsak kullanıcının yaklaşık her 60 günde bir yeniden bağlanması gerekecek. Arayüz bunu süresi dolmadan önce haber vermeli.
- Token değişimi `client_secret` istiyor. Masaüstü uygulamasının içine gömülen gizli anahtar güvenli sayılmaz. İki seçenek var:
  1. **Küçük bir arka uç (önerilen):** Yalnızca kodu token'a çeviren ve token yenileyen bir uç. Token'lar yine cihazda saklanır.
  2. **Kendi uygulamanı getir:** Kullanıcı kendi LinkedIn uygulamasının kimliğini ve gizli anahtarını girer. Teknik kullanıcılar için olur, genel kullanıcı için zor.
  - LinkedIn'in yerel uygulamalar için PKCE desteğinin bizim ürün paketimizde geçerli olup olmadığı başvuru sırasında doğrulanmalı.
- Geri dönüş adresi: Sistem tarayıcısında oturum açılıp `http://127.0.0.1:<rastgele port>/callback` adresinde geçici bir yerel dinleyici kullanılır. Bu adres LinkedIn uygulamasına kayıtlı olmalı. Gömülü web görünümünde oturum açtırılmamalı, LinkedIn de bunu önermiyor.

## 2. Instagram

### Koşullar

- Hesap **profesyonel hesap** (Business ya da Creator) olmalı. Kişisel hesaplara API ile paylaşım yapılamaz.
- İki giriş yolu var:
  - **Instagram Login:** `instagram_business_basic` ve `instagram_business_content_publish` izinleri. Facebook sayfası gerekmez.
  - **Facebook Login for Business:** `instagram_basic`, `instagram_content_publish` ve `pages_show_list` izinleri. Instagram hesabının bir Facebook sayfasına bağlı olması gerekir.
- Başka kullanıcıların hesaplarında çalışmak için Meta'nın **App Review** sürecinden geçmek ve gerektiğinde **Business Verification** tamamlamak gerekiyor. Geliştirme modunda yalnızca uygulamaya rol olarak eklenmiş hesaplar kullanılabilir.

### Yayınlama akışı

1. `POST /{ig-user-id}/media` ile bir container oluşturulur: `image_url` ve `caption` parametreleriyle. Hikâye için `media_type=STORIES`, Reels için `REELS` + `video_url` kullanılır.
2. `POST /{ig-user-id}/media_publish` ile `creation_id` yayınlanır.

- **`image_url` herkese açık olmalı:** Meta görseli kendi sunucusundan indiriyor. Masaüstündeki bir `data:` adresi ya da yerel dosya bu yüzden kullanılamaz. Görselin kısa ömürlü, herkese açık bir adrese yüklenmesi gerekiyor (S3/R2 için önceden imzalanmış adres ya da kendi arka ucumuz). Yayından sonra silinebilir.
- Desteklenen biçim JPEG. PNG çıktısını yüklemeden önce JPEG'e çevirmek ve en-boy oranını Instagram sınırlarında (4:5 – 1.91:1) tutmak gerekiyor. Hikâye ve Reels için 9:16 kullanılır.
- Limit: Hesap başına **24 saatte 100 API gönderisi**. Kalan hak `GET /{ig-user-id}/content_publishing_limit` ile öğrenilebilir.
- Instagram API'sinde de zamanlanmış gönderi yok. Gönderiyi zamanı gelince biz tetikleyeceğiz.
- Token'lar: Uzun ömürlü kullanıcı token'ı yaklaşık 60 gün geçerli ve süresi dolmadan yenilenebiliyor. Yenileme işi zamanlayıcıya eklenmeli.

## 3. Token'ların saklanması (safeStorage)

Projede Gemini, BytePlus ve Modelion anahtarları için kullanılan yapı aynen uygulanır (`electron/geminiKeys.ts`):

- Her hesap için `userData/social-accounts/<platform>-<hesapId>.bin` dosyası. İçerik `safeStorage.encryptString(JSON.stringify({ accessToken, refreshToken?, expiresAt, scopes, author }))` olur.
- Geçici dosyaya yazılıp yeniden adlandırılır, dosya izni `0o600` olur.
- `safeStorage` güvenli değilse kalıcı kayıt yapılmaz. Bu durum Linux'ta `basic_text` arka ucu seçiliyse geçerli. Bağlantı yalnızca oturum boyunca tutulur ve kullanıcıya söylenir.
- Token'lar **asla** renderer'a gönderilmez. Renderer yalnızca `{ platform, hesapAdı, bağlı, süresiDoluyor }` gibi özet bilgiyi görür. Paylaşım isteği ana süreçte yapılır.
- "Bağlantıyı kaldır" düğmesi dosyayı siler ve mümkünse platformda token'ı iptal eder.
- Günlüklere token, yetkilendirme kodu ya da `Authorization` başlığı yazılmaz. Mevcut `audit-secrets` testi bu dosyalar için de genişletilmeli.

## 4. Uygulama kapalıyken paylaşım nasıl tetiklenir?

LinkedIn ve Instagram API'lerinin ikisinde de zamanlanmış gönderi olmadığı için gönderiyi zamanı gelince bir sürecin göndermesi gerekiyor. Seçenekler:

| Seçenek | Artı | Eksi |
| --- | --- | --- |
| **A. Tepside çalışan uygulama** (bugünkü hatırlatıcı zamanlayıcısı) | Ek altyapı yok, token cihazdan çıkmaz | Bilgisayar kapalıysa ya da uykudaysa paylaşım olmaz |
| **B. A + oturum açılışında arka planda başlatma** (`app.setLoginItemSettings`, kullanıcı açarsa) | Yeniden başlatmadan sonra da çalışır | Bilgisayar kapalıyken yine paylaşmaz |
| **C. A + macOS `powerSaveBlocker` / uyandırma** | Uyku sırasında kaçırma azalır | Kapak kapalıyken güvenilir değil, pil tüketir |
| **D. Sunucu tarafı zamanlayıcı** (kendi arka ucumuz + kuyruk) | Bilgisayar kapalıyken de paylaşır | Token'lar sunucuda saklanmak zorunda. Barındırma, güvenlik ve KVKK yükü getirir |

**Öneri: A + B, gerekirse daha sonra D.**

- Zamanlayıcı bugünkü `ReminderScheduler` yapısını kullanır. Bir kayıt "otomatik paylaş" olarak işaretlenmişse, zamanı geldiğinde hatırlatma yerine yayınlama işi başlar.
- **Geç kalınan paylaşım otomatik gönderilmez.** Uygulama paylaşım saatinden bir eşik kadar (ör. 30 dk) sonra açıldıysa paylaşım kendiliğinden yapılmaz. Kullanıcıya "Şimdi paylaş / Yeni saat seç / Elle paylaştım" seçenekleri sunulur. Böylece eski bir kampanyanın yanlış günde çıkması engellenir.
- **Aynı paylaşımın iki kez yapılmasını önlemek için:**
  - Yayından önce kayıt `publishing` durumuna alınır ve diske yazılır.
  - Platformdan dönen gönderi kimliği hemen saklanır.
  - Uygulama yayın sırasında çökerse kayıt `publishing` durumunda kalır. Sonraki açılışta paylaşım otomatik olarak tekrar denenmez, kullanıcıya sorulur. BytePlus iş defterindeki (`byteplusJobs.ts`) "belirsiz" durumla aynı yaklaşım.
- **Hata durumunda:**
  - Kayıt `failed` olur ve hata Türkçe olarak gösterilir. Örnekler: "LinkedIn bağlantısının süresi doldu, yeniden bağlan", "Instagram günlük paylaşım sınırına ulaşıldı".
  - Masaüstü bildirimi gönderilir.
  - 429 ve 5xx hatalarında birkaç kez artan aralıklarla yeniden denenir. 401 ve 403 hatalarında yeniden denenmez.
- D seçeneğine geçilirse sunucu token'ları şifreli saklamalı ve cihazdaki kayıt yalnızca durum bilgisini tutmalı. Bu ayrı bir güvenlik incelemesi gerektirir.

## 5. Önerilen uygulama sırası

1. **Hesap bağlama altyapısı:**
   - `electron/socialAccounts.ts` (safeStorage deposu, OAuth geri dönüş dinleyicisi)
   - Ayarlar'da "Bağlı hesaplar" bölümü
   - Gerçek hesapla deneme yalnızca kullanıcı onayıyla, test hesabında ve geliştirme modundaki uygulamayla yapılır.
2. **LinkedIn kişisel profil** (`w_member_social`): Görsel yükleme, gönderi oluşturma, gönderi kimliğini saklama. Bu adım başvuru gerektirmediği için ilk adım olarak uygun.
3. **Takvim kaydına "Otomatik paylaş" seçeneği:** Hesap seçimi, paylaşım öncesi önizleme, geç kalınan paylaşım kuralı, `publishing/published/failed` durumları.
4. **Instagram:** Önce geçici herkese açık görsel barındırma çözümü kurulur, sonra Meta App Review ve Business Verification yapılır.
5. **LinkedIn şirket sayfası:** Community Management API başvurusu yapılır. Şirket bilgileri ve kullanım senaryosu gerekir, onay süresi belirsiz.
6. İsteğe bağlı: Oturum açılışında başlatma seçeneği (B) ve sunucu zamanlayıcısı (D) değerlendirmesi.

## 6. Test yaklaşımı

- Birim testlerinde platform API'leri sahte HTTP yanıtlarıyla çalıştırılır. 401, 403, 429 ve ağ hatası durumları denenir. Yarım kalan `publishing` durumu ve geç kalınan paylaşım kuralı test edilir.
- İzole Electron testinde (`scripts/*-test.cjs` deseni) OAuth geri dönüşü yerel sahte sunucuyla taklit edilir. Gerçek ağa çıkılmaz.
- Gerçek hesapla deneme ayrı, elle çalıştırılan bir betikte yapılır ve yalnızca kullanıcı onayıyla çalıştırılır.

## Kaynaklar

- LinkedIn Posts API: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api>
- LinkedIn MultiImage API: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api>
- LinkedIn refresh token'ları: <https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens>
- LinkedIn organik gönderi kullanım senaryosu: <https://learn.microsoft.com/en-us/linkedin/marketing/usecases/page-management/organic-posts-usecase>
- Instagram içerik yayınlama: <https://developers.facebook.com/docs/instagram-platform/content-publishing>
- Instagram Login ile yayınlama: <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing>
- IG User Media referansı: <https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media>
- Üçüncü taraf özet (Community Management uygunluk koşulları; resmi belgeyle doğrulanmalı): <https://www.upload-post.com/how-to/post-to-linkedin-company-page-api/>
