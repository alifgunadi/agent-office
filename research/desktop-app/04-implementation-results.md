# 04 - Hasil Implementasi & Testing

Tanggal: 2026-11-18. Implementasi mengikuti rekomendasi di [03](03-recommendation-and-plan.md). Kode ada di [`desktop/`](../../desktop/README.md). Tidak ada file lama yang diubah (`server.js`, `index.html`, `hook.js`, `ensure-server.js`, dan hooks snippet tetap sama).

## Yang dibangun

- `desktop/app/AgentOffice.exe`: host C# .NET 9 WinForms + WebView2 (SDK 1.0.4314.35, Runtime 157).
- Ikon **Agent Office** di Desktop dan Start Menu (`desktop/install-shortcut.ps1`). Artwork ikon diambil dari favicon `index.html` dan dirender dengan Edge.
- `desktop/tools/test-desktop.js`: 14 test end-to-end yang mengendalikan exe sungguhan lewat DevTools Protocol, di server terisolasi port 4399.
- `desktop/tools/measure-ram.ps1`: menjumlahkan private working set seluruh process tree.

Build: `dotnet publish -c Release -warnaserror` menghasilkan **0 warning, 0 error**. Warning MSB3277 dari referensi WPF di paket WebView2 dihilangkan dengan membuang referensi WPF yang tidak dipakai.

## Hasil test (14/14 lulus)

| # | Test | Hasil |
|---|---|---|
| T01 | Cold start: app menyalakan server dan menampilkan office | live dalam ~3,5 detik, judul jendela "Alifs Office" |
| T02 | Ukuran jendela, DPI, ketajaman canvas, font | 1522×875 CSS px (layar 1536×912), DPR 1.25, canvas backing = css × dpr, Nunito termuat |
| T03 | Hooks menggerakkan meja | `lead-qa`: working → done. Request tanpa header → 403 |
| T04 | Navigasi ke luar diblokir | tetap di `127.0.0.1` |
| T05 | Single instance | launch kedua exit 0, tetap 1 proses |
| T06 | **Paritas visual vs Edge** | **0 pixel berbeda** (2000×1125 px, DPR 1.25) |
| T07 | RAM | lihat tabel di bawah |
| T08 | Tombol Restart | PID server berganti, halaman reload, kembali live |
| T09 | Tombol Stop | status "stopped", marker ditulis, jendela tetap terbuka |
| T10 | F5 saat server mati | tidak ada halaman error Chromium, kembali live sendiri |
| T11 | Server auto-stop/crash | reconnecting... → live tanpa reload |
| T12 | Tutup jendela | app keluar, server tetap jalan, posisi tersimpan |
| T13 | Buka ulang | posisi/ukuran dipulihkan persis |
| T14 | Error | 0 exception halaman, 0 console error tak terduga, 0 error di log host |

Uji tambahan di server asli (port 4317, tanpa operasi yang merusak):
- Dibuka dari ikon Desktop lewat Explorer.
- Tersambung ke server yang sedang berjalan tanpa me-restart-nya (PID tetap).
- Meja "main" menampilkan tool yang sedang dipakai sesi Claude Code saat itu.

## RAM (diukur, bukan estimasi)

Private working set seluruh process tree, monitor 1920×1200 @125%:

| Kondisi | Desktop app | Edge `--app` (B2) |
|---|---|---|
| Terlihat | **~235-248 MB** (host 9 MB, GPU ~90, renderer ~95, browser ~30, utility ~12) | ~297-324 MB |
| Minimize ±10 detik | ~129-148 MB | - |
| Minimize ≥30 detik | **~16-27 MB** (Windows memangkas working set) | - |

- **≤ B2 terpenuhi:** sekitar 20-27% lebih hemat daripada Edge app window, dan hampir nol saat di-minimize.
- **Target absolut 150 MB saat terlihat tidak tercapai tanpa mengubah tampilan.** Flag yang diuji:

| Flag | RAM terlihat | Paritas pixel | Keputusan |
|---|---|---|---|
| (tanpa flag) | ~243 MB | 0% beda | **dipakai** |
| `--disable-gpu` | ~167 MB | 46% pixel beda | ditolak |
| `--enable-low-end-device-mode` | ~170 MB | 63% pixel beda, delta warna hingga 29/255 (banding) | ditolak |
| `--disable-features=msSmartScreen…` dll. | ~244 MB | - | tidak berpengaruh |
| `--js-flags=--max-lazy` | ~245 MB | - | tidak berpengaruh |

Sisa RAM saat terlihat dipakai oleh GPU process dan renderer, karena halaman menggambar ulang seluruh canvas setiap frame. Satu-satunya cara menekannya adalah mengubah `index.html` (misalnya membatasi frame rate), dan itu di luar scope migrasi.

## Catatan

- Run pertama sempat gagal karena jendela dipindah ke monitor kedua di tengah test. Run-run berikutnya stabil.
- Kegagalan T02 dan T13 di run awal ternyata bug di test (PowerShell tidak DPI-aware, dan `outerWidth` di WebView2 tidak termasuk bingkai jendela), bukan bug aplikasi.
- `start-office.ps1` tidak diubah dan tetap membuka browser. Aplikasi dibuka lewat ikon Desktop/Start Menu.
