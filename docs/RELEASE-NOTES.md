# Release notes — OSCE Playground v0.3

- UI diperbarui mengikuti referensi pengguna: latar abu terang, puppet pastel mint/peach, akses utama Add/Ask GPT/Practice, panel kontekstual, advanced editor tersembunyi.
- Website dan widget MCP App memakai source UI yang sama (tidak lagi ada file widget v0.2 yang tertinggal).
- Renderer WebGL memperbaiki RAF yang berhenti ketika scene terlambat, mengatasi context lost/restore, serta fallback Canvas2D. Kamera menyesuaikan rasio portrait.
- Gestur sendi/objek menangani pointercancel dan interupsi sentuhan kedua agar perubahan sementara tidak diam-diam tersimpan.
- Validasi anchor dan status behavior lebih ketat, pencegahan attachment cycles, preview MCP read-only, impor snapshot tervalidasi, rollback jika penulisan disk gagal saat undo.
- UI koneksi tetap bisa menampilkan input bearer token walaupun scene gagal dimuat (misalnya initial HTTP 401).
- PWA app-shell cache aktual tanpa cache konten API/MCP; layar koneksi terputus diberi recovery/status.
- 18 MCP tools, 25 automated Node tests, browser QA dan smoke endpoint lokal.

Rilis ini **belum** memperbarui live Site dalam akun ChatGPT, belum menjalani tes GPU fisik tablet atau sertifikasi simulasi medis. Lihat STATUS.md dan QA-V03.md.
