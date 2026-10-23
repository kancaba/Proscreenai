# Kanal ve Format Rehberi

Platform ölçüleri zaman zaman değişir; aşağıdakiler yaygın kullanılan değerlerdir. Kullanıcı farklı bir ölçü verirse onu esas al.

| Kanal | Oran | Önerilen piksel | Not |
|---|---|---|---|
| Instagram / Facebook post | 4:5 | 1080×1350 | Akışta en fazla alanı kaplar; varsayılan post formatı |
| Kare post / katalog | 1:1 | 1080×1080 | Pazaryeri ve katalog için de güvenli |
| Story / Reels kapak / TikTok | 9:16 | 1080×1920 | Üst ~%12 ve alt ~%20 arayüz tarafından kapanabilir |
| Web banner / hero | 16:9 veya 21:9 | 1920×1080 / 2560×1080 | Sol veya sağda metin alanı bırak |
| YouTube kapak | 16:9 | 1280×720 | Küçük boyutta okunur, büyük ve az metin |
| E-ticaret ürün görseli | 1:1 (çoğunlukla) | ≥1000×1000 | Beyaz zemin kuralları pazaryerine göre değişir — güncel kuralı kontrol ettir |
| Basılı afiş | A serisi (≈1:1,41) | Motor çıktısı + büyütme | Motorların çıktısı baskı için genelde düşük çözünürlüklüdür; büyütme (upscale) aracı gerekebilir, söyle |
| LinkedIn post | 1:1 veya 4:5 | 1200×1200 / 1080×1350 | Kurumsal tarz |

## Motor ile oran eşleştirme

- **Nano Banana:** Oranı prompt'ta yaz; arayüzde oran seçimi varsa onu da ayarlat.
- **gpt-image-1.5:** Sadece 1024×1024, 1536×1024, 1024×1536. 4:5 için 1024×1536 seçip `keep key elements within the central area to allow cropping to 4:5` ekle. 9:16 için de 1024×1536 + kenar payı.
- **gpt-image-2:** Esnek boyut destekler; istenen boyutu ver.
- **Z-Image / yerel modeller:** Genişlik/yükseklik doğrudan ayarlanabilir; 64'ün katı değerler kullanılmasını öner (ör. 1088×1360 ≈ 4:5).

## Çoklu format (aynı kampanya, farklı kanallar)

Kullanıcı aynı görseli birden fazla kanal için istiyorsa:
1. Ana görseli en "dolu" formatta değil, **kırpmaya en dayanıklı** biçimde kurgula: ürün merkezde, kenarlarda pay.
2. Her format için ayrı prompt ver ama Tarz Kilidi ve ürün tarifini birebir koru; sadece kompozisyon ve metin yerleşimi değişsin.
3. Alternatif: ana görsel üretildikten sonra motorun düzenleme özelliğiyle genişletme (outpainting) prompt'u ver: `Extend this image to a 9:16 vertical format; continue the background naturally above and below; keep the product and all existing elements unchanged.`
