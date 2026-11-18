# PRD: Migrasi Agent Office ke Aplikasi Desktop (RAM rendah, visual identik)

Dokumen: `research/desktop-app/01-product-requirements.md`
Penulis: product-manager agent
Status: Draft untuk review engineering
Sumber yang dibaca: `README.md`, `server.js`, `index.html`, `ensure-server.js`, `hook.js`, `start-office.ps1`, `stop-office.ps1`, `install-autostart.ps1`, `hooks-settings-snippet.json`

---

## 1. Problem

### 1.1 Problem statement
Agent Office sekarang tampil sebagai tab di browser biasa (`http://127.0.0.1:4317`). Office ini dipakai sebagai "monitor" yang selalu terbuka di samping Claude Code / Antigravity / OpenCode. Akibatnya:
- Office menumpang di browser utama pengguna. Tab bisa tertutup tidak sengaja, tenggelam di antara tab lain, atau ikut tertutup saat browser ditutup.
- Biaya RAM sulit dikendalikan dan sulit diukur. Renderer tab, GPU process, dan extension browser ikut terhitung.
- Pengguna ingin office berjalan sebagai jendela aplikasi sendiri dengan jejak memori serendah mungkin, karena office berjalan terus di samping tool AI yang sendiri sudah berat.

### 1.2 Goals
- G1: Office tampil di jendela desktop native sendiri (Windows 11), bukan tab browser.
- G2: **Visual parity**: tampilan identik pixel dengan versi browser untuk ukuran viewport dan DPI yang sama.
- G3: **RAM**: total private working set aplikasi desktop terukur dan berada dalam budget (lihat AC-RAM). Budget harus lebih rendah dari, atau paling buruk setara dengan, baseline browser.
- G4: Semua perilaku yang ada tetap jalan: hooks, auto-start, auto-stop, Restart/Stop, marker file, privacy, port env var.

### 1.3 Non-goals (eksplisit)
- **Tidak ada redesign.** Tidak ada perubahan warna, layout, font, animasi, copy/teks, breakpoint, atau frame rate.
- **Tidak ada fitur baru.** Tidak ada tray icon, notifikasi OS, always-on-top, mini mode, settings UI, auto-update, atau tema.
- Tidak mengubah protokol event (`POST /event`, `GET /events`, `/state`, `/control/*`) dan tidak mengubah hook script / adapter Antigravity / plugin OpenCode.
- Tidak menargetkan macOS/Linux di MVP.

---

## 2. Users & konteks pemakaian

| Aspek | Detail |
|---|---|
| Pengguna utama | Developer tunggal (pemilik mesin) yang menjalankan Claude Code, Antigravity, dan/atau OpenCode, sering dengan banyak subagent. |
| OS | Windows 11 (primary). Display scaling umum: 100% / 125% / 150%. Multi-monitor mungkin. |
| Pola pakai | Jendela selalu terbuka berjam-jam, biasanya di monitor kedua atau di samping terminal/IDE. Jarang diinteraksikan. Hanya dilihat sekilas, kadang hover, kadang klik Restart/Stop. |
| Siklus hidup | Server hidup otomatis saat SessionStart dan mati 30 detik setelah session terakhir berakhir. Jendela bisa tetap terbuka meski server mati. |
| Sensitivitas | RAM/CPU (berjalan di samping beban AI tooling), privacy (hanya localhost). |

---

## 3. User stories & acceptance criteria

### US-1 Buka office sebagai jendela desktop
Sebagai developer, saya ingin membuka office di jendela aplikasi sendiri supaya tidak bergantung pada tab browser.

- AC-1.1 Given server berjalan di port P, When saya menjalankan launcher desktop, Then muncul satu jendela berjudul `Alifs Office` (dari `<title>`) yang memuat `http://127.0.0.1:P/`, dan status pill menjadi `live` dalam 2 detik.
- AC-1.2 Given server belum berjalan, When saya menjalankan launcher desktop, Then launcher menjalankan logika yang sama dengan `start-office.ps1` (memanggil `ensure-server.js`, yang juga menghapus marker `agent-office.stopped`), lalu jendela terbuka dan menjadi `live`.
- AC-1.3 Jendela tidak menampilkan chrome browser (address bar, tab, bookmark). Satu-satunya chrome adalah title bar native Windows.
- AC-1.4 Ikon jendela/taskbar memakai artwork yang sama dengan favicon SVG di `index.html` (dikonversi ke .ico). Artwork tidak digambar ulang.

### US-2 Visual parity (kritis)
Sebagai developer, saya ingin office terlihat persis sama dengan versi browser.

Fakta teknis dari `index.html` yang menentukan parity:
- Canvas digambar sebagai path vektor dengan anti-aliasing. **Tidak ada `drawImage`/bitmap**, jadi `imageSmoothingEnabled` tidak relevan. Yang relevan adalah engine rasterisasi, `devicePixelRatio`, dan ukuran backing store (`canvas.width = round(cssW*dpr)`).
- Layout responsif bergantung pada lebar stage: `availW >= 1100` memakai layout isometrik wide, `>= 700` memakai 3 kolom, selain itu 2 kolom. Ada juga media query `max-width: 900px` (aside pindah ke bawah). Dengan body padding 32, gap 16, aside 300, dan stage padding 32, layout wide butuh client width jendela sekitar 1480 px ditambah scrollbar gutter.
- Font: `Nunito` dari Google Fonts (jaringan) dengan fallback `system-ui, Segoe UI`. Emoji memakai `Segoe UI Emoji`.
- `prefers-reduced-motion` dihormati. Saat aktif, `animT = 0` dan frame menjadi deterministik.

Acceptance criteria:
- AC-2.1 Engine render: Given versi desktop dan browser referensi (Chrome/Edge stabil), Then keduanya memakai engine Chromium (di Windows 11: WebView2/Edge Chromium). Engine non-Chromium **tidak memenuhi** syarat parity.
- AC-2.2 Screenshot diff: Given fixture state yang sama (12 role desks + 1 guest, status campuran, log berisi 10 entri, timestamp tetap), reduced motion ON, client area 1600x900 CSS px, When screenshot client area diambil di desktop dan di Edge pada versi Chromium mayor yang sama, Then pixel diff = 0 di DPI 100%, 125%, dan 150%. Toleransi jika versi Chromium mayor berbeda: maksimal 0,1% pixel berbeda, tanpa pergeseran layout atau teks (perlu sign-off visual manual).
- AC-2.3 Breakpoint: Given lebar client 1000 / 1300 / 1600 px, Then layout yang terpilih (2 kolom / 3 kolom / wide) sama dengan browser pada ukuran yang sama.
- AC-2.4 DPI: Given Windows scaling 125%, Then `window.devicePixelRatio` di desktop = 1,25 (sama dengan Edge), dan ukuran `canvas.width/height` sama persis dengan browser pada ukuran CSS yang sama. Jendela tidak boleh di-bitmap-stretch oleh OS (wajib per-monitor DPI aware).
- AC-2.5 Pindah monitor: Given jendela dipindah dari monitor 100% ke 150%, Then canvas di-resize ke DPR baru tanpa blur, seperti perilaku browser.
- AC-2.6 Font: Given online, Then teks canvas dan DOM dirender dengan Nunito 500/600/700/800 (cek via `document.fonts.check('700 13px Nunito') === true`). Given offline, Then fallback sama dengan browser (Segoe UI). Degradasi mengikuti browser.
- AC-2.7 Zoom default 100%. Ctrl+scroll dan Ctrl +/- berperilaku seperti browser (lihat OQ-8).
- AC-2.8 Animasi: Given reduced motion OFF, Then karakter berjalan, mengetik, tidur, dan bubble muncul dengan kecepatan yang sama (frame rate tidak dikunci lebih rendah dari refresh monitor, sama dengan `requestAnimationFrame` di browser).
- AC-2.9 `index.html` yang disajikan ke desktop adalah file yang sama dengan yang disajikan ke browser (single source). Tidak ada fork CSS/JS khusus desktop.

### US-3 RAM rendah dan terukur
Sebagai developer, saya ingin office memakai RAM sekecil mungkin dan angkanya bisa saya verifikasi.

Metode ukur (wajib, supaya angka bisa dibandingkan):
- Metrik: **Private Working Set** (= Task Manager kolom "Memory (active private working set)"), dijumlahkan untuk **seluruh process tree** aplikasi desktop (process host + semua child, misalnya `msedgewebview2.exe` browser/renderer/GPU/utility/crashpad). Dikumpulkan via `Get-CimInstance Win32_Process` (rekursif `ParentProcessId`) lalu `Get-Counter '\Process(*)\Working Set - Private'`. Commit (`PrivateMemorySize64`) dicatat sebagai metrik sekunder.
- Server Node (`server.js`) **dicatat terpisah** dan tidak masuk budget desktop, karena tidak berubah dan juga ada di skenario browser.
- Kondisi: client 1600x900, DPI 125%, 12 desk, setelah 5 menit idle, ambil sampel tiap 10 detik selama 10 menit, laporkan median dan maksimum. Ulangi untuk skenario "aktif" (replay ±1 event/detik selama 10 menit) dan "minimized".
- Baseline:
  - B1 (marginal tab): biaya tab office di Chrome/Edge yang sudah terbuka (Shift+Esc Task Manager browser, "Memory footprint" tab + porsi GPU process).
  - B2 (dedicated): Edge `--app=http://127.0.0.1:4317` dengan profil baru, seluruh process tree.

Acceptance criteria (angka adalah usulan, lihat OQ-1):
- AC-3.1 Idle median total private WS desktop ≤ B2, dan ≤ 150 MB absolut (gate MVP).
- AC-3.2 Stretch target ≤ 100 MB atau ≤ B1, mana yang lebih besar.
- AC-3.3 Soak 8 jam dengan event replay: pertumbuhan median ≤ 10% dari jam pertama (tidak ada leak).
- AC-3.4 Minimized/occluded: rendering di-throttle seperti tab browser di background (CPU ~0%), dan RAM tidak naik.
- AC-3.5 Hasil ukur (skrip + angka B1, B2, desktop) dilampirkan di PR. Jika AC-3.1 gagal, migrasi **tidak di-ship** dan dievaluasi ulang.

### US-4 Semua integrasi tetap jalan tanpa perubahan konfigurasi
- AC-4.1 Given `~/.claude/settings.json` berisi hooks dari `hooks-settings-snippet.json` (path `C:/projects/agent-office/*.js`), Then tidak ada perubahan yang dibutuhkan di settings, adapter Antigravity, atau plugin OpenCode.
- AC-4.2 Given aplikasi desktop tidak pernah dibuka, Then hooks, auto-start, dan auto-stop berperilaku persis seperti sekarang. Desktop app hanya klien.
- AC-4.3 Given desktop terbuka, When `http://127.0.0.1:4317` dibuka di browser, Then browser tetap berfungsi bersamaan (multi-client SSE seperti sekarang).

### US-5 Restart/Stop dari jendela
- AC-5.1 Given status `live`, When klik Restart, Then server spawn instance baru, jendela polling `/state` lalu reload, dan kembali `live` dalam ≤ 15 detik (sama dengan `RESTART_TIMEOUT_MS`).
- AC-5.2 Given status `live`, When klik Stop, Then marker `%TEMP%\agent-office.stopped` dibuat, server berhenti, jendela **tetap terbuka** dengan status `stopped` dan notice teks asli.
- AC-5.3 Given server sudah dihidupkan lagi, When tekan F5 atau Ctrl+R di jendela, Then halaman reload dan kembali `live`. Ini penting karena notice meminta pengguna "reload this page" dan EventSource sudah di-`close()`.

### US-6 Auto-stop server tidak "merusak" jendela
- AC-6.1 Given jendela terbuka, When server auto-stop (30 detik setelah SessionEnd terakhir), Then jendela tetap terbuka dan menampilkan `reconnecting...` (perilaku EventSource bawaan), tidak crash, tidak ada dialog error.
- AC-6.2 Given server hidup lagi (SessionStart baru), Then jendela otomatis kembali `live` tanpa aksi pengguna (auto-reconnect EventSource, sama dengan browser).
- AC-6.3 Jendela yang terbuka **tidak boleh** mencegah atau menunda auto-stop. Koneksi SSE tidak dihitung sebagai session.

---

## 4. Business rules yang wajib dipertahankan

| # | Rule (sumber) | Implikasi untuk desktop |
|---|---|---|
| BR-1 | Server bind hanya `127.0.0.1` (`server.js` HOST). | Desktop tidak membuka listener/port baru. Webview hanya memuat `http://127.0.0.1:<port>`. |
| BR-2 | `POST /event` dan `/control/*` ditolak tanpa header `X-Agent-Office: 1`. CORS preflight tidak pernah disetujui. | Desktop tidak boleh melonggarkan CORS atau menyuntik header global. Tombol tetap memakai `fetch` same-origin dengan header seperti sekarang. |
| BR-3 | Privacy payload minimal (`hook.js`). | Tidak berubah. Desktop tidak menambah telemetri. |
| BR-4 | `AGENT_OFFICE_PORT` default 4317, dibaca oleh server, hook, dan ensure-server. | Launcher desktop membaca env var yang sama. Lihat risiko R4. |
| BR-5 | `ensure-server.js` idempotent, silent, selalu exit 0, dan menghapus marker stopped. | Launcher desktop memanggilnya (bukan memodifikasinya). Launcher desktop = "explicit start", sama dengan `start-office.ps1`. |
| BR-6 | `hook.js` menghidupkan server kembali saat `UserPromptSubmit`, kecuali marker stopped ada. | Tidak berubah. |
| BR-7 | Auto-stop 30 detik, stale session 6 jam, `AGENT_OFFICE_AUTO_STOP=0`. | Tidak berubah. Lifecycle jendela terpisah dari lifecycle server. |
| BR-8 | Restart memakai `process.execPath` + `server.js`. | Tetap valid karena server tetap dijalankan oleh `node`, bukan oleh runtime desktop. |
| BR-9 | Log server di `%TEMP%\agent-office.log`. | Tidak berubah. Log desktop (jika ada) memakai file terpisah. |
| BR-10 | Browser tetap jadi jalur yang didukung (Start cannot be a button, halaman disajikan server). | Browser tetap fallback resmi. |

Rekomendasi arsitektur dari sisi produk (parity-preserving): **aplikasi desktop = klien tipis** pengganti tab browser. Server tetap proses Node terpisah yang dikelola hooks seperti sekarang. Menyatukan server ke dalam app mengubah hooks, auto-stop, Restart, dan marker, jadi tidak masuk MVP.

### 4.1 Perilaku "opens the browser once"
Temuan: README (bagian Auto start pertama) menyebut `ensure-server.js` "opens the browser once" dan `AGENT_OFFICE_OPEN_BROWSER=0`. Tapi **kode `ensure-server.js` tidak membuka browser**. Hanya `start-office.ps1` yang memanggil `Start-Process "http://127.0.0.1:$port"`. README juga menyebut `start-office-hidden.vbs`, dan file itu tidak ada di repo. README punya dua bagian "Auto start" yang saling bertentangan.
- Default yang direkomendasikan: ikuti **kode**, bukan README. SessionStart tidak membuka jendela. `start-office.ps1` membuka jendela desktop, bukan URL browser, dengan fallback ke browser bila desktop tidak terpasang. README dirapikan terpisah (lihat OQ-3).

---

## 5. Keputusan khusus desktop (dengan default yang direkomendasikan)

| # | Keputusan | Default yang direkomendasikan | Label | Alasan / dampak |
|---|---|---|---|---|
| D1 | Tombol close (X) | **Quit jendela** (setara menutup tab). Server tidak terpengaruh. | Minimal, parity | Tray = fitur baru dan menambah RAM residen. |
| D2 | Single instance | **Ya**. Launch kedua memfokuskan jendela yang ada. | Minimal | Mencegah dua webview (2x RAM). |
| D3 | Always-on-top | **Tidak** (off, tanpa toggle). | Parity | Toggle = fitur baru, masuk Later. |
| D4 | Start on logon | **Tidak ada perubahan.** `install-autostart.ps1` tetap hanya menjalankan server. Membuka jendela saat logon bukan bagian MVP. | Parity | Lihat OQ-5. |
| D5 | Ukuran/posisi awal | Client area 1600x900 CSS px, center di monitor utama. | Parity-preserving | Di atas ambang layout wide (~1495 px). Konfirmasi ukuran yang biasa dipakai di browser (OQ-6). |
| D6 | Ingat ukuran/posisi | **Ya**, simpan bounds terakhir (termasuk monitor dan maximized). Jika monitor hilang, kembali ke D5. | Minimal desktop hygiene, tidak mengubah visual | Tanpa ini pengguna harus mengatur ulang setiap buka. Butuh konfirmasi bahwa ini bukan "fitur baru" (OQ-7). |
| D7 | Minimum window size | Tidak dibatasi lebih dari browser (layout 2 kolom / media query tetap berlaku). | Parity | |
| D8 | Context menu / DevTools | Context menu default webview dimatikan di build release. DevTools hanya di build debug. | Minimal | Lihat OQ-8. |
| D9 | Reload (F5/Ctrl+R) | **Tetap aktif.** | Parity, wajib | Dibutuhkan setelah Stop/Restart gagal (AC-5.3). |
| D10 | Zoom | 100% default. Ctrl+wheel/± diizinkan seperti browser. Zoom tidak disimpan. | Parity | Zoom mengubah DPR, jadi screenshot diff wajib di 100%. |
| D11 | Navigasi keluar | Diblokir. Hanya origin `127.0.0.1:<port>` + fonts.googleapis/gstatic (seperti sekarang). | Privacy | Mencegah webview jadi browser umum. |
| D12 | Server mati saat launch dan start gagal | Jendela tetap tampil dengan `reconnecting...` (perilaku halaman). Tidak ada dialog baru. | Parity | Sedikit berbeda dari browser, yang menampilkan halaman error koneksi. Lihat OQ-9. |
| D13 | Background throttling | Throttle rAF saat minimized/occluded, setara tab background. | Parity | Mendukung AC-3.4. |

---

## 6. Scope

### MVP (must-have)
1. Jendela desktop Windows 11 berbasis engine Chromium (WebView2) yang memuat `http://127.0.0.1:<port>/`.
2. Launcher yang memanggil `ensure-server.js` lalu membuka jendela. `start-office.ps1` diarahkan ke launcher ini dengan fallback ke browser.
3. D1, D2, D5, D6 (jika disetujui), D8, D9, D10, D11, D13.
4. Per-monitor DPI awareness.
5. Paket bukti parity (fixture + screenshot diff di 3 DPI dan 3 lebar) dan paket bukti RAM (skrip ukur + B1/B2/desktop + soak 8 jam).
6. Update README hanya untuk cara membuka versi desktop, plus koreksi temuan 4.1.

### Later (nice-to-have, di luar migrasi ini)
- Tray icon, always-on-top toggle, membuka jendela saat logon, notifikasi OS saat `waiting`, installer/MSI, code signing, auto-update, bundling font Nunito lokal, macOS/Linux, menyatukan server ke dalam app.

### Scope creep yang harus ditolak di migrasi ini
- Mengurangi frame rate atau mengubah animasi untuk menghemat CPU/RAM. Ini perubahan visual.
- Mengubah teks notice (misalnya "reload this page" atau "start-office.ps1") supaya terdengar lebih "desktop".
- Menambah tombol Start di UI.

---

## 7. Risiko

| # | Risiko | Dampak | Mitigasi |
|---|---|---|---|
| R1 | Webview standalone bisa memakai **lebih banyak** RAM daripada satu tab di browser yang memang sudah terbuka (B1). Runtime webview membawa browser, GPU, dan utility process sendiri. | Goal G3 bisa gagal | Ukur B1 dan B2 sebelum build. Gate AC-3.1/3.5. Jika gagal, jangan ship. |
| R2 | Versi WebView2 Runtime berbeda dari Chrome/Edge pengguna, sehingga muncul selisih anti-aliasing atau teks sub-pixel. | Parity "pixel identik" gagal | Bandingkan dengan Edge pada versi mayor yang sama. Toleransi AC-2.2 butuh sign-off. |
| R3 | Font Nunito dimuat dari Google. Saat offline atau lambat, fallback berbeda, dan canvas sempat menggambar dengan fallback. | Tampilan beda sementara | Sama dengan browser hari ini (parity). Bundling lokal dicatat di Later/OQ-4. |
| R4 | `AGENT_OFFICE_PORT` di-set di `env` settings.json Claude Code. Variabel ini **tidak terlihat** oleh launcher desktop yang dibuka dari Start menu/shortcut. | Jendela konek ke port yang salah | Dokumentasikan bahwa port custom harus di-set sebagai env var user Windows. Default tetap 4317. |
| R5 | Path hook di-hardcode ke `C:/projects/agent-office`. | Desktop tidak boleh memindahkan file server/hook | Desktop app tidak merelokasi atau menyalin `server.js`/`hook.js`. |
| R6 | Loop `requestAnimationFrame` berjalan terus. Jika webview tidak meng-throttle saat occluded, CPU naik. | Beban tambahan | AC-3.4 + D13. |
| R7 | Dokumentasi tidak konsisten (4.1), sehingga ekspektasi pengguna tentang auto-open jendela salah. | Kebingungan | OQ-3. |

---

## 8. Open questions (dengan default yang direkomendasikan)

| # | Pertanyaan | Default yang direkomendasikan | Dampak jika berbeda |
|---|---|---|---|
| OQ-1 | Budget RAM absolut yang diterima? | Gate ≤ 150 MB total private WS idle dan ≤ B2. Stretch ≤ 100 MB. Final setelah B1/B2 diukur. | Menentukan go/no-go dan pilihan teknologi. |
| OQ-2 | Apakah "lebih hemat dari browser" berarti dibandingkan B1 (tab marginal) atau B2 (browser dedicated)? | B2 sebagai syarat, B1 sebagai stretch. | Jika B1 wajib, kemungkinan besar tidak tercapai dengan webview (R1). |
| OQ-3 | Apakah SessionStart harus otomatis membuka jendela desktop (seperti klaim README)? | **Tidak** (ikuti kode saat ini). Jendela dibuka via `start-office.ps1`/shortcut. README dikoreksi. | Jika ya, perlu flag `AGENT_OFFICE_OPEN_BROWSER`/equivalent dan aturan "sekali per apa" (per logon? per server start?). Ini perlu didefinisikan. |
| OQ-4 | Boleh bundling Nunito lokal (visual sama, offline lebih konsisten, tidak ada request ke Google)? | Tidak di MVP (index.html tidak diubah). Masuk Later. | Jika ya, `index.html` berubah untuk browser juga. Privacy membaik. |
| OQ-5 | Jendela perlu ikut terbuka saat logon? | Tidak. | Jika ya, perlu shortcut Startup atau task baru dan menambah RAM sejak logon. |
| OQ-6 | Ukuran jendela browser yang biasa dipakai sekarang (layout wide atau stacked)? | 1600x900 (wide). | Mempengaruhi D5 dan fixture parity. |
| OQ-7 | Apakah mengingat ukuran/posisi jendela termasuk "fitur baru" yang dilarang? | Boleh (tidak mengubah visual). | Jika dilarang, jendela selalu buka di D5. |
| OQ-8 | Context menu, DevTools, dan zoom di build release? | Context menu off, DevTools off, zoom on (seperti browser). | Kecil. Zoom off mengurangi risiko DPR berbeda dari yang diuji. |
| OQ-9 | Saat launch dan server gagal start, perlu pesan khusus? | Tidak. Tampilkan halaman apa adanya (`reconnecting...`) atau halaman kosong. Tidak ada UI baru. | Jika ya, itu fitur/copy baru. |
| OQ-10 | Distribusi: cukup jalan dari folder repo (dependency-free ethos) atau perlu installer? | Jalan dari repo atau satu exe portable di repo. Tanpa installer dan tanpa signing di MVP. | Installer/signing menambah scope dan memunculkan SmartScreen. |
| OQ-11 | Telemetri bawaan runtime webview perlu dimatikan? | Ya, matikan opsi yang tersedia (misalnya SmartScreen/diagnostic di environment options) selama tidak mempengaruhi rendering. | Privacy: konsisten dengan klaim "local only". |

---

## 9. Out of scope
- Redesign apa pun (visual, copy, layout, animasi, frame rate).
- Fitur baru: tray, always-on-top, notifikasi, mini mode, settings UI, auto-update, tombol Start.
- Perubahan protokol server, `hook.js`, `ensure-server.js` (logika), hooks snippet, adapter Antigravity, plugin OpenCode.
- Menyatukan server ke dalam proses desktop.
- macOS/Linux, installer MSI, code signing.
- Optimasi CPU yang mengubah perilaku render.

---

### Lampiran: file yang relevan
- `index.html`: render loop (`render`/`frame`), DPR dan sizing canvas sekitar baris 1752-1814, breakpoint layout baris 1755, Restart/Stop dan EventSource baris 1864-1939, Google Fonts baris 10-12.
- `server.js`: HOST/PORT, header guard, auto-stop, restart via `process.execPath`.
- `ensure-server.js`: menghapus marker stopped dan tidak membuka browser (bertentangan dengan README).
- `start-office.ps1`: satu-satunya tempat yang membuka browser.
- `README.md`: dua bagian "Auto start" yang bertentangan dan referensi ke `start-office-hidden.vbs` yang tidak ada.
