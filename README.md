# OSCE Playground v0.4 — Direct Claymotion Controls

**Tablet-first OSCE puppet sandbox with direct-touch posing.** The app still uses one genuine 3D world and MCP tools; visual interactions now share the same controller across WebGL and Canvas2D fallback. v0.4 is an implementation package, **not** proof that a hosted ChatGPT Site has been updated.

## Touch-first controls (no slider, no move mode)

- **Drag torso/head** to move an entire patient or doctor along the floor.
- **Drag wrist** to guide the shoulder and elbow; **drag ankle** to guide the hip and knee.
- **Drag elbow/knee** for intermediate positioning. Movement is computed by a screen-space IK solver, respecting approximate joint limits.
- **Drag a prop** to reposition it; props attached to other objects must be detached first.
- **Drag empty space** to orbit; **pinch/two-finger pan** to zoom or reposition the camera.
- **Release** to freeze a pose and send its changed joints as one atomic revision. Undo reverts the whole gesture.
- **Tap an object** to show a small compact card. Expand it only for preset poses, 30° rotation, instrument actions, and attachment options.

This is **pose authoring**, not an anatomically accurate biomechanical simulator. Two-dimensional finger targets have unavoidable depth ambiguity; rotating the camera then dragging again resolves hard angles. Touch input and performance on physical tablets must still be verified before claiming production readiness.

## Key changes from v0.3

- Replaced axis sliders/Move-mode with one direct-touch interaction system (`web/touch-pose.js`).
- Independent body repositioning, arm/leg IK, and direct prop dragging on WebGL and Canvas2D.
- A small collapsed selection card to avoid obscuring the scene; markers appear only on the active joint.
- One server operation transaction per gesture; rollback on cancellation or second-finger interruption.
- Existing MCP scene and behavior tools remain unchanged; backend schema and saved scene version remain compatible with v0.3.
- Offline draft key migrates from v0.3 to v0.4 rather than losing pending user work.
- Added dedicated unit tests and browser automation for direct drag/persist behavior.

# OSCE Playground v0.3 — tablet-first 3D studio + MCP App

Aplikasi sandbox OSCE berbasis web yang memakai dua boneka bersendi, kamera yang dapat diputar, instrumen interaktif, katalog aset, editor skenario, penyimpanan, serta endpoint MCP untuk ChatGPT. **UI v0.3 menggunakan gaya stickman pastel mint–peach** dan hanya tiga akses utama: **Add**, **Ask GPT**, **Practice**. Kontrol objek muncul sesuai konteks seleksi, sementara fitur teknis berada di menu More.

Varian ChatGPT Sites dibangun dengan `npm run build:sites` dan menggunakan penyimpanan per akun. Situs web, antarmuka MCP App dan data scene memakai backend yang sama. `open_studio` menyediakan HTML MCP App untuk host yang kompatibel. Situs mandiri tidak berpura-pura memiliki AI internal: tombol Ask GPT membuat instruksi yang bisa dikirim dari ChatGPT; pada widget ChatGPT yang tersambung, pesan dikirim melalui host MCP.

## Jalankan

Butuh Node.js 22+. Tidak memerlukan `npm install` atau CDN untuk rendering.

```bash
npm run check
npm test
npm start
# Tab lain, ketika server aktif:
npm run smoke
```

Buka `http://127.0.0.1:4173` di browser. Preview antarmuka MCP App di `/widget`. Buka menu **... → Sinkronisasi & MCP → Uji MCP sekarang** untuk mengonfirmasi endpoint lokal. File project default disimpan di `data/studio.json` dan ikut dimuat lagi setelah server restart. Lihat [panduan deploy](docs/DEPLOY.md).

## Apa yang nyata, bukan mock

- **Renderer 3D WebGL**: camera orbit, pinch zoom, pan, boneka dan alat diproyeksikan dari koordinat X/Y/Z, animasi pose dari hierarki sendi; fallback Canvas2D proyeksi 3D aktif jika GPU/WebGL tidak tersedia. Bug render loop saat data terlambat sudah diperbaiki.
- **Manipulasi**: pilih sendi, slider sudut, drag sendi, preset duduk/berdiri, geser instrumen, attach/detach ke anchor tervalidasi, rotasi objek, duplicate, delete, camera reset, undo/redo.
- **Add**: dua tipe puppet dan katalog 10 aset awal. Alat baru yang dibuat muncul dalam katalog tanpa edit kode aplikasi.
- **Asset Factory & Behavior Engine**: membuat geometri baru dari box/sphere/cylinder, titik anchor, state/transisi, warna/skala per status, efek attach/detach/move; divalidasi tanpa menjalankan JavaScript bebas.
- **Practice**: tiga kasus bawaan; perubahan template dan checklist disimpan di server, bukan simulasi skor klinis.
- **Sync & recovery**: operasi revisi atomik, validasi konflik, penyimpanan file temp+rename, undo/redo dengan rollback pada error disk, draft lokal khusus pose/posisi jika koneksi putus, restore JSON untuk situs mandiri, ekspor proyek, status Saving/Saved/Offline/Error.
- **18 tools MCP** (termasuk `open_studio` dan `preview_scene_operations` yang membuat pratinjau transaksi tanpa menyimpannya); satu `ui://osce-playground/studio.html` resource interaktif.
- **Deploy**: Dockerfile, Compose, Caddy HTTPS, Render Blueprint dengan persistent disk, health endpoint dan script smoke.

## Arsitektur

- `web/index.html`, `web/styles.css`, `web/app.js`: website tablet dengan panel kontekstual, keyboard dan sentuhan. `web/sw.js` menyimpan **app shell** saja, **bukan** data pasien atau hasil API.
- `web/render3d.js`: renderer, model puppet, kamera, gesture dan fallback saat GPU hilang.
- `server/core.js`: sumber kebenaran scene, validasi, asset/behavior registry, transaksi, penyimpanan, undo/redo, preview.
- `server/index.js`: HTTP API, auth bearer single-owner, MCP, resource widget.
- `server/mcp.js`: 18 tools, MCP JSON-RPC endpoint.
- `server/widget.js`: menghasilkan UI ChatGPT dari **file UI website yang sama**, bukan duplikasi yang bisa tertinggal.
- `tests/`: 25 pengujian Node, ditambah laporan browser QA pada [docs/QA-V03.md](docs/QA-V03.md).

## Konektivitas ChatGPT

`POST https://DOMAIN/mcp` setelah HTTPS deployment; UI resource `ui://osce-playground/studio.html`, MIME `text/html;profile=mcp-app`. Untuk ChatGPT Sites, katalog MCP memakai endpoint Site yang sama dengan editor. Lihat [docs/CHATGPT_SETUP.md](docs/CHATGPT_SETUP.md).

## Pembatasan yang disengaja

Bentuk instrumen dihasilkan dari primitive yang saat ini didukung, bukan generasi bebas mesh GLB. State alat adalah animasi/status prosedural, bukan model tekanan darah, refleks saraf atau fisiologi manusia. Kontrol IK memakai perkiraan visual di layar, tanpa fisika tubuh atau detail jari. Tidak ada skor teknik otomatis. Tidak cocok untuk menyimpan rekam medis, asesmen OSCE formal, layanan publik multi-user atau pembuktian prosedur medis aman. Pengujian GPU di iPad/Android fisik belum dilakukan; lihat [STATUS](docs/STATUS.md).
