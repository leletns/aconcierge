# PROMPT MESTRE — Fable ULTRACODE · blue. Central da Helen

> Copie **tudo** abaixo (do `---INÍCIO---` ao `---FIM---`) e cole como primeira mensagem no Fable ULTRACODE.

---INÍCIO---

# MISSÃO

Construir o **MVP único definitivo** da concierge **blue.** para a Helen: um sistema que **substitui o trabalho de ficar pulando entre duas abas do Google Sheets**, unificando Recall + Cirurgias em **um só app**, com sync automático bidirecional, **tudo editável** (inclusive **prazos de acompanhamento por procedimento e por paciente**), aparência extraordinária e uso diário ultra-rápido.

**Não é protótipo. É ferramenta de produção.**

---

## QUEM USA

- **Helen** — concierge (pt-BR)
- Uso: MacBook, Chrome/Safari, WhatsApp constante
- Meta: &lt;30 segundos para qualquer ação rotineira

---

## REPOSITÓRIO BASE (estender — não reescrever)

- GitHub: `leletns/aconcierge`
- Branch: `cursor/production-crm-sheets-sync-4197`
- Stack: Vite + JS modular + Apps Script + sync queue
- Paleta existente: creme `#F4F1EB`, azul `#6F8DB0`, Montserrat

---

## DUAS PLANILHAS GOOGLE (fonte da verdade)

### 1) RECALL
- URL: https://docs.google.com/spreadsheets/d/1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU/edit
- ID: `1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU`
- Colunas (linha ~5): PACIENTE | CONTATO (WhatsApp) | ÚLTIMA CONSULTA/PROCEDIMENTO | DATA AGENDADA | STATUS | MOTIVO DA RECUSA | DATA DO CONTATO | PRÓXIMO CONTATO | OBSERVAÇÕES
- Status típicos: Pendente, Agendado, Não agendou, Sem Resposta, Em Acompanhamento, Sem interesse

### 2) CIRURGIAS BLUE
- URL: https://docs.google.com/spreadsheets/d/1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI/edit
- ID: `1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI`
- Colunas: Data | Paciente | Cirurgia | Hospital | 03 meses | 06 meses | 01 ano
- Estados retorno: Realizada, Marcada, Pendente, Sem resposta

**Unificação:** mesma paciente = `id` estável + match por nome normalizado + telefone E.164.

---

## CONCEITO CENTRAL: “PLANILHA DENTRO DO SISTEMA”

Helen **NÃO** deve abrir duas abas do Google Sheets no dia a dia.

O app tem **modo planilha integrado** — duas visões que **parecem e funcionam como planilha** (grade editável inline), mas dentro do mesmo MVP:

| Visão no app | Espelha | Navegação |
|--------------|---------|-----------|
| **📋 Planilha Recall** | Planilha Recall | Sidebar ou toggle “Recall \| Cirurgias” |
| **📋 Planilha Cirurgias** | Planilha Cirurgias | Mesmo toggle — **um clique**, mesma janela |
| **Hoje** | Dashboard urgências | Sidebar |
| **Ficha da paciente** | Detalhe unificado | Clique no nome |

**Requisitos da grade tipo planilha:**
- Edição **inline** (clicou na célula → edita → auto-save → sync Sheets)
- Filtros por coluna (como Sheets)
- Ordenação por coluna
- Scroll horizontal se necessário
- Cabeçalhos fixos
- Status com cores suaves (não gritantes)
- Atalho `⌘F` buscar na grade ativa
- Indicador “sincronizado há Xs” / “salvando…”

**Opcional:** botão discreto “abrir no Google Sheets” (nova aba) só para emergência — **não** é o fluxo principal.

---

## TUDO EDITÁVEL — ESPECIALMENTE PRAZOS DE ACOMPANHAMENTO

Hoje o código tem marcos fixos (7d, 1m, 3m, 6m, 1a). **Isso deve virar configurável em 3 níveis:**

### Nível 1 — Templates por tipo de procedimento (global)
Tela **⚙ Acompanhamentos** (só admin/Helen):
- Lista de procedimentos: Lipedema MMII, Botox, Bioestimulador, Mastopexia, Retoque, etc.
- Para cada procedimento, Helen define **marcos personalizados**:
  - Nome do marco (ex.: “7 dias”, “3 meses”, “revisão mama”)
  - **Dias após cirurgia** (número editável — ela coloca o que quiser: 14, 45, 120, 400…)
  - Obrigatório? (sim/não)
- Salvar template → persiste no Apps Script (aba `_Config`) + local
- **Não apagar dados** ao mudar template — só afeta novos cálculos ou recalcular com confirmação

### Nível 2 — Por paciente (override)
Na ficha da paciente, aba **Retornos**:
- Ver trilho de marcos (calculados da data da cirurgia + template do procedimento)
- **Editar dias de cada marco** só para aquela paciente
- Adicionar marco extra (“6 semanas”, “18 meses”)
- Remover marco (com confirmação)
- Recalcular datas automaticamente quando muda `data_cirurgia`

### Nível 3 — Colunas da planilha Cirurgias (03m / 06m / 1a)
- Mapear para marcos do template **OU** permitir renomear períodos na config (ex.: cirurgia X usa 2m, 5m, 9m em vez de 3m, 6m, 1a)
- Status editável inline na grade: Realizada | Marcada | Pendente | Sem resposta
- Sync bidirecional com colunas da planilha real

### Também editável em todo o sistema:
- Status recall, próximo contato, observações, hospital, procedimento
- Lista de exames pré-op (adicionar/remover por paciente)
- Mensagens padrão WhatsApp por contexto
- Categorias/filtros salvos (“Botox”, “Sem resposta esta semana”, “Cirurgia esta semana”)

---

## SYNC AUTOMÁTICO (zero import CSV)

- Apps Script com `openById` nas **duas** planilhas
- Poll ≤3s + push debounced 400ms
- `modifiedAt` — nunca sobrescrever dado mais novo
- `fullSync` ao conectar
- `onEdit` nas duas planilhas
- `beautifySheets()` — **só formatação** (cores, freeze, filtros, validação dropdown), **nunca alterar valores**

---

## TELEFONE + WHATSAPP

- Parser BR (+55, DDD) + internacional
- Armazenar E.164
- Botão verde **WhatsApp** em toda linha → `wa.me` direto

---

## EXPORTAR XLSX

- Botão sidebar, download Blob, `Blue_Central_YYYY-MM-DD_HH-mm.xlsx`
- Filtros da visão ativa, datas dd/MM/yyyy

---

## GEMINI (estilo Sheets)

- ✨ Resumir via Apps Script (`GEMINI_API_KEY`)
- Modal: copiar | regenerar | inserir em observações

---

## DESIGN (não parecer app de IA)

- Logo: **blue .** Montserrat **300**
- Referências: Attio, Linear, Notion — limpo, editorial, médico premium
- Proibido: gradientes roxos, excesso de ícones, cards genéricos “SaaS”
- Sidebar: Hoje | Planilha Recall | Planilha Cirurgias | Retornos | Pré-op | ⚙ Config

---

## ARQUITETURA

```
src/
  components/   — SpreadsheetGrid, PatientSheet, TimelineEditor, WhatsAppBtn
  pages/      — Hoje, PlanilhaRecall, PlanilhaCirurgias, ConfigAcompanhamentos
  services/   — dualSheetSync, procedureTemplates, export
  utils/      — phone, dates, patientModel
apps-script/
  Code.gs     — syncRecall, syncCirurgia, getConfig, saveConfig, beautify, summarize
docs/
  DATA_MODEL.md
  INSTALACAO-MACBOOK-HELEN.md
```

---

## FASES

1. Ler planilhas reais → `DATA_MODEL.md` + modelo `Patient` + `ProcedureTemplate`
2. Apps Script dual-sheet + aba `_Config` para templates de marcos
3. `SpreadsheetGrid` editável (Recall + Cirurgias)
4. Editor de acompanhamentos (global + por paciente)
5. Ficha unificada + Hoje + WhatsApp + Gemini + Export
6. `beautifySheets()` + README + testes aceite

---

## CRITÉRIOS DE ACEITE

- [ ] Helen navega Recall ↔ Cirurgias **dentro do app** (1 clique), sem abrir 2 abas Google
- [ ] Editar célula na grade → Sheets atualiza em segundos
- [ ] Editar no Sheets → app atualiza em segundos
- [ ] Helen cria template “Botox” com marcos 15d, 90d, 180d — funciona
- [ ] Helen altera marco de **uma** paciente para 45 dias — só ela muda
- [ ] Export XLSX baixa arquivo
- [ ] WhatsApp BR + internacional
- [ ] Gemini resumo
- [ ] `npm run build` OK
- [ ] Guia instalação MacBook em pt-BR

---

## NÃO FAZER

- Import CSV como fluxo principal
- Marcos fixos hardcoded sem UI de edição
- Duas janelas/abas obrigatórias do navegador para planilhas
- Alterar textos existentes nas células ao “embelezar”
- Placeholders ou mocks

Comece pela Fase 1: mostre modelo de dados e wireframe textual da navegação “planilha | planilha” antes de codar.

---FIM---
