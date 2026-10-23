# Görsel İyileştirme ve Dekupe (Prompt Tabanlı)

Kullanıcı bir ürün fotoğrafı yüklediğinde bu dosyayı kullan. Görseli kendin işlemezsin; görseli **analiz eder**, sorunları raporlar ve motorun düzenleme özelliğine verilecek **edit prompt'larını** yazarsın.

## 1. Görsel analizi

Görsele bakıp şu başlıklarda kısa bir teşhis raporu çıkar. Sadece gerçekten var olan sorunları yaz; olmayan sorunu uydurma.

| Başlık | Bakılacaklar |
|---|---|
| Işık | Karanlık/patlak alanlar, sert gölgeler, düz ve cansız ışık, karışık renk sıcaklıkları |
| Renk | Renk kayması (sarı/mavi/yeşil), soluk renkler, ürünün gerçek rengine sadakat |
| Netlik | Bulanıklık, odak kaçması, gren/gürültü, düşük çözünürlük |
| Arka plan | Dağınıklık, dikkat dağıtan objeler, uyumsuz zemin, kenar sorunları |
| Ürün yüzeyi | Toz, parmak izi, çizik, istenmeyen yansımalar, buruşuk etiket |
| Perspektif | Eğik çekim, bozulmuş geometri, kesilmiş ürün |
| Kompozisyon | Ürün çok küçük/çok kenarda, metin için alan yok |

Rapor formatı:
```
🔍 GÖRSEL ANALİZİ
✅ İyi olanlar: …
⚠️ İyileştirilebilir: … (öncelik sırasıyla)
💡 Önerim: [hafif iyileştirme / dekupe + yeni sahne / tamamen yeni çekim prompt'u]
```

Sonra kullanıcıya hangi yolu istediğini sor (önerdiğini belirterek).

## 2. Üç düzenleme yolu

### Yol A — Hafif iyileştirme (sahne korunur)
Fotoğraf genel olarak iyi, sadece ışık/renk/temizlik gerekiyor.

Şablon:
```
Edit this product photo. Keep the composition, camera angle, background and the product itself exactly the same.
Improve only the following:
- Lighting: [ör. brighten the underexposed left side, soften the harsh shadow under the product]
- Color: [ör. correct the yellow color cast to neutral white balance, keep the product's true colors]
- Clean-up: [ör. remove dust specks and fingerprints from the glass surface]
- Sharpness: [ör. increase clarity on the label text]
Do not change the product's shape, label, logo, text or colors. Do not add or remove any objects.
```

### Yol B — Dekupe (arka planı kaldır / izole et)
Ürün, arka plandan ayrılacak.

**gpt-image-1.5 ile (gerçek şeffaflık):**
```
Remove the background completely and isolate the product. Keep the product exactly as it is: same shape, edges, label, logo, colors, reflections on its surface. Clean, precise edges including fine details like [ör. the bottle cap ridges / transparent glass areas]. Transparent background.
```
Ayarlar: `background: transparent`, `output_format: png`, `input_fidelity: high`.

**Nano Banana / gpt-image-2 / Z-Image ile (şeffaflık yok):**
```
Isolate the product on a perfectly flat, pure white (#FFFFFF) background. Keep the product exactly as it is: same shape, label, logo, colors and materials. Remove all background elements, props and surfaces. No shadow, no reflection on the ground, crisp clean edges.
```
Beyaz ürünlerde beyaz yerine chroma yeşil (#00B140) veya ürünle zıt düz bir renk iste. Kullanıcıya: "Bu görsel düz renk zeminle gelecek; gerçek şeffaf PNG için bir arka plan silme aracından (ör. tasarım programının arka plan kaldırma özelliği) geçirmen gerekecek" de.

**Şeffaf / yansıtıcı ürünler (cam, sıvı, parlak metal):** Dekupe en zor bu ürünlerde. Prompt'a ekle: `Preserve the transparency and internal refractions of the glass; the background must not show through as a different color.` Kullanıcıyı kenarları kontrol etmesi için uyar.

### Yol C — Dekupe + Yeni Sahne (ürünü yeni ortama yerleştir)
En sık istenen reklam akışı: gerçek ürün fotoğrafı + marka tarzında yeni sahne.

Şablon (Nano Banana / GPT Image):
```
Image 1 is the real product photo — preserve the product exactly: identical shape, proportions, label text, logo, colors and materials. Do not redesign it.
Place this product into a new scene: [sunum + sahne bloğu, Tarz Kilidi'nden].
Lighting: [Tarz Kilidi ışığı] — relight the product so its highlights and shadows match the new scene naturally, including a realistic contact shadow [or: a soft floor shadow for levitation].
Camera: [Tarz Kilidi kamerası], keep the product's original perspective.
[Renk, kompozisyon, metin, kısıtlar.]
```
Kritik nokta **yeniden ışıklandırma**: Ürünün eski ışığı yeni sahneyle çelişirse "yapıştırılmış" görünür. Prompt'a ışığın uyumlanmasını ve temas gölgesini mutlaka ekle.

Z-Image ile Yol C'yi önerirken ürün sadakatinin sınırlı olduğunu belirt (bkz. `motor-profilleri.md`).

## 3. Sık düzeltme prompt'ları (ince ayar kütüphanesi)

Teslimatın "İnce ayar prompt'ları" bölümünde bunlardan uygun olanları ver:

- Gölge çok sert: `Keep everything identical; only make the shadow beneath the product softer, lighter and more diffused.`
- Ürün çok küçük: `Keep the scene identical; scale the product up so it fills about 60% of the frame height, keeping its proportions.`
- Renk kaydı: `Keep everything identical; correct the overall color balance to neutral, and make sure the product's color matches #[HEX] exactly.`
- Etiket bozuldu: `Keep the scene identical; restore the product label to exactly match Image 1 — same text, typography, logo and layout.`
- Arka plan dikkat dağıtıyor: `Keep the product and lighting identical; simplify the background — reduce props and blur it slightly so the product stands out.`
- Yansıma sorunu: `Keep everything identical; remove the distracting reflection of [X] on the product surface while keeping natural glossy highlights.`
- Yapay görünüyor: `Keep the composition; make it look like a real photograph — add subtle natural imperfections, realistic material texture and true-to-life light falloff.`

## 4. Dürüstlük notları

- Motor düzenlemeleri piksel hassasiyetinde değildir; her düzenleme ürünü az da olsa değiştirebilir. Kontrol listesine "ürünü orijinalle yan yana karşılaştır" maddesini her zaman ekle.
- Düşük çözünürlüklü, çok bulanık bir fotoğrafta ürün detayları (etiketteki küçük yazılar) motor tarafından uydurulabilir. Bu durumda yeni ve daha iyi bir ürün fotoğrafı çekilmesini öner; temel çekim için kısa ipuçları ver (gün ışığı alan pencere kenarı, beyaz karton arka plan, telefonu sabitlemek).
