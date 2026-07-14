# Instalação — blue. Central (Netlify, zero terminal)

O app roda no **Netlify** (um link). Toda a instalação acontece **no navegador** —
nem você nem a Helen abrem terminal no dia a dia.

**Manual de uso completo (telas, pré-op, fuso, troubleshooting):** [`MANUAL-HELEN.md`](./MANUAL-HELEN.md)

---

## O que a Helen vai ter

- **Um ícone no Dock** que abre o app já conectado.
- Alterna **Planilha Recall ↔ Planilha Cirurgias** com 1 clique, mesma janela.
- Sync automático bidirecional com as duas planilhas Google.
- Pré-op com **checklist do Protocolo Interno de Exames** (por tipo de cirurgia).
- Datas e lembretes no fuso **America/Sao_Paulo** (Brasília).
- WhatsApp em 1 clique, export XLSX, resumo ✨ com Gemini.
- Ela **nunca** precisa digitar senha/URL no dia a dia — abre e usa.

---

## Parte A — Você faz UMA VEZ (só navegador, ~20 min)

### 1. Google Apps Script (o motor do sync)

1. Abra a planilha **Cirurgias BLUE** no Google Sheets → **Extensões → Apps Script**.
2. Apague o conteúdo e cole o `apps-script/Code.gs` do repositório
   ([ver no GitHub](https://github.com/leletns/aconcierge/blob/main/apps-script/Code.gs) → botão de copiar).
3. Engrenagem ⚙ **Configurações do projeto → Propriedades do script**, adicione:

| Propriedade | Valor |
|---|---|
| `SHEETS_API_SECRET` | uma senha longa que você inventa (anote) |
| `GEMINI_API_KEY` | chave do Google AI Studio (opcional — ✨ Resumir) |
| `RECALL_SHEET_ID` | `1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU` |
| `CIRURGIAS_SHEET_ID` | `1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI` |

4. No editor, selecione e **Execute**: `installTriggers` (obrigatório — é o que
   faz edição na planilha aparecer no app) e depois `beautifySheets`
   (visual — se falhar por células mescladas, pule; não muda nenhum valor).
   Autorize a conta Google quando pedir.
5. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu** · Quem pode acessar: **Qualquer pessoa**
   - Copie a **URL do Web App** (termina em `/exec`).

### 2. Conectar e gerar o link de instalação

1. Abra o **site do Netlify** no seu navegador.
2. **conectar planilhas** (barra lateral) → cole a URL do Web App + a senha →
   **conectar e sincronizar** → bolinha verde.
3. Confira as URLs:
   - Recall: `https://docs.google.com/spreadsheets/d/1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU/edit`
   - Cirurgias: `https://docs.google.com/spreadsheets/d/1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI/edit`
4. No mesmo modal: **🔗 copiar link de instalação** (se existir) **ou** envie o link Netlify + instrução de criar atalho.
5. Envie o link para o Mac da Helen (AirDrop, WhatsApp, e-mail).

### 3. Teste de garantia (60 segundos)

App e planilha lado a lado:
- Mude um STATUS no app → aparece na planilha em ~2s ✅
- Digite numa célula da planilha → aparece no app em ~3s ✅
- Em **pré-op**, uma cirurgia de Lipedema/Mama deve mostrar o checklist do protocolo ✅
- No cabeçalho **hoje**, deve aparecer `fuso America/Sao_Paulo` ✅

---

## Parte B — No Mac da Helen (~2 min, só Chrome)

1. Abra o **link do Netlify** no Chrome.
2. Menu ⋮ → **Transmitir, salvar e compartilhar → Criar atalho…** →
   marque **Abrir como janela**.
3. Arraste o "app" criado para o **Dock**.
4. Confira fuso do Mac: **Ajustes → Geral → Data e Hora → Brasília**.
5. (Opcional) **Itens de Início** → adicionar o atalho.

---

## Parte C — Helen usa todo dia

Ver o guia completo: **[`MANUAL-HELEN.md`](./MANUAL-HELEN.md)**

| O que ela quer | Onde clica |
|------------------|------------|
| Abrir | Ícone **blue.** no Dock |
| Ver/editar a planilha Recall | Sidebar → **planilha recall** |
| Ver/editar a planilha Cirurgias | Sidebar → **planilha cirurgias** (1 clique) |
| Urgências do dia | **hoje** |
| Trilho pós-op | **retornos** |
| Exames pré-cirurgia (protocolo) | **pré-op** |
| Ficha de alguém | `⌘K` → nome (ou duplo-clique no nome na grade) |
| WhatsApp | Botão verde na linha |
| Resumo IA | **✨ Resumir** |
| Exportar | **exportar XLSX** |
| Mudar prazos de retorno | **⚙ acompanhamentos** |

Editar é como planilha: clica na célula → digita → Enter. Salva e sincroniza
sozinho ("sincronizado" na barra lateral).

---

## Manutenção (raro)

| Problema | Solução |
|----------|---------|
| Bolinha vermelha "erro de sync" | Verificar internet; fechar e reabrir pelo ícone do Dock |
| Lembrete 1 dia errado | Fuso Brasília no Mac + Sheets; atualizar `Code.gs` |
| Link Recall errado | **conectar planilhas** → colar URL oficial do Recall |
| Pré-op genérico | Texto da cirurgia deve ter Lipedema/Mama/…; botão **↺ protocolo** |
| Nova versão do app | Automático — Netlify publica a cada push em `main` |
| Emergência: editar no Google | Botões **abrir no Google ↗** no topo das grades |

---

## Apêndice — rodar local (só desenvolvimento, opcional)

```bash
git clone https://github.com/leletns/aconcierge.git && cd aconcierge
git checkout main
npm install
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Variáveis opcionais em `.env` (ver `.env.example`). Nada disso é necessário
para o uso da Helen — o Netlify cobre tudo.
