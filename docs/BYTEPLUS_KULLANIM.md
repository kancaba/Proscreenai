# BytePlus ile poster ve görsel oluşturma

1. Görsel Stüdyo → Oluştur ekranını aç.
2. Görsel üretim aracı menüsünden **BytePlus · Seedream API** seç.
3. **ModelArk API anahtarı ekle** düğmesinden kendi ModelArk anahtarını kaydet. ECS AccessKey/SecretKey bu alana uygun değildir. Anahtar kaydetmek üretim yapmaz; model erişimi henüz doğrulanmış sayılmaz.
4. Modeli ve desteklenen çözünürlüğü seç. Başlangıç seçeneği Seedream 5.0 Flash / 1.5K'dır. Lite 4K dahil farklı seçenekler sunar; başka modele otomatik geçilmez.
5. Tasarım türünü seç: serbest, ürün tanıtımı, kampanya/indirim veya etkinlik. Aynen yazılacak başlık/fiyat gibi metinleri ayrı alana gir. Modelin metin ve logo doğruluğunu sonuçta kontrol et.
6. Brief'i yaz; gerekirse ürün/logo referanslarını ekle ve çıktı oranını seç. En fazla dört referans desteklenir. Düzenlemede ilk referans kaynak görseldir.
7. **API isteğini önizle · ücretsiz** ile talimatları kontrol et. Bu işlem API'ye bağlanmaz; anahtar ve referans dosyalarının içeriği gösterilmez. Brief'teki web bağlantılarının metni üretim sırasında eklenebilir.
8. Tahmini USD bedelini ve **yerel toplam harcama sınırını** kontrol et. **Oluştur** gerçek, ücretlenebilir API isteğini başlatır.

## Maliyet ve kayıtlar

- Fiyatlar 27 Ekim 2026 tarihli liste fiyatlarının tahminidir; kesin fatura veya kalan deneme kredisi değildir. Hesabındaki paket koşullarını ve güncel tarifeyi konsoldan kontrol et.
- Yerel sınır bu cihazın tutulan BytePlus kayıtlarına uygulanır; aynı hesaptan başka uygulamada yapılan harcamaları kapsamaz. Başlangıç sınırı 1 USD'dir. Tamamlanan ve sonucu belirsiz istekler sınıra dahildir; açıkça reddedilen isteklerin rezervi kaldırılır.
- Token bilgisi sağlayıcıdan gelirse kaydedilir; görsel maliyetini doğrudan token sayısından hesaplamayız. Pro çıktısının gerçek piksel kademesi ve referans adedi tahmine dahil edilir.
- İstekler otomatik yeniden gönderilmez. Tekrarlanan istek kimliği yeniden üretim yapamaz. Bilerek tekrar Oluştur'a basmak yeni bir üretimdir ve ayrıca ücretlenebilir.
- Kayıtlı API sonuçları bölümündeki **Sonucu kurtar** yalnızca mevcut çıktıyı indirir. **Galeriye al** bu cihazdaki tamamlanmış görseli alır. İkisi de yeni üretim çağrısı yapmaz.
- Görsel indirme bağlantısı 24 saat geçerlidir. Uygulama kapanırsa başarılı dosyalar ve alınmış indirme bilgileri yerel kayıtlardan kurtarılabilir. Henüz yanıt alınmadan uygulama tamamen kapatılmışsa sonuç belirsiz kalabilir.
- Ekranı kapatmak ücretli isteği sunucuda iptal etmez. Uygulama çalışmaya devam ediyorsa dönen sonuç yerel olarak kaydedilir.
- Anahtar işletim sistemi şifrelemesiyle saklanır. Güvenli depolama yoksa yalnızca oturum belleğinde tutulur; projelere yazılmaz.

## Doğrulama

- Birim testleri: `npm test`
- Tip kontrolü: `npm run typecheck`
- Üretim derlemesi: `npx vite build`
- İzole masaüstü testi: `npx electron scripts/byteplus-desktop-test.cjs`

Masaüstü testinde tüm HTTP çağrıları sahte yanıtlarla karşılanır, geçici kullanıcı profili ve sahte anahtar kullanılır. Test gerçek üretim yapmaz. Sonuç raporu: `artifacts/byteplus-desktop-report.json`.

Video, toplu üretim ve katman ayırma ilk sürümün kapsamı dışındadır.
