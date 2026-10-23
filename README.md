# Pro Screen AI

Video ve yapay zeka görsel üretimi için iki ayrı çalışma alanı sunan Electron masaüstü uygulaması. macOS / Apple Silicon üzerinde geliştiriliyor.

Kaynak deposu: https://github.com/kancaba/Proscreenai

- **Video Stüdyo:** ekran/alan kaydı, zaman çizelgesi, zoom, ses, anotasyon ve dışa aktarma.
- **Görsel Stüdyo:** tek istekle AI üretimi, kalıcı marka/ürün kimlikleri, galeri ve katmanlı görsel düzenleme.
- Her iki stüdyodan **Ana ekran** düğmesiyle başlangıca dönülebilir. Video değişiklikleri için kayıt kontrolü, görsel editörde taslak kaydı uygulanır.

API anahtarları kullanıcının yerel güvenli deposunda tutulur. GitHub kaynak kodunu yedekler; kişisel galeri, kayıtlar ve anahtarlar depoya gönderilmez.

## Çalıştırma

```sh
npm ci
npm run build:native-helpers
npm run dev
```

Node.js 22 LTS veya üstü ve Xcode Command Line Tools gerekir. Native derleme hedefi macOS 14.0'dır. Diğer platformların build scriptleri korunmuştur; Windows/Linux bu geliştirme sırasında test edilmemiştir.

Yerel macOS uygulaması:

```sh
npm run build:app
open "release-source-fix/mac-arm64/Pro Screen AI.app"
```

İlk kayıt öncesinde macOS Sistem Ayarları → Gizlilik ve Güvenlik altında Ekran Kaydı ve cursor takibi için Erişilebilirlik izinlerini verin. Mikrofonu açarsanız mikrofon izni de gerekir. İzin değişikliğinden sonra uygulamayı yeniden başlatmanız gerekebilir. Geliştirme ve paketlenmiş uygulama farklı izin kimlikleri kullanabilir.

## Bu sürüm

- Pro Screen AI açılış ekranı: ekran kaydı, video içe aktarma, proje açma.
- Türkçe varsayılan dil; İngilizce, İspanyolca, Çince dil seçenekleri korunur.
- Kayıt sırasında otomatik küçülen süre/durdurma çubuğu; macOS yakalama filtresinde uygulama pencerelerinin dışlanması.
- Zoom/Kes/Hız/Metin araç çubuğu ve hassas bölge zamanları.
- Hazır görünüm presetleri ve özel görünüm kaydı; görünüm dahil undo/redo.
- Yeni projelerde kaynak çözünürlüğünü koruyan varsayılan export.
- Yerel son projeler kitaplığı, atomik proje kaydı ve `.screenmovie` uzantısı.
- Eski `.recordly` / `.openscreen` projelerini açma.
- Recordly'den gelen native kayıt, cursor hareketleri, otomatik/manuel zoom, timeline kesme/hız, anotasyon, görünüm ayarları ve MP4/GIF export altyapısı.
- Kaydetme iptal edilirse editör açık kalır; yeni projeler de kapanışta korunur.
- Kaynak kayıtlar yaş veya adet sınırıyla otomatik silinmez.
- Editördeki **AI yazıları** paneli, kullanıcının kendi Modelion API anahtarıyla konu ve üsluba göre video süresine yayılan düzenlenebilir metinler üretir. Onaylanan yazılar anotasyon olarak zaman çizelgesine eklenir ve export edilir. Kesilmiş aralıklara yazı yerleştirilmez. Anahtar proje dosyasına yazılmaz; işletim sistemi güvenli depolaması varsa şifreli saklanır, yoksa yalnızca uygulama oturumunda tutulur.

Orijinal videolar projeye gömülmez; kaynak dosya taşınırsa proje bağlantısı bozulabilir. Taşınabilir proje paketi sonraki aşamadır. Webcam, transkript/altyazı, AI ses iyileştirme ve bulut paylaşımı bu sürüme eklenmemiştir. Screen Studio ile tam özellik/kalite eşitliği iddia edilmez.

## Doğrulama

```sh
npm run typecheck
npm test
npm run i18n:check
```

`scripts/smoke-test.cjs`, üretim renderer'ını gerçek Electron penceresinde izole profille test eder. Öncesinde `artifacts/sample.mp4` örnek videonuzu hazırlayın ve `vite build` çalıştırın. Test video içe aktarma, proje kaydı, kapanışta kayıt iptali, son projeler ve MP4 export akışını kontrol eder; `artifacts/` altında rapor ve ekran görüntüleri üretir. Sistem izinlerini değiştirmez.

```sh
./node_modules/.bin/vite build
./node_modules/.bin/electron scripts/smoke-test.cjs
```

## Kaynak ve lisans

Temel: https://github.com/DougNix/recordly — commit `405946a1c89f219c38fd69a11f68a1819a42caea`.

Recordly / OpenScreen telif ve MIT lisans bildirimleri `LICENSE`, `LICENSE.md`, `LICENSE-OpenScreen` dosyalarında korunur. Kaynak README `docs/UPSTREAM_README.md` içindedir. Bağımlılık ve medya lisanslarının durumu için `THIRD_PARTY_NOTICES.md`, araştırma ve sonraki aşamalar için `PLAN.md` dosyasına bakın.
