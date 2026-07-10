# blue. Central — concierge da Helen

Aplicação web única (MacBook da Helen) que substitui as duas abas do Google Sheets:
**GESTÃO DE RECALL — PACIENTES** e **Cirurgias BLUE (controle Helen)** — com sync
automático bidirecional, tudo editável, visual premium (Montserrat, paleta creme/azul).

## Telas

| Tela | O que faz |
|------|-----------|
| **hoje** | urgências: recall vencido, retornos da semana, pré-op em atenção |
| **planilha recall** | grade editável 1:1 com a planilha Recall (inline edit, filtros, ⌘F, auto-save) |
| **planilha cirurgias** | grade editável 1:1 com a planilha Cirurgias — alternância com 1 clique |
| **retornos** | trilho pós-op com marcos configuráveis por procedimento |
| **pré-op** | checklist de exames por cirurgia marcada |
| **⚙ acompanhamentos** | templates de prazos (ex.: Botox 15/90/180d) + override por paciente |

## Rodar

```bash
npm install
npm run dev      # http://localhost:8000
npm run build    # produção → dist/
npm run preview  # servir o build
```

Sem conexão configurada o app roda 100% local (localStorage) com dados de exemplo.
Para sincronizar com as planilhas reais: implantar `apps-script/Code.gs` e conectar
pela UI (**conectar planilhas**) ou via `.env` — passo a passo completo em
[`docs/INSTALACAO-MACBOOK-HELEN.md`](docs/INSTALACAO-MACBOOK-HELEN.md).

## Funcionalidades

| Feature | Descrição |
|---------|-----------|
| Grades editáveis | Espelho 1:1 das duas planilhas; Enter/Tab/Esc; sync automático por célula |
| Sync | Poll ≤3s, push debounced, conflito por `modifiedAt`, fullSync ao conectar |
| Prazos configuráveis | Templates por procedimento (dias livres) + override por paciente, persistidos na aba `_Config` |
| Telefone | Parser BR (+55/DDD) e internacional (EUA, PT, CZ, NL…) → E.164 |
| WhatsApp | Botão verde → `wa.me` direto em cada linha |
| Export | `Blue_Central_YYYY-MM-DD_HH-mm.xlsx` com as duas abas, download via Blob |
| ✨ Resumir | Gemini via Apps Script (`GEMINI_API_KEY` em Script Properties), modal copiar/regenerar |
| Busca | `⌘K` paciente unificada · `⌘F` dentro da grade |

## Arquitetura

- `src/app.js` — orquestrador da UI
- `src/components/SpreadsheetGrid.js` — grade editável estilo planilha
- `src/screens/acompanhamentos.js` — editor de templates de prazos
- `src/services/` — store (espelho dual-sheet), syncService, googleSheetsApi, exportService, summaryService
- `src/utils/` — telefone E.164, datas PT-BR ("Sex, 09 de Jan 2026"), matching de pacientes, templates de marcos
- `apps-script/Code.gs` — Web App dual-sheet: doGet/doPost, onEdit nas duas planilhas, `_Config`, `beautifySheets()` (só formatação), Gemini

Modelo de dados: [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) ·
Prototipo legado preservado em `blue-central-helen.html`.
