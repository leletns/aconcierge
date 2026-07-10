# Instalação no MacBook da Helen — blue. Central

Guia para a Helen usar o sistema **todo dia** no Mac, sem terminal depois da instalação inicial.

---

## O que ela vai ter

- **Um ícone no Dock** que abre o app blue.
- **Um sistema só** — alterna entre “Planilha Recall” e “Planilha Cirurgias” **dentro do app** (sem ficar trocando aba no Google).
- Sync automático com as planilhas Google (ela pode ignorar o Sheets no dia a dia).
- Atalho no Desktop opcional.

---

## Parte A — Você faz UMA VEZ (setup técnico, ~45 min)

### 1. Instalar no Mac

```bash
# Terminal (Cmd+Espaço → Terminal)

# Node.js (se não tiver): baixar em https://nodejs.org (versão LTS)

# Clonar o projeto
git clone https://github.com/leletns/aconcierge.git
cd aconcierge
git checkout cursor/production-crm-sheets-sync-4197

npm install
npm run build
```

### 2. Google Apps Script (sync das 2 planilhas)

1. Abrir a planilha **Cirurgias BLUE** no Google Sheets.
2. **Extensões → Apps Script**.
3. Colar o conteúdo de `apps-script/Code.gs` do projeto.
4. **Configurações do projeto → Propriedades do script:**
   - `SHEETS_API_SECRET` = uma senha longa (anotar)
   - `GEMINI_API_KEY` = chave do Google AI Studio (para Resumir)
   - `RECALL_SHEET_ID` = `1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU`
   - `CIRURGIAS_SHEET_ID` = `1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI`
5. Executar no editor: `setupSheet()` e `installTriggers()` (autorizar conta Google).
6. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu**
   - Quem acessa: **Qualquer pessoa**
   - Copiar a **URL do Web App**.

### 3. Arquivo de configuração no Mac

Criar arquivo `aconcierge/.env` na pasta do projeto:

```env
VITE_SHEETS_WEBAPP_URL=https://script.google.com/macros/s/COLE_A_URL_AQUI/exec
VITE_SHEETS_API_SECRET=a-senha-que-voce-criou
VITE_RECALL_SHEET_ID=1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU
VITE_CIRURGIAS_SHEET_ID=1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI
VITE_SPREADSHEET_URL_RECALL=https://docs.google.com/spreadsheets/d/1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU/edit
VITE_SPREADSHEET_URL_CIRURGIAS=https://docs.google.com/spreadsheets/d/1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI/edit
```

Rebuild:

```bash
npm run build
```

### 4. Atalho “app” no Mac (Automator)

1. Abrir **Automator** → Novo → **Aplicativo**.
2. Adicionar ação **Executar Script Shell**:

```bash
cd /Users/HELEN/aconcierge
npm run preview -- --host 127.0.0.1 --port 4173 &
sleep 2
open http://127.0.0.1:4173
```

(Ajustar caminho `/Users/HELEN/aconcierge` para a pasta real.)

3. Salvar como **blue Central.app** em Aplicativos.
4. Arrastar para o **Dock**.

**Alternativa mais simples:** criar bookmark no Chrome para `http://localhost:4173` após rodar `npm run preview`.

### 5. Abrir automaticamente ao ligar o Mac (opcional)

**Ajustes do Sistema → Geral → Itens de Início** → adicionar **blue Central.app**.

---

## Parte B — Helen usa todo dia (30 segundos)

### Abrir

- Clicar no ícone **blue Central** no Dock **ou** bookmark no Chrome.

### Primeira vez só

1. Clicar **conectar planilha** na barra lateral.
2. Colar URL do Web App + senha (se não estiver no `.env`).
3. Clicar **conectar e sincronizar**.
4. Pronto — nunca mais precisa importar CSV.

### Navegar “planilha em planilha” (sem Google aberto)

| O que Helen quer | Onde clica |
|------------------|------------|
| Ver lista igual Recall | Sidebar → **Planilha Recall** |
| Ver lista igual Cirurgias | Sidebar → **Planilha Cirurgias** |
| Alternar entre as duas | **Um clique** no menu — mesma janela |
| Urgências do dia | **Hoje** |
| Detalhe de uma paciente | Clica no **nome** |
| WhatsApp | Botão verde na linha |
| Resumo IA | **✨ Resumir** |
| Exportar | **exportar XLSX** |
| Mudar prazos de retorno (ex. Botox 15d, 90d) | **⚙ Acompanhamentos** |
| Mudar prazo só de uma paciente | Ficha → aba **Retornos** → editar dias |

### Editar como planilha

- Clicar na célula → digitar → **salva sozinho** → aparece “sincronizado”.
- Não precisa botão Salvar na grade.

### Atalhos úteis

| Atalho | Ação |
|--------|------|
| `⌘ K` | Buscar paciente |
| `⌘ F` | Buscar na planilha aberta |
| `Esc` | Fechar modal |

---

## Parte C — Manutenção (raro)

| Problema | Solução |
|----------|---------|
| App não abre | Terminal: `cd aconcierge && npm run preview` |
| Sync parou | Verificar internet; reabrir app; clicar conectar planilha |
| Atualização nova versão | Terminal: `git pull && npm install && npm run build` |
| Emergência: editar no Google | Botão discreto “abrir planilha” (só se necessário) |

---

## Checklist antes de entregar o Mac à Helen

- [ ] App abre pelo ícone do Dock
- [ ] Planilha Recall abre e edita inline
- [ ] Planilha Cirurgias abre com um clique (sem nova aba browser)
- [ ] WhatsApp abre conversa
- [ ] Export XLSX baixa arquivo
- [ ] Resumir funciona
- [ ] Helen consegue mudar dias de acompanhamento em ⚙ Acompanhamentos
- [ ] Conta Google da Helen tem acesso às duas planilhas
