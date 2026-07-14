/**
 * Linhas espelhadas das planilhas — cada linha do app corresponde 1:1 a uma
 * linha real do Google Sheets. `row` é o número da linha na planilha
 * (null enquanto ainda não foi enviada); `key` é o id local estável.
 */
import { nowISO, isoHoje, somarDias, fmtDataPlanilhaCirurgias, fmtDataPlanilhaRecall } from './dates.js';
import { EXAMES_GENERICOS, examesDoProtocolo } from './preopProtocol.js';

export const rowUid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function novaLinhaRecall(base = {}) {
  return {
    key: rowUid(),
    row: null,
    nome: '',
    contato: '',
    ultimaConsulta: '',
    dataAgendada: '',
    status: 'Pendente',
    motivoRecusa: '',
    dataContato: '',
    proximoContato: '',
    obs: '',
    modifiedAt: nowISO(),
    exemplo: false,
    ...base,
  };
}

export function novaLinhaCirurgia(base = {}) {
  return {
    key: rowUid(),
    row: null,
    data: '',
    paciente: '',
    cirurgia: '',
    hospital: '',
    m3m: 'Pendente',
    m6m: 'Pendente',
    m1a: 'Pendente',
    modifiedAt: nowISO(),
    exemplo: false,
    ...base,
  };
}

/**
 * extras app-only por paciente.
 * Se `cirurgiaTexto` for passado, aplica o protocolo de exames do PDF.
 */
export function novoExtras(cirurgiaTexto = '') {
  const base = cirurgiaTexto
    ? examesDoProtocolo(cirurgiaTexto)
    : { protocoloId: 'generico', protocoloNome: 'Pré-op geral', exames: EXAMES_GENERICOS.map((n) => ({ nome: n, feito: false })) };
  return {
    exames: base.exames,
    protocoloId: base.protocoloId,
    protocoloNome: base.protocoloNome,
    examesCustom: false,
    historico: [],
    marcoStatus: {},
  };
}

/** Dados de demonstração — removíveis, no formato exato das planilhas reais */
export function semearExemplos() {
  const d = isoHoje();
  return {
    recall: [
      novaLinhaRecall({
        nome: 'Paciente Exemplo Recall',
        contato: '(21) 99999-0001',
        ultimaConsulta: fmtDataPlanilhaRecall(somarDias(d, -120)),
        status: 'Pendente',
        dataContato: fmtDataPlanilhaRecall(somarDias(d, -14)),
        proximoContato: fmtDataPlanilhaRecall(d),
        obs: 'Exemplo — conecte a planilha para ver os dados reais',
        exemplo: true,
      }),
      novaLinhaRecall({
        nome: 'Exemplo Internacional',
        contato: '1 (770) 655-0100',
        ultimaConsulta: 'Primeira Consulta',
        status: 'Sem Resposta',
        dataContato: fmtDataPlanilhaRecall(somarDias(d, -30)),
        obs: 'Telefone internacional (EUA) — botão WhatsApp funciona igual',
        exemplo: true,
      }),
    ],
    cirurgias: [
      novaLinhaCirurgia({
        data: fmtDataPlanilhaCirurgias(somarDias(d, -100)),
        paciente: 'Paciente Exemplo Cirurgia',
        cirurgia: 'Lipedema MMII + Argoplasma + Morpheus',
        hospital: 'Perinatal',
        m3m: 'Realizada',
        m6m: 'Marcada',
        m1a: 'Pendente',
        exemplo: true,
      }),
      novaLinhaCirurgia({
        data: fmtDataPlanilhaCirurgias(somarDias(d, 12)),
        paciente: 'Paciente Exemplo Pré-Op',
        cirurgia: 'Lipedema MMII + Argoplasma',
        hospital: 'Barra D’or',
        exemplo: true,
      }),
      novaLinhaCirurgia({
        data: fmtDataPlanilhaCirurgias(somarDias(d, 20)),
        paciente: 'Exemplo Mama Pré-Op',
        cirurgia: 'Mastopexia com implante',
        hospital: 'Perinatal',
        exemplo: true,
      }),
    ],
  };
}
