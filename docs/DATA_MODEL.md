# Modelo de dados unificado — Recall + Cirurgias

## Planilha Recall → App

| Coluna Sheets | Campo app | Editável |
|---------------|-----------|----------|
| PACIENTE | `nome` | ✅ |
| CONTATO (WhatsApp) | `telefone` | ✅ |
| ÚLTIMA CONSULTA / PROCEDIMENTO | `ultimaConsulta` | ✅ |
| DATA AGENDADA | `dataAgendada` | ✅ |
| STATUS | `recall.status` | ✅ |
| MOTIVO DA RECUSA | `recall.motivoRecusa` | ✅ |
| DATA DO CONTATO | `recall.ultimoContatoData` | ✅ |
| PRÓXIMO CONTATO | `recall.proxima` | ✅ |
| OBSERVAÇÕES | `obs` | ✅ |

## Planilha Cirurgias → App

| Coluna Sheets | Campo app | Editável |
|---------------|-----------|----------|
| Data | `dataCirurgia` | ✅ |
| Paciente | `nome` | ✅ |
| Cirurgia | `procedimento` | ✅ |
| Hospital | `hospital` | ✅ |
| 03 meses | `marcos['3m'].status` | ✅ |
| 06 meses | `marcos['6m'].status` | ✅ |
| 01 ano | `marcos['1a'].status` | ✅ |

## Unificação

```text
Patient {
  id: string                    // estável, sync
  nome, telefone (E.164)
  procedimento, hospital
  dataCirurgia
  recall: { status, proxima, motivoRecusa, historico[] }
  marcos: { [marcoId]: { label, diasAposCirurgia, data, status } }
  procedureTemplateId?: string  // liga ao template editável
  marcoOverrides?: { marcoId, diasAposCirurgia }[]  // só esta paciente
  obs, modifiedAt, deleted
}

ProcedureTemplate {
  id, nome                     // ex: "Lipedema MMII", "Botox"
  marcos: [{ id, label, dias, obrigatorio }]
  // Helen edita dias livremente: 7, 14, 45, 120, 400...
}
```

## Navegação “planilha | planilha”

- `PlanilhaRecallPage` → renderiza grade com colunas Recall
- `PlanilhaCirurgiasPage` → renderiza grade com colunas Cirurgias
- Toggle na sidebar ou segmented control no topo — **mesma SPA, zero nova aba**
