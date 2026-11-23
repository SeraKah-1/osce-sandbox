# Quality, Security & Clinical Safety

## Yang sudah diuji

`npm test`: validasi scene dan pose, transaksi atomic, konflik revision, pembuatan asset/FSM, kegagalan action ilegal, undo/redo, snapshot restore, template scenario, MCP tool routing, HTTP API, persistensi file, API token, dan penolakan write berbasis revisi lama.

`npm run check`: pemeriksaan sintaks JS pada modul inti.

## Yang BELUM diuji pada paket ini

- Penampilan WebGL pada iPad Safari dan Android Chrome sesungguhnya.
- Hasil FPS terhadap model tablet, orientasi layar, kondisi baterai, GPU throttling.
- Hit-testing hotspot sendi dalam berbagai sudut kamera dengan sentuhan nyata.
- Konektivitas ke akun ChatGPT remote / custom MCP app sungguhan.
- Skenario dari ChatGPT model yang benar-benar memanggil tool secara otonom.
- Penilaian dari dosen klinik, keamanan tindakan, dan kesesuaian guideline prosedur.

Jangan mempromosikan alpha ini sebagai produk OSCE yang sudah memenuhi standar asesmen keterampilan.

## Security model

| Risiko | Mitigasi yang tersedia | Masih diperlukan untuk publik |
| --- | --- | --- |
| Perintah AI berbahaya | Allowlists operasi, validasi angka/shape/ID, FSM tanpa eval | Permissions per-user, approval, audit terperinci |
| Mutasi saling tabrak | Revision check, atomic rollback | Server-side multi-user merge/locks |
| Data bocor lewat HTTP | Default 127.0.0.1 | HTTPS dan OAuth, secure cookies |
| Endpoint terbuka | API_TOKEN opsional; wajib saat binding publik | Rate limits, identity, scopes |
| Aset mengandung skrip | Only JSON shapes & finite states; html escaped | Formal schema library & sandbox |
| Data rusak | Temp-file rename dan backup via export | DB transactions & backup rotation |
| Komputasi boros | Batas 250 entity, 60 parts/asset, 100 transitions | Quotas per-user, CPU/GPU limits |

**Jangan membuka port `4173` langsung ke internet.** `API_TOKEN` contoh tetap tidak cukup untuk SaaS publik. Penerapan terproteksi perlu reverse proxy HTTPS, identity, OAuth yang kompatibel MCP, anti-abuse, dan audit.

## Clinical risk boundaries

**Scene visual:** manusia terdiri dari tabung dan bola, sendi digerakkan sebagai FK (forward kinematics). Tidak ada otot, saraf, tulang individual, resistensi jaringan, dan colliders tubuh. Sudut adalah parameter grafis, bukan hasil goniometri tervalidasi.

**Alat visual:** behavior mengubah status (`inflated`, `tight`, `on`) tanpa simulasi tekanan atau efek fisiologi. Status tourniquet yang dikencangkan tidak menyiratkan keberhasilan hemostasis; status manset mengembang tidak memproduksi tekanan darah real. Pengukuran refleks atau palpasi tidak bisa dihasilkan hanya dengan state machine sederhana.

**Skenario:** template adalah contoh latihan, bukan guideline definitif atau penilaian formal. Kasus buatan AI perlu label "generated" dan review sumber klinis. Semua tindakan klinis berisiko tetap dilatih melalui instruktur dan alat/simulasi yang sesuai.

## Acceptance matrix sebelum rilis beta

- [ ] iPad Safari dan Android Chrome: gesture orbit/pan/pinch berhasil berulang 100 kali.
- [ ] Tap hotspot lengan kanan/kiri tetap akurat pada zoom dekat/jauh.
- [ ] Perpindahan editor ↔ ChatGPT tidak menghilangkan edit manual.
- [ ] Undo/redo berfungsi pada aksi attach/detach, scene, pose dan asset creation.
- [ ] Beban 2 karakter + 30 objek tetap ≥30 FPS pada tablet target yang ditentukan.
- [ ] Import file rusak/berbahaya ditolak tanpa merusak scene.
- [ ] Akun A tidak dapat membaca/mengubah scene milik akun B (setelah multi-user tersedia).
- [ ] Model GPT tidak dapat melewati validasi schema via tool injection.
- [ ] Setidaknya 3 kasus OSCE diperiksa pakar klinis.
- [ ] Log, restore, token rotation dan prosedur incident response tersedia.

## Known issues

- Rig tidak dibatasi rentang gerak anatomi; seluruh axis menerima -180 sampai +180 derajat. Diperlukan constraint profile tiap joint sebelum mengklaim ketepatan anatomi.
- Renderer hanya memakai primitive sederhana; tidak membuat strap yang sungguhan melilit lengan atau stetoskop dengan selang lentur.
- Snap anchor ke tangan digambarkan sebagai posisi dunia yang mengikuti joint. Rotasi alat terhadap permukaan tubuh tidak diselesaikan.
- Saat token server aktif, browser polling 3 detik (bukan SSE dengan Authorization header).
- Undo history disimpan di RAM, hilang setelah restart; scene terbaru tetap persisten.
- Aplikasi memerlukan server untuk operasi/data; PWA service worker hanya memberi cache file UI, bukan offline editor lengkap.
- MCP adapter manual bersifat eksperimen; migrasi ke SDK resmi diperlukan sebelum produksi.
- Belum ada accessibility audit untuk screen reader atau motor impairment.
