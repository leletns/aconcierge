## Cursor Cloud specific instructions

### Stack
Vite + vanilla JS SPA. Dependencies via npm (`package.json`). Legacy prototype: `blue-central-helen.html`.

### Commands
| Task | Command |
|------|---------|
| Install | `npm install` |
| Dev server | `npm run dev` → http://localhost:8000 |
| Build | `npm run build` → `dist/` |
| Preview prod | `npm run preview` |

### Services
- **Required:** Vite dev server (`npm run dev`) for the modular app.
- **Optional:** Google Sheets Web App (configure in app UI or `.env` — see README).
- **Optional:** Gemini API key for AI summaries.

### Notes
- Google Sheets sync requires deploying `apps-script/` to a real Google Spreadsheet; without credentials the app runs fully in localStorage mode.
- No automated test suite; phone parser can be smoke-tested: `node --input-type=module -e "import {parsePhone} from './src/utils/phone.js'; console.log(parsePhone('21999999999'));"`
