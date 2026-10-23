# Kaynak ve dokümantasyon güvenlik kontrolü — 23 Ekim 2026

## Sonuç ve kapsam

Proscreenai için yayımlanan `main` geçmişi ve README güncellemesinin aday kaynak dosyaları tarandı. Kontrol edilen kimlik bilgisi biçimlerinde **bulgu yok**. Kişisel API anahtarları, kullanıcı profili, video kayıtları ve galeri bu güncellemeye dahil edilmedi.

Bu sonuç, “bilgisayardaki bütün Git nesneleri temiz” anlamına gelmez. Yereldeki eski upstream / yedek referansları ayrıca tarandı. Bu eski geçmişte `.kiro/settings/mcp.json` dosyasının tarihsel bir sürümünde **Figma tokenı tespit edildi**. Önceki GitHub aktarımı bu nedenle durdurulmuştu. Proscreenai yeni, temiz kaynak ağacıyla başlatıldı; bu tarihsel nesne Proscreenai `main` dalından erişilebilir değil ve bu güncellemede gönderilmiyor. Referansları ve eski nesneleri yerelden kalıcı silme işlemi yapılmadı.

## Neler kontrol edildi?

- `HEAD` ve `origin/main` üzerinden erişilebilir commit'lerin tekilleştirilmiş metin nesneleri; sadece son dosya halleri değil, erişilebilir önceki sürümler de.
- Git'e aday mevcut kaynak dosyaları; henüz commit edilmemiş dosyalar dahil.
- Figma, GitHub, Google/Gemini, Modelion, OpenAI/Anthropic benzeri sağlayıcı token biçimleri; AWS erişim kimlikleri, Slack tokenları, JWT, özel anahtar blokları, URL içine yazılmış kimlik bilgileri ve bazı sabit credential atamaları.
- `.env`, yerel proje, uygulama paketi, build/test çıktısı, kayıt ve galeri dosyalarının yayımlanacak dosya listesine girmemesi.
- Yeni PNG ekran görüntülerinin görsel incelemesi: gerçek kullanıcı adı, hesap, API anahtarı, kişisel marka veya proje yerine yalnızca sentetik demo içerikleri.
- Yeni SVG şeması ve Markdown içeriği. Eski iki dokümandaki kişiye özgü yerel dosya yolları da genelleştirildi; önceki commit'teki yollar bir credential değildir ve kaynak geçmişi bu değişiklik için yeniden yazılmadı.

Git yazar adı ve e-posta adresi gibi Git'in normal commit metaverileri bu taramadaki erişim anahtarı sınıfından ayrıdır. Normal telif/lisans bildirimleri korunur.

## Yanlış pozitif incelemesi

Eski Homebrew workflow'undaki `${GH_TOKEN}` ortam değişkeniyle oluşturulan URL gerçek bir sabit token değildir. Bu ifade manuel incelendi. Tarayıcı ortam değişkeni yer tutucusunu gerçek URL credential'ından ayırır; gerçek değer çıktı veya raporda gösterilmez.

## Tekrarlanabilir kontrol

```sh
# Yayımlanabilir geçmiş + mevcut kaynak adayları
python3 scripts/audit-secrets.py

# Eski yerel/yedek/checkpoint referansları dahil; bilinen tarihsel bulgu nedeniyle hata kodu beklenir
python3 scripts/audit-secrets.py --all-refs

# Temiz kaynak, geçmişten silinmiş credential ve yeni dosyada credential senaryoları
python3 scripts/audit-secrets-test.py
```

Tarayıcı yalnızca bulgunun türünü, dosya/nesne konumunu ve satırını bildirir; token değerini yazdırmaz. Sentetik test değerleri geçici depolarda oluşturulur ve kaynak deposuna fixture credential dosyaları eklenmez.

## Sınırlar

Bu kontrol bilinen biçimlere dayalıdır; bilinmeyen bir sır biçiminin yokluğunu matematiksel olarak garanti etmez. PNG ve derlenmiş binary içerikleri metin token taramasına dahil edilmez. Yeni ekran görüntüleri manuel incelendi. Yerel arşivler, Git reflog'ları, servis hesaplarının durumu ve eski tokenın hâlâ geçerli olup olmadığı bu kontrolün kapsamı dışındadır.
