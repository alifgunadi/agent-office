# 02 - Technical Research: Migrasi Agent Office ke Desktop App (RAM minimal, visual identik)

Status: riset saja. Tidak ada file proyek yang diubah.
Tanggal: 2026-11-18. Basis kode: commit `0d3e63f` (branch `main`).
Target: Windows 11 (utama). Mesin referensi: Intel(R) Graphics, RAM 15.7 GB, scaling 125% (AppliedDPI 120, jadi `devicePixelRatio` = 1.25).

> Tentang angka: semua angka RAM dan ukuran di dokumen ini adalah **estimasi** dari karakteristik umum tiap teknologi (ditandai "est."), **bukan hasil pengukuran di mesin ini**. Angka sebenarnya bergantung pada versi runtime, driver GPU, ukuran jendela, DPI, dan jumlah agent yang tampil. Bagian 6.4 berisi skrip untuk mengukur angka sebenarnya. Keputusan final harus didasarkan pada hasil skrip itu.

---

## Ringkasan eksekutif

- Halaman `index.html` adalah satu file HTML berisi Canvas 2D murni (tanpa gambar, tanpa `drawImage`, tanpa offscreen canvas) dan memakai API web standar: `EventSource`, `fetch`, `location.reload`, `ResizeObserver`, `matchMedia`, `document.fonts`, `devicePixelRatio`, pointer events. Semua API ini didukung penuh oleh WebView2 (Chromium/Edge 157 sudah terpasang). Jadi kompatibilitas WebView2 tinggi.
- **Rekomendasi utama:** host native tipis **C# .NET 9 WinForms + WebView2**. Host ini membuka `http://127.0.0.1:4317/` dari `server.js` yang **tidak diubah**. Semua tooling-nya sudah ada di mesin ini. Host punya akses penuh ke API hemat memori WebView2 (`IsVisible`, `TrySuspendAsync`, `MemoryUsageTargetLevel`, `AdditionalBrowserArguments`, `WebResourceRequested`).
- **Fallback (tanpa build):** launcher PowerShell `msedge.exe --app=http://127.0.0.1:4317/` dengan profil khusus. Paritas render 100%, tetapi kontrol memorinya lebih sedikit.
- **Jalur upgrade bila host harus sekecil mungkin:** Rust (wry/tao atau Tauri v2). Desainnya sama, hanya bahasa host yang berbeda. Prasyarat MSVC sudah ada, tinggal menginstal `rustup`.
- **Ditolak:** Electron. Electron membawa Chromium sendiri, dan itulah sumber RAM/disk terbesar yang ingin dihindari.
- Penghematan terbesar datang dari dua hal: (1) tidak membundel Chromium, dan (2) **menghentikan render saat jendela tidak terlihat**. Halaman saat ini menggambar ulang seluruh scene setiap frame `requestAnimationFrame` tanpa henti. Poin (2) bisa dilakukan sepenuhnya dari host tanpa menyentuh `index.html`.

---

## 1. Analisis arsitektur saat ini

### 1.1 Komponen

| File | Peran | Catatan untuk migrasi |
|---|---|---|
| `server.js` | HTTP server tanpa dependensi, bind `127.0.0.1:${AGENT_OFFICE_PORT:-4317}`. Route: `GET /` (index.html, `no-store`), `GET /events` (SSE, keepalive 15 s), `GET /state`, `POST /event`, `POST /control/stop`, `POST /control/restart`. | Kontrak HTTP ini dipakai oleh hook Claude Code, adapter Antigravity, dan plugin OpenCode. **Kontrak ini tidak boleh berubah.** |
| `hook.js` | Meneruskan event hook ke `POST /event` dengan header `X-Agent-Office: 1`. Saat `UserPromptSubmit` gagal terkirim, ia menghidupkan server lewat `ensure-server.js`, kecuali marker stop ada. | Tidak terpengaruh oleh desktop app. |
| `ensure-server.js` | Mem-probe `GET /state`. Kalau tidak ada respons, ia men-spawn `server.js` secara detached dengan `process.execPath`. Ia juga **menghapus** `%TEMP%\agent-office.stopped`. | Host desktop cukup memanggil skrip ini, jadi logika start tidak perlu ditulis ulang. |
| `index.html` | Seluruh UI (CSS + JS inline, 1944 baris). | Harus dimuat dari origin server (alasan di 1.3). |
| `start-office.ps1` | Menjalankan `ensure-server.js`, lalu `Start-Process http://127.0.0.1:$port` (browser default). | Desktop app menggantikan langkah "buka browser". |
| `stop-office.ps1`, `install-/uninstall-autostart.ps1` | Stop dan logon task. | Tetap berlaku. |

Perilaku siklus hidup server yang memengaruhi host:
- **Restart** (`/control/restart`): server menutup port, men-spawn **proses baru** (detached, `process.execPath`), lalu proses lama `exit`. Akibatnya **PID server berganti**. Host tidak boleh menganggap server sebagai child process yang PID-nya tetap. Server harus diperlakukan sebagai layanan eksternal yang dicek lewat HTTP.
- **Stop** (`/control/stop`): menulis marker `%TEMP%\agent-office.stopped` lalu exit.
- **Auto stop**: server mati 30 s setelah `SessionEnd` terakhir (kecuali `AGENT_OFFICE_AUTO_STOP=0`). Di browser, halaman lalu menampilkan "reconnecting...". Di desktop app perilakunya sama karena halamannya sama.

Ketidaksesuaian dokumentasi yang ditemukan (hanya dicatat, tidak diperbaiki):
- README menyebut `ensure-server.js` "opens the browser once" dan variabel `AGENT_OFFICE_OPEN_BROWSER`. Kode `ensure-server.js` **tidak** membuka browser, dan variabel itu tidak dipakai di mana pun. Hanya `start-office.ps1` yang membuka browser.
- README menyebut `start-office-hidden.vbs`, tetapi file itu tidak ada di repo.
- README punya dua bagian "## Auto start" yang isinya duplikat.

### 1.2 Inventaris API browser yang dipakai `index.html` (hasil grep)

Hitungan token diambil dengan `grep -oE ... index.html | sort | uniq -c`.

**Jaringan / navigasi**

| API | Lokasi (baris) | Catatan kompatibilitas |
|---|---|---|
| `new EventSource('/events')` + `onopen`/`onerror`/`onmessage` | 1915-1939 | URL relatif, **same-origin**. Reconnect otomatis bawaan EventSource. |
| `fetch('/control/' + action, { method: 'POST', headers: { 'X-Agent-Office': '1' } })` | 1867 | Custom header. Kalau origin berbeda, request ini memicu CORS preflight yang **sengaja tidak pernah disetujui server**. |
| `fetch('/state', { cache: 'no-store' })` | 1891 | Polling saat restart. |
| `location.reload()` | 1892 | Dipanggil setelah restart berhasil. |
| `<link>` ke `https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800` + preconnect `fonts.gstatic.com` | 10-12 | **Satu-satunya dependensi eksternal (internet).** Lihat 5.3. |
| Favicon `data:image/svg+xml,...` | 8-9 | Di desktop, favicon tidak dipakai sebagai ikon jendela. Ikon perlu dikonversi ke `.ico`. |

**Canvas 2D** (`canvas.getContext('2d')`, satu canvas `#office`)

- Path: `beginPath` (61), `moveTo` (29), `lineTo` (31), `closePath` (12), `ellipse` (29), `arc` (10), `arcTo` (4), `quadraticCurveTo` (10), `fill` (59), `stroke` (34), `clearRect` (1).
- Style: `fillStyle` (41), `strokeStyle` (25), `lineWidth` (25), `lineCap` (6), `lineJoin` (2), `globalAlpha` (19), `shadowBlur`/`shadowColor`/`shadowOffsetY` (masing-masing 2, lewat helper `soft()`/`noShadow()`).
- Transform: `setTransform` (3), `transform` (6), `scale` (5), `translate` (2), `save`/`restore` (4, plus helper `safe()` yang membungkus setiap draw call).
- Teks: `font` (28), `fillText` (8), `measureText` (11), `textAlign` (6), `textBaseline` (6). Font canvas: `'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`, ditambah fallback emoji `'Segoe UI Emoji', ...` untuk ikon chat `💬 ☕ ♪ … ! ✓`.
- **Tidak dipakai:** `drawImage`, `getImageData`/`putImageData`, `toDataURL`, `createPattern`, gradien canvas, `ctx.filter` (keempat kemunculan `filter` adalah `Array.prototype.filter`), `OffscreenCanvas`, `imageSmoothingEnabled`. Konsekuensinya, `imageSmoothingEnabled` **tidak relevan** karena tidak ada bitmap yang di-scale. Grafiknya vektor murni yang di-rasterisasi ulang setiap frame.
- Ukuran backing store: `canvas.width = round(cssW * dpr)`, `canvas.height = round(cssH * dpr)`, dengan `dpr = max(1, devicePixelRatio)` (baris 1773-1777). Ukuran CSS di-set lewat `canvas.style.width/height`.

**DOM / layout / event**

| API | Catatan |
|---|---|
| `document.getElementById`, `querySelector`, `createElement` (4, hanya untuk `<li>` log), `textContent`, `append`, `className`, `style.*`, `setAttribute('aria-label')` | DOM standar. |
| `getComputedStyle(stage)`, `clientWidth`/`clientHeight` | Mengukur area stage. **Lebar scrollbar memengaruhi `clientWidth`** (lihat 5.5). |
| `new ResizeObserver(measureStage)` + `window.addEventListener('resize')` | Layout responsif. Ambang `availW >= 1100` (isometric wide), `>= 700` (3 kolom), selain itu 2 kolom. Media query CSS `max-width: 900px`. **Ukuran viewport menentukan layout.** |
| `window.matchMedia('(prefers-reduced-motion: reduce)')` + listener `change` | Saat aktif: `animT = 0`, animasi canvas membeku, agent "teleport". Ini berguna untuk screenshot deterministik (bagian 6.5). |
| `document.fonts.load('700 13px Nunito')`, `document.fonts.load('800 13px Nunito')` | Memanaskan web font untuk canvas. Komentar di kode: "frames redraw continuously, so it appears once loaded". Artinya halaman **mengandalkan redraw terus-menerus** agar teks canvas pindah ke Nunito setelah font termuat. |
| `requestAnimationFrame(frame)` | Loop **tanpa henti**. `frame()` memanggil rAF lagi sebelum `render()`, dan render menggambar ulang seluruh lantai, dinding, furnitur, dan karakter setiap frame. Tidak ada cache layer statis. Jumlah frame mengikuti refresh rate monitor (60/120/144 Hz). |
| `performance.now()`, `Date.now()`, `setTimeout` | Timing. `updateAgents(dt, t, gap > 2000)` sudah menangani lompatan waktu besar (mis. tab yang sempat hidden). Jadi **menjeda rAF aman secara logika**. |
| `new Date(e.t).toLocaleTimeString()` | Format jam di panel Activity **bergantung locale** (lihat 5.9). |
| `localeCompare` | Urutan guest desk, juga bergantung locale (dampaknya kecil). |
| `pointermove`/`pointerleave` + `getBoundingClientRect` | Hover agent. |
| `console.error` | Diagnostik. |
| CSS: `100dvh`, `scrollbar-gutter: stable`, `:focus-visible`, `background-attachment: fixed`, `box-shadow`, `linear-gradient`, `color-scheme: light`, `overflow-wrap: anywhere` | Semuanya didukung Chromium modern. |

**Tidak dipakai** (penting untuk menilai webview): `localStorage`/`sessionStorage`, `IndexedDB`, Service Worker, `window.open`, `alert`/`confirm`/`prompt`, clipboard, notifikasi, WebSocket, WebGL, Web Audio, `history`, `navigator.*`, user-agent sniffing. Halaman ini **tidak bergantung pada user-agent**.

Kesimpulan kompatibilitas: semua fitur di atas termasuk web platform "baseline". WebView2 (Chromium 157) kompatibel 100%. Webview non-Chromium (WebKitGTK/WKWebView di Linux/macOS) kemungkinan besar juga kompatibel, tetapi rasterisasi teks dan anti-aliasing canvas bisa sedikit berbeda. Itu di luar target Windows.

### 1.3 Konsekuensi arsitektural: halaman harus dimuat dari origin server

Karena `EventSource('/events')` dan `fetch('/control/...')` memakai URL relatif, dan proteksi CSRF server bergantung pada fakta bahwa custom header `X-Agent-Office` memaksa CORS preflight yang tidak pernah disetujui, maka:
- Memuat `index.html` dari `file://`, dari custom scheme (`tauri://`, `https://app.local`), atau lewat `NavigateToString` akan **merusak** SSE dan tombol Restart/Stop. Kalau ingin dibuat berfungsi, `index.html` atau `server.js` harus diubah (base URL absolut plus CORS). Itu melanggar "pure migration" dan melemahkan model keamanannya.
- **Keputusan: webview menavigasi ke `http://127.0.0.1:<port>/`** persis seperti browser. Ini juga membuat `location.reload()` dan fitur Restart (yang memuat `index.html` baru) bekerja tanpa perubahan.

---

## 2. Perbandingan opsi

### 2.1 Cara membaca angka RAM

- Angka yang dibandingkan adalah **private working set** (kolom "Memory" di Task Manager), dijumlahkan untuk **seluruh process tree** aplikasi.
- "Idle" berarti jendela terlihat, sekitar 12 desk, animasi berjalan, ukuran kira-kira 1600x900 CSS px pada DPR 1.25. Karena halaman ini selalu menggambar, "idle" di sini tidak berarti 0% CPU.
- "Hidden" berarti jendela di-minimize, dengan pengoptimalan dari bagian 3 diterapkan.
- Semua angka adalah **est.** dengan rentang lebar. Proses Node server (est. 30-50 MB, lihat bagian 4) **tidak** termasuk di kolom RAM karena sama untuk semua opsi, kecuali dinyatakan lain.

### 2.2 Tabel

| Opsi | RAM idle, terlihat (est.) | RAM saat minimize + optimasi (est.) | Ukuran bundle (est.) | Butuh Node runtime? | Kompleksitas dev | Paritas render vs Chrome | Auto-update | Tooling di mesin ini |
|---|---|---|---|---|---|---|---|---|
| **Chrome tab (baseline sekarang)** | Marginal 60-120 MB (renderer tab) jika Chrome sudah terbuka. 200-400 MB jika Chrome dibuka hanya untuk ini. | Tab background: rAF berhenti, renderer tetap ~40-80 MB | 0 | Ya (server) | 0 | Referensi | Chrome sendiri | Ada |
| **Electron** | 150-280 MB (main + GPU + renderer + utility, Chromium bundel) | 100-180 MB | Installer 80-120 MB, terpasang 250-350 MB | Bundel Node di main process (lihat catatan) | Sedang | Sangat tinggi (Chromium, tetapi versi berbeda dari Chrome) | electron-updater / Squirrel (matang) | Node/npm ada |
| **Tauri v2 (Rust + WebView2)** | 110-200 MB (host Rust 5-15 + tree msedgewebview2) | 40-90 MB | 3-10 MB (+ bootstrapper WebView2 opsional) | Tidak untuk host. Server tetap Node kecuali di-port. | Sedang (Rust, config, capability/permission) | Tinggi (Edge Chromium 157) | Plugin updater resmi (signed) | Rust **tidak ada** (MSVC ada) |
| **Wails v2/v3 (Go + WebView2)** | 115-210 MB (host Go 10-25) | 45-95 MB | 8-15 MB | Tidak untuk host. Server bisa di-port ke Go in-process. | Sedang | Tinggi | Tidak ada updater resmi bawaan (v3 masih berkembang, perlu dicek ulang) | Go **tidak ada** |
| **Neutralinojs** | 110-200 MB (host C++ kecil ~5-15 + WebView2) | 50-100 MB (API memori WebView2 tidak diekspos) | 2-5 MB | Tidak untuk host. Punya server internal sendiri (tidak dipakai). | Rendah-sedang. Konfigurasi `url` eksternal perlu diverifikasi. | Tinggi | Updater sederhana bawaan | Bisa via npm |
| **webview/webview (C/C++) atau binding (mis. Bun/Deno/Go)** | 105-195 MB (host 2-10) | 50-100 MB (API WebView2 lanjut harus diakses manual lewat COM) | < 1-3 MB | Tergantung binding | Sedang (C++) / rendah (binding) | Tinggi | Tidak ada | VS 2022 C++ ada |
| **Host native WebView2 C# .NET 9 WinForms** | 125-230 MB (host .NET 20-40 + WebView2) | 50-110 MB | Framework-dependent 0.5-3 MB (perlu .NET Desktop Runtime 9). Self-contained 60-150 MB. | Tidak untuk host | **Rendah** (~200-300 baris) | Tinggi | Tidak ada bawaan. Bisa sederhana karena halaman di-update dari repo (lihat 6.1). | **.NET 9 SDK + WindowsDesktop 9.0.9 ada** |
| **Rust wry/tao langsung (tanpa Tauri)** | 105-195 MB (host 3-10) | 40-90 MB | 2-6 MB | Tidak untuk host | Sedang-tinggi (event loop, COM WebView2 via `webview2-com`) | Tinggi | Tidak ada | Rust tidak ada |
| **Electrobun (Bun + system webview / CEF)** | Dengan WebView2: 130-230 MB (proses Bun 25-50 + WebView2). Dengan CEF: setara Electron. | Tidak pasti | 15-30 MB (system webview) | Bun di host. Server bisa jalan di Bun. | Sedang. Dukungan Windows lebih muda daripada macOS, perlu verifikasi status terkini. | Tinggi (WebView2) | Updater bawaan (delta) | Bun 1.4.4 ada |
| **Edge `--app=` (launcher PWA-style)** | Profil terpisah: 150-300 MB (browser + GPU + renderer + utility + network). Profil default saat Edge sudah jalan: marginal ~60-120 MB. | Tidak ada kontrol host. Edge melakukan occlusion/background throttling sendiri. | 0 (satu `.ps1`/shortcut) | Ya (server) | **Sangat rendah** | **Identik** (engine sama dengan WebView2/Chrome) | Edge sendiri | Edge + Chrome ada |
| **Pertahankan Node server + jendela webview tipis** (pola umum di atas) | = opsi host yang dipilih + Node 30-50 MB | | | Ya | | | | |

Catatan per opsi:
- **Electron:** satu-satunya opsi yang membawa Chromium sendiri. Main process Electron adalah Node. Menjalankan `server.js` di dalamnya dengan `require` **tidak aman** karena `server.js` memanggil `process.exit` saat stop/restart (aplikasi ikut mati), dan `restart()` men-spawn `process.execPath` (= `electron.exe`) dengan argumen `server.js`. Itu baru berjalan sebagai Node kalau `ELECTRON_RUN_AS_NODE=1`. Bisa diakali, tetapi menambah risiko. Electron juga memberi paling sedikit penghematan RAM, sehingga bertentangan dengan tujuan utama.
- **Tauri v2:** pilihan matang untuk distribusi (installer NSIS/MSI, updater bertanda tangan, `additionalBrowserArgs` di config). API WebView2 lanjut (`MemoryUsageTargetLevel`, `TrySuspend`) harus diakses lewat `with_webview` + `webview2-com` (unsafe COM). Untuk aplikasi "satu jendela yang membuka URL lokal", sebagian besar framework Tauri (IPC, capability) tidak terpakai.
- **Wails:** cocok kalau server mau di-port ke Go dalam satu proses. Tanpa port, Wails tidak memberi keuntungan dibanding host tipis lain. Wails dirancang untuk aset frontend yang di-embed. Navigasi ke URL eksternal sebagai halaman utama bukan alur standarnya (perlu verifikasi).
- **Neutralinojs:** ringan, tetapi model aplikasinya (server internal + `neutralino.js` client lib) tidak terpakai. Kontrol WebView2 (memory target, suspend, intercept font) tidak tersedia, jadi penghematan saat minimize lebih kecil.
- **webview/webview:** library C tipis di atas WebView2. API lanjut harus diakses lewat `webview_get_native_handle` + COM manual. Binding Bun (`webview-bun`) memungkinkan host berbahasa TS di Bun, tetapi proses Bun (~25-50 MB est.) menghapus keunggulan ukurannya.
- **C# WinForms + WebView2:** kontrol resmi Microsoft dengan seluruh API WebView2 tersedia secara typed. Biaya utamanya adalah runtime .NET di proses host (est. +15-35 MB dibanding host Rust/C++). NativeAOT tidak didukung resmi untuk WinForms, jadi angka itu tidak bisa ditekan jauh. WPF lebih berat daripada WinForms, jadi tidak disarankan.
- **Edge `--app=`:** nol kode, render identik, jendela tanpa address bar. Kekurangannya: (a) dengan `--user-data-dir` terpisah, seluruh tree browser Edge berjalan sendiri; (b) tanpa profil terpisah, jendela "menempel" ke Edge pengguna (ekstensi, flag, zoom per-site ikut terbawa); (c) ikon dan judul di taskbar dikelola Edge; (d) tidak ada kontrol memory target. Chrome `--app=` setara, hanya engine-nya Chrome.

---

## 3. Bagaimana RAM WebView2 sebenarnya dihitung, dan penghematan yang tidak mengubah visual

### 3.1 Penjelasan jujur tentang "WebView2 berbagi proses dengan Edge"

- WebView2 Evergreen Runtime (`C:\Program Files (x86)\Microsoft\EdgeWebView\Application\157.0.4341.46\`) adalah **instalasi terpisah** dari browser Edge, dengan executable `msedgewebview2.exe`. Aplikasi WebView2 **tidak** menumpang di proses browser Edge yang sedang dibuka pengguna.
- Yang benar-benar dibagi: **file binary di disk** (satu runtime untuk semua aplikasi WebView2) dan **halaman kode (DLL) yang di-map dari file yang sama**. Halaman kode ini masuk "shared working set", bukan "private working set". Jadi ia tidak dihitung ganda per aplikasi di kolom Memory Task Manager. Inilah alasan bundle Tauri/C# kecil dan footprint per aplikasi lebih rendah daripada Electron (Electron membawa salinan `chrome.dll`/`electron.exe` sendiri yang tidak dibagi dengan siapa pun).
- **Process tree** WebView2 dibagi hanya antar-WebView yang memakai **user data folder (UDF) yang sama, versi runtime yang sama, dan environment options yang sama**. Untuk satu aplikasi dengan satu jendela, tree-nya kira-kira:

| Proses (`msedgewebview2.exe --type=...`) | Fungsi | Private WS (est.) |
|---|---|---|
| browser (tanpa `--type`) | Proses induk, jaringan untuk sebagian config, UI thread | 25-45 MB |
| `gpu-process` | Kompositor + rasterisasi canvas terakselerasi | 30-80 MB (sangat bergantung driver dan ukuran canvas) |
| `renderer` | Blink + V8 + Canvas 2D untuk halaman ini | 40-90 MB |
| `utility` (network service, storage, audio, dll.) | Biasanya 1-3 proses | 8-25 MB masing-masing |
| `crashpad-handler` | Crash reporting | 2-5 MB |
| **Total** | | **~100-200 MB** |

- Ditambah proses host: Rust/C++ 2-15 MB, Go 10-25 MB, .NET WinForms 20-40 MB, Bun 25-50 MB (semua est.).
- **Bandingkan dengan Chrome tab hari ini:** kalau Chrome memang selalu terbuka, biaya marginal halaman ini hanya renderer tab (+ sebagian GPU). Desktop app WebView2 menambah tree browser/GPU/utility sendiri. **Desktop app bisa memakai RAM total lebih besar daripada "satu tab tambahan di Chrome yang sudah terbuka".** Penghematan nyata terjadi kalau pengguna menutup tab/jendela Chrome itu, atau kalau dibandingkan dengan Electron. Ini harus dikomunikasikan dengan jelas ke pengguna.
- Penghematan terbesar yang bisa dikontrol:
  1. Tidak membundel Chromium (WebView2 vs Electron): est. hemat 50-120 MB private, ditambah ~200+ MB disk.
  2. **Mengurangi kerja renderer/GPU:** loop rAF tanpa henti yang menggambar ulang semua path vektor di setiap frame. Ini memengaruhi CPU/GPU dan baterai lebih dari RAM, tetapi menekan juga working set GPU dan renderer saat hidden.

### 3.2 Penghematan tanpa mengubah visual, diurutkan dari yang tidak menyentuh `index.html`

**A. Di level host (tanpa mengubah `index.html`): direkomendasikan**

1. **Jeda render saat minimize/hidden:** set `CoreWebView2Controller.IsVisible = false` saat jendela di-minimize, dan `true` saat restore. Efeknya, `document.visibilityState` menjadi `hidden`, Chromium menghentikan `requestAnimationFrame`, dan timer di-throttle. Halaman sudah menangani lompatan waktu (`gap > 2000` di `render()`), jadi tidak ada glitch. Di WinForms, jangan bergantung pada perilaku otomatis kontrol. Set secara eksplisit di event `Resize` saat `WindowState == FormWindowState.Minimized`. Perilaku otomatisnya berbeda antar-versi SDK, jadi perlu diverifikasi.
2. **`MemoryUsageTargetLevel = Low` saat minimize:** set `CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low`, lalu kembalikan ke `Normal` saat restore. Dokumentasi Microsoft menyarankan nilai ini hanya untuk saat aplikasi tidak aktif, karena saat aktif bisa menurunkan performa. Efeknya, Chromium membuang cache (mis. decoded resources, GPU tiles) dan V8 melakukan GC lebih agresif. Besar penghematannya bervariasi, est. 10-40% dari tree, dan harus diukur.
3. **`TrySuspendAsync()` (opsional, setelah `IsVisible = false`):** membekukan script dan render sepenuhnya, lalu `Resume()` saat restore. Saat di-suspend, event SSE tertahan. Setelah resume, pesan berikutnya membawa **state lengkap** (server selalu mengirim seluruh `state`), jadi tidak ada data yang hilang secara logika. Risikonya, keepalive dan buffer TCP menumpuk saat suspend lama. Rekomendasi: aktifkan di fase 2 setelah diuji.
4. **Occlusion (jendela tertutup jendela lain, tidak di-minimize):** Chrome punya native window occlusion tracking. Untuk WebView2 di aplikasi host, perilaku ini **tidak pasti** dan perlu diuji. Kalau tidak terjadi otomatis, render tetap berjalan saat jendela tertutup. Opsi lanjut: deteksi occlusion di host (kompleks, tunda).
5. **Kurangi fitur browser yang tidak dipakai** lewat `CoreWebView2EnvironmentOptions` dan `CoreWebView2Settings`:
   - `EnableTrackingPrevention = false` (didokumentasikan sebagai peningkatan performa; halaman lokal tidak butuh).
   - `AreBrowserExtensionsEnabled = false` (default sudah false).
   - Settings: `IsStatusBarEnabled = false`, `IsPasswordAutosaveEnabled = false`, `IsGeneralAutofillEnabled = false`, `IsSwipeNavigationEnabled = false`, `IsPinchZoomEnabled = false`, `AreDevToolsEnabled = false` (release build), `AreDefaultContextMenusEnabled = false` (lihat 5.7), `IsReputationCheckingRequired = false` (SmartScreen untuk URL lokal; tersedia di SDK yang lebih baru, cek ketersediaannya).
   - `AdditionalBrowserArguments`: kandidat yang **harus diukur satu per satu**, tidak dipakai sekaligus tanpa bukti:
     - `--disable-features=msSmartScreenProtection` (alternatif lama untuk SmartScreen).
     - `--disable-background-networking`, `--disable-component-update`, `--no-first-run`.
     - `--renderer-process-limit=1` (untuk satu halaman sebenarnya sudah satu renderer; ini mencegah spare renderer).
     - Fitur `SpareRendererForSitePerProcess` (nama flag Chromium bisa berubah, perlu verifikasi).
   - **Jangan** memakai `--single-process` (tidak didukung, tidak stabil) atau `--in-process-gpu` sebagai default.
   - `--disable-gpu` menghilangkan proses GPU (hemat est. 30-80 MB). Akibatnya canvas dirasterisasi software di renderer, CPU naik pada loop 60 fps, dan anti-aliasing bisa berbeda sedikit. **Default: jangan dimatikan.** Ukur sebagai eksperimen terpisah.
6. **Satu instance:** gunakan mutex bernama agar instance kedua hanya mem-fokus jendela yang sudah ada. Ini mencegah dua tree WebView2.
7. **UDF di `%LOCALAPPDATA%\AgentOffice\WebView2`**, bukan di samping exe. Ini menghindari masalah izin dan cache yang tumbuh di folder repo.

**B. Rate cap via skrip injeksi host (tanpa mengedit file, tetapi mengubah "gerak")**

- `AddScriptToExecuteOnDocumentCreatedAsync` bisa membungkus `requestAnimationFrame` agar dibatasi, mis. 30 fps, atau 60 fps di monitor 120/144 Hz. Animasi di halaman berbasis `dt`, jadi **kecepatan gerak tetap sama**. Frame diamnya identik piksel demi piksel. Yang berubah hanya kehalusan gerak. Batas 60 fps di monitor 144 Hz praktis tidak terlihat, sedangkan 30 fps terlihat sedikit.
- Ini **keputusan produk**, bukan murni teknis (lihat "Ambiguity" di 6.7). Default yang direkomendasikan: tanpa cap, atau cap 60 fps hanya bila refresh monitor di atas 60 Hz.

**C. Di level halaman (perlu mengubah `index.html`; di luar scope "pure migration", dicatat untuk fase lanjut)**

| Ide | Relevansi di kode ini | Dampak visual |
|---|---|---|
| Jeda rAF saat `document.visibilityState === 'hidden'` | Sudah ditangani browser/WebView2 untuk rAF. Tidak perlu kode tambahan. | Tidak ada |
| "Throttle redraw saat tidak ada perubahan" | **Hampir tidak pernah berlaku.** Agent idle punya animasi `z` mengambang, karakter mengetik, bubble `waiting` berkedip, dan chat lounge berjalan. Scene praktis selalu berubah, kecuali `prefers-reduced-motion` aktif (`animT = 0`). Dengan reduced motion, redraw bisa dilewati kalau state tidak berubah. | Tidak ada, kalau diterapkan hanya pada kondisi itu |
| Cache layer statis (lantai, dinding, furnitur) ke canvas offscreen, lalu `drawImage` per frame | Sumber penghematan CPU terbesar, karena ratusan path vektor statis digambar ulang setiap frame. **Tetapi** menambah RAM (satu bitmap seukuran canvas, ~9 MB pada 2000x1125x4) dan berisiko perbedaan sub-piksel karena urutan depth-sort agent vs item (`depthSort(list)` mencampur item furnitur dengan agent). | Berisiko. Wajib screenshot diff. |
| Cap ukuran backing canvas | Backing = CSS x DPR (1.25 di mesin ini). Kalau dibatasi, gambar **menjadi blur** di layar HiDPI. | **Mengubah visual: jangan.** |
| Melepas canvas offscreen | Halaman **tidak memakai** offscreen canvas. | N/A |
| `renderLog` membangun ulang 100 `<li>` setiap pesan SSE | Biaya kecil, terjadi hanya saat ada event. | Tidak ada |

---

## 4. Sisi server

| Opsi | RAM (est.) | Kompatibilitas hook | Risiko | Rekomendasi |
|---|---|---|---|---|
| **A. `server.js` apa adanya, dijalankan via `node ensure-server.js`** | Node 24 idle HTTP server: private WS ~25-45 MB (est.) | 100%, tidak ada perubahan | Sangat rendah | **Direkomendasikan** |
| B. `server.js` dijalankan dengan `bun` | Bun idle: ~20-45 MB (est.). **Tidak dijamin lebih kecil dari Node.** Ukur dulu. | 100% (README menyatakan kompatibel). `restart()` memakai `process.execPath`, jadi tetap Bun. | Rendah. Perbedaan perilaku `http` Bun vs Node pada SSE perlu diuji (keepalive, `req.on('close')`). | Opsional, setelah diukur |
| C. Port ke bahasa host (Go/Rust/C#) in-process | Host + server satu proses. Hemat proses Node (~25-45 MB). | Harus 100% sama: route, kode status, header guard, format SSE, timer (8 s done->idle, auto stop 30 s, stale 6 jam/10 menit), mapping desk, marker file. | **Tinggi:** dua implementasi logika bisnis bisa drift. Semantik `restart` (memuat kode baru) hilang. Hook yang men-spawn `ensure-server.js` akan mencoba menjalankan Node server kedua (port bentrok, sehingga `EADDRINUSE`). Aplikasi desktop harus selalu hidup agar hook berfungsi, padahal hari ini server hidup tanpa UI. | **Tidak** untuk fase ini |
| D. Host memuat `index.html` dari file/aset embed | Tidak ada penghematan berarti. Server tetap dibutuhkan untuk hook. | Merusak SSE dan control (lihat 1.3) kecuali kode diubah | Tinggi | **Tidak** |

Alasan memilih A:
- Kontrak HTTP+SSE adalah API publik bagi tiga integrasi (Claude Code, Antigravity, OpenCode). Tidak mengubahnya berarti tidak ada risiko regresi di sana.
- Server sudah punya siklus hidup sendiri (auto start oleh hook, auto stop, restart, manual stop). Desktop app cukup menjadi **viewer**: ia tidak memiliki dan tidak membunuh server. Menutup jendela tidak mematikan server, sama seperti menutup tab browser.
- Host menjalankan `node ensure-server.js` saat startup (idempotent; menghapus marker stop, sama seperti `start-office.ps1`). Lalu host mem-poll `GET /state` sampai 200 (timeout mis. 5 s) sebelum navigasi. Ini menghindari halaman error "can't reach" saat cold start.
- Kalau `node` tidak ada di PATH: tampilkan pesan native yang jelas, jangan crash. Path `node` bisa dikonfigurasi (di mesin ini `C:\nvm4w\nodejs\node.exe`, via nvm4w, jadi bisa berubah saat ganti versi). Resolusi via PATH lebih aman daripada path absolut.
- Port: baca `AGENT_OFFICE_PORT` dari environment (default 4317) agar konsisten dengan `server.js`/`hook.js`.

---

## 5. Checklist paritas visual

| # | Item | Perilaku di Chrome tab sekarang | Yang harus dilakukan di desktop (WebView2) | Cara verifikasi |
|---|---|---|---|---|
| 5.1 | **DPI / `devicePixelRatio`** | 1.25 di mesin ini; canvas tajam (backing = CSS x 1.25) | Host harus **Per-Monitor V2 DPI aware** (`<ApplicationHighDpiMode>PerMonitorV2</ApplicationHighDpiMode>` di csproj / `Application.SetHighDpiMode(HighDpiMode.PerMonitorV2)` / app.manifest). Tanpa ini, Windows mem-bitmap-scale jendela, sehingga `devicePixelRatio = 1` dan hasilnya **blur**. Perpindahan antar-monitor dengan DPI berbeda juga harus memicu `resize` di halaman. | `devicePixelRatio` via DevTools (debug build). Screenshot diff. |
| 5.2 | `imageSmoothingEnabled` | Tidak dipakai (tidak ada `drawImage`) | Tidak ada tindakan | - |
| 5.3 | **Font Nunito** (Google Fonts, 500-800) | Dimuat dari internet. Offline pertama kali, fallback ke `system-ui`/Segoe UI (tampilan berbeda). | Default: **sama** (jaringan, cache HTTP terpisah di UDF WebView2). Peningkatan tanpa mengubah `index.html`: host meng-intercept `https://fonts.googleapis.com/css2*` dan `https://fonts.gstatic.com/*` via `AddWebResourceRequestedFilter` + `WebResourceRequested`, lalu menyajikan salinan lokal (CSS + woff2, lisensi OFL, dengan header `Access-Control-Allow-Origin: *` dan `Content-Type` yang benar). **File lokal harus persis file yang disajikan Google untuk Chromium** (subset `unicode-range` dan versi yang sama). Ambil sekali dengan UA Chromium, simpan, dan catat tanggalnya. Versi font yang berbeda bisa menggeser metrik teks dan pemotongan `fitText()`. | Screenshot diff label plaque/bubble. Uji mode offline. |
| 5.4 | Emoji (`💬 ☕ ♪ ✓`) | Segoe UI Emoji (DirectWrite) | Sama (font sistem) | Screenshot lounge chat |
| 5.5 | **Scrollbar** | `.stage` `overflow: auto` + `scrollbar-gutter: stable` (ruang scrollbar selalu dipesan), `#log` `overflow-y: auto` | **Risiko nyata:** Edge/WebView2 bisa memakai gaya scrollbar "Fluent/overlay" yang lebar dan rupanya berbeda dari Chrome (status default kedua engine berubah antar-versi; **tidak pasti**, perlu dicek di 157). Lebar gutter memengaruhi `stage.clientWidth`, lalu `availW`, lalu **ambang layout 1100/700 dan skala canvas**. Kalau berbeda, coba `AdditionalBrowserArguments` untuk menonaktifkan fitur scrollbar Fluent Edge (nama flag harus diverifikasi di runtime 157) atau terima perbedaan gaya asal lebar sama. | Bandingkan `stage.clientWidth` di kedua lingkungan pada ukuran jendela sama. Screenshot diff. |
| 5.6 | Margin default / body | `body { margin: 0; height: 100dvh; padding: 16px }`, gradien `background-attachment: fixed` | Tidak ada tindakan. CSS halaman sudah eksplisit. Pastikan WebView mengisi seluruh client area (`Dock = Fill`) tanpa border/padding WinForms. | Screenshot tepi |
| 5.7 | **Window chrome dan context menu** | Chrome: tab, address bar, menu klik kanan browser | Jendela native standar dengan title bar Windows. **Jangan** frameless/custom title bar (itu redesign). Context menu bawaan (Back/Reload/Save as/Inspect) **tidak** bagian dari desain. Rekomendasi: `AreDefaultContextMenusEnabled = false` di release. Pertahankan **F5/Ctrl+R** (`AreBrowserAcceleratorKeysEnabled = true`), karena notice halaman menyuruh pengguna "reload this page" setelah Stop. | Uji manual |
| 5.8 | **Zoom factor = 1** | Chrome menyimpan **zoom per-site** untuk `127.0.0.1:4317`. Kalau pengguna pernah Ctrl+/-, tampilan yang "dikenal" mungkin bukan 100%. | `ZoomFactor = 1.0`. Pilih `IsZoomControlEnabled = false` (kunci 100%) atau `true` dan simpan nilainya. Default disarankan: kunci 1.0. **Cek dulu zoom Chrome pengguna saat ini** (`chrome://settings/content/zoomLevels`). | Bandingkan `window.innerWidth` vs ukuran client area |
| 5.9 | **Locale** (`toLocaleTimeString`, `localeCompare`) | Mengikuti bahasa UI Chrome | WebView2 mengikuti bahasa UI OS kecuali `CoreWebView2EnvironmentOptions.Language` di-set. Samakan dengan bahasa Chrome pengguna (mis. `en-US`) agar format jam di panel Activity identik (mis. "2:05:11 PM" vs "14.05.11"). | Screenshot panel Activity |
| 5.10 | User-agent | Tidak ada dependensi UA di halaman. Google Fonts memilih format berdasarkan UA, dan WebView2 ber-UA Edge/Chromium sehingga mendapat woff2. | Tidak ada tindakan | - |
| 5.11 | Latar transparan | `canvas { background: transparent }` di atas gradien `.stage` | Tidak perlu jendela transparan. Set `DefaultBackgroundColor` ke `#dff3ea` (warna awal gradien body) agar **tidak ada kilatan putih** sebelum first paint. Ini bukan perubahan desain karena hanya terlihat sebelum halaman dirender. | Rekam layar saat startup |
| 5.12 | Ukuran jendela = ukuran viewport | Layout bergantung pada lebar viewport (ambang 1100/700 px pada `availW`, media query 900 px) | Ukuran **client area** jendela harus menghasilkan viewport CSS yang sama dengan tab Chrome pengguna. Viewport Chrome = jendela dikurangi tab strip dan toolbar. Simpan/pulihkan posisi dan ukuran jendela (termasuk maximized) di `%LOCALAPPDATA%\AgentOffice\window.json`. | `innerWidth`/`innerHeight` sama, lalu screenshot diff |
| 5.13 | `prefers-reduced-motion` | Mengikuti setting OS "Animation effects" | Sama (WebView2 mengikuti OS) | - |
| 5.14 | `color-scheme: light` | Halaman memaksa light | Sama. Mode gelap Windows tidak berpengaruh pada isi. Title bar native akan mengikuti tema OS, dan itu bagian chrome, bukan desain. | - |
| 5.15 | Judul dan ikon | `<title>Alifs Office</title>`, favicon SVG data URI | Judul jendela mengikuti `DocumentTitleChanged`. Ikon taskbar: konversi SVG favicon ke `.ico` multi-ukuran (16/24/32/48/256) satu kali, simpan di `desktop/`. | Visual |
| 5.16 | Akselerasi GPU | Chrome memakai GPU (Intel) untuk canvas | Biarkan default (GPU aktif). Ini juga meminimalkan perbedaan anti-aliasing. | Screenshot diff |

---

## 6. Rekomendasi

### 6.1 Pilihan

**Primary: host native tipis C# .NET 9 WinForms + WebView2 (framework-dependent)**

Alasan:
1. **Tooling sudah ada:** .NET SDK 9.0.305, WindowsDesktop runtime 9.0.9, WebView2 Runtime 157. Tidak perlu menginstal toolchain baru (Rust/Go). Dependensinya hanya satu paket NuGet resmi `Microsoft.Web.WebView2`, karena WinForms adalah bagian dari .NET.
2. **Akses API WebView2 penuh dan typed:** `IsVisible`, `MemoryUsageTargetLevel`, `TrySuspendAsync`, `WebResourceRequested` (font lokal), `AdditionalBrowserArguments`, `Language`, `DefaultBackgroundColor`, settings. Semua kontrol memori di bagian 3 bisa dipakai tanpa COM manual.
3. **Kode kecil** (~200-300 baris), mudah diaudit, dan tidak memperkenalkan framework (IPC/permission) yang tidak dipakai.
4. **Server tidak diubah:** kontrak HTTP+SSE tetap. Hook dan integrasi tidak tersentuh.
5. **Paritas render tinggi:** Edge Chromium 157 sama dengan engine Chrome. Perbedaan yang tersisa ada di checklist 5 dan bisa dikendalikan.
6. **Auto-update hampir tidak diperlukan:** konten (`index.html`) disajikan server dari repo, jadi update konten = `git pull` + Restart dari halaman, seperti sekarang. Runtime WebView2 di-update otomatis oleh Windows (Evergreen). Host hanya perlu dibangun ulang kalau logika host berubah (jarang).

Trade-off yang diterima: proses host .NET ~20-40 MB (est.), sekitar 15-35 MB lebih besar daripada host Rust/C++. Terhadap total tree ~150-250 MB, ini sekitar 10-20%. Kalau setelah pengukuran selisih ini dianggap penting, pindah ke jalur upgrade (Rust) dengan desain yang sama.

**Fallback (langsung pakai, nol build): launcher Edge `--app`**

```powershell
# desktop/launcher/open-office-app.ps1 (usulan, belum dibuat)
$port = if ($env:AGENT_OFFICE_PORT) { [int]$env:AGENT_OFFICE_PORT } else { 4317 }
node (Join-Path $PSScriptRoot "..\..\ensure-server.js")
$deadline = (Get-Date).AddSeconds(5)
do {
  try { Invoke-WebRequest "http://127.0.0.1:$port/state" -UseBasicParsing -TimeoutSec 1 | Out-Null; $up = $true }
  catch { Start-Sleep -Milliseconds 200 }
} until ($up -or (Get-Date) -gt $deadline)
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:LOCALAPPDATA "AgentOffice\EdgeAppProfile"
Start-Process $edge -ArgumentList @(
  "--app=http://127.0.0.1:$port/", "--user-data-dir=`"$profile`"",
  "--no-first-run", "--disable-extensions", "--window-size=1600,940"
)
```
Pakai fallback ini bila host C# bermasalah atau sebagai baseline pengukuran. Paritasnya identik, tetapi RAM-nya lebih tinggi dengan profil terpisah, dan tidak ada kontrol memory target.

**Jalur upgrade (opsional, kalau RAM host harus minimal):** Rust + `wry`/`tao` (atau Tauri v2 kalau butuh installer dan updater), dengan perilaku sama persis dengan host C#. Prasyarat MSVC (VS 2022 Community + komponen VC Tools x64) sudah terpasang, tinggal `rustup`.

**Tidak direkomendasikan:** Electron (bundel Chromium), port server ke bahasa lain (risiko drift kontrak), memuat `index.html` dari file (merusak SSE/control).

### 6.2 Usulan struktur folder (tanpa menyentuh file yang ada)

```
agent-office/
  (semua file yang ada tetap, tidak diubah)
  research/desktop-app/02-technical-research.md      <- dokumen ini
  desktop/
    README.md                                          cara build, jalankan, ukur
    host-dotnet/
      AgentOffice.Desktop.csproj                       net9.0-windows, UseWindowsForms, PerMonitorV2, ref Microsoft.Web.WebView2 (pin versi)
      app.manifest                                     DPI awareness, supportedOS Win10/11
      Program.cs                                       single-instance mutex, start ensure-server, wait /state
      MainForm.cs                                      WebView2 setup, visibility/memory handling, window state
      ServerBootstrap.cs                               resolve node, run ensure-server.js, poll /state
      FontInterceptor.cs                               (fase 2) sajikan Nunito lokal
      assets/
        app.ico                                        dari favicon SVG
        fonts/nunito/ (css + woff2 + OFL.txt)          (fase 2)
    launcher/
      open-office-app.ps1                              fallback Edge --app
    tools/
      measure-ram.ps1                                  skrip bagian 6.4
      parity/                                          skrip screenshot diff (bagian 6.5), dev-only
```

Path repo saat runtime: host mencari `ensure-server.js` relatif terhadap lokasi exe (`..\..\` saat dijalankan dari `desktop/host-dotnet/bin/...` tidak stabil). Simpan konfigurasi `AgentOfficeRoot` (default: folder induk `desktop/`) di `appsettings.json` atau ambil dari argumen/ENV `AGENT_OFFICE_ROOT`. Jangan hardcode `C:\projects\agent-office`.

### 6.3 Rencana migrasi bertahap

| Fase | Langkah | Kriteria selesai |
|---|---|---|
| 0. Baseline | (a) Catat ukuran viewport, zoom Chrome per-site, dan bahasa UI Chrome. (b) Ukur RAM/CPU Chrome tab dan Edge `--app` dengan `measure-ram.ps1` (terlihat, minimize, tertutup jendela lain). (c) Ambil screenshot referensi (6.5). | Angka baseline tercatat |
| 1. Host minimal | WinForms Form + WebView2 `Dock=Fill`. UDF di `%LOCALAPPDATA%`. PerMonitorV2. `DefaultBackgroundColor`. Jalankan `node ensure-server.js`, poll `/state`, lalu `Navigate("http://127.0.0.1:{port}/")`. Judul dari `DocumentTitleChanged`. Ikon. Single-instance. | Halaman tampil, SSE "live", Restart (reload), dan Stop (notice) berfungsi |
| 2. Paritas | Terapkan checklist 5: zoom terkunci, `Language`, context menu off, F5 tetap, simpan ukuran jendela. Screenshot diff. | Diff di bawah ambang (6.5) di 3 ukuran layout |
| 3. Hemat memori | Minimize: `IsVisible=false` lalu `MemoryUsageTargetLevel=Low`. Restore: kebalikannya. Settings fitur off. `EnableTrackingPrevention=false`. Ukur ulang. Lalu eksperimen terpisah per flag `AdditionalBrowserArguments`; pertahankan hanya yang terbukti hemat dan tidak memengaruhi diff. | Angka minimize turun secara terukur, tanpa regresi visual/fungsi |
| 4. Opsional | `TrySuspendAsync` saat minimize lama. Font lokal via intercept. Cap rAF via injeksi (butuh keputusan produk). Shortcut Start Menu. Opsi "buka saat logon" (terpisah dari logon task server). | Per fitur, diuji |
| 5. Opsional | Port host ke Rust bila angka host .NET dianggap terlalu besar. | Angka host < 15 MB, paritas sama |

Penanganan kasus tepi di host:
- Server belum hidup / `node` tidak ditemukan: tampilkan pesan native + tombol "Coba lagi". Jangan navigasi ke halaman error Chromium.
- Server mati di tengah jalan (auto stop/Stop): halaman sendiri menampilkan "reconnecting..."/notice, sama seperti di browser. Host **tidak** otomatis menghidupkan server (menghormati marker manual stop). Opsional: item menu/shortcut "Start server" di host, setara `start-office.ps1`.
- `ProcessFailed` (renderer/GPU crash): reload sekali, lalu tampilkan pesan.
- Restart dari halaman: PID server berganti. Host tidak melacak PID, jadi tidak terpengaruh.
- Menutup aplikasi: **tidak** menghentikan server.

### 6.4 Cara mengukur RAM (PowerShell)

Skrip ini menjumlahkan **private working set** (sama dengan kolom Memory Task Manager) dan CPU untuk satu process tree, dengan sampling selama N detik. Usulan file: `desktop/tools/measure-ram.ps1`.

```powershell
<#
  Contoh:
    # Desktop app (host + semua msedgewebview2 turunan)
    .\measure-ram.ps1 -RootName AgentOffice.Desktop -Seconds 60
    # Edge --app dengan profil terpisah (root = proses browser yang command line-nya berisi profil)
    .\measure-ram.ps1 -RootCmdLike '*AgentOffice\EdgeAppProfile*' -Seconds 60
    # Server Node (dicari dari port)
    .\measure-ram.ps1 -Port 4317 -Seconds 30
#>
param(
  [string]$RootName,          # nama proses tanpa .exe
  [string]$RootCmdLike,       # wildcard CommandLine
  [int]$RootPid,
  [int]$Port,
  [int]$Seconds = 30,
  [int]$IntervalMs = 1000
)
$ErrorActionPreference = 'Stop'

function Get-Tree([int[]]$roots) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine
  $set = [System.Collections.Generic.HashSet[int]]::new()
  $queue = [System.Collections.Generic.Queue[int]]::new()
  foreach ($r in $roots) { if ($set.Add($r)) { $queue.Enqueue($r) } }
  while ($queue.Count) {
    $p = $queue.Dequeue()
    foreach ($c in $all | Where-Object { $_.ParentProcessId -eq $p }) {
      if ($set.Add([int]$c.ProcessId)) { $queue.Enqueue([int]$c.ProcessId) }
    }
  }
  $all | Where-Object { $set.Contains([int]$_.ProcessId) }
}

$roots = @()
if ($RootPid) { $roots += $RootPid }
if ($RootName) { $roots += (Get-Process -Name $RootName -ErrorAction SilentlyContinue).Id }
if ($Port) { $roots += (Get-NetTCPConnection -LocalPort $Port -State Listen).OwningProcess }
if ($RootCmdLike) {
  $cands = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like $RootCmdLike }
  # ambil hanya root: kandidat yang parent-nya bukan kandidat
  $ids = $cands.ProcessId
  $roots += ($cands | Where-Object { $ids -notcontains $_.ParentProcessId }).ProcessId
}
if (-not $roots) { throw 'Root process not found' }

$cores = [Environment]::ProcessorCount
$samples = @()
$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
  $tree = Get-Tree $roots
  $ids = $tree.ProcessId
  $perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
    Where-Object { $ids -contains [int]$_.IDProcess }
  $samples += [pscustomobject]@{
    PrivateMB = [math]::Round((($perf | Measure-Object WorkingSetPrivate -Sum).Sum) / 1MB, 1)
    CpuPct    = [math]::Round((($perf | Measure-Object PercentProcessorTime -Sum).Sum) / $cores, 1)
    Procs     = $ids.Count
  }
  Start-Sleep -Milliseconds $IntervalMs
}

"Process tree (last sample):"
$tree = Get-Tree $roots
$perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process
$tree | ForEach-Object {
  $id = [int]$_.ProcessId
  $p = $perf | Where-Object { [int]$_.IDProcess -eq $id } | Select-Object -First 1
  $type = if ($_.CommandLine -match '--type=(\S+)') { $Matches[1] } else { 'main' }
  [pscustomobject]@{ Pid = $id; Name = $_.Name; Type = $type;
    PrivateMB = if ($p) { [math]::Round($p.WorkingSetPrivate / 1MB, 1) } else { $null } }
} | Sort-Object PrivateMB -Descending | Format-Table -AutoSize

$s = $samples | Measure-Object PrivateMB -Average -Maximum
$c = $samples | Measure-Object CpuPct -Average -Maximum
"Private WS  avg {0:N1} MB  max {1:N1} MB" -f $s.Average, $s.Maximum
"CPU (total) avg {0:N1} %   max {1:N1} %" -f $c.Average, $c.Maximum
```

Catatan pengukuran:
- Snippet ini adalah draf dan belum dijalankan. Uji dulu sebelum dipakai. `Win32_PerfFormattedData_PerfProc_Process.PercentProcessorTime` adalah nilai per-core yang dibagi jumlah core logis, sehingga hasilnya persen dari total CPU, setara Task Manager.
- **Chrome tab:** proses renderer tab tidak bisa dipisahkan dengan tree, karena semua tab adalah anak proses browser. Ada dua cara: (1) apples-to-apples, jalankan Chrome dengan `--user-data-dir` sementara + `--app=...` lalu ukur seluruh tree dengan `-RootCmdLike`; (2) biaya marginal, lihat PID renderer tab di Chrome Task Manager (Shift+Esc), lalu `-RootPid <pid>` untuk renderer saja. Laporkan keduanya.
- **WebView2:** tree `msedgewebview2.exe` adalah anak dari proses host, sehingga `-RootName AgentOffice.Desktop` sudah mencakup semuanya. Verifikasi dengan kolom `Type` di output. Kalau ada proses WebView2 yang parent-nya bukan host (mis. dibagi dengan aplikasi lain ber-UDF sama), itu tidak akan terhitung. Cek manual di Task Manager (grup "WebView2" di bawah aplikasi).
- Ukur Node server terpisah (`-Port 4317`). Laporkan total = app tree + server.
- Skenario wajib: (a) terlihat, 60 s, setelah 2 menit warm-up; (b) minimize, ukur setelah 30 s; (c) tertutup jendela lain (bukan minimize); (d) setelah restore 30 s. Ulangi 3 kali dan ambil median. Pastikan ukuran jendela/viewport sama di semua opsi.
- Jangan menyimpulkan dari satu sampel. Working set Chromium berfluktuasi karena GC dan trimming.

### 6.5 Rencana uji paritas (screenshot diff)

Tujuannya membandingkan Chrome (referensi) dan desktop app pada **viewport dan DPR yang sama** dengan **state deterministik**.

1. **State deterministik:** jalankan server di port uji (`AGENT_OFFICE_PORT=4399`, `AGENT_OFFICE_AUTO_STOP=0`). Kirim urutan event tetap via `POST /event` (header `X-Agent-Office: 1`), mis. main `working`, product-manager `waiting`, lead-qa `done`, satu guest. Kedua klien membaca server yang sama, jadi stempel waktu log identik.
2. **Bekukan animasi tanpa mengubah kode:** emulasikan `prefers-reduced-motion: reduce` di kedua lingkungan via CDP `Emulation.setEmulatedMedia` (`features: [{name:'prefers-reduced-motion', value:'reduce'}]`). Halaman lalu memakai `animT = 0`. Untuk WebView2, aktifkan CDP lewat `AdditionalBrowserArguments="--remote-debugging-port=9333"` **hanya di build uji**, atau via env `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`. Chrome dijalankan dengan `--remote-debugging-port=9222 --user-data-dir=<temp>`. Catatan: idle 10 menit memengaruhi posisi agent (lounge). Pakai state yang baru dibuat, atau jalankan skenario "idle lama" secara terpisah dengan menunggu.
3. **Viewport dan DPR sama:** keduanya di monitor yang sama (125%). Set ukuran viewport via `Emulation.setDeviceMetricsOverride` (width/height/`deviceScaleFactor: 1.25`) atau samakan ukuran client area. Uji 3 ukuran yang memicu 3 layout: lebar ~1500 (isometric), ~1000 (3 kolom), ~800 (2 kolom; juga di bawah media query 900 px).
4. **Capture:** `Page.captureScreenshot` (PNG) dari kedua lingkungan, setelah `document.fonts.ready` dan 1 s jeda.
5. **Diff:** skrip Node dev-only di `desktop/tools/parity/` (mis. dengan `pngjs` + `pixelmatch` sebagai devDependency di folder itu saja, tidak di root repo) atau ImageMagick `compare -metric AE` bila tersedia. Ambang awal: `threshold 0.1`, piksel berbeda < 0.1% per screenshot. Selisih anti-aliasing kecil antar-proses GPU wajar. Simpan gambar diff untuk inspeksi.
6. **Cek terarah tambahan:** `stage.clientWidth`, `innerWidth`, `devicePixelRatio`, `canvas.width/height`, `getComputedStyle(document.body).fontFamily`, dan `document.fonts.check('800 13px Nunito')` diambil lewat `Runtime.evaluate` di kedua lingkungan; harus sama.
7. **Uji fungsional manual:** status "live", event masuk menggerakkan desk, Restart lalu reload, Stop lalu notice, F5 setelah start ulang, minimize/restore (animasi lanjut tanpa glitch, agent tidak "nyangkut"), pindah monitor DPI berbeda, mode offline (font).

### 6.6 Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Total RAM desktop app > biaya marginal satu tab Chrome yang sudah terbuka | Ekspektasi "hemat RAM" tidak terpenuhi bagi pengguna yang selalu membuka Chrome | Ukur di fase 0. Komunikasikan bahwa penghematan nyata ada saat minimize/hidden dan dibanding Electron. Sediakan fallback `--app` di profil default (berbagi proses Edge). |
| Gaya/lebar scrollbar WebView2 berbeda dari Chrome | Layout bergeser (ambang `availW`), visual beda | Screenshot diff + cek `clientWidth`. Flag fitur scrollbar (perlu verifikasi di runtime 157). |
| Font Google tidak tersedia (offline) atau versi lokal berbeda | Teks fallback/metrik beda | Intercept dengan salinan persis. Uji offline. |
| DPI awareness host salah | Blur, `devicePixelRatio=1` | PerMonitorV2 di manifest/csproj. Uji di 100%/125%/150%. |
| `node` tidak di PATH (nvm4w berganti versi) | App gagal start server | Resolusi PATH + config override + pesan jelas |
| Perilaku `IsVisible`/suspend berbeda antar-versi SDK/runtime | Animasi tidak berhenti saat minimize, atau SSE tertahan | Set eksplisit. Uji per upgrade SDK. Suspend hanya di fase opsional. |
| Flag `AdditionalBrowserArguments` tak terdokumentasi berubah atau hilang | Tidak efektif, kemungkinan kecil memengaruhi render | Uji satu per satu, simpan hanya yang terbukti, dan dokumentasikan versinya |
| WebView2 Runtime tidak ada di mesin lain | App tidak jalan | Windows 11 sudah menyertakan Evergreen runtime. Cek di startup, dan tautkan Evergreen Bootstrapper bila tidak ada. |
| .NET Desktop Runtime 9 tidak ada di mesin lain | App framework-dependent tidak jalan | Publish self-contained untuk distribusi (bundle lebih besar; RAM relatif sama) |
| Dokumen README tidak sinkron (1.1) | Kebingungan saat menulis dokumentasi desktop | Catat, perbaiki terpisah bila diminta |

### 6.7 Ambiguitas yang perlu diputuskan

1. **Cap frame rate.**
   - Ambiguity: apakah "visual identik" mencakup kehalusan gerak (fps)?
   - Impact: cap 30/60 fps menghemat CPU/GPU tetapi mengubah kehalusan gerak di monitor ber-refresh tinggi.
   - Recommended decision: tanpa cap di fase 1-3. Tawarkan cap 60 fps (hanya bila refresh > 60 Hz) sebagai opsi di fase 4.
2. **Perilaku tombol close.**
   - Ambiguity: close keluar dari aplikasi, atau minimize ke tray?
   - Impact: tray menambah fitur yang bukan bagian dari desain browser.
   - Recommended decision: close = keluar aplikasi (server tetap hidup), sama dengan menutup tab.
3. **Zoom.**
   - Ambiguity: kunci 100%, atau izinkan Ctrl+wheel seperti browser?
   - Recommended decision: kunci 1.0, kecuali baseline menunjukkan pengguna memakai zoom lain di Chrome. Dalam kasus itu, pakai nilai tersebut sebagai default tetap.
4. **Context menu dan DevTools.**
   - Recommended decision: nonaktif di release, aktif di debug build.

---

## Validasi yang direkomendasikan (tidak dijalankan)

- `dotnet build` / `dotnet publish -c Release` untuk `desktop/host-dotnet` setelah dibuat.
- `measure-ram.ps1` untuk Chrome tab, Edge `--app`, dan desktop app (skenario 6.4), lalu bandingkan dengan estimasi di dokumen ini dan perbarui tabel 2.2 dengan angka nyata.
- Screenshot diff 6.5 di 3 ukuran layout dan 2 tingkat DPI.
- Uji fungsional: hook Claude Code, Antigravity, dan OpenCode tetap memperbarui desk saat desktop app terbuka; Restart/Stop dari halaman; auto stop; marker manual stop dihormati.
