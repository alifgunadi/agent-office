# 03 - Rekomendasi Akhir & Rencana Migrasi

Dokumen ini menggabungkan [01-product-requirements.md](01-product-requirements.md) (product-manager) dan [02-technical-research.md](02-technical-research.md) (lead-software-engineer) menjadi satu keputusan. Kalau ada konflik antara 01 dan 02, keputusan di sini yang berlaku.

Status: **riset selesai, belum ada implementasi.** Semua angka RAM masih **estimasi**. Angka nyata baru diketahui setelah Fase 0 (baseline) dijalankan.

---

## 1. Keputusan dalam satu kalimat

Bangun **host native tipis C# .NET 9 WinForms + WebView2** di folder baru `desktop/`. Host ini hanya membuka `http://127.0.0.1:4317/` dari `server.js` yang **tidak diubah**. Visual dijaga identik karena halaman, server, dan engine (Chromium) tetap sama. RAM dihemat dengan tidak membundel Chromium dan dengan menurunkan kerja webview saat jendela di-minimize.

## 2. Kenapa ini, bukan yang lain

| Opsi | Keputusan | Alasan singkat |
|---|---|---|
| **C# .NET 9 WinForms + WebView2** | **Primary** | Tooling sudah terpasang (.NET SDK 9, WebView2 Runtime 157). Semua API memori WebView2 tersedia secara typed. Kode kecil (~200-300 baris). Engine Chromium sehingga parity tinggi. |
| Edge `--app=` + profil terpisah | **Fallback / baseline** | Tidak perlu build dan render identik. RAM lebih tinggi dan tidak ada kontrol memori. Dipakai juga sebagai pembanding B2. |
| Rust wry/tao atau Tauri v2 | **Jalur upgrade** | Host paling kecil (est. 3-15 MB vs .NET 20-40 MB). Rust belum terpasang. Dipakai hanya kalau angka host .NET terbukti terlalu besar. |
| Electron | Ditolak | Membundel Chromium sendiri, sehingga penghematan RAM paling kecil. Bertentangan dengan tujuan utama. |
| Port server ke Go/Rust | Ditolak | Kontrak dengan hooks bisa melenceng. Auto-stop, Restart, dan marker harus ditulis ulang. |
| Muat `index.html` dari file | Ditolak | `EventSource('/events')` dan `fetch('/control/*')` relatif ke origin, jadi SSE dan Restart/Stop rusak. |
| Neutralino / webview C lib | Tidak dipilih | Ringan, tetapi kontrol memori WebView2 tidak diekspos tanpa COM manual. |

## 3. Ekspektasi RAM yang jujur

- Estimasi total tree desktop (host + `msedgewebview2.exe`): **~125-230 MB saat terlihat** dan **~50-110 MB saat minimize** dengan optimasi.
- Penghematan nyata dibanding **Electron**: est. 50-120 MB.
- Dibanding **Edge/Chrome `--app` dengan profil sendiri (B2)**: diharapkan lebih hemat, terutama saat minimize.
- **Peringatan:** kalau Chrome memang selalu terbuka, satu tab tambahan (B1) bisa lebih murah daripada app desktop apa pun, karena app membawa process tree browser/GPU/utility sendiri. Tujuan "lebih hemat" diukur terhadap **B2**. B1 hanya stretch target.
- Gate ship (dari PRD AC-3.1): idle median ≤ B2 **dan** ≤ 150 MB. Kalau gagal, jangan ship. Coba jalur Rust atau tetap di browser.

## 4. Resolusi konflik antara PM dan LSE

| Topik | PM (01) | LSE (02) | **Keputusan** |
|---|---|---|---|
| Zoom | Default 100%, Ctrl+wheel diizinkan seperti browser | Kunci 100% | **Ikuti browser:** default 100%, zoom diizinkan, tidak disimpan. Screenshot diff selalu diambil di 100%. Alasan: "sama persis dengan browser" termasuk perilakunya. |
| Server gagal start saat launch | Tidak ada UI baru, biarkan halaman/`reconnecting...` | Pesan native + tombol "Coba lagi" | **MVP: tanpa UI baru.** Host menunggu `/state` hingga 5 detik lalu tetap navigasi. Pesan native masuk "Later" bila ternyata membingungkan. |
| Font Nunito lokal (intercept) | Later | Fase 2/4 opsional | **Later.** Perilaku sama dengan browser hari ini (online = Nunito, offline = fallback). |
| Ingat ukuran/posisi jendela | Ya (perlu konfirmasi) | Ya | **Ya.** Tidak mengubah visual. |
| Cap frame rate | Ditolak (perubahan visual) | Default tanpa cap | **Tanpa cap.** |
| Tombol close | Quit jendela, server tetap jalan | Sama | **Quit jendela, server tetap jalan.** |
| Context menu / DevTools | Off di release | Off di release, on di debug | **Off di release, on di debug.** |
| F5/Ctrl+R | Wajib aktif | Tetap aktif | **Aktif.** Notice Stop meminta pengguna reload. |
| Single instance | Ya | Ya | **Ya** (mutex, launch kedua memfokuskan jendela). |

## 5. Penghematan RAM yang aman untuk visual

Urutan prioritas. Tidak ada yang mengubah `index.html`.

1. **WebView2, bukan Chromium bundel**: penghematan terbesar.
2. **Saat minimize:** `CoreWebView2Controller.IsVisible = false`, lalu `CoreWebView2.MemoryUsageTargetLevel = Low`. Saat restore: kembalikan `Normal` dan `IsVisible = true`. rAF otomatis berhenti dan halaman sudah tahan jeda frame.
3. **Matikan fitur webview yang tidak dipakai:** autofill, password, status bar, dan sejenisnya. Juga set `EnableTrackingPrevention = false`.
4. **Satu jendela, satu WebView, satu user data folder** di `%LOCALAPPDATA%\AgentOffice\WebView2`.
5. **`AdditionalBrowserArguments`:** eksperimen satu per satu. Pertahankan hanya flag yang terbukti hemat **dan** lolos screenshot diff.
6. *(Opsional, Fase 4)* `TrySuspendAsync()` saat lama di-minimize.

Yang **tidak** dilakukan karena mengubah visual atau tidak relevan: menurunkan FPS, membatasi ukuran backing canvas (blur), mematikan GPU, dan `imageSmoothingEnabled` (halaman tidak memakai `drawImage`).

## 6. Checklist parity (wajib lolos sebelum ship)

- [ ] Per-Monitor V2 DPI aware (`app.manifest`). `devicePixelRatio` sama dengan Edge, misalnya 1.25 di mesin ini.
- [ ] Zoom factor 1.0 saat diff. Cek apakah Chrome menyimpan zoom per-site untuk `127.0.0.1:4317`.
- [ ] Lebar scrollbar WebView2 = Chrome. Ini penting karena `scrollbar-gutter: stable` memengaruhi breakpoint 1100/700 px.
- [ ] `Language` webview = bahasa UI Chrome, supaya format jam di Activity panel sama.
- [ ] `DefaultBackgroundColor` = warna background halaman, supaya tidak ada kedipan putih.
- [ ] Font Nunito termuat (`document.fonts.check('700 13px Nunito')`).
- [ ] Screenshot diff = 0 pixel di lebar 1000/1300/1600 px × DPI 100/125/150%. Ambil dengan `prefers-reduced-motion` diemulasikan via CDP supaya frame deterministik.

## 7. Struktur folder target

Belum dibuat. Semua file yang sudah ada tetap tidak diubah.

```
agent-office/
  research/desktop-app/        <- riset ini
  desktop/
    README.md
    host-dotnet/               AgentOffice.Desktop.csproj, app.manifest, Program.cs, MainForm.cs, ServerBootstrap.cs, assets/app.ico
    launcher/open-office-app.ps1   fallback Edge --app
    tools/measure-ram.ps1          skrip ukur RAM (02 §6.4)
    tools/parity/                  skrip screenshot diff (02 §6.5)
```

Root repo ditemukan lewat `AGENT_OFFICE_ROOT` atau `appsettings.json`, tidak di-hardcode.

## 8. Rencana kerja

| Fase | Isi | Selesai bila | Owner yang disarankan |
|---|---|---|---|
| 0. Baseline | Ukur B1 (tab Chrome) dan B2 (Edge `--app`) dengan `measure-ram.ps1`. Ambil screenshot referensi. Catat ukuran viewport dan zoom yang biasa dipakai. | Angka baseline tercatat di `research/desktop-app/baseline.md` | lead-software-engineer |
| 1. Host minimal | WinForms + WebView2, ensure-server, poll `/state`, navigasi, judul, ikon, single instance | Halaman `live`, Restart & Stop berfungsi | lead-software-engineer |
| 2. Parity | Checklist §6, simpan bounds jendela | Diff 0 di 9 kombinasi | lead-software-engineer + lead-qa |
| 3. Hemat memori | Optimasi §5 poin 2-5, ukur ulang | Gate RAM lolos (§3) | lead-software-engineer |
| 4. Integrasi | **Shortcut "Agent Office" di Desktop dan Start Menu** (ikon dari favicon) yang membuka `AgentOffice.exe`. `start-office.ps1` membuka app (fallback browser). README diperbarui dan inkonsistensi diperbaiki (lihat §10). | Hooks tidak perlu diubah sama sekali | lead-software-engineer |
| 5. Opsional | Font lokal, TrySuspend, port Rust | Per item | - |

## 9. Pertanyaan terbuka untuk user (ada default, tidak memblokir)

1. **Target RAM:** gate ≤ 150 MB dan ≤ B2? *Default: ya.*
2. **Pembanding:** dibanding Edge `--app` (B2) atau dibanding satu tab di Chrome yang sudah terbuka (B1)? *Default: B2. B1 kemungkinan tidak tercapai oleh opsi mana pun.*
3. **Auto-open:** SessionStart Claude Code otomatis membuka jendela desktop? *Default: tidak (sesuai kode sekarang).*
4. **Ukuran jendela default:** *Default: 1600×900 (layout wide).*

## 10. Temuan sampingan (belum diperbaiki)

`README.md` tidak sinkron dengan kode:
- Menyebut `ensure-server.js` "opens the browser once" dan `AGENT_OFFICE_OPEN_BROWSER`, padahal kode tidak melakukannya.
- Menyebut `start-office-hidden.vbs`, padahal file itu tidak ada.
- Punya dua bagian "Auto start" yang saling bertentangan.
