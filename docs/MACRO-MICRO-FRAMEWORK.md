# OSCE Playground v0.8 — Macro/Micro Interaction Framework

## Prinsip desain

Sandbox tidak perlu mengetahui apa itu tensimeter, goniometer, atau instrumen baru. Mesin cukup memahami bagian 3D, hubungan antarbagian, gerakan mekanis, titik interaksi, dan perubahan status. ChatGPT melalui MCP membuat **definisi data** yang menggunakan kemampuan mesin. Tidak ada `eval()`, remote script, ataupun fungsi fiktif.

- **Macro:** `move_entity`, `rotate_entity` mengubah transformasi keseluruhan objek/karakter. Gerakan berlangsung di browser tanpa round-trip sampai gesture selesai. Pada tablet, drag biasa memindahkan; tahan pada objek sekitar 340 ms lalu drag memutar yaw/pitch. Mouse kanan drag memutar. Tombol ↶/↷ tetap tersedia sebagai alternatif yang jelas.
- **Micro:** `set_mechanism` mengubah satu mekanisme internal, misalnya engsel, pemutar, slider, atau tombol. Parts milik mekanisme mengikuti transformasi pivot+axis; nesting/parenting didukung. Ketika mencapai batas tertentu, mekanisme dapat memanggil aksi dari finite-state behavior yang telah tervalidasi.
- **Study:** engine tetap dipakai untuk latihan OSCE manual tanpa klaim mengukur kekuatan, tekanan, kualitas palpasi, atau hasil fisiologi pasien.

## Data kontrak v0.8

`create_asset` menerima bentuk primitif `box`, `sphere`, `cylinder`, `capsule`, `cone`, `torus`, dan `tube` (jalur polyline 2–25 titik). Setiap bagian memiliki posisi, ukuran, warna, ID (wajib bila dikendalikan mekanisme), dan rotasi lokal opsional dalam radian. Hingga 100 parts dalam satu aset.

`mechanisms` opsional, maksimal 24 definisi:

| Field | Tujuan |
| --- | --- |
| `id`, `label` | Nama stabil untuk MCP dan pengguna |
| `kind` | `hinge`, `dial`, `slider`, `button` |
| `partIds` | Bagian 3D yang dikendalikan; tiap part hanya dimiliki satu mekanisme |
| `parentId` | Mekanisme induk, untuk subassembly bertingkat |
| `pivot` | Titik putar/asal lokal XYZ |
| `axis` | Vektor arah nonnol; otomatis dinormalisasi |
| `min`, `max`, `initial` | Batas dan posisi awal. Engsel/dial dalam derajat, slider/tombol dalam satuan meter dunia |
| `triggers.min`, `triggers.max` | Aksi behavior saat mekanisme baru mencapai batas; opsional |

Contoh minimal mekanisme:

```json
{
  "id": "hinge-a",
  "label": "Engsel A",
  "kind": "hinge",
  "partIds": ["lever"],
  "pivot": [0, 0.2, 0],
  "axis": [0, 0, 1],
  "min": -40,
  "max": 90,
  "initial": 0
}
```

Contoh lengkap tanpa membuat alat medis tersedia di `examples/articulated-demo.json`.

## Jalur ChatGPT/MCP

1. Baca `get_world_state` untuk mengambil `sessionId` dan `scene.revision` dan `get_asset_catalog` untuk melihat aset/behavior yang tersedia.
2. Buat `create_behavior` terlebih dahulu jika alat memerlukan state machine. Definisi trigger yang mengarah ke aksi tidak dikenal akan ditolak.
3. Gunakan `validate_asset`, lalu `create_asset` dengan struktur parts + mechanisms + anchors + affordances bila diperlukan.
4. Panggil `apply_scene_operations` dengan `spawn_asset` menggunakan `baseRevision` terbaru. Nilai awal mekanisme disimpan pada `entity.controls`.
5. Untuk micro, kirim `set_mechanism` dengan `entityId`, `mechanismId`, `value`. Untuk macro, kirim `move_entity` atau `rotate_entity` (rotasi tiga sumbu dalam radian).
6. Untuk perubahan besar gunakan `preview_scene_operations`; jika valid, apply terpisah. Perubahan dapat di-Undo dalam sesi yang sama.

## Rancangan UI tablet

Dunia 3D tetap memenuhi layar; tidak ada daftar 24 parameter permanen. Normalnya pengguna cukup drag objek atau karakter. Saat salah satu aset terpilih dan memiliki mekanisme, panel kontekstual menampilkan tombol **Edit Detail**. Mode ini memberi titik biru pada komponen interaktif; drag langsung menggerakkan bagian itu, tanpa slider. Tombol `−/+` disediakan sebagai opsi presisi dan aksesibilitas; panel bisa ditutup sambil tetap bekerja pada titik biru.

`Detail Mode` menggeser fokus kamera ke alat yang dipilih. Satu label kecil menampilkan nama mekanisme dan nilainya. Jari kedua tetap digunakan untuk navigasi kamera. Setelah tombol Detail ditutup, objek kembali ke mode Macro biasa.

## Performa dan integritas

- Saat drag, client memperbarui transformasi 3D langsung, lalu mengirim satu batch operasi saat dilepas. Tidak ada autosave disk atau sinkronisasi per frame.
- Nilai mekanisme dibatasi range pada client **dan** server. Server menolak NaN/Infinity, sumbu nol, parent siklik, part duplikat, referensi hilang, dan aksi behavior yang tidak kompatibel.
- Trigger dipanggil hanya pada transisi **memasuki** `min`/`max`. Mengulangi nilai yang sama tidak memanggil aksi berkali-kali.
- Efek server (misalnya perubahan state atau parameter) dibaca ulang ke UI setelah gesture, supaya tidak ada label status usang.
- Tidak ada penyimpanan permanen. Memulai sesi baru melakukan reset dunia.

## Batas yang disengaja

Framework ini bukan runtime CAD atau simulator fisiologi. Belum ada deformable mesh (karet/kain lentur), tekanan cairan, mekanika jaringan tubuh, impor GLB/GLTF, persamaan mekanika bebas, atau collision mesh presisi. Alat yang membutuhkan kemampuan tersebut harus dilaporkan sebagai *unsupported* dan tidak dipresentasikan seolah berfungsi.

Pengujian browser pada build ini dibatasi karena kebijakan Chromium pada lingkungan eksekusi memblokir navigasi halaman (`ERR_BLOCKED_BY_ADMINISTRATOR`). Uji otomatis JS, solver transform, server HTTP/MCP, dan widget inline tetap tersedia; pengujian tactile di iPad/Android fisik masih wajib sebelum rilis produksi.
