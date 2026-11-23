# Prompt untuk ChatGPT yang telah terhubung ke MCP Studio

Kamu mengelola OSCE Sandbox Studio saya melalui MCP. Buka `get_world_state` dan `get_asset_catalog` dulu. Buat ruang OSCE pemeriksaan muskuloskeletal bahu. Tempatkan pasien dan dokter agar dapat dilakukan pemeriksaan manual di tablet; tambahkan bed dan goniometer. Jika suatu alat belum ada, buat dengan `create_asset` dari bentuk 3D yang didukung. Jika alat memerlukan logika, buat `create_behavior` (FSM) lalu jalankan `test_behavior` sebelum menggunakannya.

Setiap mutasi scene harus menggunakan `baseRevision` terbaru. Jangan menimpa perubahan manual saya tanpa membaca ulang scene. Setelah operasi, verifikasi dengan `get_world_state`, dan beri tahu apa yang benar-benar dibuat. Jangan mengklaim bahwa sudut sendi atau respons pasien merupakan penilaian klinis otomatis.

Jika ada alat yang tidak dapat dibuat dari primitive yang tersedia, jelaskan keterbatasannya dan buat representasi sederhana yang jujur.
