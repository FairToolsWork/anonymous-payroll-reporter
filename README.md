# Payroll PDF Processor — Tools & Fixtures

A monorepo for the Payroll PDF Processor PWA and its test/fixture tooling. The PWA runs fully client-side, extracting payroll data from PDF payslips and rendering a printable report. This repo also includes the Python/Node pipelines that generate synthetic PDF and Excel fixtures used by the test suite.

## Repository layout

- **`pwa/`** — Client-side PWA (Vue + PDF.js + service worker)
- **`generate_fixtures/`** — PDF/Excel fixture generators (Python)
- **`tests/`** — Vitest suite covering PDF parse, contribution parse, and report workflows

## Setup

### Node dependencies

```bash
pnpm install
```

### Fixture tooling (Python)

The fixture generators require Python and a local virtual environment. See the detailed setup in:

- `generate_fixtures/README_PDF.md`
- `generate_fixtures/README_EXCEL.md`

## Common commands

### Quality & checks

Runs formatting, linting, typechecking, then tests (in order):

```bash
pnpm precommit
```

Other useful commands:

```bash
pnpm test:all
pnpm jslint
pnpm csslint
pnpm check:js
```

### Fixture generation

PDF fixtures:

```bash
pnpm fixtures:generate
pnpm fixtures:expected
```

Excel fixtures:

```bash
pnpm fixtures:excel
pnpm fixtures:expected-excel
```

Full fixture pipeline:

```bash
pnpm fixtures:generate
```

> For the full PDF and Excel fixture workflows, see the generator READMEs linked below.

## Releases

This repo uses [release-please](https://github.com/googleapis/release-please) for automated versioning. On every push to `main`, the release-please GitHub Action maintains an open release PR. Merging it:

- bumps the version in `package.json`
- bumps `CACHE_NAME` in `pwa/sw.js` (invalidating the Service Worker cache for all users)
- creates a tagged GitHub release with a generated changelog

Version increments are driven by [conventional commits](https://www.conventionalcommits.org/): `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major.

See `pwa/README.md` for the full deployment checklist.

## Update reminders (important)

- **Service Worker cache invalidation:**
  `CACHE_NAME` in `pwa/sw.js` is bumped automatically when the release-please PR is merged. No manual change needed.

- **Regenerate fixtures when inputs change:**
  If `generate_fixtures/payroll_inputs.json` or structure configs change, regenerate fixtures and expected snapshots before running tests.

## Local documentation

- **PWA**: `pwa/README.md`
- **PDF fixtures**: `generate_fixtures/README_PDF.md`
- **Excel fixtures**: `generate_fixtures/README_EXCEL.md`
