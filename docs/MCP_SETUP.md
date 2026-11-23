# MCP Setup — ChatGPT / Local Client / Remote

MCP (*Model Context Protocol*) adalah antarmuka agar ChatGPT atau klien lain dapat memanggil tools aplikasi. Proyek ini menyediakan **dua adapter tanpa dependensi eksternal**: HTTP JSON-RPC di `/mcp` dan stdio di `server/stdio.js`.

**Status:** adapter telah diuji lokal dengan JSON-RPC `initialize`, `tools/list`, dan `tools/call`. Belum dilakukan pengujian koneksi end-to-end dari akun ChatGPT, sehingga belum ada klaim kompatibilitas host final. Untuk produksi, migrasi ke SDK TypeScript v2 resmi disarankan.

## Local server

```bash
npm start
```

Baca katalog tools:

```bash
curl -s http://127.0.0.1:4173/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Contoh panggil operasi untuk mengangkat bahu pasien (pastikan `baseRevision` sama dengan hasil `get_world_state`):

```bash
curl -s http://127.0.0.1:4173/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"apply_scene_operations","arguments":{"baseRevision":0,"operations":[{"type":"set_joint","entityId":"patient","joint":"rightShoulder","axis":"abduction","angle":60}]}}}'
```

Jika `API_TOKEN` aktif, tambahkan header `Authorization: Bearer TOKEN`.

## Skenario pembuatan instrumen oleh ChatGPT

Contoh prompt:

> Bangun demonstrasi pemeriksaan neurologi. Cek katalog. Buat senter jika belum ada. Buat behavior `off/on` dengan aksi nyalakan/matikan, serta body cylinder, bola lensa, dan anchor grip. Tempatkan alat di meja, dan atur posisi dokter/pasien. Pakai `baseRevision` terbaru. Tes behavior sebelum dipakai. Jangan mengklaim refleks saraf telah disimulasikan.

Urutan tools:

1. `get_world_state`
2. `get_asset_catalog`
3. `create_behavior` jika behavior perlu dibuat
4. `test_behavior` dengan rangkaian aksi
5. `create_asset` untuk blueprint geometri 3D
6. `get_world_state` lagi untuk revision terbaru
7. `apply_scene_operations` untuk menambah objek, memposisikan, attach, mengubah pose, dan mengubah skenario.
8. `get_world_state` untuk memverifikasi hasil.

Setiap tool `create_*` menyimpan data secara persisten. `update_*` hanya bisa mengubah aset/behavior custom. Alat bawaan harus diduplikasi dengan ID baru jika perlu modifikasi.

## Daftar tools MCP

| Tool | Input | Keterangan |
| --- | --- | --- |
| `get_world_state` | `{}` | Snapshot lengkap scene, asset & behavior registry |
| `get_asset_catalog` | `{}` | Semua blueprint dan FSM |
| `list_templates` | `{}` | Template OSCE dan pose |
| `apply_scene_operations` | `{baseRevision, operations}` | Batch mutasi atomik 1–50 operasi |
| `create_asset` | Blueprint geometri | Tambah alat baru |
| `create_behavior` | FSM states/transitions | Tambah aturan interaksi |
| `update_asset` | `{id,changes}` | Revisi blueprint custom |
| `update_behavior` | `{id,changes}` | Revisi FSM custom |
| `test_behavior` | `{behaviorId,actions}` | Uji transisi tanpa commit |
| `get_execution_log` | `{}` | Log ringkas perubahan berhasil |
| `reset_world` | `{confirmed:true}` | Reset scene; destruktif |

`apply_scene_operations` mendukung operasi berikut:

```text
spawn_character, spawn_asset, move_entity, rotate_entity,
set_joint, apply_pose, attach, detach, trigger_action,
delete_entity, set_scenario, set_scenario_details,
complete_step, uncomplete_step, set_environment, rename_scene
```

Contoh payload lengkap ada di `examples/mcp-call.json`.

## Stdio adapter (klien lokal)

Jalankan:

```bash
node server/stdio.js
```

Klien MCP yang mendukung subprocess/stdio dapat mengarahkan tool path ke berkas itu. Untuk berbagi state dengan server web, set variabel `STUDIO_DATA` ke lokasi absolut `data/studio.json` yang sama. **Jangan menjalankan dua proses penulis file JSON secara paralel** pada data yang sama; untuk penggunaan serempak, gunakan server HTTP tunggal. Belum ada inter-process locking.

## Menghubungkan ChatGPT remote

1. Deploy backend pada host HTTPS yang stabil; **jangan menggunakan localhost sebagai URL ChatGPT**.
2. Atur autentikasi dan otorisasi yang sesuai. Minimum untuk pengembangan adalah bearer token; implementasi publik yang mengelola akun memerlukan OAuth / pengaturan akses yang diterima host.
3. Pertimbangkan penggunaan **SDK MCP v2 resmi** dan jalankan compliance tests untuk Streamable HTTP dan auth.
4. Buat custom MCP app di ChatGPT jika fitur dan akun mendukung, lalu masukkan URL endpoint `https://DOMAIN/mcp`.
5. Jalankan smoke test tools/list lalu create_asset, test_behavior, dan perubahan scene.
6. Buka studio di tablet dengan proyek yang sama. Scene akan tersinkron melalui SSE/polling.

Tingkat akses penuh dalam sandbox tetap dibatasi oleh izin pengguna dan validasi engine. Aplikasi **tidak** memberi ChatGPT akses shell, filesystem umum, API medis berbahaya, atau JavaScript execution bebas.

### Batasan adapter alpha

- Mendukung metode JSON-RPC utama `initialize`, `ping`, `tools/list`, `tools/call` dan notification tanpa balasan.
- Transport HTTP JSON stateless; tidak menyediakan SSE server-initiated MCP message stream (SSE yang ada ditujukan untuk browser UI).
- Belum mendukung authorization discovery, OAuth flow, resource subscriptions, sampling, server tasks, elicitations, atau interoperabilitas MCP Apps embedded UI.
- Tidak memiliki compatibility/certification matrix untuk ChatGPT remote; pengujian lokal tidak sama dengan deployment berhasil.

## Dokumentasi resmi

- https://github.com/modelcontextprotocol/typescript-sdk
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://developers.openai.com/api/docs/guides/custom-mcp-server
