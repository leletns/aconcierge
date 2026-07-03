# blue. — Central da Helen

Production CRM for patient concierge management with **bidirectional Google Sheets sync**, XLSX export, intelligent phone parsing, WhatsApp integration, and AI summaries.

## Quick start

```bash
npm install
npm run dev      # http://localhost:8000
npm run build    # output in dist/
npm run preview  # preview production build
```

Legacy single-file prototype preserved at `blue-central-helen.html`.

## Architecture

```
src/
  components/   UI widgets (Toast, WhatsApp, Summary, Sync)
  hooks/        Form UX (auto-save, keyboard nav)
  services/     Store, export, sync, summary, Google API
  styles/       CSS
  utils/        Phone parser, dates, patient model
apps-script/    Google Apps Script Web App (Sheets backend)
```

## Google Sheets setup

1. Create a Google Spreadsheet.
2. **Extensions → Apps Script** — paste `apps-script/Code.gs` and `appsscript.json`.
3. Run `setupSecret()` once, then set `SHEETS_API_SECRET` in **Script Properties** to a strong secret.
4. Run `installTriggers()` once to enable `onEdit` sync timestamps.
5. **Deploy → New deployment → Web app** — Execute as Me, Anyone can access.
6. Copy the Web App URL into the app (**configurar sync**) or `.env`:

```env
VITE_SHEETS_WEBAPP_URL=https://script.google.com/macros/s/.../exec
VITE_SHEETS_API_SECRET=your-secret
VITE_GEMINI_API_KEY=optional-for-ai-summaries
```

## Features

| Feature | Description |
|---------|-------------|
| **XLSX Export** | Filtered view export, `Blue_Central_YYYY-MM-DD_HH-mm.xlsx`, UTF-8, dd/MM/yyyy dates |
| **Sheets Sync** | Bidirectional via Apps Script; conflict resolution by `modifiedAt` |
| **Resumir** | Structured patient summary; Gemini when API key configured |
| **Phone parser** | Brazil default + international; stores E.164 |
| **WhatsApp** | Direct wa.me links on every row |
| **UX** | Auto-save, validation, keyboard nav, toasts, sync queue |
