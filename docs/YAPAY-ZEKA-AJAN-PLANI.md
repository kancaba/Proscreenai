# Tıklama zoom'u ve yerel yapay zeka ajanları planı

Tarih: 19 Ekim 2026. Durum: Faz A, Faz B'nin otomatik altyazı kısmı ve Faz C–E (yapay zeka ajanı) yapıldı ve 19 Ekim 16:32 paketinde. Aşağıdaki "Mimari" bölümü ilk plandır; gerçekte yapılan "Faz C–E durumu" bölümünde.

İki iş var:

1. Kayıttan sonra tıklanan yerlere otomatik zoom (Screen Studio benzeri).
2. Kullanıcının kendi bilgisayarında kurulu Claude Code, Codex, Cursor, Gemini gibi yapay zeka araçlarıyla otomatik altyazı, zoom ve kurgu.

İkinci iş runhq'daki "agent tools" özelliğinden esinleniyor. Oradaki kod `upstream/main` dalında (`crates/runhq-core/src/agents`, `packages/agent-runtime`, `docs/AGENT_TOOLS.md`); kullanılan desenler aşağıda ScreenMovie'ye uyarlandı.

---

## 1. Tıklanan yerlere otomatik zoom

### Bugünkü durum

Özellik zaten var ve yeni kayıtta kendiliğinden çalışıyor:

- Kayıt sırasında imleç 33 ms'de bir örnekleniyor. Tıklamalar uiohook ile ayrı olaylar olarak `<video>.cursor.json` dosyasına yazılıyor (`click`, `double-click`, `right-click`).
- Editör açılınca `buildAutoZoomSpans` (`src/components/video-editor/autoZoom.ts`) tıklamaları gruplayıp zoom bölgeleri üretiyor (`VideoEditor.tsx` ~L865).
  - Zoom ilk tıklamadan 0,9 sn önce başlıyor ve son tıklamadan 2,4 sn sonra bitiyor.
  - 2,5 sn içindeki yakın tıklamalar tek zoom'da birleşiyor.
- Timeline'daki "Zoom öner" düğmesi aynı veriyi elle kullanıyor.

### Neden çalışmıyor görünebilir

1. **Erişilebilirlik izni yok.** macOS'ta imleç ve tıklama takibi bu izin olmadan hiç başlamıyor (`handlers.ts:2386`). Uygulama yeni Apple Development kimliğiyle imzalandı, bu yüzden izin yeni kimliğe yeniden verilmeli. İzin yoksa telemetri dosyası boş kalıyor ve hiç zoom üretilmiyor; kullanıcıya da bir şey söylenmiyor.
2. **Proje açılınca atlanıyor.** Kayıt kaydedilmiş bir proje olarak açılırsa, içinde zoom olmasa bile otomatik zoom çalışmıyor.
3. **Geri bildirim yok.** Kaç tıklama bulunduğu ve kaç zoom eklendiği gösterilmiyor.

### Faz A durumu (19 Ekim, kaynakta yapıldı, paketlenmedi)

- [x] HUD'da izin uyarısı: Erişilebilirlik izni yoksa üst satırda "Tıklama zoom'u kapalı · İzin ver" çıkar (2 sn'de bir kontrol edilir). Düğme sistem iznini ister, gerekirse Ayarlar'ı açar. Kayıt izinsiz de yapılabilir.
- [x] Kayıttan sonra editörde bildirim: "3 tıklama bulundu, 3 zoom eklendi". "Kaldır" düğmesi zoom'ları kaldırır (⌘Z ile geri gelir), "Ayarla" düğmesi Hareket sekmesindeki ayarlara gider. Tıklama yoksa ve izin eksikse "Bu kayıtta tıklama verisi yok" ve "İzin ver" gösterilir.
- [x] Hareket sekmesinde "Otomatik zoom" ayarları (`AutoZoomControls.tsx`, `autoZoomSettings.ts`, cihaz başına `localStorage`):
  - Kapalı / Tıklamalar / + Duraklama.
  - Yoğunluk: Az / Normal / Çok (birleştirme aralığı 4 / 2,5 / 1,5 sn).
  - Zoom derinliği (1,25×–5×).
  - "Zoom'ları bu ayarlarla yeniden oluştur" düğmesi; ⌘Z ile geri alınır.
- [x] Zoom'u olmayan bir proje açılınca "Bu projede zoom yok. Tıklamalardan N zoom eklensin mi?" önerisi çıkar. Zoom'lar kendiliğinden eklenmez.
- [x] Önceden var olan bir hata düzeltildi: aynı videonun projesi yeniden açılınca editörde video süresi 0'da kalıyordu.
- [x] Test: `npx electron scripts/auto-zoom-test.cjs` (14 kontrol). Smoke 40, timeline-tools, text-effects ve region-workflow yeniden geçti; 151 birim testi, typecheck ve i18n temiz.
- [x] **İzin kurulumu (19 Ekim, kullanıcı geri bildirimi):** Tıklamalar yalnızca izin verildikten sonra başlayan kayıtlarda takip edilebiliyor, sonradan eklenemiyor. Bu yüzden:
  - Açılış ekranında "Kuruluma iki izinle başlayın" kartı gösteriliyor (`PermissionSetupPanel.tsx`). Ekran kaydı ve tıklama takibi durumları 2 sn'de bir yenileniyor, "İzin ver" düğmeleri var; iki izin de verilince kart gizleniyor.
  - Tıklama takibi kapalıyken Kaydet'e basılırsa kayıt başlamadan önce sistem penceresi açılıyor: "İzin ver" (macOS listesine ekler ve Ayarlar'ı açar, kayıt başlamaz) / "İzinsiz kaydet" / "Vazgeç", ayrıca "Bir daha sorma" kutusu.
  - Test: `npx electron scripts/click-permission-test.cjs` (9 kontrol, izin yokmuş gibi çalışır; kayıt başlatma yalnızca sayılır).
- [ ] Kalan: paketlenmiş uygulamada gerçek kayıtla kabul testi (5 tıklama, zoom'lar tıklama zamanlarında, önizleme ve export aynı).
- [ ] Ertelendi: klavye etkinliği aralıkları (Girdi İzleme izni gerekir), yazı imlecinde (`text`) daha uzun tutma. Uzak tıklamalar zaten ayrı bölgelere bölünüyor ve "Zoom'ları bağla" açıkken aralarında kaydırma yapılıyor.

Bu faz yapay zekaya bağlı değil ve tek başına yayınlanabilir.

---

## 2. Yerel yapay zeka ajanları ile otomatik düzenleme

### Fikir

Kullanıcı kendi hesabıyla kurduğu aracı seçer: Claude Code, Codex, Cursor Agent, Gemini CLI veya OpenCode. ScreenMovie API anahtarı istemez ve yapay zeka maliyeti üstlenmez; işlem kullanıcının kendi aboneliğinden yürür.

Kullanıcı hazır bir görev seçer ya da kendi isteğini yazar, örneğin:

- "Altyazı ekle"
- "Sessizlikleri kes"
- "Önemli yerlere zoom yap"
- "Bekleme anlarını hızlandır"

Ajan, ScreenMovie'nin sunduğu araçlarla projeyi okur ve bir **değişiklik önerisi** hazırlar. Kullanıcı öneriyi timeline'da görür ve kabul eder ya da reddeder.

### Temel kısıt: ajanlar videoyu izleyemez

Bu ajanlar video ve ses işleyemez; metin, JSON ve (bazıları) tek tek görüntüler okuyabilir. Bu yüzden önce **yerel analiz katmanı** gerekir. Bu katman videoyu ajanın okuyabileceği verilere çevirir:

| Veri | Kaynak | Durum |
|---|---|---|
| Tıklama ve imleç olayları | `.cursor.json` | Var |
| Kelime zamanlı transkript | Yerel konuşma tanıma (aşağıda) | Yok |
| Sessiz aralıklar ve ses seviyesi | FFmpeg `silencedetect` / `ebur128` | Yok |
| Sahne değişimi ve hareketsiz aralıklar | FFmpeg `scdet` / kare farkı | Yok |
| Düşük çözünürlüklü kareler | İstek üzerine tek kare PNG | Yok |
| Klavye etkinliği aralıkları | Faz A'daki isteğe bağlı kayıt | Yok |

**Transkript (otomatik altyazının temeli):**

- **macOS:** Apple'ın cihaz üzerinde çalışan konuşma tanıma API'si `SpeechAnalyzer`, **`DictationTranscriber`** modülüyle (macOS 26+), yeni bir Swift helper üzerinden kullanılır. Model sistem tarafından indirilir, uygulamaya eklenmez. Yeni uzun konuşma modeli `SpeechTranscriber` Türkçeyi desteklemiyor (aşağıdaki "Faz B ön doğrulama").
- **Whisper kullanılmayacak** (kullanıcı kararı, 19 Ekim): ek model indirmesi yok. Seslendirme (metinden sese) mevcut Modelion Ema Lightning entegrasyonuyla devam eder. Windows/Linux'ta otomatik altyazı şimdilik kapsam dışı; Modelion'un belgelenmiş bir ses→metin API'si olmadıkça varsayılmaz.
- Transkript, ajan olmadan da işe yarar: ham altyazı doğrudan oluşturulabilir. Ajan bunu temizler, satırlara böler, vurgular ve çevirir.

### Faz B ön doğrulama: Apple konuşma tanıma ve Türkçe (19 Ekim)

Bu Mac'te ölçüldü: macOS 27.0.1, Xcode Swift 6.2.3. Betikler `scripts/speech-eval/` klasöründe.

**Dil desteği:**

| API | Türkçe | Not |
|---|---|---|
| `SpeechTranscriber` (yeni, uzun konuşma) | **Yok** | 45 dil destekleniyor, `tr` aralarında değil; `supportedLocale(equivalentTo: tr-TR)` boş dönüyor |
| `DictationTranscriber` (yeni API, dikte modeli) | **Var**, bu Mac'te kurulu | Kelime zamanı (`audioTimeRange`) ve güven puanı veriyor. Komut satırından izin istemeden çalıştı |
| `SFSpeechRecognizer` (eski API) | Var, cihaz üzerinde | Konuşma tanıma izni (TCC) ve Info.plist açıklaması gerekir |

**Ölçüm:**

- **Ses kaynağı:** macOS'un Türkçe "Yelda" sesiyle üretilen 53 kelimelik metin. 7 cümle, aralarında 0,8 sn sessizlik; her cümlenin gerçek başlangıç ve bitişi biliniyor. Aynı ses pembe gürültüyle ve 8 kez arka arkaya (5 dk, 424 kelime) da denendi.
- **Hız:** 38 sn ses 1,1–1,5 sn'de, 5 dk ses 7,4 sn'de çözüldü (yaklaşık 25–40 kat gerçek zamandan hızlı).
- **Doğruluk:** ham kelime hata oranı %16–21. Hataların çoğu yazım farkı:
  - "ScreenMovie" → "screen Movie";
  - "bin seksen piksele" → "1080 piksel'e";
  - ekler ayrı parça olarak dönüyor ("aktar" + "ıyoruz"); parçalar boşluk durumuna göre birleştirilmeli.

  Gerçek tanıma hatası 53 kelimede 2: "kaydının" → "kaydını" ve "kayıt" → "kayıp". Özel kelime listesi (`AnalysisContext.contextualStrings`) marka adını düzeltmedi.
- **Noktalama yok:** `.punctuation` seçeneği açık olsa da Türkçe çıktıda nokta ve virgül gelmedi. Cümlelere bölme sessizliklerden yapılmalı; noktalama ve büyük harf düzeltmesi ajan ya da basit kurallarla yapılmalı.

**Kelime zamanları (hedef ±150 ms):**

| Durum | Cümle başı | Cümle sonu |
|---|---|---|
| 38 sn, temiz | 6/6, en fazla 30 ms | 4/7 (sonlar ~+150 ms geç) |
| 38 sn, gürültülü | 6/6, en fazla 60 ms | 7/7 |
| 5 dk, tek parça | 31/45, en fazla **974 ms** | 37/52 |
| 5 dk, ≤30 sn parçalara bölünmüş + sessizliğe yapıştırma | **51/51, en fazla 7 ms** | **56/56, en fazla 127 ms** |

Tek parça uzun seste bir bölümde (190–212 sn) metin doğru kaldı ama kelime zamanları birkaç saniyeye sıkıştı. Bu, altyazının o bölümde kaymasına yol açar.

**Sonuç ve karar:**

- macOS'ta Türkçe transkript için `DictationTranscriber` kullanılabilir. Kurulum gerektirmiyor, hızlı, ve doğru işlendiğinde zamanlama hedefi tutuyor.
- Helper şu adımları uygulamalı:
  1. Sesi sessizliklerden ≤30 sn parçalara bölmek.
  2. Her parçayı kendi başlangıç zamanıyla çözmek.
  3. Cümle başı ve sonlarını sessizlik tespitine yapıştırmak (`scripts/speech-eval/chunked.py`, `snap.py`).
  4. Sessizlik eşiğini gürültü seviyesine göre ayarlamak: sabit -40 dB, gürültülü seste hiç sessizlik bulamadı.
- **Açık sorular:**
  - Gerçek insan sesi ve mikrofon kaydıyla tekrar ölçülmeli (TTS sesi temiz ve düzenli).
  - Helper ScreenMovie içinden başlatıldığında izin istenip istenmediği uygulama içinde doğrulanmalı.
  - Türkçe dikte modeli kurulu olmayan bir Mac'te `AssetInventory` indirmesinin süresi ve boyutu ölçülmeli.

### Faz B durumu: otomatik altyazı (19 Ekim, kaynakta yapıldı, paketlenmedi)

- [x] **Swift helper** `electron/native/SpeechTranscriberHelper.swift` → `openscreen-speech-transcriber` (`build-native-helpers.mjs` listesinde).
  - `DictationTranscriber` ile parçaları cihaz üzerinde çözer; model yoksa `AssetInventory` ile indirir.
  - Çıktısı satır başına bir JSON (`assets` / `chunk` / `done` / `error`).
  - Desteklenmeyen dil ve macOS 26 öncesi için açık hata kodları verir.
- [x] **Ana süreç** `electron/transcription.ts`, IPC `transcribe-video`, `cancel-transcription`, `transcription-progress`:
  1. FFmpeg ile 16 kHz mono ses çıkarılır.
  2. Gürültüye uyarlanan eşikle konuşma aralıkları bulunur.
  3. Ses ≤30 sn parçalara bölünür (geçici WAV dosyaları, iş bitince silinir).
  4. Helper çalıştırılır; Türkçe ek parçaları birleştirilir; cümle başı ve sonları sese yapıştırılır.
  - Pencere kapanınca veya iptal edilince işlem süreç olarak durdurulur. Video yolu `resolveReadableMediaPath` ile doğrulanır. 2 saatten uzun video reddedilir.
- [x] **Saf modüller** (`src/lib/captions/`, 11 birim testi):
  - `speechSegmentation.ts`: seviye, konuşma tespiti, parçalama, ek birleştirme, yapıştırma.
  - `captionCues.ts`: duraklamada yeni satır, en fazla 84 karakter ve 6 sn, Türkçe büyük harf, kesilen aralıklardaki altyazıyı çıkarma.
- [x] **Editör:** AI sekmesinde "Otomatik altyazı" bölümü (`AutoCaptionsSection.tsx`, `useAutoCaptions.ts`).
  - Dil seçimi (Türkçe/İngilizce), aşama ve ilerleme göstergesi, Vazgeç düğmesi.
  - Altyazılar "Alt yazı" hazır stiliyle eklenir ve `generatedBy: "transcript"` ile işaretlenir.
  - Yeniden çalıştırınca eskilerin yerini alır. Tek ⌘Z ile ya da bildirimdeki "Geri al" ile geri alınır.
  - Sekme değiştirmek işlemi durdurmaz; video değişince iptal edilir.
- [x] **Test:** `npx electron scripts/auto-captions-test.cjs` (14 kontrol, Türkçe "Yelda" sesiyle 23 sn video).
  - 5 cümlenin altyazısı 1,3 sn'de oluştu; başlangıç sapmaları 7–22 ms; anahtar kelimelerin hepsi tanındı.
  - Yeniden çalıştırma, geri alma ve iptal de doğrulandı.
  - Smoke 40, otomatik zoom 14, yazı efektleri 4, timeline araçları 10, alan iş akışı 5 kontrol yeniden geçti; 162 birim testi, typecheck ve i18n temiz.
- [ ] **Kalan:**
  - Gerçek mikrofon kaydıyla deneme.
  - Paketlenmiş uygulamada helper'ın izin istemeden çalıştığının doğrulanması.
  - Noktalama yok; cümle sonu noktası ve virgül sonraki adımda ajan ya da kurallarla eklenecek.
  - SRT/VTT dışa aktarma.
  - Sessizlik, sahne ve kare alma analizleri (Faz B'nin geri kalanı).

### Faz C–E durumu: yapay zeka ajanı (19 Ekim, kaynakta yapıldı, paketlenmedi)

AI sekmesinde "Yapay zeka ajanı" bölümü:

- **Araç seçimi:** Bulunan araçlar durumuyla listelenir (hazır / giriş gerekli / kurulu değil / çalışmıyor). Girişi yapılmamış bir araç seçilirse çalıştırılması gereken komut gösterilir ve görev düğmeleri kapanır.
- **Görevler:** Altı hazır görev (Akıllı zoom, Altyazıları düzelt, Sessizlikleri kes, Beklemeleri hızlandır, Bölüm başlıkları, Kısa versiyon) ve serbest istek alanı.
- **Seçenekler:**
  - "Video karelerini paylaş" (varsayılan kapalı).
  - Aracın modelini seçme (isteğe bağlı).
  - Hangi verilerin gönderildiği açıkça yazılır.
- **Çalışırken:** Adımlar canlı listelenir ("Tıklamalar okunuyor", "Zoom önerisi"…); "Durdur" düğmesi vardır.
- **Öneriler:**
  - Türüne göre gruplanır; her biri onay kutusu, zaman aralığı ve gerekçesiyle gösterilir. Tıklayınca o ana gidilir.
  - "Seçilenleri uygula" hepsini tek ⌘Z adımı olarak uygular; "Reddet" de vardır.
  - Uygulamadan önce proje değişmez.
- **Devam isteği:** Aynı oturumla devam eder (Claude `--resume`, Codex `exec resume`, Cursor `--resume`, OpenCode `--session`).
- **Sürekli çalışma:** Sekme değiştirmek görevi durdurmaz. Video değişince ya da pencere kapanınca görev iptal edilir.

**İlk plandan farkları ve nedenleri:**

| Plan | Yapılan | Neden |
|---|---|---|
| Claude Agent SDK, `codex app-server`, ACP | Her aracın kendi başsız modu: `claude -p --output-format stream-json`, `codex exec --json`, `agent -p --output-format stream-json`, `opencode run --format json` | Ek bağımlılık ve Node kurulumu gerekmiyor. Dördü de MCP'yi doğrudan destekliyor ve gerçek çalıştırmayla doğrulandı. |
| stdio MCP sunucusu (`ELECTRON_RUN_AS_NODE`) | Ana süreçte **HTTP MCP sunucusu**: yalnızca 127.0.0.1, rastgele port, her çalıştırmaya özel 48 karakterlik gizli adres, `Origin` başlıklı istekler reddedilir | Ayrı süreç ve asar sorunu yok; tüm araçlar destekliyor. |
| Timeline'da hayalet bölgeler | Panelde onay kutulu liste + o ana gitme | Daha az riskli. Hayalet bölgeler sonraki adım. |
| Gemini CLI / Antigravity | Yok | Bu Mac'te Gemini CLI kurulu değil; Antigravity yalnızca IDE, başsız modu yok. |
| Faz F (dosya tabanlı yedek) | Yapılmadı | Dört araç yapılandırılmış modla çalıştığı için gerek kalmadı. |

**Güvenlik:** Her araç boş bir geçici klasörde çalışır ve iş bitince klasör silinir. Ajanın kendi araçları kapatılır; yalnızca ScreenMovie araçları kullanılabilir:

- **Claude:** `--tools ""`, `--strict-mcp-config`, `--allowedTools mcp__screenmovie`, `--permission-mode dontAsk`.
- **Codex:** `sandbox_mode="read-only"`, `--ignore-user-config`, `--ignore-rules`. Şu özellikler kapatılır: `shell_tool`, `browser_use`, `computer_use`, `apps`, `plugins`, `image_generation`, `multi_agent`, `hooks`. Onaysız çalışma yalnızca ScreenMovie sunucusu için açılır (`default_tools_approval_mode="approve"`).
- **Cursor:** `--mode ask`, `--approve-mcps`, `--trust`, `--workspace <geçici klasör>`.
- **OpenCode:** edit/bash/webfetch reddedilir ve bu araçlar kapatılır.

Diğer önlemler:

- Görev süreç grubu olarak başlar. Durdurulunca SIGTERM, 5 sn sonra SIGKILL gönderilir; görev en fazla 20 dakika sürebilir.
- Uygulama hiçbir kimlik bilgisini okumaz.
- Öneriler ana süreçte doğrulanır: süre, örtüşme, derinlik ve hız değerleri, metin uzunluğu. Hatalı öneri ajana açıklamayla geri döner, ajan düzeltebilir.

**Ajanın araçları (MCP):**

- **Okuma:** `get_project`, `get_clicks`, `get_transcript` (Faz B transkripti, önbellekli), `get_pauses`, `get_frame` (yalnızca izin verildiyse, görev başına en fazla 40 kare).
- **Öneri:** `propose_zooms`, `propose_trims`, `propose_speed`, `propose_captions`, `propose_text`.
- **Kontrol:** `review_proposals`, `clear_proposals`.

**Kod:**

- `src/lib/agent/`:
  - öneri doğrulama;
  - araç çıktısı ayrıştırıcıları (gerçek çıktı örnekleriyle test edildi);
  - MCP çekirdeği, görevler ve anlık görüntü doğrulama.
- `electron/agents/`: araç bulma, MCP HTTP sunucusu, çalıştırıcı, oturum araçları, IPC.
- Editör tarafı: `AgentPanel.tsx`, `useAgentRun.ts`, `agentApply.ts`.

**Test sonuçları (bu Mac):**

| Araç | Durum |
|---|---|
| Codex 0.163 (ChatGPT uygulamasındaki) | **Tam doğrulandı.** `npx electron scripts/agent-test.cjs` 14/14 kontrol: algılama, giriş uyarısı, Akıllı zoom (18 sn, 2 zoom; tıklamaları kapsıyor, Türkçe gerekçeli), onaydan önce değişiklik yok, devam isteği (bekleyen zoom önerilerini korudu, başlık ekledi), uygula, tek geri al (zoom ve başlık birlikte), Durdur (254 ms). `scripts/agent-tasks-test.cjs`: altı görevin hepsi hatasız (14–21 sn). |
| OpenCode 1.18 (girişsiz ücretsiz model) | **Tam doğrulandı.** `AGENT_TOOL=opencode AGENT_TIMEOUT_MIN=20 npx electron scripts/agent-test.cjs` 14/14 (Akıllı zoom 61 sn). Ücretsiz model yavaş ve gerekçeleri bazen İngilizce yazıyor. İlk denemede devam isteği "Unexpected server error" verdi: OpenCode oturuma yalnızca aynı çalışma klasöründen devam edebiliyor. Her sohbete sabit bir klasör verilerek düzeltildi (24 saat sonra silinir). |
| Claude Code 2.1.295 | Bağlantı doğrulandı: yalnızca ScreenMovie araçları görünüyor, MCP sunucusu bağlı. Görev çalıştırılamadı çünkü bu Mac'teki oturumun süresi dolmuş; uygulama "giriş gerekli" ve `claude` → `/login` gösteriyor. Giriş yapıldıktan sonra `AGENT_TOOL=claude npx electron scripts/agent-test.cjs` ile doğrulanmalı. |
| Cursor Agent 2026.04.17 | Giriş yapılmamış (`agent login`); uygulama bunu gösteriyor. Komut satırı ve çıktı ayrıştırıcısı yazıldı ama gerçek görevle **test edilmedi**. |

**Bu turda düzeltilen yan hatalar:**

- **Geri alma birleşmesi:** Aynı türden iki değişiklik 400 ms içinde gelince (kaydırıcı sürükleme kuralı) "altyazıları uygula" ve "önerileri uygula" önceki adımla birleşiyordu. Bu iki işlem artık her zaman kendi geri alma adımını açıyor (`startNewHistoryStep`).
- **Transkript önbelleği:** Transkript ve sessizlik tespiti dosya sürümüne göre önbelleğe alınıyor (son 3 video). Aynı videoda ajan ve "Otomatik altyazı" sesi yeniden çözmüyor.

**Testler hakkında:** `agent-test.cjs` ve `agent-tasks-test.cjs` gerçek yapay zeka istekleri gönderir ve seçilen aracın hesabından kullanım düşer. Smoke testi, ağır bir testin hemen ardından çalışınca bir kez dışa aktarma süresini (90 sn) aştı; tek başına 40/40 geçti.

**Kalan:**

- Claude ve Cursor ile girişten sonra uçtan uca test.
- Timeline'da öneri önizlemesi (hayalet bölgeler).
- Paketlenmiş uygulamada Finder'dan açılınca araç bulmanın doğrulanması.
- Gerçek kayıtlarla kalite değerlendirmesi.

### Mimari

```
Editör (React)
   │  IPC: agent-detect / agent-run / agent-answer / agent-cancel, olay: agent-event
   ▼
Electron main: AgentManager
   ├─ Araç bulma: PATH + bilinen klasörler, --version yoklaması (5 sn, stdin kapalı)
   ├─ Her görev için bir utilityProcess ("köprü"), NDJSON üzerinden konuşur
   │     adaptörler: claude (Agent SDK) | codex (app-server JSON-RPC) | acp (Cursor, Gemini) | opencode (serve + SSE)
   └─ ScreenMovie MCP sunucusu: ajanın kullanabileceği tek araç seti
         ├─ okuma:  get_project, get_transcript, get_clicks, get_silences, get_scenes, get_frame
         └─ öneri:  propose_zooms, propose_captions, propose_trims, propose_speed, propose_text
                    (doğrudan yazmaz; öneri taslağına ekler)
```

runhq'dan alınan kararlar:

- Komut satırı metnini ayrıştırmak yerine araçların resmî yapılandırılmış arayüzleri kullanılır:
  - Claude Agent SDK, `pathToClaudeCodeExecutable` ile kullanıcının kendi `claude` kurulumu.
  - `codex app-server --listen stdio://`.
  - `agent acp` (Cursor).
  - ACP destekleyen diğer araçlar.
  - OpenCode için `opencode serve`, rastgele port ve parola ile.
- Her görev ayrı bir süreç grubunda çalışır. İptalde önce nazik durdurma denenir, 15 sn içinde bitmezse tüm grup öldürülür.
- Kimlik bilgileri kopyalanmaz, giriş yapılmaz. Kullanıcı `claude login` ve benzerlerini kendisi çalıştırır. "Bağlantıyı test et" düğmesi giriş sorunlarını gösterir.
- Ajanın sorduğu izinler yalnızca aracın sunduğu seçeneklerle cevaplanır.

ScreenMovie'de runhq'dan **farklı** olanlar:

- **Ayrı Node gerekmez.** Electron'un `utilityProcess`'i köprüyü çalıştırır; kullanıcının Node kurması gerekmez.
- **Ajan dosya düzenlemez, komut çalıştırmaz.** runhq kod ajanlarına proje klasöründe tam yetki verir. Burada ajanın çalışma klasörü geçici ve boş bir klasördür; tek yetkisi ScreenMovie MCP araçlarıdır:
  - Claude: yalnızca `mcp__screenmovie__*` araçlarına izin verilir; `canUseTool` diğer her şeyi reddeder.
  - Codex: `sandbox: read-only` ile çalışır.
  - ACP: sadece ScreenMovie MCP sunucusu verilir.
- **MCP sunucusu ScreenMovie tarafından verilir.** runhq hiç MCP sunucusu vermez, burada bu temel parçadır:
  - Claude SDK'da `createSdkMcpServer` ile aynı süreç içinde çalışır.
  - ACP'de `session/new { mcpServers: [...] }` ile stdio sunucusu verilir.
  - Codex'te config override ile verilir. app-server'ın bunu desteklediği ilk iş olarak doğrulanmalı.
  - stdio sunucusu `ELECTRON_RUN_AS_NODE=1` ile ScreenMovie'nin kendi Electron'u üzerinden çalışır. Ana sürece görev başına tek kullanımlık bir jetonla bağlanır.
- **Değişiklik önerisi modeli.** `propose_*` araçları projeyi değiştirmez; bir öneri taslağı biriktirir. Her öneri bir şemaya göre doğrulanır: süreler videonun içinde olmalı, zoom derinliği 1–6, metin uzunluğu sınırlı, kimlik çakışması olmamalı. Geçersiz öneri ajana hata olarak döner, böylece ajan düzeltebilir.

### Kullanıcı deneyimi

1. **Ayarlar → Yapay zeka araçları:** bulunan araçlar listelenir (Kullanılabilir / Bulunamadı / Hatalı). "Bağlantıyı test et", model seçimi ve özel yol girişi buradadır.
2. **Editörde "Yapay zeka" paneli** üç bölümden oluşur:
   - **Hazır görevler:**
     - Otomatik altyazı
     - Akıllı zoom (tıklamalar + konuşma, örneğin "şu butona bakın")
     - Sessizlik ve dolgu kelimelerini kes
     - Beklemeleri hızlandır
     - Bölüm başlıkları ekle
     - Kısa versiyon çıkar
   - **Serbest istek:** "İlk 10 saniyeyi kes ve başa başlık ekle" gibi.
   - **Gönderilecek veri özeti:** "Transkript (1.240 kelime), 34 tıklama, 0 kare". Kare gönderimi varsayılan olarak kapalıdır ve ayrıca açılır.
3. **İlerleme:** ajanın adımları kısa satırlar olarak akar ("Transkript okunuyor", "8 zoom önerildi"). İptal düğmesi vardır.
4. **Öneri görünümü:** önerilen bölgeler timeline'da kesik çizgili "hayalet" bölgeler olarak görünür ve önizlemede oynatılabilir. "Tümünü uygula", tek tek seç ve "Reddet" seçenekleri vardır. Uygulama tek bir geri al adımıdır.
5. **Takip:** "Altyazıları daha kısa yap" gibi devam istekleri aynı oturumla gönderilir. Claude `resume`, Codex thread ve ACP `session/load` bunu destekler.

### Gizlilik ve güvenlik

- Video ve ses dosyası hiçbir zaman ajana verilmez. Yalnızca panelde gösterilen metin verisi ve kullanıcı açtıysa küçük kareler gönderilir.
- Bu veriler kullanıcının seçtiği aracın sağlayıcısına (Anthropic, OpenAI, Cursor, Google) gider. Panelde bu açıkça yazar.
- API anahtarı veya oturum jetonu okunmaz, saklanmaz, loglanmaz. `CLAUDE_CODE_OAUTH_TOKEN` gibi değişkenler alt sürece aktarılmaz; runhq da böyle yapıyor.
- Ajanın stderr çıktısı arayüze ve loglara aktarılmaz; yalnızca hata teşhisi için son 4 KB tutulur.
- Mevcut Modelion entegrasyonu (TTS ve konu yazısı) olduğu gibi kalır; bu ayrı bir yoldur.

### Fazlar

| Faz | İçerik | Kabul ölçütü |
|---|---|---|
| **A** | Tıklama zoom'u: izin kontrolü, bildirim, ayarlar (bölüm 1) | Paketli uygulamada gerçek kayıtta zoom'lar tıklama zamanlarında |
| **B** | Analiz katmanı: transkript helper'ı (`DictationTranscriber`, parçalama + sessizliğe yapıştırma), sessizlik, sahne, kare alma; ajansız "Otomatik altyazı" düğmesi | 5 dk Türkçe kayıtta kelime zamanları ±150 ms; altyazı önizleme ve export'ta aynı |
| **C** | Ajan altyapısı: araç bulma, köprü, Claude ve Codex adaptörleri, MCP sunucusu, öneri şeması | "Akıllı zoom" görevi iki araçla da geçerli öneri üretir; iptal 15 sn içinde süreçleri kapatır |
| **D** | Panel ve öneri görünümü: hayalet bölgeler, uygula/reddet, tek geri al, devam isteği | Uygulanan öneri tek ⌘Z ile tamamen geri alınır |
| **E** | ACP (Cursor, Gemini CLI), OpenCode; hazır görevlerin tamamı | Her araçla en az bir görev uçtan uca çalışır |
| **F** | Dosya tabanlı yedek: yapılandırılmış arayüzü olmayan araçlar için "görev paketi dışa aktar / sonuç JSON'u içe aktar" | Elle düzenlenen sonuç dosyası aynı doğrulamadan geçer |

Önerilen sıra A → B → C → D → E. A ve B'nin ilk kısmı yapay zekasız da değer üretir ve C'nin girdisini hazırlar.

### Riskler ve açık sorular

- **Araç arayüzleri değişebilir.** Codex app-server ve ACP hâlâ hızlı gelişiyor. Önlem: sürüm yoklaması, adaptör başına testler ve bilinmeyen olayları güvenle yok sayma.
- **Antigravity:** bir IDE'dir; bilinen bir komut satırı veya ACP modu yok. Aynı Google hesabıyla Gemini CLI'ın ACP modu kullanılır. İkisi de kurulumdan önce doğrulanmalı.
- **Codex'e MCP verme:** app-server'da görev başına MCP sunucusu verilebildiği doğrulanmalı. Verilemiyorsa Codex için Faz F'nin dosya tabanlı yolu kullanılır.
- **Türkçe konuşma tanıma kalitesi:** Apple `DictationTranscriber` sentetik seste ölçüldü (yukarıda). Gerçek konuşmayla ölçüm bekliyor.
- **Uzun videolar:** 30 dk+ transkript bağlam sınırına yaklaşabilir. MCP araçları sayfalı okuma sunmalı (`get_transcript { fromMs, toMs }`).
- **Süre ve maliyet:** görevler kullanıcının aboneliğinden yürür. Panel tahmini süreyi ve kullanılan token sayısını (araç bildiriyorsa) gösterir.
- **Claude Agent SDK paketi:** uygulamaya bağımlılık olarak eklenir. Lisansı ve boyutu paketlemeden önce kontrol edilmeli.
