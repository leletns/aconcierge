# blue. Central — 1 comando + 1 prompt

## Passo 1 — Um comando no terminal

```bash
git clone https://github.com/leletns/aconcierge.git && cd aconcierge && git checkout cursor/production-crm-sheets-sync-4197 && npm install
```

Abra a pasta `aconcierge` no Fable ULTRACODE.

## Passo 2 — Cole o prompt abaixo (tudo está dentro dele)

Copie de `---COLE NO FABLE---` até o final. **Não precisa screenshot, CSV, nem anexo.**

---COLE NO FABLE---

Você está na pasta do repositório `aconcierge` (branch `cursor/production-crm-sheets-sync-4197`).

Leia os links das planilhas abaixo, leia o código em `src/` e `apps-script/`, e construa o MVP completo. **Não peça nada ao usuário** — tudo que você precisa está nesta mensagem.

---

# PRODUTO

**blue. Central da Helen** — concierge médica (cirurgia plástica, Dr. Rafael).  
Uma única aplicação web no MacBook da Helen que **substitui abrir duas abas do Google Sheets**.  
Sync automático bidirecional. Tudo editável. Aparência premium (Montserrat fino, logo **blue .**, paleta creme/azul do `src/styles/main.css`).

---

# PLANILHA 1 — RECALL (ler e mapear)

**Link:** https://docs.google.com/spreadsheets/d/1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU/edit?usp=sharing  
**ID:** `1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU`  
**Título:** GESTÃO DE RECALL — PACIENTES  
**Cabeçalho na linha 5:**

| Coluna | Conteúdo exemplo |
|--------|------------------|
| PACIENTE | Josely Cristine Azevedo Pereira |
| CONTATO (WhatsApp) | 21 98303-0058, 1 (770) 655-6389, (21) 98117-1900 |
| ÚLTIMA CONSULTA / PROCEDIMENTO | 10/11/2025, Primeira Consulta, Botox |
| DATA AGENDADA | Pendente, 09/07/2026 |
| STATUS | Pendente, Agendado, Não agendou, Sem Resposta, Em Acompanhamento, Sem interesse |
| MOTIVO DA RECUSA | Outros, Distância, Agenda incompatível |
| DATA DO CONTATO | 29/05/2026 |
| PRÓXIMO CONTATO | 29/05/2026 |
| OBSERVAÇÕES | texto livre |

Dados começam linha 6. Há telefones BR e internacionais.

---

# PLANILHA 2 — CIRURGIAS BLUE (ler e mapear)

**Link:** https://docs.google.com/spreadsheets/d/1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI/edit?usp=sharing  
**ID:** `1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI`  
**Título:** Cirurgias BLUE (controle Helen)  
**Cabeçalho linha 1:**

| Coluna | Exemplo |
|--------|---------|
| Data | seg., 05 jan. 2026 |
| Paciente | Mariana Monteiro Spizzirri |
| Cirurgia | Lipedema MMII + Argoplasma + Morpheus |
| Hospital | Perinatal, Barra D'or, Copa Star |
| 03 meses | Realizada, Marcada, Pendente, Sem resposta |
| 06 meses | idem |
| 01 ano | idem |

Dados começam linha 2.

---

# UNIFICAR AS DUAS NO MESMO SISTEMA

- Mesma paciente = `id` estável + match nome normalizado + telefone E.164
- Se só Recall → visão recall
- Se só Cirurgias → visão cirurgia/retornos
- Se nas duas → **ficha única** com tudo

**Helen NÃO deve usar duas abas do Google no dia a dia.**

Navegação no app (sidebar, mesma janela):
- **Hoje** — urgências
- **Planilha Recall** — grade editável igual à planilha Recall (inline edit, filtros, auto-save)
- **Planilha Cirurgias** — grade editável igual à planilha Cirurgias
- Alternar Recall ↔ Cirurgias = **1 clique**, sem abrir nova aba do browser
- **Retornos** — trilho pós-op
- **Pré-op** — exames
- **⚙ Acompanhamentos** — config de prazos

---

# TUDO EDITÁVEL — PRAZOS DE ACOMPANHAMENTO

O código atual tem marcos fixos em `src/utils/constants.js` (7d, 1m, 3m, 6m, 1a). **Substituir por sistema configurável:**

1. **Por procedimento (global):** Helen edita templates — ex. "Botox" → marcos 15 dias, 90 dias, 180 dias; "Lipedema" → 90d, 180d, 365d. Qualquer número de dias.
2. **Por paciente (override):** Na ficha, ela muda os dias só daquela paciente.
3. **Colunas 03m / 06m / 1a** da planilha Cirurgias sincronizam com os marcos do template (ou config renomeável).

Persistir templates na aba `_Config` do Apps Script + sync.

---

# SYNC AUTOMÁTICO (sem importar CSV)

Apps Script (`apps-script/Code.gs`) deve:
- `SpreadsheetApp.openById` nos dois IDs acima
- `doGet` / `doPost` / `onEdit` nas duas planilhas
- Poll app ≤3s, push debounced, conflito por `modifiedAt`
- `fullSync` ao conectar
- `beautifySheets()` — só formatação (cores, freeze, filtros), **nunca mudar valores das células**
- `summarize` com Gemini (`GEMINI_API_KEY` em Script Properties)
- Script Properties: `SHEETS_API_SECRET`, `GEMINI_API_KEY`, `RECALL_SHEET_ID`, `CIRURGIAS_SHEET_ID`

---

# FUNCIONALIDADES OBRIGATÓRIAS

| Feature | Requisito |
|---------|-----------|
| Grade Recall | Edição inline, sync bidirecional |
| Grade Cirurgias | Edição inline, sync bidirecional |
| Telefone | Parser BR (+55/DDD) + internacional → E.164 |
| WhatsApp | Botão verde → `https://wa.me/{digits}` direto |
| Export | XLSX `Blue_Central_YYYY-MM-DD_HH-mm.xlsx`, Blob download |
| Resumir | ✨ Gemini via Apps Script, modal copiar/regenerar/notas |
| Busca | ⌘K paciente, ⌘F na grade |
| Auto-save | Formulários e células |
| Logo | **blue .** Montserrat weight 300 |

---

# CÓDIGO EXISTENTE (estender)

- `src/app.js` — orquestrador UI
- `src/services/syncService.js`, `googleSheetsApi.js`, `store.js`
- `src/utils/phone.js`, `patientModel.js`
- `index.html`, `src/styles/main.css`

Não reescreva do zero. Evolua para dual-sheet + grades + templates editáveis.

---

# ENTREGÁVEIS

1. Código funcionando: `npm run build` sem erro
2. `apps-script/Code.gs` atualizado para 2 planilhas
3. `docs/INSTALACAO-MACBOOK-HELEN.md` — como instalar no Mac (Automator + Dock)
4. `.env.example` com os dois sheet IDs e variáveis

---

# CRITÉRIOS DE ACEITE

- [ ] Helen alterna Planilha Recall ↔ Planilha Cirurgias dentro do app (1 clique)
- [ ] Editar célula no app → planilha Google atualiza
- [ ] Editar no Google → app atualiza em segundos
- [ ] Helen configura dias de acompanhamento por procedimento
- [ ] Helen override dias de uma paciente específica
- [ ] Export XLSX baixa arquivo
- [ ] WhatsApp BR e internacional
- [ ] Sem fluxo de import CSV
- [ ] Visual limpo, não genérico de IA

---

# ORDEM DE EXECUÇÃO

1. Inspecionar repo + inferir estrutura das planilhas pelos links/dados acima
2. Implementar Apps Script dual-sheet
3. Implementar `SpreadsheetGrid` para Recall e Cirurgias
4. Implementar `ProcedureTemplate` + editor ⚙ Acompanhamentos
5. Integrar sync, WhatsApp, export, Gemini
6. Build + documentação Mac

**Execute tudo. Não pare para perguntar. Não use placeholders.**

---FIM DO PROMPT---
