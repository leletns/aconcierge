/**
 * ✨ Resumir — Gemini via Apps Script (preferido), Gemini direto ou resumo local.
 * Recebe o "snapshot" unificado da paciente (recall + cirurgias + marcos).
 */

export function pacienteSnapshot(paciente, store) {
  const recall = paciente.recallRows[paciente.recallRows.length - 1] || null;
  const cirurgias = paciente.cirurgiaRows.map((c) => ({
    data: c.data,
    cirurgia: c.cirurgia,
    hospital: c.hospital,
    marcos: store
      .marcosDe(c)
      .map((m) => `${m.label} (${m.dias}d): ${m.status}`)
      .join(' · '),
  }));

  return {
    nome: paciente.nome,
    telefone: paciente.telefone,
    ultimaConsulta: recall?.ultimaConsulta || '',
    statusRecall: recall?.status || '',
    motivoRecusa: recall?.motivoRecusa || '',
    dataContato: recall?.dataContato || '',
    proximoContato: recall?.proximoContato || '',
    obs: recall?.obs || '',
    cirurgia: cirurgias.map((c) => `${c.cirurgia} em ${c.data} (${c.hospital})`).join(' | '),
    marcos: cirurgias.map((c) => c.marcos).join(' | '),
  };
}

class LocalSummaryProvider {
  async generate(snapshot) {
    const text = [
      'Resumo da Paciente', '',
      `• Nome: ${snapshot.nome || '—'}`,
      `• Procedimento / Cirurgia: ${snapshot.cirurgia || snapshot.ultimaConsulta || '—'}`,
      `• Situação do recall: ${snapshot.statusRecall || '—'}${snapshot.motivoRecusa ? ' (' + snapshot.motivoRecusa + ')' : ''}`,
      `• Retornos: ${snapshot.marcos || '—'}`,
      `• Próximo contato: ${snapshot.proximoContato || '—'}`,
      `• Observações importantes: ${snapshot.obs || '—'}`,
    ].join('\n');
    return { text, provider: 'local' };
  }
}

export const PAPEL_CONCIERGE =
  'Você é a assistente da Helen, concierge da clínica blue. (Dr. Rafael, cirurgia plástica, Rio de Janeiro). ' +
  'Responda SEMPRE em português do Brasil, com frases curtas e diretas, tom acolhedor e profissional. ' +
  'Fale de pacientes com discrição. Nunca dê orientação médica — foque em relacionamento, ' +
  'agendamento e organização do recall. Não invente dados que não estejam no material recebido.';

export class SummaryService {
  constructor({ gemini = null, sheetsApi = null } = {}) {
    this.local = new LocalSummaryProvider();
    this.gemini = gemini;
    this.sheetsApi = sheetsApi;
  }

  setSheetsApi(api) {
    this.sheetsApi = api;
  }

  setGemini(gemini) {
    this.gemini = gemini;
  }

  /** Preferência: Gemini com a chave da clínica → Gemini via Apps Script → resumo local */
  async summarize(snapshot) {
    if (this.gemini?.configured) {
      try {
        const text = await this.gemini.gerar(
          'Faça um resumo da paciente para a concierge usar antes de ligar. Use tópicos curtos com estes títulos: ' +
            'Quem é, Situação do recall, Retornos, Próximo passo, Cuidados na conversa. ' +
            'No "Próximo passo", sugira a ação concreta de hoje.\n\nDados da paciente (JSON):\n' +
            JSON.stringify(snapshot, null, 2),
          { sistema: PAPEL_CONCIERGE, temperatura: 0.35 },
        );
        return { text, provider: 'gemini' };
      } catch (_) {}
    }
    if (this.sheetsApi?.configured) {
      try {
        const result = await this.sheetsApi.summarize(snapshot);
        return { text: result.text, provider: result.provider || 'gemini' };
      } catch (_) {}
    }
    return this.local.generate(snapshot);
  }
}
