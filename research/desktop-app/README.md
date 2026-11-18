# Riset: Agent Office sebagai Desktop App

Riset untuk memindahkan Agent Office dari tab browser ke aplikasi desktop Windows dengan **RAM minimal** dan **visual identik** (migrasi murni, tanpa redesign atau fitur baru).

Dibuat: 2026-11-18. Status: **sudah diimplementasikan dan dites (14/14 lulus)**. Aplikasi ada di [`desktop/`](../../desktop/README.md). Tidak ada file lama yang diubah.

## Urutan baca

| File | Isi | Penulis | Untuk |
|---|---|---|---|
| [03-recommendation-and-plan.md](03-recommendation-and-plan.md) | **Mulai di sini.** Keputusan akhir, resolusi konflik, checklist parity, rencana fase | Orchestrator (sintesis 01 + 02) | User & agent implementasi |
| [04-implementation-results.md](04-implementation-results.md) | Hasil build, 14 test end-to-end, RAM terukur, flag yang ditolak karena mengubah pixel | Orchestrator | Semua |
| [01-product-requirements.md](01-product-requirements.md) | PRD: goals/non-goals, user stories + acceptance criteria, business rules yang wajib dipertahankan, keputusan desktop, open questions | product-manager | Review scope, QA |
| [02-technical-research.md](02-technical-research.md) | Inventaris API browser di `index.html`, perbandingan 10 opsi (RAM, bundle, tooling), cara RAM WebView2 dihitung, skrip ukur RAM, rencana uji screenshot diff | lead-software-engineer | Engineering |

## Ringkasan

- **Pilihan utama:** host tipis **C# .NET 9 WinForms + WebView2** di folder baru `desktop/`, membuka `http://127.0.0.1:4317/`. `server.js`, `index.html`, dan hooks **tidak diubah**.
- **Fallback:** launcher Edge `--app=` (tanpa build).
- **Upgrade:** Rust wry/tao jika host .NET terlalu besar.
- **Ditolak:** Electron (bundel Chromium), port server, memuat HTML dari file.
- **RAM (terukur):** ~235-248 MB saat terlihat (Edge `--app`: ~297-324 MB), ~16-27 MB setelah di-minimize ±30 detik. Target 150 MB saat terlihat hanya bisa dicapai dengan flag yang mengubah pixel, jadi ditolak (lihat `04`).

## Catatan untuk agent

- Kalau ada konflik antara dokumen, ikuti `03`.
- Jangan ubah `server.js`, `hook.js`, `ensure-server.js`, `index.html`, atau `hooks-settings-snippet.json` dalam migrasi ini (PRD §4, §9).
- Angka RAM terukur ada di `04`. Angka di `01`-`03` adalah estimasi sebelum implementasi.
