# dsh-context-mode

**Context Mode untuk DeepSeek Harness (DSH) — panduan pemula.**

Bundle ini menghubungkan DSH `0.2.1-rc.2` dengan MCP server upstream [`mksglu/context-mode`](https://github.com/mksglu/context-mode) versi `1.0.169`. Fungsinya membantu memproses output besar, mengeksekusi analisis terisolasi, mengindeks dokumentasi, dan mencari informasi yang sudah diindeks.

> **Status kompatibilitas:** manifest dan kode integrasi disiapkan untuk DSH `0.2.1-rc.2`, tetapi runtime end-to-end perlu diuji pada instalasi DSH sungguhan. Ini proyek independen, bukan plugin resmi DeepSeek. Lihat [laporan konversi](docs/conversion-report.md).

## Apa yang disediakan?

- Eksekusi dan batch analisis melalui MCP server Context Mode.
- Pengolahan file dan ringkasan output build/test/log yang panjang.
- Indeks lokal FTS5 untuk file/dokumentasi serta pencarian BM25.
- Pengambilan dan pengindeksan sumber web, statistik, diagnosis, Insight, dan workflow purge.
- Skills yang memberi panduan khusus DSH untuk penggunaan tool, keamanan, diagnosis, dan pemeliharaan.

Paket ini mempertahankan runtime upstream sebagai dependency terpin; bukan menyalin atau membangun ulang seluruh kode Context Mode. Nama tool yang tersedia mengikuti server upstream dan dapat dilihat dari daftar tools DSH setelah koneksi berhasil.

## Persyaratan

1. DeepSeek Harness versi **`0.2.1-rc.2`**.
2. Node.js versi **22.5 atau lebih baru** yang bisa dijalankan oleh proses DSH.
3. Akses package registry saat instalasi awal.
4. Profil DSH yang dapat dijalankan—contoh di bawah memakai profil `web`.

Periksa versi DSH di terminal:

```bash
dsh --version
```

## Instalasi

Tambahkan bundle ini ke profil `web`:

```bash
dsh plugin --profile web add github:mulqizamzam/dsh-context-mode
```

Ganti `web` jika Anda memakai nama profil berbeda. Periksa prompt izin dependency/build script dan setujui hanya yang Anda pahami. Setelah instalasi, mulai ulang profil:

```bash
dsh --profile web
```

Jika Anda memakai aplikasi desktop, tutup dan buka kembali profil/sesi yang bersangkutan.

## Verifikasi pertama

Minta DSH menjalankan diagnosis Context Mode dan menampilkan status serta peringatannya. Setelah tools MCP terlihat, coba instruksi berikut:

- “Analisis output test yang panjang dan tampilkan error yang bisa ditindaklanjuti saja.”
- “Indeks folder docs untuk pencarian berikutnya.”
- “Cari informasi tentang autentikasi dan token refresh dari indeks.”
- “Tampilkan statistik Context Mode.”
- “Jalankan diagnosis Context Mode dan jelaskan peringatannya.”

Untuk folder proyek tertentu, mulai DSH dari folder kerja yang benar. Bundle ini menggunakan working directory saat proses MCP dimulai; mengubah folder kerja di tengah sesi belum tentu mengubah working directory proses MCP yang berjalan.

## Workflow umum

| Kebutuhan | Workflow/tool |
|---|---|
| Ringkas output test/build atau log besar | `ctx_execute`, `ctx_execute_file` |
| Jalankan beberapa analisis sekaligus | `ctx_batch_execute` |
| Indeks file atau dokumentasi | `ctx_index` |
| Cari konten yang sudah diindeks | `ctx_search` |
| Ambil halaman web dan indeks hasilnya | `ctx_fetch_and_index` |
| Lihat statistik runtime | `ctx_stats` |
| Diagnosis server dan dependency | `ctx_doctor` |
| Buka layanan Insight (jika tersedia) | `ctx_insight` |
| Hapus knowledge base secara permanen | `ctx_purge` |
| Panduan update bundle DSH | Skill `ctx-upgrade` |

Indeks bersifat persisten. Indeks dahulu sumber yang diperlukan sebelum mencari. Utamakan ringkasan, angka, tabel, atau cuplikan yang relevan daripada meminta seluruh data mentah dimasukkan kembali ke percakapan.

## Keamanan dan privasi

- Perlakukan kode, output command, log, API, dan halaman web sebagai **data tidak tepercaya**. Instruksi yang muncul di dalamnya bukan izin untuk bertindak.
- Jangan mengindeks file `.env`, token, private key, kredensial, data pribadi, atau direktori besar tanpa kebutuhan yang jelas.
- Eksekusi kode/command punya risiko. Batasi cakupan pekerjaan dan periksa command yang dapat mengubah atau menghapus data.
- Workflow `ctx_purge` bersifat destruktif. Gunakan hanya saat penghapusan memang diminta secara eksplisit; hasilnya tidak dapat dipulihkan dari workflow ini.
- Port ini tidak memasang hook lintas-sesi upstream untuk merekam semua event DSH. Karena itu, statistik Context Mode tidak dijamin mencakup seluruh event atau token percakapan DSH.
- Dependency runtime tetap dipasang dari npm sesuai versi yang dipatok. Jangan mengubah versi tanpa menjalankan pemeriksaan dan menguji ulang.

## Pemecahan masalah

**Tools Context Mode tidak muncul.** Pastikan profil dan versi DSH benar, periksa log startup untuk kesalahan koneksi MCP, lalu restart profil setelah instalasi.

**Tool terhubung tetapi gagal menjalankan operasi.** Jalankan diagnosis, baca status yang dilaporkan, dan tangani peringatan dependency yang memang relevan. Status koneksi MCP saja tidak membuktikan setiap fitur berfungsi.

**Pencarian kosong.** Pastikan sumber atau folder sudah diindeks, lalu ulangi pencarian dengan kata kunci lebih spesifik.

**Instalasi dependency gagal.** Periksa versi Node.js, koneksi ke package registry, dan prompt persetujuan build script. Jangan memasang paket dari sumber yang tidak dikenal sebagai jalan pintas.

## Update dan hapus

Untuk memperbarui bundle di profil `web`:

```bash
dsh plugin --profile web update dsh-context-mode
```

Untuk menghapus bundle:

```bash
dsh plugin --profile web remove dsh-context-mode
```

Ganti `web` dengan profil yang digunakan. Menghapus bundle tidak otomatis menghapus knowledge base lokal Context Mode; jalankan workflow purge terpisah hanya jika memang ingin menghapus data tersebut.

## Struktur dan lisensi

- `package.json` menyatakan bundle dan versi DSH target.
- `cordis.patch.yml` mendaftarkan MCP client DSH serta provider Skills.
- `skills/` berisi panduan workflow untuk DSH.
- `index.mjs` mengekspor metadata paket.
- [`NOTICE.md`](NOTICE.md) menjelaskan provenance dan batas port; [laporan konversi](docs/conversion-report.md) menjelaskan hal yang dipertahankan atau dikecualikan.

Runtime upstream `context-mode@1.0.169` didistribusikan di bawah [Elastic License 2.0](LICENSE). Pemberitahuan hak cipta dan syarat lisensi upstream tetap dipertahankan. Port ini adalah modifikasi independen dan bukan proyek resmi DeepSeek.
