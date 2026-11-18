# Riset: Agent Office sebagai Desktop App

Riset untuk memindahkan Agent Office dari tab browser ke aplikasi desktop Windows dengan **RAM minimal** dan **visual identik** (migrasi murni, tanpa redesign atau fitur baru).

Dibuat: 2026-11-18. Status: riset selesai, belum ada implementasi. Tidak ada file project yang diubah.

## Urutan baca

| File | Isi | Penulis | Untuk |
|---|---|---|---|
| [03-recommendation-and-plan.md](03-recommendation-and-plan.md) | **Mulai di sini.** Keputusan akhir, resolusi konflik, checklist parity, rencana fase | Orchestrator (sintesis 01 + 02) | User & agent implementasi |
| [01-product-requirements.md](01-product-requirements.md) | PRD: goals/non-goals, user stories + acceptance criteria, business rules yang wajib dipertahankan, keputusan desktop, open questions | product-manager | Review scope, QA |
| [02-technical-research.md](02-technical-research.md) | Inventaris API browser di `index.html`, perbandingan 10 opsi (RAM, bundle, tooling), cara RAM WebView2 dihitung, skrip ukur RAM, rencana uji screenshot diff | lead-software-engineer | Engineering |

## Ringkasan

- **Pilihan utama:** host tipis **C# .NET 9 WinForms + WebView2** di folder baru `desktop/`, membuka `http://127.0.0.1:4317/`. `server.js`, `index.html`, dan hooks **tidak diubah**.
- **Fallback:** launcher Edge `--app=` (tanpa build).
- **Upgrade:** Rust wry/tao jika host .NET terlalu besar.
- **Ditolak:** Electron (bundel Chromium), port server, memuat HTML dari file.
- **RAM (estimasi):** ~125-230 MB saat terlihat, ~50-110 MB saat minimize. Gate ship: ≤ 150 MB dan ≤ Edge `--app`. Satu tab di Chrome yang sudah terbuka mungkin tetap lebih murah.

## Catatan untuk agent

- Kalau ada konflik antara dokumen, ikuti `03`.
- Jangan ubah `server.js`, `hook.js`, `ensure-server.js`, `index.html`, atau `hooks-settings-snippet.json` dalam migrasi ini (PRD §4, §9).
- Semua angka RAM adalah estimasi. Jalankan Fase 0 (baseline) sebelum memilih atau mengklaim angka.
- Langkah berikutnya: Fase 0 di `03` §8.
