# QA & edge-case matrix — OSCE Playground v0.3

| Kasus | Perilaku yang diterapkan | Bukti status |
|---|---|---|
| Data scene datang setelah frame pertama | RAF tidak dihentikan ketika `world=null`; draw setelah data tiba | Browser regression dengan delay 0,8 s: PASS |
| WebGL tidak tersedia | Pindah ke Canvas2D yang tetap merender boneka, alat dan kamera | Browser Chromium fallback: PASS |
| Context WebGL hilang | Tampilkan recovering, inisialisasi ulang buffer/shader pada restore; fallback setelah timeout | Event kehilangan konteks yang disengaja: PASS (GPU stub) |
| Jari kedua saat drag sendi | Batalkan pose sementara, ubah ke mode pinch/pan | Code path + unit/browser review; tablet fisik belum diuji |
| Pointer cancel | Rollback pose sementara dan jangan commit | Code path; tablet fisik belum diuji |
| Sendi/anchor tidak dikenal | Validasi, error, tidak mengubah scene | Unit: PASS |
| Dua aset saling attach membentuk lingkaran | Ditolak tanpa perubahan scene | Unit: PASS |
| Perintah MCP berdasarkan revisi lama | `REVISION_CONFLICT`/409, tanpa overwrite | Unit: PASS |
| Preview scene AI | Menciptakan scene sementara tanpa commit | Unit: PASS |
| Update behavior menghapus state alat aktif | Ditolak `INCOMPATIBLE_UPDATE` | Unit: PASS |
| Update aset menghapus anchor terpakai | Ditolak | Unit: PASS |
| File restore rusak atau referensi hilang | Ditolak tanpa mengubah scene aktif | Unit: PASS |
| Disk gagal ditulis saat Undo | Rollback memory dan stack Undo/Redo | Unit: PASS |
| Input JSON asset/behavior invalid | API menolak, UI menampilkan alasan | Unit + tombol validasi: PASS |
| Koneksi offline ketika pose/posisi diubah | Draft di browser; tidak mengklaim server sudah menyimpan | Code path; manual network QA belum dilakukan |
| Konflik antara draft offline dan scene server | Tidak me-replay draft di revisi berbeda; minta tindakan pengguna | Code path; manual QA belum dilakukan |
| Pengguna menambah aset dari UI | Validasi → create → registry → muncul di Add | Browser + server live: PASS |
| Add, Practice, Ask GPT, diagnostik | Tindakan + feedback/status terhubung API | Browser + server live: PASS |
| Layar tablet portrait dan ponsel sempit | Panel dapat digulir, canvas tanpa horizontal overflow | Browser responsive checks: PASS |
| Server memakai API_TOKEN dan scene belum bisa dibaca | Panel koneksi tetap menampilkan kolom token; retry memuat scene setelah token benar | Browser protected API + reconnect: PASS |
| Tablet diputar ke portrait | Kamera menghitung ulang jarak frame sesuai rasio layar | Browser screenshot portrait: PASS (simulasi viewport) |
| Situs offline total | Shell dapat cache via SW, tetapi data baru/mutasi butuh server | Tidak ada klaim editor offline penuh |
| Plugin ChatGPT yang lama terpasang | Plugin tool dapat diakses, **bukan bukti** site ter-deploy v0.3 | Perlu publikasikan versi baru |

## Tes penting setelah deploy yang wajib diulang

1. HTTPS terbuka; token melindungi `/api/state` dan `/mcp`; tidak ada scene yang bocor tanpa token.
2. `STUDIO_URL=https://DOMAIN API_TOKEN=... npm run smoke` mengembalikan 18 tools dan resource `ui://osce-playground/studio.html`.
3. Instal/refresh ChatGPT MCP App, panggil `open_studio`, pastikan versi host widget sama dengan source ini.
4. Jalankan gestur pinch, orbit, drag siku, rotate bed, attach alat; coba putuskan koneksi dan pulihkan.
5. Restart server/instance untuk membuktikan persistent volume mempertahankan scene; ulangi backup/restore.
6. Pada perangkat sasaran: ukur FPS, isu memori WebGL, visibility switch, rotation, perubahan orientasi dan on-screen keyboard.

**Laporan ini tidak mengklaim 100% bebas bug.** Unit dan browser emulation menangkap sebagian besar regresi yang diketahui; perangkat nyata dan host resmi tetap mempunyai karakteristik berbeda.
