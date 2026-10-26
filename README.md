# dsh-context-mode

[![CI](https://github.com/mulqizamzam/dsh-context-mode/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mulqizamzam/dsh-context-mode/actions/workflows/ci.yml)

Integrasi [Context Mode](https://github.com/mksglu/context-mode) untuk DeepSeek Harness (DSH). Paket ini menyediakan Skills dan helper untuk retrieval planning, context budgeting, compaction, audit bukti, dan recovery.

## Kebutuhan

- DSH `0.2.1-rc.2`
- Node.js sesuai kebutuhan DSH: `^22.19.0` atau `>=24.0.0`
- `pnpm` tersedia di `PATH`

Contoh di bawah menggunakan profil `web`. Ganti `web` dengan profil yang lo pakai.

## Instalasi

### 1. NPM Registry

Gunakan nama paket resmi proyek ini setelah tersedia di npm:

```bash
dsh plugin --profile web add <nama-paket-npm>
dsh --profile web
```

**Catatan:** nama `dsh-context-mode` saat ini terdaftar di npm dengan metadata publisher yang berbeda. Jangan gunakan nama itu sebelum dipastikan bahwa paketnya merupakan rilis dari repository ini. Lihat [paket di npm](https://www.npmjs.com/package/dsh-context-mode).

### 2. GitHub Repository

```bash
dsh plugin --profile web add "github:mulqizamzam/dsh-context-mode#main"
dsh --profile web
```

### 3. Local Directory

Dari mesin yang sudah memiliki checkout repository:

```bash
cd /path/to/dsh-context-mode
dsh plugin --profile web add .
dsh --profile web
```

Metode ini memasang checkout lokal untuk pengembangan. Jangan pindahkan atau hapus folder repository setelah dipasang.

Setelah instalasi, restart profil DSH agar bundle termuat.

## Fitur

- **Context Mode tools:** indexing, search, execution, dan statistik melalui runtime Context Mode.
- **Skills:** workflow untuk diagnosis, index/search, compaction, context budget, retrieval planning, quality audit, recovery, dan upgrade.
- **CLI helper:** mode `plan`, `budget`, `compact`, `adaptive-compact`, `quality`, dan `recover`.

Helper memproses input yang diberikan; helper tidak otomatis membaca file atau mengambil data dari indeks. Retrieval planner hanya membuat rencana dan tidak menjalankan pencarian.

### Pemakaian CLI

Lihat semua mode dan contoh input tanpa perlu menyiapkan file:

```bash
dsh-context-quality --help
```

CLI menerima satu objek JSON lewat stdin. Output default tetap JSON agar aman dipakai dalam script; tambahkan `--text` untuk ringkasan yang lebih mudah dibaca:

```bash
printf '%s' '{"source":"INFO: startup\nERROR: permission denied"}' | dsh-context-quality compact --text
printf '%s' '{"source":"ERROR: permission denied","compact":"ERROR: permission denied","requiredFacts":["permission denied"]}' | dsh-context-quality quality --text
```

Untuk mode `quality`, exit code membedakan hasil audit: `0` = pass, `1` = fail, `2` = error input/usage, dan `3` = insufficient checks. Status `pass` hanya berarti bukti literal yang diperiksa tetap ada; status itu bukan jaminan kebenaran semantik. Mode `adaptive-compact` dapat mengembalikan status hold/fallback secara sukses sambil mempertahankan sumber asli—selalu periksa field `status`, jangan hanya exit code.

## Verifikasi

Periksa bundle yang terpasang:

```bash
dsh plugin --profile web why dsh-context-mode
dsh --profile web --dump-config
```

Di sesi DSH, jalankan `ctx_doctor` untuk memeriksa kesehatan runtime. Pastikan tool dan Skills yang dibutuhkan benar-benar tersedia; koneksi MCP saja tidak membuktikan semua fitur bekerja.

Untuk menjalankan pemeriksaan proyek dari checkout:

```bash
npm run check
npm test
npm run benchmark
```

Lihat [panduan runtime integration test](docs/integration-smoke-test.md) untuk pengujian lengkap.

## Lisensi

Elastic License 2.0. Lihat [LICENSE](LICENSE) dan [NOTICE.md](NOTICE.md).
