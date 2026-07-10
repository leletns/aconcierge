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

class ClientGeminiProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  get configured() {
    return Boolean(this.apiKey);
  }
  async generate(snapshot) {
    const prompt =
      'Resumo da Paciente em português brasileiro (bullet points): Nome, Procedimento/Cirurgia, ' +
      'Situação do recall, Retornos, Próximo passo, Observações.\n\n' +
      JSON.stringify(snapshot, null, 2);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 1024 },
        }),
      },
    );
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || 'Gemini error');
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Resposta vazia');
    return { text: text.trim(), provider: 'gemini' };
  }
}

export class SummaryService {
  constructor({ geminiApiKey, sheetsApi } = {}) {
    this.local = new LocalSummaryProvider();
    this.clientGemini = geminiApiKey ? new ClientGeminiProvider(geminiApiKey) : null;
    this.sheetsApi = sheetsApi || null;
  }

  setSheetsApi(api) {
    this.sheetsApi = api;
  }

  /** Preferência: Gemini via Apps Script → Gemini direto → resumo local */
  async summarize(snapshot) {
    if (this.sheetsApi?.configured) {
      try {
        const result = await this.sheetsApi.summarize(snapshot);
        return { text: result.text, provider: result.provider || 'gemini' };
      } catch (_) {}
    }
    if (this.clientGemini?.configured) {
      try {
        return await this.clientGemini.generate(snapshot);
      } catch (_) {}
    }
    return this.local.generate(snapshot);
  }
}
