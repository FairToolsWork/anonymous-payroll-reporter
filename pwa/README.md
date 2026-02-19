# Payroll PDF Processor (PWA)

A client-side PWA that extracts payroll data from PDF payslips and renders a printable report.
All processing happens locally in the browser — no uploads or server calls, privacy focused.

## Features

- Client-side PDF extraction via PDF.js
- Report rendering with per-payslip tables and summary totals
- Missing-month detection (highlighted in report and UI)
- Offline-capable PWA with service worker caching
- Optional PDF password support
- Print / Save as PDF export

## How it works

1. Select one or more payslip PDFs.
2. The app extracts text, parses payroll fields, and builds an HTML report.
3. Use **Print / Save as PDF** to export.

## Local usage

Open `pwa/index.html` in a browser or serve the folder with any static server.

To enable debug panel:

```
index.html?debug=1
```

## Tech

- Vue 3 (CDN)
- PDF.js (CDN)
- Service Worker + Web Manifest

## Notes

- No data is stored or sent to a server.
- The report uses the page title to suggest the PDF filename.
