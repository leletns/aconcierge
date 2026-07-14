# Deploy no Netlify — blue. Central

## Por que estava “feio”?

O app foi refatorado de **um HTML único** (CSS e JS inline) para **Vite** (CSS em `src/styles/main.css`, JS em `src/`).

O `index.html` na raiz **não tem estilo embutido** — só funciona depois de:

```bash
npm run build
```

Se o Netlify publicar a **pasta raiz** sem build, você vê:
- HTML sem cor de fundo
- Sidebar quebrada
- Nenhum dado (JavaScript não carrega)
- Ícones estranhos

**Correção:** `netlify.toml` na raiz com `npm run build` → publicar pasta `dist`.

---

## Passo a passo Netlify (5 min)

### 1. Conectar repositório

1. Acesse [https://app.netlify.com](https://app.netlify.com)
2. **Add new site** → **Import an existing project**
3. GitHub → repositório `leletns/aconcierge`
4. Branch: **`main`** (depois do merge) ou `cursor/production-crm-sheets-sync-4197`

### 2. Configuração de build (confira — o `netlify.toml` já define)

| Campo | Valor |
|-------|--------|
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version | 20 |

### 3. Variáveis de ambiente (opcional — sync Google)

> ⚠️ **Segurança:** variáveis `VITE_*` entram no bundle JS **público** do site.
> Se você colocar `VITE_SHEETS_API_SECRET` aqui, qualquer pessoa que descobrir a
> URL do Netlify consegue ler e editar as planilhas via Web App.
> **Recomendado:** deixe as variáveis de segredo em branco e configure a conexão
> **dentro do app** (botão *conectar planilhas*) — fica salva só no navegador da
> Helen (localStorage), não no site público.

Se mesmo assim preferir pré-configurar (URL do site mantida privada):

**Site settings → Environment variables:**

| Variável | Valor |
|----------|--------|
| `VITE_SHEETS_WEBAPP_URL` | URL do Apps Script Web App |
| `VITE_SHEETS_API_SECRET` | Senha do Script Properties (⚠️ vira público — ver acima) |
| `VITE_SPREADSHEET_URL_RECALL` | URL da planilha Recall (botão "abrir no Google") |
| `VITE_SPREADSHEET_URL_CIRURGIAS` | URL da planilha Cirurgias |

Depois de salvar variáveis: **Deploys → Trigger deploy → Clear cache and deploy**.

**Dica extra de segurança:** as duas planilhas estão compartilhadas como
"qualquer pessoa com o link". O sync **não precisa disso** — o Apps Script roda
como a sua conta Google. Pode restringir o compartilhamento das planilhas que o
app continua funcionando normalmente.

### 4. Deploy

Clique **Deploy site**. Aguarde ~1 min. Abra a URL `*.netlify.app`.

### 5. Testar

- [ ] Fundo creme, logo **blue .** fino
- [ ] Sidebar com hoje / retornos / recall / pré-op
- [ ] Cards com dados de exemplo
- [ ] Botão **exportar XLSX** funciona

---

## Conectar planilhas Google (dentro do app)

1. Abra o site Netlify
2. Sidebar → **conectar planilha**
3. Preencha:
   - URL da planilha (qualquer uma das duas)
   - **Web App URL** (Apps Script implantado)
   - **API Secret**
4. **conectar e sincronizar**

Setup Apps Script: ver `apps-script/Code.gs` e `README.md`.

---

## Deploy local (testar antes)

```bash
git clone https://github.com/leletns/aconcierge.git
cd aconcierge
npm install
npm run build
npm run preview
```

Abra http://localhost:4173 — deve ficar **igual** ao Netlify correto.

---

## O que cada ferramenta fez

| Quem | O que fez |
|------|-----------|
| **Protótipo original** | `index.html` monolítico — funcionava abrindo arquivo direto |
| **Cursor (branch produção)** | Vite modular, sync Sheets, export XLSX, WhatsApp, Gemini |
| **Claude/Fable** | Documentação em `docs/` (prompts, instalação Mac) — **não alterou o build Netlify** |
| **Netlify errado** | Publicou HTML sem `npm run build` → site sem CSS |

---

## Problemas comuns

| Sintoma | Solução |
|---------|---------|
| Site branco/feio | Build command = `npm run build`, publish = `dist` |
| JS não carrega | Não publique a raiz do repo |
| Sync não funciona | Variáveis `VITE_*` no Netlify + Apps Script deployado |
| Mudança não aparece | Redeploy com **Clear cache** |
