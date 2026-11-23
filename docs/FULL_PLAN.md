# Full Plan — Dari prototipe ke OSCE Sandbox Studio stabil

## Tujuan produk

Membangun workspace belajar OSCE berbasis tablet di mana pengguna menggerakkan model dokter dan pasien secara manual, memilih alat pemeriksaan, dan meminta ChatGPT menyiapkan seluruh scene melalui MCP. AI dapat membuat definisi alat baru beserta state machine interaksinya. Fokus sandbox: **eksplorasi dan rehearsal visual**, bukan computer vision dan bukan sertifikasi kemampuan klinis.

## Prinsip yang tidak boleh dilanggar

1. **Tablet-first**: viewport besar, UI kontekstual, interaksi multi-touch, slider untuk presisi.
2. **Manual-first**: pengguna tetap memanipulasi model tanpa harus memanggil AI.
3. **AI-extensible**: katalog alat dan logic tidak disematkan sebagai pilihan tetap.
4. **Validated changes**: AI hanya memakai operasi yang diizinkan, skema ketat, snapshot, revision-check, rollback.
5. **Clinically honest**: model visual dan hasil fisiologis tidak disamakan.
6. **Recoverability**: save, export/import, versioning, undo, audit.

## Pengguna utama

Mahasiswa profesi kedokteran atau pelajar kesehatan yang ingin menghafal urutan OSCE, posisi pemeriksaan, penggunaan instrumen, dan interaksi relatif dokter–pasien. Bukan pengganti pasien standar, manekin fisik, dosen klinik, ataupun pelatihan skill tangan.

## Skenario contoh

**Bahu:** set pasien duduk, dokter di samping, goniometer di meja; manipulasi flexion/abduction; checklist urutan. Perhatikan bahwa scapula dan jaringan lunak tidak disimulasikan.

**Tekanan darah:** buat kursi, cuff, pasien duduk, lengan diposisikan; behavior `free→wrapped→inflated→wrapped`; hasil numerik hanya berasal dari kasus, bukan perhitungan fisiologis.

**Neurologi:** senter dan palu refleks dapat dipegang/diarahkan; respons neurologis ditetapkan skenario, bukan respons refleks terkomputasi.

## Masalah dan mitigasi

| Masalah | Dampak | Solusi jangka pendek | Solusi jangka panjang |
| --- | --- | --- | --- |
| Gesture kamera dan boneka berebut input | Gagal memanipulasi | Mode Select/Move/Pose dan pointer capture | Gesture recognizer dengan pointer arbitration |
| Sendi tidak anatomis | Posisi menyesatkan | Tandai simulasi sederhana; preset; axis tersurat | Joint constraints terkalibrasi + FK/IK hybrid |
| Badan menembus bed | Ilusi rusak | Positioning manual dan preset | Colliders/snap collision serta constraint solver |
| Alat kecil sulit disentuh | Target sentuh kecil | Scene list, hotspot, inspector angka | Enlarged invisible hit targets, stylus precision |
| AI membuat objek invalid | Crash / objek hilang | Strict JSON validation, 60 parts cap | Geometri prosedural kompleks dan static analyzer |
| AI membuat FSM kontradiktif | State tak tercapai | Uji transisi dan history | Reachability/static graph analysis, auto tests |
| Dua pihak edit scene | Edit terhapus | Revision check, rollback, undo | Fine-grained conflict resolution / CRDT bila perlu |
| Data hilang | Harus buat ulang scene | Atomic JSON persistence, export/import | DB transaction + backups + audit timeline |
| Alat terlalu kompleks | Frame rate turun | Low-poly primitives; batas entities | LOD, instancing, occlusion, benchmark GPU |
| AI memberi simulasi medis salah | Salah belajar | Label demo/simulasi, temuan kasus terpisah | Review pakar klinis dan sumber guideline berversi |
| Akses MCP salah konfigurasi | Tidak terhubung ke ChatGPT | Local JSON-RPC test, manual docs | Official SDK, HTTPS, OAuth, user-facing connection flow |
| Server terbuka tanpa auth | Data/scene bisa diubah siapa pun | Bind loopback default; token untuk bind publik | OAuth, granular scopes, per-user isolation, audit |
| Proyek membengkak | Fitur inti gagal selesai | Batasi runtime primitives dan OSCE visual | Modul tambahan setelah uji pengguna nyata |

## Fase dan exit criteria

### v0.1 — Technical alpha **(kode awal disediakan dalam paket ini)**

- WebGL, dua karakter, sendi, kamera touch, asset registry, FSM deklaratif, snapshot, local HTTP/MCP.
- Exit criteria: unit/API/MCP tests pass; masih perlu uji end-to-end di tablet dan validasi UX.

### v0.2 — Tablet usability stabilization (estimasi 2–4 minggu)

- Uji iPad Safari dan Android Chrome fisik; memperbaiki pointer picking, drag anchor, orientasi landscape/portrait dan keyboard virtual.
- Desktop fallback mouse/keyboard yang setara; sensitif stylus; pan stabil dan gesture conflicts.
- Uji 30 fps+ pada target tablet kelas menengah dengan minimal 2 humanoid + 15–30 objek.
- UX test lima pengguna: tugas pilih sendi, gerakkan bahu, ambil goniometer, simpan skenario tanpa instruksi lisan.
- Exit criteria: minim keluhan gesture, tidak ada hilangnya data pada tes berulang.

### v0.3 — Geometry + equipment builder (estimasi 3–5 minggu)

- Tambahkan tube/strap/path geometry, grouping, anchors offset rotasi, snap point yang terlihat, GLB loader, asset revision preview.
- Behavior builder visual berbasis graph; graph reachability tests; searchable template actions.
- Peralatan OSCE inti 15–25 aset sederhana.
- Exit criteria: 3 objek baru bisa dibuat dari deskripsi via MCP tanpa perubahan source code.

### v0.4 — MCP productionization (estimasi 3–5 minggu)

- Migrasi manual HTTP adapter ke MCP SDK v2 dan compat matrix dengan ChatGPT custom app.
- Deploy HTTPS server + proper OAuth + scope read/write, API key secret vault, approval untuk operasi destruktif.
- Sinkronisasi lebih baik: event ops, revision conflict UX, audit trail, transaksi portable.
- Exit criteria: ChatGPT tersambung sungguhan pada akun/paket yang mendukung; berhasil create scene + create tool + attach + execute behavior; semua operasi tercatat.

### v0.5 — OSCE authoring (estimasi 3–5 minggu)

- Skenario berlapis: patient profile, chief complaint, hidden findings, examiner cues, checklist, variasi kasus.
- Review medis dan provenance skenario. Referensi guideline tersimpan, pemisahan clinical result dan action event.
- Lesson library; import/export template; screenshot & pose comparison.
- Exit criteria: minimal 10 template OSCE melalui modul engine yang sama, dicek pengajar.

### v0.6–1.0 — Stable release (estimasi 4–7 minggu)

- Security review, migration tests, backup policy, load test, E2E tablet, monitoring, offline design.
- Dokumentasi pengguna, license aset, performance budget, continuous deployment.
- Exit criteria: tidak ada data-loss P0; koneksi AI dapat dipulihkan; aplikasi tetap bisa digunakan manual saat AI tidak tersedia.

Perkiraan seluruh lintasan pasca-alpha ~15–26 minggu untuk pengembang tunggal yang cukup mahir. Ini perkiraan usaha, bukan jadwal yang telah dikerjakan.

## Kriteria penerimaan fungsional (definition of done)

1. Pengguna dapat mengubah seluruh sendi yang diumumkan didukung dan melihat perubahan arah yang konsisten.
2. Viewport bisa orbit, zoom, pan tanpa menggerakkan objek saat gesture kamera.
3. Aset baru dibuat via MCP, muncul tanpa refresh manual, dan bisa digenggam/diubah statusnya.
4. AI tidak dapat mengirim script bebas ke browser atau shell.
5. Transaksi salah memulihkan state sebelumnya, bukan meninggalkan setengah operasi.
6. Alat dan skenario tetap ada setelah restart server.
7. Dua request dengan revision sama tidak sama-sama commit.
8. Data ekspor dapat dipulihkan dan setiap versi skema punya jalur migrasi.
9. Operasi berbahaya butuh persetujuan dan audit pada deployment nyata.
10. Konten klinis tidak diklaim sebagai hasil pengukuran real atau validasi keterampilan jika engine tidak mendukungnya.

## Fitur yang sengaja di luar scope

- Voice patient agent yang mengerti dialog real-time.
- Vision detector / grading otomatis dari pose pengguna.
- Fisika jaringan tubuh, palpasi dengan force feedback, bedah realistis, refleks motor-neural terhitung.
- Multiplayer kolaboratif dan akun publik pada alpha.

## Keputusan strategis

Prioritas setelah v0.1 bukan mengganti WebGL sederhana menjadi realistis. Prioritasnya **uji gesture pada tablet fisik, anchor placement, lalu pengalaman AI membuat satu alat baru yang benar-benar bisa digunakan**. Hal tersebut langsung membuktikan konsep produk dan menentukan pekerjaan berikutnya.
