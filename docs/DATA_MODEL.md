# Modelo de dados — dual-sheet (implementado)

O app é um **espelho 1:1 das duas planilhas reais**. Cada linha da grade corresponde a uma
linha do Google Sheets (`row` = número da linha). A visão de paciente é **derivada** por matching.

## Planilha Recall → `store.recall[]`

`GESTÃO DE RECALL — PACIENTES` · cabeçalho linha 5, dados linha 6+

| Coluna Sheets | Campo | Editável na grade |
|---------------|-------|:---:|
| PACIENTE | `nome` | ✅ |
| CONTATO (WhatsApp) | `contato` | ✅ (+ botão WhatsApp) |
| ÚLTIMA CONSULTA / PROCEDIMENTO | `ultimaConsulta` | ✅ |
| DATA AGENDADA | `dataAgendada` | ✅ |
| STATUS | `status` (Pendente · Agendado · Não agendou · Sem Resposta · Em Acompanhamento · Sem interesse) | ✅ |
| MOTIVO DA RECUSA | `motivoRecusa` | ✅ |
| DATA DO CONTATO | `dataContato` | ✅ |
| PRÓXIMO CONTATO | `proximoContato` | ✅ |
| OBSERVAÇÕES | `obs` | ✅ |

## Planilha Cirurgias → `store.cirurgias[]`

`Cirurgias BLUE (controle Helen)` · cabeçalho linha 1, dados linha 2+

| Coluna Sheets | Campo | Editável na grade |
|---------------|-------|:---:|
| Data (ex.: "seg., 05 jan. 2026") | `data` | ✅ |
| Paciente | `paciente` | ✅ |
| Cirurgia | `cirurgia` | ✅ |
| Hospital | `hospital` | ✅ |
| 03 meses | `m3m` (Pendente · Marcada · Realizada · Sem resposta) | ✅ |
| 06 meses | `m6m` | ✅ |
| 01 ano | `m1a` | ✅ |

As datas em português ("Sex, 09 de Jan 2026", "Ter, 19 de maio 2026"…) são interpretadas por
`parseDataPt()` para cálculos, mas o **texto original é preservado** na célula.

## Unificação (`src/utils/matching.js`)

Mesma paciente = **telefone E.164 igual** OU **nome normalizado igual** (sem acentos/caixa)
OU **um nome é prefixo do outro** ("Kenia Fátima Pires" ⊂ "Kênia Fatima Pires Torres").

```text
Paciente (derivado) {
  key                       // estável, hash do nome normalizado
  nome, telefone (E.164)
  recallRows[]              // linhas da planilha Recall
  cirurgiaRows[]            // linhas da planilha Cirurgias (pode ter várias cirurgias)
}
```

- Só no Recall → ficha mostra visão recall
- Só nas Cirurgias → ficha mostra cirurgia + retornos
- Nas duas → ficha única com tudo

## Templates de acompanhamento (`config.appConfig`, sync via aba `_Config`)

```text
ProcedureTemplate {
  id, nome, padrao
  marcos: [{ id, label, dias, col }]   // col: 'm3m'|'m6m'|'m1a'|null
}
appConfig {
  templates: ProcedureTemplate[]       // Helen edita em ⚙ Acompanhamentos
  assignments: { [pacienteKey]: templateId }   // atribuição manual na ficha
  overrides: { [pacienteKey]: marcos[] }       // prazos só daquela paciente
  modifiedAt                           // conflito last-writer-wins
}
```

- Marco com `col` → status lido/escrito **na coluna real** da planilha Cirurgias.
- Marco sem `col` (ex.: Botox 15 dias) → status guardado em `extras` (app-only).
- Template escolhido por: atribuição manual → nome do template contido no texto da cirurgia → padrão.

## App-only (`store.dados.extras[pacienteKey]`, localStorage)

```text
extras { exames[], historico[], marcoStatus: { [cirurgiaKey]: { [marcoId]: status } } }
```

## Sync (`apps-script/Code.gs` ↔ `src/services/syncService.js`)

- **Pull**: poll 3 s → `GET sync&since=lastChange`; resposta mínima quando nada mudou
  (lastChange cacheado no CacheService — poll barato).
- **Push**: fila de operações (`edit` célula, `append` linha, `config`), debounce 400 ms.
- **Conflito por modifiedAt**: edição feita direto na planilha depois da edição do app vence
  (o Apps Script devolve `skipped: conflict`); no app, linhas com edição pendente não são
  sobrescritas pelo pull até o flush.
- **fullSync ao conectar** substitui os dados de exemplo pelo espelho real.
- `beautifySheets()` aplica só formatação (cores, freeze, filtros) — nunca valores.
