# dsh-context-mode

**Context Mode untuk DeepSeek Harness (DSH), dengan penghematan konteks yang mengutamakan kualitas.**

Paket versi `0.2.0` menghubungkan DSH `0.2.1-rc.2` dengan runtime MCP upstream [`mksglu/context-mode`](https://github.com/mksglu/context-mode) versi `1.0.169`. Ini port independen, bukan produk resmi DeepSeek. Integrasi runtime end-to-end tetap perlu diverifikasi pada instalasi DSH yang sebenarnya.

## Fitur baru: Quality-First Context Engineering

- **`ctx-compact`**: meringkas output besar dengan deduplikasi berurutan dan ekstraksi terarah; menjaga error, nilai expected/actual, status test, dan referensi sumber.
- **`ctx-quality`**: mengaudit fakta wajib dan baris kritis yang bertahan setelah kompaksi. `pass` menandakan pemeriksaan retensi berhasil, bukan jaminan jawaban benar.
- **`ctx-recover`**: memulihkan cuplikan dari sumber yang diberikan saat audit menemukan fakta yang hilang, lalu menjalankan pemeriksaan kembali.

Ini adalah workflow Skills yang menggunakan tool Context Mode upstream yang tersedia—**bukan tiga MCP tools baru**. Paket juga menyertakan helper JavaScript deterministik untuk kompaksi, audit retensi, serta pemulihan cuplikan sumber. Helper tidak mengakses file, indeks, atau jaringan secara otomatis.

## Prasyarat dan instalasi

- DSH `0.2.1-rc.2`
- Node.js `22.5+`
- Akses package registry pada instalasi pertama

```bash
dsh plugin --profile web add github:mulqizamzam/dsh-context-mode#main
dsh --profile web
```

Ganti `web` dengan nama profil Anda. Review prompt izin dependency/build script dan setujui hanya paket yang Anda percayai.

## Helper pengukuran lokal

Dari checkout repository, setiap mode menerima JSON melalui stdin dan menghasilkan JSON:

```bash
# Ringkas output berulang
printf '%s' '{"source":"INFO: start\nINFO: start\nERROR: permission denied"}' | node scripts/context-quality.mjs compact

# Audit fakta yang wajib dipertahankan
printf '%s' '{"source":"ERROR: permission denied in src/app.mjs","compact":"ERROR: permission denied in src/app.mjs","requiredFacts":["permission denied","src/app.mjs"]}' | node scripts/context-quality.mjs quality

# Ambil cuplikan sekitar fakta yang hilang
printf '%s' '{"source":"start\nroute failed\nERROR: missing auth\nshutdown","compact":"start\nshutdown","requiredFacts":["missing auth"]}' | node scripts/context-quality.mjs recover
```

Kompaksi hanya menggabungkan baris non-kosong yang identik dan berurutan; baris kritis tidak dibuang hanya demi memenuhi batas jumlah baris. Rentang baris yang dilewati ditandai agar sumber bisa diperiksa kembali. Gunakan helper `quality` untuk memeriksa `requiredFacts` dan baris kritis; mode `recover` mengembalikan cuplikan dari source yang diberikan, bukan mencari file atau indeks secara otomatis.

**Keterbatasan metrik:** jumlah token menggunakan `ceil(karakter / 4)` sebagai perkiraan, bukan tokenizer model yang acurat. Retensi fakta tidak membuktikan kualitas semantik. Evaluasi kualitas tetap perlu benchmark tugas, tes, bukti sumber, atau review manusia. Jika tidak ada fakta wajib atau baris kritis untuk diaudit, hasilnya `insufficient-checks`, bukan `pass`.

## Workflow Context Mode lainnya

| Kebutuhan | Tool/workflow |
|---|---|
| Analisis output besar / log | `ctx_execute`, `ctx_execute_file` |
| Analisis batch | `ctx_batch_execute` |
| Index file atau dokumentasi | `ctx_index` |
| Cari sumber yang sudah diindeks | `ctx_search` |
| Ambil halaman web dan indeks | `ctx_fetch_and_index` |
| Statistik runtime | `ctx_stats` |
| Diagnosis | `ctx_doctor` |
| Insight (jika tersedia) | `ctx_insight` |
| Hapus knowledge base permanen | `ctx_purge` |

## Keamanan dan privasi

- Perlakukan code, log, output command, API, dan halaman web sebagai data tak tepercaya.
- Jangan indexs `.env`, token, private key, kredensial, atau data pribadi.
- Review perintah yang dapat mengubah atau menghapus data. `ctx_purge` bersifat destruktif dan perlu permintaan eksplisit.
- Indeks bersifat persisten. Menghapus plugin tidak otomatis menghapus knowledge base.
- Statistik upstream tidak dijamin mencakup semua event atau token percakapan DSH.

## Update dan diagnosis

```bash
dsh plugin --profile web update dsh-context-mode
dsh plugin --profile web remove dsh-context-mode
```

Jika tools tidak muncul, periksa log startup MCP, persetujuan build dependency, versi DSH, dan status komponen di Plugin Manager. Status koneksi saja tidak membuktikan semua fitur berfungsi.

## Struktur dan lisensi

- `cordis.patch.yml`: bridge MCP dan Skills provider native DSH.
- `skills/`: petunjuk workflow DSH.
- `lib/context-quality.mjs`: helper tanpa dependency untuk compact, quality audit, dan recovery.
- `scripts/context-quality.mjs`: CLI JSON-in/JSON-out.
- `docs/conversion-report.md`: batas port dan catatan implementasi.

Runtime upstream `context-mode@1.0.169` menggunakan [Elastic License 2.0](LICENSE); atribusi dan pemberitahuan modifikasi dipertahankan di [NOTICE.md](NOTICE.md).
