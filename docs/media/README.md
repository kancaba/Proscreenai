# README görselleri

Bu klasördeki PNG dosyaları Pro Screen AI'ın üretim derlemesinden, ayrı ve geçici bir Electron profilinde alındı. Gerçek kullanıcı profili, kayıtları, API anahtarları ve marka kütüphanesi kullanılmadı.

- **Luma / Pulse** sentetik demo markası ve ürünüdür; `luma.example` örnek alan adıdır.
- Kampanya görselleri script içinde SVG ile çizilmiş demo varlıklardır. Modelin ürettiği görsel kalitesinin veya referansa sadakatinin kanıtı olarak sunulmaz.
- Üretim ilerlemesi ve video AI önerileri, gerçek arayüzü göstermek için sabit demo IPC yanıtları kullanır. Ücretli AI isteği yapılmaz. Üretim süresi ve token maliyeti kıyaslaması değildir.
- Video, sentetik bir ürün sayfasından oluşturulur; kişisel ekran kaydı içermez.
- `ai-workflow.svg` uygulama ekranı değil, kaynak koddaki akışları açıklayan şemadır.

Yeniden oluşturma (macOS, bağımlılıklar kurulu olmalı):

```sh
npx vite build
node_modules/.bin/electron scripts/readme-screenshots.cjs
```

Script `ffmpeg-static` ve geçici bir kullanıcı profili kullanır. İzole test pencerelerini açar; mevcut uygulamanın profilini değiştirmez.
