# Tauri değerlendirmesi

Tarih: 15 Ekim 2026

Mevcut uygulama React/Pixi editör, Electron IPC, Swift ScreenCaptureKit kayıt yardımcıları, WebCodecs video işleme ve FFmpeg sonlandırma katmanlarından oluşuyor.

Tauri, Chromium paketlemediğinden dağıtım boyutunu azaltmaya adaydır. RAM, render süresi ve pil kazanımları ölçülmeden garanti edilmez. macOS'ta WKWebView, Windows'ta WebView2, Linux'ta WebKitGTK kullanması video API davranışlarının platform başına doğrulanmasını gerektirir.

Taşınabilir: React editör bileşenleri, proje şeması, zaman çizelgesi hesaplamaları, anotasyon verisi ve görünüm presetleri.

Yeniden yazılacak: Electron main/preload IPC, dosya diyalogları, proje kütüphanesi erişimi, pencere/HUD yönetimi, izin kontrolü, yardımcı süreç yaşam döngüsü ve paketleme.

Kritik doğrulama: WebCodecs + Pixi/OffscreenCanvas önizleme ve MP4/GIF dışa aktarma WKWebView altında çalışmalı. Swift kayıt yardımcısı Tauri komutları veya sidecar üzerinden bağlanabilir. Gerekirse render Swift AVFoundation/VideoToolbox veya Rust+FFmpeg katmanına taşınmalı; bu ayrı bir geliştirmedir.

Önerilen sıra:
1. Mevcut Electron sürümünü çalışan referans olarak koru.
2. Tauri prototipinde aynı demo proje dosyasını aç.
3. Ekran kaydı, mini HUD, 12 saniyelik efektli MP4 ve GIF üret.
4. Aynı makinede kurulum boyutu, boşta RAM, oynatma kare kaybı ve export süresini karşılaştır.
5. Sonuçlar yeterliyse aşamalı geçiş yap.

Kaynaklar:
- https://v2.tauri.app/reference/webview-versions/
- https://v2.tauri.app/develop/sidecar/

Henüz Tauri geçişi uygulanmadı.
