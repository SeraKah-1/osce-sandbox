# QA v0.8 — Macro/Micro Framework

## Pengujian yang bisa diulang

```bash
npm run check
npm test
npm start
# terminal terpisah:
npm run smoke
```

`tests/v08-macro-micro.test.js` mencakup bentuk 3D baru, nested assemblies, button/toggle behavior, ujung batas, Undo/Redo, invalid schema, preview tanpa perubahan, snapshot validation, interaksi sentuh mikro, dan mouse right-drag rotasi makro. Tes lama untuk IK 3D, snap pasien dan furnitur, sesi sementara, isolasi sesi, browser recovery serta HTTP/MCP tetap dijalankan.

`npm run smoke` menguji pipeline kesehatan server, endpoint MCP tools/list dan resource HTML widget, sesi sementara yang sama, perubahan posisi pasien, dan relasi bed. Widget sumbernya adalah UI yang sama dengan situs web (bukan mock UI terpisah).

## Kasus yang harus diuji manual pada perangkat target

1. Sentuh dan tahan pada badan pasien sekitar sepertiga detik, geser horizontal, lihat karakter memutar. Lepas; posisi harus menetap. Ulangi pada kasur dan kursi.
2. Seret bagian yang sama secara langsung tanpa menahan; objek harus berpindah, bukan memutar.
3. Pindahkan pasien ke kursi/kasur. Geser/putar furnitur; pasien mengikuti.
4. Buat contoh `articulated-demo.json` melalui MCP atau builder, spawn ke scene, pilih, buka **Edit Detail**. Geser titik biru pada engsel/slider/dial; mekanisme mengikuti dan dibatasi range. Sentuh tombol biru: state posisi tombol berganti.
5. Masuk/keluar Detail Mode tanpa kehilangan orientasi, lalu gunakan kamera dua jari.
6. Putuskan koneksi MCP setelah scene dimuat; gerakan lokal tetap merespons, perubahan yang membutuhkan server melaporkan kegagalan dan dipulihkan.
7. Coba tablet landscape/portrait; pastikan panel Detail tidak menutupi seluruh objek.
8. Uji device context lost, multiple pointers, gesture cancel, throttling FPS, dan baterai.

## Kondisi yang masih memerlukan validasi

Belum ada pengukuran FPS dan input latency pada GPU iPad/Android sebenarnya, belum ada uji manual sentuhan fisik lintas merek, dan belum ada publikasi ulang ChatGPT Site ke versi ini. Jangan klaim ketiga hal itu sudah lulus tanpa bukti perangkat/server live.
