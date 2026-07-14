# Instalação no MacBook da Helen — blue. Central

Guia para a Helen usar o sistema **todo dia** no Mac, sem terminal depois da instalação inicial.

---

## O que ela vai ter

- **Um ícone no Dock** que abre o app blue.
- **Um sistema só** — alterna entre "Planilha Recall" e "Planilha Cirurgias" **dentro do app**, com 1 clique (sem trocar de aba no Google).
- Sync automático bidirecional com as duas planilhas Google: editou no app → planilha atualiza; editou na planilha → app atualiza em segundos.
- Prazos de acompanhamento configuráveis (⚙ acompanhamentos) e personalizáveis por paciente.
- WhatsApp em 1 clique (números BR e internacionais), export XLSX, resumo ✨ com Gemini.

---

## Parte A — Você faz UMA VEZ (setup técnico, ~30 min)

### 1. Instalar no Mac

```bash
# Terminal (Cmd+Espaço → Terminal)

# Node.js (se não tiver): baixar em https://nodejs.org (versão LTS)

# Clonar o projeto
git clone https://github.com/leletns/aconcierge.git
cd aconcierge
git checkout claude/blue-central-crm-sync-3bs31v

npm install
npm run build
```

### 2. Google Apps Script (sync das 2 planilhas)

1. Abrir a planilha **Cirurgias BLUE** no Google Sheets (pode ser qualquer uma das duas).
2. **Extensões → Apps Script**.
3. Apagar o conteúdo e colar o `apps-script/Code.gs` do projeto.
4. **Configurações do projeto (⚙) → Propriedades do script**, adicionar:
   - `SHEETS_API_SECRET` = uma senha longa (anotar — vai no app também)
   - `GEMINI_API_KEY` = chave do Google AI Studio (para o ✨ Resumir; opcional)
   - `RECALL_SHEET_ID` = `1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU`
   - `CIRURGIAS_SHEET_ID` = `1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI`
5. No editor, executar `installTriggers` e depois `beautifySheets` (autorizar a conta Google).
   - `beautifySheets` só formata (cores, congela cabeçalho, filtros) — **não muda nenhum valor**.
6. **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu** · Quem pode acessar: **Qualquer pessoa**
   - Copiar a **URL do Web App** (termina em `/exec`).

### 3. Conectar e gerar o LINK DE INSTALAÇÃO (Helen: zero configuração)

1. Abra o app **no seu computador** (site do Netlify ou local).
2. Clique **conectar planilhas** → cole a URL do Web App + a senha →
   **conectar e sincronizar** (a bolinha fica verde).
3. No mesmo modal, clique **🔗 copiar link de instalação**.
4. Envie esse link para o Mac da Helen (AirDrop, WhatsApp, e-mail).

O link carrega a configuração embutida (`#cfg=…`): **toda vez que é aberto, o
app se configura sozinho** — mesmo que o navegador dela limpe os dados, basta
abrir o atalho de novo. Helen nunca vê tela de configuração, senha, nada.

> Alternativa técnica: arquivo `.env` na pasta do projeto (`VITE_SHEETS_WEBAPP_URL`,
> `VITE_SHEETS_API_SECRET`, …) e `npm run build`. Só para rodar local.

### 4. Atalho "app" no Mac

**Opção A — site no Netlify (mais simples, sem terminal):** no Mac da Helen,
abra o **link de instalação** (passo 3) no Chrome →
menu ⋮ → **Transmitir, salvar e compartilhar → Criar atalho…** → marcar
**Abrir como janela**. Vira um "app" com ícone próprio — arraste para o Dock.
Importante: o atalho guarda o link de instalação completo, então cada abertura
já entra conectada. Pronto, pule para o passo 5.

**Opção B — rodando local (Automator):**

1. Abrir **Automator** → Novo → **Aplicativo**.
2. Adicionar ação **Executar Script Shell**:

```bash
cd /Users/HELEN/aconcierge
/usr/local/bin/npm run preview -- --host 127.0.0.1 --port 4173 &
sleep 2
open http://127.0.0.1:4173
```

(Ajustar `/Users/HELEN/aconcierge` para a pasta real; se o npm estiver em outro caminho, `which npm` mostra.)

3. Salvar como **blue Central.app** em Aplicativos.
4. Arrastar para o **Dock**.

**Alternativa mais simples:** rodar `npm run preview` e criar bookmark no Chrome para `http://localhost:4173`.

### 5. Abrir automaticamente ao ligar o Mac (opcional)

**Ajustes do Sistema → Geral → Itens de Início** → adicionar **blue Central.app**.

---

## Parte B — Helen usa todo dia (30 segundos)

### Abrir

- Clicar no ícone **blue Central** no Dock **ou** bookmark no Chrome.

### Navegar "planilha em planilha" (sem Google aberto)

| O que Helen quer | Onde clica |
|------------------|------------|
| Ver a planilha Recall | Sidebar → **planilha recall** |
| Ver a planilha Cirurgias | Sidebar → **planilha cirurgias** |
| Alternar entre as duas | **1 clique** (sidebar ou botão ⇄ no topo) — mesma janela |
| Urgências do dia | **hoje** |
| Trilho pós-op | **retornos** |
| Exames pré-cirurgia | **pré-op** |
| Ficha completa de alguém | `⌘K` → nome (ou duplo-clique no nome na grade) |
| WhatsApp | Botão verde na linha |
| Resumo IA | **✨ Resumir** (na ficha ou botão flutuante) |
| Exportar | **exportar XLSX** (as duas planilhas em um arquivo) |
| Mudar prazos de retorno (ex. Botox 15d/90d/180d) | **⚙ acompanhamentos** |
| Mudar prazo só de UMA paciente | Ficha → **personalizar prazos desta paciente** |

### Editar como planilha

- Clicar na célula → digitar → **Enter** (ou clicar fora) → salva e sincroniza sozinho.
- **Tab** pula para a próxima célula, **Esc** cancela.
- "＋ nova linha" no rodapé da grade adiciona paciente/cirurgia — vai para o Google também.
- Registrar contato de recall: botão **registrar** (tela hoje ou ficha) — grava STATUS,
  DATA DO CONTATO, PRÓXIMO CONTATO e OBSERVAÇÕES direto na planilha.

### Atalhos

| Atalho | Ação |
|--------|------|
| `⌘ K` | Buscar paciente (ficha unificada) |
| `⌘ F` | Buscar dentro da planilha aberta |
| `Esc` | Fechar modal / cancelar edição |

---

## Parte C — Manutenção (raro)

| Problema | Solução |
|----------|---------|
| App não abre | Terminal: `cd aconcierge && npm run preview` |
| Sync parou ("erro de sync" na sidebar) | Verificar internet; recarregar a página; conferir URL/senha em **conectar planilhas** |
| Atualizar versão | Terminal: `git pull && npm install && npm run build` |
| Emergência: editar direto no Google | Botões **abrir no Google ↗** no topo das grades |

---

## Checklist antes de entregar o Mac à Helen

- [ ] App abre pelo ícone do Dock
- [ ] Planilha Recall abre com os dados reais e edita inline
- [ ] Planilha Cirurgias abre com 1 clique (sem nova aba do browser)
- [ ] Editar célula no app → planilha Google atualiza
- [ ] Editar na planilha Google → app atualiza em segundos
- [ ] WhatsApp abre conversa (testar um número BR e um internacional)
- [ ] Export XLSX baixa arquivo com as duas abas
- [ ] ✨ Resumir funciona
- [ ] Helen muda dias de acompanhamento em ⚙ acompanhamentos
- [ ] Helen personaliza prazos de uma paciente na ficha
- [ ] Conta Google (dona do Web App) tem acesso às duas planilhas
