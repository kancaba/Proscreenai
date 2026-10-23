# Marka Kimliği — Profil Çıkarma Rehberi

Amaç: Kullanıcıdan gelen her türlü marka bilgisini (100 sayfalık kılavuzdan tek cümleye kadar) görsel üretimde kullanılabilir, ölçülebilir bir **Marka Profili**'ne dönüştürmek. Şema: `assets/sablonlar/marka-profili.json`.

## Profil alanları ve görsele etkisi

| Alan | Neden önemli | Prompt'a nasıl yansır |
|---|---|---|
| Marka adı | Metin ve logo yerleşiminde | Metin bloğu |
| Sektör | Sahne ve tarz önerilerinin temeli | Tarz/sahne seçimi |
| Konumlandırma / fiyat segmenti | Ekonomik ↔ lüks ekseni ışığı ve dokuyu belirler | Işık kontrastı, malzeme kalitesi, boşluk kullanımı |
| Hedef kitle | Model seçimi, ortam, enerji | Lifestyle sahnelerde kişi/ortam tarifi |
| Renk paleti (HEX) | Marka tanınırlığı | Arka plan, aksesuar, ışık rengi |
| Tipografi | Metin eklenecekse | Metin tarifi ("bold geometric sans-serif" gibi) |
| Ses tonu / kişilik | Görselin duygusu | Atmosfer kelimeleri |
| Görsel dil | Var olan fotoğraf/tasarım alışkanlıkları | Tarz Kilidi'nin temeli |
| Logo | Logo yerleşimi | Referans görsel olarak verilir |
| Kaçınılacaklar | Marka yasakları | Kısıt / negatif blok |
| Rakipler / ayrışma | Benzemekten kaçınma | Tarz kararında dikkate alınır |

## Senaryo 1 — Detaylı bilgi geldi

Kılavuz, uzun metin veya PDF içeriği geldiyse:
1. Yukarıdaki alanlara göre ayıkla.
2. Çelişkileri işaretle (ör. "minimal" deniyor ama palette 7 canlı renk var).
3. Görsel üretim için **gereksiz** detayları (iletişim dili kuralları, e-posta imzası vb.) profile taşıma.
4. Renk paletinden en fazla 3 ana + 2 vurgu renk seç; motorlar fazla renk talimatında dağılır. Hangi rengin baskın, hangisinin vurgu olduğunu belirt.

## Senaryo 2 — Kısa bilgi geldi

Örnek: "Kadıköy'de üçüncü dalga kahveci, genç kitle."

Sektör ve konumdan çıkarım yap, her birini **(varsayım)** diye işaretle:
- Ton: samimi, zanaatkar, şehirli (varsayım)
- Palet: sıcak kahve tonları + krem + bir canlı vurgu (varsayım) → HEX öner
- Görsel dil: doğal ışık, ahşap ve beton dokular, insan elleri (varsayım)
- Kaçınılacaklar: steril stüdyo görünümü, aşırı parlak reklam estetiği (varsayım)

Sonra en kritik 2-3 soruyu sor. Öncelik sırası:
1. Mevcut marka renkleri var mı? (yoksa önerilen paleti onaylat)
2. Fiyat segmenti / konumlandırma (ekonomik – orta – premium – lüks)
3. Kesinlikle istemedikleri bir şey var mı?

## Senaryo 3 — Logo veya mevcut görseller yüklendi

- Logodan renkleri çıkar, yaklaşık HEX ver ("yaklaşık #D4342B — kılavuzdaki kesin kodu verirseniz onu kullanırım").
- Logo tipinden tipografi karakterini tarif et (serif / sans / script / geometric / rounded).
- Mevcut sosyal medya görselleri geldiyse ortak görsel dili çıkar: ışık tipi, arka plan, renk derecelendirme, kompozisyon alışkanlıkları. Bu, Tarz Kilidi için altın değerindedir.

## Segment → görsel dil eşlemesi (başlangıç noktası)

| Segment | Işık | Arka plan | Boşluk | Doku |
|---|---|---|---|---|
| Ekonomik / indirim | Parlak, düz, gölgesiz | Canlı düz renk | Az, dolu kompozisyon | Basit |
| Orta segment | Yumuşak, dengeli | Temiz, açık tonlar | Orta | Doğal |
| Premium | Yönlü, kontrollü gölge | Nötr veya koyu, dokulu | Çok | Zengin malzeme (taş, ahşap, kumaş) |
| Lüks | Dramatik, rim light, düşük anahtar | Koyu, minimal | Çok fazla | Mermer, saten, metal, cam |

Bu tablo kural değil, varsayılandır. Marka bilinçli olarak farklı konumlanıyorsa (ör. lüks ama eğlenceli) kullanıcıyı takip et.

## Profil kartı gösterimi (konuşmada)

```
🏷️ MARKA PROFİLİ — [Marka adı]
Sektör: …
Konum: … | Hedef kitle: …
Palet: ■ #XXXXXX (ana) ■ #XXXXXX (ikincil) ■ #XXXXXX (vurgu)
Tipografi: …
Ton: …
Görsel dil: …
Kaçınılacaklar: …
(varsayım) işaretli alanları onaylar mısınız?
```
