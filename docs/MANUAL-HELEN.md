# Manual completo — blue. Central (Helen)

Guia oficial para o MacBook da concierge. **Não precisa abrir as duas abas do Google Sheets** no dia a dia: o app é o espelho das duas planilhas.

> Documento vivo — acompanhe também `INSTALACAO-MACBOOK-HELEN.md` (instalação técnica) e `NETLIFY.md` (site online).

---

## 1. O que o sistema faz (em uma frase)

Centraliza **Recall** + **Cirurgias** + **retornos pós-op** + **checklist pré-op (Protocolo Interno de Exames)** em um único app, com sync automático com o Google Sheets.

---

## 2. Telas — o que clicar e quando

| Tela | Para que serve | Quando usar |
|------|----------------|-------------|
| **hoje** | Urgências do dia: recall vencido, retornos da semana, pré-op em atenção | **Primeira tela da manhã** |
| **planilha recall** | Grade editável = planilha GESTÃO DE RECALL | Contatar / atualizar status / próximo contato |
| **planilha cirurgias** | Grade editável = planilha Cirurgias BLUE | Incluir cirurgia, hospital, status 03m/06m/1a |
| **retornos** | Trilho pós-op com datas calculadas (fuso Brasília) | Acompanhar marcação dos retornos |
| **pré-op** | Checklist de exames do **Protocolo Interno** por tipo de cirurgia | Paciente com cirurgia marcada |
| **acompanhamentos** | Templates de prazos (Botox 15/90/180d, Cirurgia 90/180/365…) | Ajustar regras uma vez |

### Alternar Recall ↔ Cirurgias sem sair do app

Nas grades: botão **⇄ planilha cirurgias** / **⇄ planilha recall**.  
Botão **abrir no Google ↗** abre a planilha correta no navegador (link já configurado).

---

## 3. Fluxo diário recomendado (5–10 min)

1. Abra o **blue. Central** (ícone no Dock ou `http://127.0.0.1:4173`).
2. Olhe **hoje**:
   - **recall para hoje** → clique **registrar** → marque resultado → salva na planilha.
   - **retornos desta semana** → clique na paciente → atualize status do marco.
   - **pré-op em atenção** → vá à tela pré-op e marque exames feitos.
3. Se precisar editar várias linhas: use **planilha recall** ou **planilha cirurgias** (digitação igual ao Sheets).
4. WhatsApp: botão verde na coluna Contato ou na ficha.
5. Fim do dia (opcional): **exportar XLSX** → backup `Blue_Central_AAAA-MM-DD_HH-mm.xlsx`.

---

## 4. Fuso horário (lembretes “um dia a menos”)

O calendário da clínica é **America/Sao_Paulo** (Brasília).

- Datas de retorno / próximo contato / “hoje” usam esse fuso — **não o fuso do Mac** se estiver errado.
- No cabeçalho de **hoje** aparece: `… · fuso America/Sao_Paulo`.
- Na grade, datas mostram dicas: `· hoje`, `· amanhã`, `· há 2d`.

**Checklist se uma data ainda parecer errada:**

1. Mac: Ajustes → Geral → Data e Hora → fuso **Brasília**.
2. Google Sheets → Arquivo → Configurações → fuso **(GMT-03:00) Brasília**.
3. Apps Script já está com `"timeZone": "America/Sao_Paulo"`.
4. Atualize o `Code.gs` no Apps Script (cole a versão nova do GitHub) e **reimplante** o Web App.

---

## 5. Planilha Recall — VIVE DENTRO DO APP

Helen **quase nunca precisa abrir o Google Sheets**. A tela **planilha recall** é o espelho 1:1.

### No app (uso diário)

1. Sidebar → **planilha recall**
2. Filtros inteligentes: **vencidos · hoje · próx. 7 dias · sem próximo contato**
3. Clique na célula → edite → Enter (grava no Google sozinho)
4. Coluna Contato → botão verde WhatsApp (com mensagem pronta)
5. Coluna **ações** → **registrar** (atualiza Status / Data do Contato / Próximo / Obs) ou **ficha**
6. **＋ nova linha** → paciente novo na planilha Recall real

### Botão "abrir no Google ↗"

Só para emergência / conferência. O link oficial é:  
`https://docs.google.com/spreadsheets/d/1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU/edit`

### Se a grade estiver vazia

1. Bolinha de sync deve mostrar `Recall N · Cirurgias M`
2. **conectar planilhas** de novo (Web App URL + senha)
3. Apps Script: cole o `Code.gs` atualizado e **reimplante**
4. Script Properties: `RECALL_SHEET_ID` = `1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU`
5. Cabeçalho da planilha deve estar na **linha 5** com **PACIENTE**

### Cadastrar alguém novo (2–3 cliques)

1. **hoje** → **＋ paciente no recall** **ou** planilha recall → **＋ nova paciente**
2. Preenche: nome, WhatsApp, status, próximo contato
3. **salvar na planilha** → aparece na grade e sobe sozinho para o Google Sheets

Não precisa abrir o Google.

---

## 6. Pré-op — Protocolo Interno de Exames

O checklist **não é mais uma lista genérica**. Ele aplica o protocolo do PDF conforme o texto da coluna **Cirurgia**:

| Cirurgia (texto na planilha) | Protocolo aplicado |
|------------------------------|--------------------|
| Lipedema… | Laboratorial, RX tórax, ECG, Risco, Eco (>40), Doppler MMII |
| Mama / Mastopexia / Implante | USG mamas + laboratorial + … + Mamografia (>35) |
| Abdominoplastia | USG abdômen + parede + … + Doppler (>35) |
| Abdominoplastia + Mama | combinação completa |
| Abdominoplastia + Lipo | combinação abdome + lipo |
| Lipoaspiração (+ Mama) | conforme protocolo |
| Blefaroplastia | **sem** Ecocardiograma |

**Como usar**

1. Abra **pré-op**.
2. Veja o protocolo detectado sob o nome da paciente.
3. Clique no exame para marcar ✓.
4. Se editou a lista à mão e quiser voltar: **↺ protocolo**.
5. Observações gerais do PDF ficam no topo da tela pré-op (prótese → RM; idade 35/40; RM de mamas dispensa USG/mamografia).

> Checklist fica no Mac (localStorage). Status dos retornos 03m/06m/1a continua na planilha Cirurgias.

---

## 7. Registrar contato (Recall)

1. Em **hoje** ou na ficha → **registrar**
2. Canal + resultado + anotação
3. Data agendada / próximo contato (calendário)
4. **salvar na planilha** → grava Status, Data do Contato, Próximo Contato, Obs no Sheets

---

## 8. Retornos / acompanhamentos

- Datas = data da cirurgia + dias do template (ex.: 90 / 180 / 365).
- Status **Pendente / Marcada / Realizada / Sem resposta** espelha as colunas da planilha.
- Em **acompanhamentos**, Helen pode criar Botox (15/90/180), Lipedema, etc.
- Na ficha da paciente: override de prazos só para aquela paciente.

---

## 9. Atalhos

| Atalho | Ação |
|--------|------|
| ⌘K | Buscar paciente |
| ⌘F | Buscar dentro da grade aberta |
| Clique célula | Editar |
| Enter / Tab | Salvar e navegar |
| Esc | Cancelar edição |
| Duplo clique no nome | Abrir ficha |
| ✨ Resumir | Resumo estilo Gemini |

---

## 10. Instalação no Mac (resumo)

```bash
git clone https://github.com/leletns/aconcierge.git
cd aconcierge
git checkout main
npm install
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Abrir: http://127.0.0.1:4173  

Passo a passo Dock/Automator + Apps Script: `docs/INSTALACAO-MACBOOK-HELEN.md`.

---

## 11. Conectar as planilhas (obrigatório para dados reais)

1. Apps Script com `apps-script/Code.gs` atualizado  
2. Script Properties: `SHEETS_API_SECRET`, `RECALL_SHEET_ID`, `CIRURGIAS_SHEET_ID`  
3. Implantar → App da Web → URL `/exec`  
4. No app → **conectar planilhas** → colar URL + senha + links das planilhas  
5. Status na sidebar: **sincronizado**

---

## 12. Problemas comuns

| Sintoma | Solução |
|---------|---------|
| Lembrete 1 dia adiantado/atrasado | Fuso Brasília no Mac + Sheets + App (seção 4) |
| Link Recall abre planilha errada | Colar URL correta em conectar planilhas (seção 5) |
| Grade Recall vazia | Sync + IDs + cabeçalho linha 5 |
| Pré-op com exames genéricos | Texto da cirurgia deve conter Lipedema/Mama/…; botão ↺ protocolo |
| Site Netlify feio | `npm run build` + publish `dist` (`docs/NETLIFY.md`) |
| Sync Unauthorized | Mesma senha do `SHEETS_API_SECRET` |

---

## 13. O que NÃO precisa fazer no dia a dia

- ❌ Abrir duas abas do Google e copiar/colar  
- ❌ Importar CSV  
- ❌ Recalcular datas de retorno na mão  
- ❌ Montar checklist pré-op do zero (o protocolo aplica sozinho)

---

## 14. Contatos das planilhas oficiais

- **Recall:** https://docs.google.com/spreadsheets/d/1BikHFpFs_2d1W1RpvH53lisr6hZCRNVQTZHmHr1H8pU/edit  
- **Cirurgias:** https://docs.google.com/spreadsheets/d/1ZORqTbcRRc0MCFwGbGlh4I_bLNPIWKsc7WRdoG1jGEI/edit  

Dúvida de uso: volte a este manual. Dúvida técnica de install: `INSTALACAO-MACBOOK-HELEN.md`.
