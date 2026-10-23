# Pro Screen AI — 23 Ekim 2026

Ürün adı Pro Screen AI, kaynak deposu https://github.com/kancaba/Proscreenai oldu.
Önceki açık kaynak geçmişi ve lisans bildirimleri korunur. Eski kaynak remote'u upstream olarak tutulur.

## Gezinme

- Görsel üretim ekranında görünür Ana ekran düğmesi.
- Katmanlı editörde ayrı Ana ekran ve Görsel Stüdyo düğmeleri. Her iki dönüşte önce taslak kaydedilir; kayıt hatası dönüşü durdurur.
- Video editöründe Ana ekran düğmesi. Kaydedilmemiş proje için Kaydet / Kaydetmeden kapat / Vazgeç kontrolü korunur. Export sürerken dönüş devre dışıdır.
- Kaynak video yüklenemediğinde de Ana ekran erişilebilir.

## Uyumluluk ve yedekleme

Mevcut `app.screenmovie.desktop` uygulama kimliği, `screenmovie` kullanıcı verisi klasörü, IndexedDB adları ve proje uzantıları uyumluluk için korunur. İzole test profilleri bu kuraldan etkilenmez.

GitHub yalnızca kaynak kodunu saklar. Kişisel görseller, markalar, API anahtarları, video kayıtları ve yerel projeler Git'e eklenmez. Bu veriler ayrıca kullanıcı tarafından yedeklenmelidir. Kurulum paketleri, build çıktıları, test çıktıları ve `.env` dosyaları ignore edilir.

## Kontrol

- TypeScript, Vite üretim derlemesi ve 229 birim testi.
- `scripts/home-navigation-test.cjs`: iki stüdyo ve katmanlı editör dönüşleri, video iptal/kaydetme iptali/kaydetmeden dönüş. İzole profil; gerçek kişisel proje değiştirilmez.
- Ana ekran ve görsel stüdyo regresyon scriptleri.

## Kaynak geçmişi

GitHub, upstream geçmişindeki `.kiro/settings/mcp.json` dosyasında bir erişim anahtarı tespit etti. Proscreenai deposu bu eski geçmiş aktarılmadan, güncel temiz kaynak ağacıyla başlatılır. Telif/lisans bildirimleri korunur. Önceki geçmiş yerel yedek referansında ve upstream deposunda kalır. GitHub koruması aşılmaz.
