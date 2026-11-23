**Version 0.4.0 touch control release.** Read `QA-V04.md` for evidence, tests, and unverified physical-device behavior. Hosted ChatGPT Site remains independent and may still run an older version.

# Status verifikasi v0.3 — 23 November 2026

## Terimplementasi dan diuji

- Node `npm run check`: lulus untuk server, MCP, dan UI/renderer.
- `npm test`: **25/25 lulus**. Transaksi scene, snapshot restore, versi, validasi geometri dan perilaku, attach/detach, penolakan anchor palsu/siklus, penolakan revisi lama, asset update, preview tanpa write, pemulihan gagal tulis disk saat Undo, tool MCP, resource UI ChatGPT, autentikasi API.
- `npm run smoke` pada HTTP lokal: MCP initialize, 18 tools, 1 MCP App UI resource, `open_studio` membaca scene yang sama dengan `/api/state`.
- Browser Chromium dengan transport API nyata ke server: membuka Add, spawn instrumen, menandai checklist Practice, Ask GPT, diagnostik MCP (18 tools), editor lanjutan membuat aset/behavior dan aset baru terlihat di katalog. Tidak ada exception JavaScript. Layout ukuran 1180×820, 1100×760, 820×1180 dan 390×844 tidak overflow horizontal. Kamera menyesuaikan jarak otomatis ketika layar portrait.
- Browser tambahan terhadap server `API_TOKEN` aktif: initial 401 menampilkan form token, pengisian token sesi yang benar mengembalikan scene ke status Tersinkron. Tidak ada exception JavaScript.
- Black-screen regression: scene sengaja ditunda ~0,8 detik; jalur WebGL diuji dengan stub GPU (panggilan draw 0 sebelum data dan lebih dari 2.000 setelah data). Simulasi context lost mengaktifkan fallback 2D tanpa error.
- WebGL tidak tersedia pada lingkungan Chromium QA: Canvas2D fallback menyajikan scene hidup dan operasi tetap bekerja. Screenshot harus diberi label fallback, bukan bukti WebGL GPU berjalan.

## Belum terverifikasi; tidak diklaim selesai

- Uji interaksi multitouch/stylus dan benchmark FPS pada **tablet fisik** (iPad Safari, Chrome Android) belum dilakukan.
- Renderer WebGL dengan GPU fisik belum berhasil diuji di lingkungan ini. Jalur shader sudah memiliki validasi/error handling dan fallback, tetapi visual hardware tetap harus diperiksa.
- **ChatGPT Site live** yang sudah terpasang di akun pengguna belum diperbarui dengan source v0.3. Package ini tidak mengubah hosting sendiri. Plugin OSCE lama dapat merespons tool, tetapi versi host itu mungkin berbeda dari paket yang diberikan.
- Kompatibilitas penuh `ui/initialize`/`tools/call` di host ChatGPT resmi belum diuji end-to-end setelah deploy; sudah diuji kontrak dan UI bridge lokal.
- OAuth, isolasi tenant, load balancing horizontal, database transaksional dan audit multi-pengguna belum ada. Build ini mengasumsikan satu pemilik + bearer token di belakang HTTPS.
- Kalibrasi anatomi/biomekanik, model fisiologis, penilaian OSCE, dan verifikasi pakar klinis tidak menjadi bagian dari aplikasi ini.

## Definisi klaim “tidak ada mock feature”

Semua tombol yang ditampilkan dalam mode masing-masing punya handler, memanggil fungsi nyata atau memberikan pesan kegagalan eksplisit. Tidak ada generated model/AI fake chat, frame placeholder yang disebut WebGL, atau skor OSCE yang dikarang. Pada situs mandiri Ask GPT adalah handoff ke percakapan ChatGPT terhubung, **bukan** chat AI di dalam browser; impor snapshot disembunyikan saat mode widget yang tidak mendukungnya. Menyamakan demo visual dengan fisiologi medis atau deployment live akan menyesatkan dan tidak dilakukan.
