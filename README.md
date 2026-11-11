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

Sebelum memasang dengan metode ini, jalankan `pnpm install` di folder repository. Profil link tidak meng-install dependensi milik paket yang di-link, sehingga `context-mode` (dan peers `@deepseek-ai/*`) harus tersedia dari `node_modules` repository itu sendiri; tanpa itu entry MCP gagal resolve `context-mode/cli` dan auto-trigger service otomatis nonaktif (fail-open, dengan warning di log boot).

Setelah instalasi, restart profil DSH agar bundle termuat.

## Fitur

- **Context Mode tools:** indexing, search, execution, dan statistik melalui runtime Context Mode.
- **Skills:** workflow untuk diagnosis, index/search, compaction, context budget, retrieval planning, quality audit, recovery, dan upgrade.
- **CLI helper:** mode `plan`, `budget`, `compact`, `adaptive-compact`, `quality`, dan `recover`.
- **Auto-trigger service:** menjalankan skrip hook upstream context-mode otomatis di seam lifecycle DSH — tanpa trigger manual (detail di bagian [Auto-trigger](#auto-trigger-native-service)).

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

## Auto-trigger (native service)

Sejak `0.5.0`, bundle memuat entry cordis ketiga: `dsh-context-mode-auto` (`lib/auto-trigger.mjs`). Entry ini menjalankan skrip hook upstream context-mode — yang sama dengan platform lain yang didukung Context Mode — di seam lifecycle DSH, sehingga routing Context Mode berjalan **otomatis tanpa trigger**:

| Seam DSH | Hook upstream | Efek |
|---|---|---|
| `agent/created` | `hooks/sessionstart.mjs` | auto-inject routing block + snapshot resume saat session startup/resume/clear/compact |
| `tools/pre-execute` | `hooks/pretooluse.mjs` | nudge tool big-output agar memakai `ctx_*` (threshold ukuran + allowlist decided upstream) |
| `tools/post-execute` | `hooks/posttooluse.mjs` | capture session event (kontinuitas sesi) |
| `agent/turn-stopping` | `hooks/stop.mjs` | capture akhir turn / paksa kelanjutan |

Sifat: fail-open (error/timeout/spawn hook tidak pernah memblokir tool atau mem-crash host), nol dependensi runtime, dan session DB hook disimpan di `$DSH_HOME/context-mode-hooks` (bukan `~/.claude`). Gate pre/post hanya memicu untuk tool yang cocok dengan `toolMatcher` default: `bash`, `read`, `grep`, `glob`, `web_fetch`, `webSearch`, `read_page`, `platform_search`, `advanced_search`, `browser_*`, dan `mcp__context_mode__*`.

Config row (semua opsional, default aman):

```yaml
    - id: dsh-context-mode-auto
      name: 'dsh-context-mode/auto-trigger'
      config:
        enabled: true   # false = matikan seluruh auto-trigger
        # events: { sessionStart: false }  # toggle per-event; kunci tak disebut default true
        # toolMatcher: '^(bash|read|...)$|^mcp__context_mode__'
        # timeoutMs: 15000
        # configDir: /path/ke/dir
```

Catatan: event `PreCompact` tidak didukung bridge DSH; gate kompaksi dipegang oleh plugin `mulqi-context-compression`.

## Verifikasi

Periksa bundle yang terpasang:

```bash
dsh plugin --profile web why dsh-context-mode
dsh --profile web --dump-config
```

Baris mount yang sehat: `dsh-context-mode-mcp`, `dsh-context-mode-skills`, dan `dsh-context-mode-auto` (tanpa baris "skipping profile bundle").

Di sesi DSH, jalankan `ctx_doctor` untuk memeriksa kesehatan runtime. Pastikan tool dan Skills yang dibutuhkan benar-benar tersedia; koneksi MCP saja tidak membuktikan semua fitur bekerja.

Untuk menjalankan pemeriksaan proyek dari checkout. Benchmark performa melaporkan median waktu dan scaling untuk input sintetis 1.000, 5.000, dan 15.000 baris; bandingkan hasil pada environment yang sama, karena waktu absolut bervariasi:

```bash
npm run check
npm test
npm run benchmark
npm run benchmark:performance
```

Lihat [panduan runtime integration test](docs/integration-smoke-test.md) untuk pengujian lengkap.

## Lisensi

Elastic License 2.0. Lihat [LICENSE](LICENSE) dan [NOTICE.md](NOTICE.md).
