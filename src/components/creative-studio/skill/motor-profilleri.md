# Motor Profilleri — Motora Göre Prompt Yazımı

Prompt yazmadan önce hedef motorun bölümünü oku. Bilgiler 2026 sonbaharı itibarıyla derlendi; motorlar hızla güncellenir. Kullanıcı bir motorun beklenenden farklı davrandığını söylerse bu dosyadaki varsayımı değil kullanıcının gözlemini esas al.

## İçindekiler
1. Ortak kurallar (tüm motorlar)
2. Nano Banana ailesi (Gemini)
3. GPT Image ailesi (OpenAI)
4. Z-Image Turbo (yerel / açık kaynak)
5. Diğer yerel modeller (Flux, SDXL vb.)
6. Hızlı karşılaştırma tablosu

---

## 1. Ortak kurallar

- **Fotoğrafçıya brief verir gibi yaz**, anahtar kelime yığını gibi değil. Modern motorlar (Nano Banana, GPT Image, Z-Image) doğal dil cümlelerini anahtar kelime listelerinden çok daha iyi anlar.
- **En önemli şey başta:** Özne (ürün) ve varsa görselde yazacak metin prompt'un ilk cümlelerinde olsun.
- **Somut ol:** "güzel ışık" değil `soft key light from upper left, warm rim light from behind`.
- **Bir prompt'ta 3-5 güçlü görsel fikir.** Daha fazlası birbirini sulandırır.
- **Fotoğraf terminolojisi işe yarar:** lens (85mm, 100mm macro), açı (eye-level, low angle, top-down), alan derinliği, ışık tipleri (softbox, rim light, strip light), renk sıcaklığı (Kelvin).
- **Ürün korunacaksa açıkça söyle:** `Preserve the product exactly as in Image 1: same shape, proportions, label text, logo, colors and materials. Do not redesign or reinterpret the product.`
- **Referans görsellere rol ver:** `Image 1: the product (preserve exactly). Image 2: style reference only (match lighting and color grading). Image 3: brand logo.`

## 2. Nano Banana ailesi (Google Gemini görsel modelleri)

**Sürümler:**
- **Nano Banana 2:** 2026 başından beri Gemini uygulamasında varsayılan model. Hızlı, genel kullanım için iyi.
- **Nano Banana Pro (Gemini 3 Pro Image):** Daha yavaş ama daha keskin; metin içeren, karmaşık yerleşimli, baskıya gidecek işler için tercih edilir.
- **Nano Banana (Gemini 2.5 Flash Image):** İlk sürüm; hâlâ bazı araçlarda bulunur.

**Güçlü yönler:** Talimat takibi, fotoğraf terminolojisini anlama, konuşmalı düzenleme ("kompozisyonu koru, ışığı gün batımına çevir"), birden fazla referans görseli rollerle kullanma, metin yazımı (özellikle Pro).

**Yazım kalıbı:** Akıcı paragraf. Sıra: amaç/tür → özne → sunum → sahne → ışık → kamera → renk/marka → kompozisyon → metin → korunacaklar.

**Negatif prompt:** Gemini uygulamasında ayrı kutu yoktur. Kısıtları prompt'un sonunda pozitif/açık ifadeyle yaz: `Keep the background completely free of text and logos. The product label must remain sharp and legible.` Bazı üçüncü parti arayüzler negatif prompt alanı sunar; varsa ayrıca ver.

**En-boy oranı:** Prompt içinde belirt (`vertical 4:5 composition` / `9:16 vertical format`) ve arayüzde oran seçeneği varsa onu da ayarlamasını söyle.

**Şeffaf arka plan:** Gerçek şeffaflık (alfa kanalı) üretmez; "transparent" denirse dama tahtası deseni çizebilir. Dekupe için: `isolated on a pure solid white (#FFFFFF) background` veya `on a flat chroma green (#00B140) background, no shadows, no reflections` iste; ardından kullanıcı harici bir arka plan silme aracı kullanır.

**Düzenleme modu:** "Edit, don't re-roll" — sonuç %80 iyiyse yeniden üretme, aynı sohbette düzeltme talimatı ver: `Keep everything exactly the same, only make the shadow under the bottle softer and shorter.`

**Örnek iskelet:**
```
A high-end commercial product photograph for an Instagram post, vertical 4:5.
The hero is [product description — material, color, form, label]. [Preservation clause if Image 1 is given.]
The product [presentation: stands on / floats above] [scene element].
Scene: [background from Style Lock].
Lighting: [lighting block from Style Lock].
Camera: [camera block from Style Lock].
Color: brand palette — [HEX] dominant in the background, [HEX] as accent in [where].
Composition: product in the [lower two-thirds / center], clean empty space in the [top third] reserved for text.
[Text block if rendering text.]
[Constraints.]
```

## 3. GPT Image ailesi (OpenAI — ChatGPT ve API)

**Sürümler:**
- **gpt-image-2 (Nisan 2026):** Akıl yürütme ("thinking") modu, en iyi metin yazımı. Şeffaf arka planı **desteklemez**; giriş görsellerini her zaman yüksek sadakatle işler.
- **gpt-image-1.5 (Aralık 2025):** `background: "transparent"` destekler (PNG/WebP çıktı ile) — **gerçek dekupe için tercih edilecek GPT modeli**. Düzenlemede `input_fidelity: low | high` ayarı vardır: high kompozisyonu ve ana öğeleri korur, low daha serbest yorumlar.
- ChatGPT uygulamasında hangi sürümün çalıştığı kullanıcıya görünmeyebilir; API veya üçüncü parti araç kullanılıyorsa parametreleri ayrıca belirt.

**Güçlü yönler:** Uzun talimatları takip etme, metin yazımı, marka tasarım sistemlerine uyum, çoklu görsel birleştirme.

**Yazım kalıbı:** Net, yapılandırılmış doğal dil. Başlıklı bloklar iyi çalışır:
```
Create a photorealistic commercial product image.
Product: …
Presentation: …
Background: …
Lighting: …
Camera: …
Brand colors: …
Composition: …
Text to render exactly: "…"
Constraints: …
```

**Çoklu görsel:** Her girdiyi indeks ve açıklamayla tanımla (`Image 1: product photo. Image 2: style reference.`) ve aralarındaki ilişkiyi yaz (`Place the product from Image 1 into the scene style of Image 2.`).

**Düzenleme cümlesi:** Değişiklik dışındaki her şeyi kilitle: `Change only X. Do not change any other aspect of the image.`

**Negatif prompt:** Ayrı alan yok; kısıtları "Constraints" bloğunda yaz.

**Boyutlar:** gpt-image-1.5 sabit boyutlar kullanır: 1024×1024 (kare), 1536×1024 (yatay), 1024×1536 (dikey). gpt-image-2 daha esnek boyutlar destekler. 4:5 gibi oranlar için en yakın boyutu seç ve kompozisyonda kırpma payı bırakmasını söyle (`keep important elements away from the top and bottom edges to allow cropping to 4:5`).

**Ayarlar bloğunda ver:** model önerisi, `size`, `quality` (taslak için low/medium, final için high), `background` (dekupe → transparent, sadece 1.5), `input_fidelity` (düzenleme → high, sadece 1.5).

## 4. Z-Image Turbo (Alibaba Tongyi-MAI, açık kaynak, yerelde çalışabilir)

**Yapı:** ~6 milyar parametreli, birkaç adımda (≈8) üretim yapan damıtılmış (distilled) model. Yerel kurulumlarda (ComfyUI vb.) ve fal gibi servislerde bulunur. Image-to-image pipeline'ı da vardır.

**Kritik fark — negatif prompt ÇALIŞMAZ:** Resmi Turbo hattı guidance kullanmadığı için negatif prompt kutusu etkisizdir. Bütün kısıtları **pozitif** dille ana prompt'a göm:
- "no blur" yerine → `sharp focus, crisp details`
- "no text" yerine → `clean background with no text, no watermark, no logos`
- "no extra fingers" yerine → `anatomically correct hand with five fingers`

**Uzunluk:** Detaylı, anlatı tarzı prompt'ları sever ama etkili metin dikkati yaklaşık 512 token civarında sınırlanır ve kalite çok daha önce kaymaya başlar. Hedef: 80-180 kelime. Özne ve yazılacak metin en başta.

**Metin yazımı:** İngilizce ve Çince metinde güçlüdür; metni tırnak içinde, prompt başında ver. **Türkçe özel karakterler (ş, ğ, ı, İ) güvenilir değildir** — Türkçe metin için "boş alan bırak" yolunu varsayılan yap; kullanıcı yine de denemek isterse kontrol listesine harf kontrolünü ekle.

**Stil:** Her prompt'ta tek bir kamera ifadesi ve tek bir ışık/film ifadesi seç; birden fazlası birbiriyle çatışır.

**Ürün sadakati:** Referans görselden ürünü birebir koruma konusunda Nano Banana / GPT Image kadar güçlü değildir. Gerçek ürünle birebir uyum kritikse kullanıcıya bunu söyle; img2img kullanılacaksa düşük denoise/strength ile ürünü korumasını öner.

**Örnek iskelet:**
```
[Product + exact text if any, first sentence]. [Presentation]. [Scene]. [One lighting phrase]. [One camera phrase]. [Brand colors as concrete objects/surfaces]. [Composition]. Sharp focus, crisp product details, clean background with no text or watermark, photorealistic commercial product photography.
```

## 5. Diğer yerel modeller

- **Flux ailesi:** Doğal dil; çoğu kurulumda negatif prompt yok veya zayıf — Z-Image gibi pozitif kısıt kullan.
- **SDXL ve türevleri:** Etiket tarzı (virgülle ayrılmış ifadeler) + ayrı negatif prompt iyi çalışır. Ağırlık sözdizimi `(product label:1.3)` arayüze göre desteklenir. Metin yazımı zayıftır → her zaman boş alan yolu.
- Kullanıcı hangi modeli kullandığını söylemiyor ama "kendi modelimiz" diyorsa: model adını, negatif prompt desteğini ve img2img desteğini sor; bilinmiyorsa doğal dil + pozitif kısıt + ayrı (opsiyonel) negatif blok ver — bu her yerde çalışan en güvenli biçimdir.

## 6. Hızlı karşılaştırma

| | Nano Banana Pro / 2 | gpt-image-2 | gpt-image-1.5 | Z-Image Turbo |
|---|---|---|---|---|
| Prompt stili | Akıcı brief | Yapılandırılmış bloklar | Yapılandırılmış bloklar | Kısa-orta anlatı |
| Negatif prompt | Prompt içinde | Prompt içinde | Prompt içinde | Çalışmaz → pozitif dil |
| Gerçek şeffaf arka plan | Hayır (beyaz/chroma iste) | Hayır | **Evet** | Hayır |
| Türkçe metin | İyi (Pro daha iyi), kontrol şart | En iyi, kontrol şart | İyi, kontrol şart | Zayıf → boş alan |
| Ürün sadakati (referansla) | Çok iyi | Çok iyi | Çok iyi (fidelity high) | Orta |
| Konuşmalı düzenleme | Çok güçlü | Güçlü | Güçlü | Sınırlı |
