# blue. Central — concierge da Helen

Aplicação web única (MacBook da Helen) que substitui as duas abas do Google Sheets:
**GESTÃO DE RECALL — PACIENTES** e **Cirurgias BLUE (controle Helen)** — com sync
automático bidirecional, tudo editável, visual premium (Montserrat, paleta creme/azul).

## Visualização Linha Única (single-page)

| Área | O que faz |
|------|-----------|
| **smart alert (topo)** | tarefas críticas & pacientes do dia — recall vencido, revisões vencidas, cirurgias próximas; colapsável |
| **bloco recall** | uma linha por paciente: nome · status (badge colorida) · próximo contato · observações com auto-save direto na planilha |
| **bloco cirurgias & revisões** | uma linha por cirurgia: status da próxima revisão · data · obs; pré-op com contagem regressiva |
| **📊 resumo para gestão** | card executivo blue.: volume, porcentagens por status, revisões, motivos de recusa e gargalos — pronto para print/PDF |
| **🎯 atenção do mês** | filtro global: só quem precisa de ação até o fim do mês |
| **▸ ver detalhes** | expande a grade-espelho completa de cada planilha (oculta por padrão) |
| **rodapé técnico** | ⚙ acompanhamentos (prazos por procedimento + override por paciente) · conectar planilhas |

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

**Manual da Helen (uso diário):** [`docs/MANUAL-HELEN.md`](docs/MANUAL-HELEN.md)

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
