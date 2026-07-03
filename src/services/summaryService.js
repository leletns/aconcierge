/**
 * Resumo estilo Gemini do Google Sheets — via Apps Script (preferido) ou cliente
 */

import { fmtLonga, difDias } from '../utils/dates.js';
import { emPreOp, emPosOp, proximoMarco, ultimoContato, MARCOS, estadoMarco } from '../utils/patientModel.js';
import { formatPhoneDisplay } from '../utils/phone.js';

export class LocalSummaryProvider {
  async generate(patient) {
    const pendencias = [];
    const px = proximoMarco(patient);

    if (emPreOp(patient)) {
      const pendentes = (patient.exames || []).filter((e) => !e.feito);
      if (pendentes.length) pendencias.push(`${pendentes.length} exame(s): ${pendentes.map((e) => e.nome).slice(0, 3).join(', ')}`);
      const dd = difDias(patient.dataCirurgia);
      if (dd !== null && dd <= 10) pendencias.push(`cirurgia em ${dd === 0 ? 'hoje' : dd + ' dias'}`);
    }
    if (emPosOp(patient)) {
      MARCOS.forEach((m) => {
        if (estadoMarco(patient, m) === 'atrasado') pendencias.push(`retorno ${m.rotulo} atrasado`);
      });
    }
    if (['aguardando contato', 'sem resposta'].includes(patient.recall?.status)) {
      pendencias.push(`recall: ${patient.recall.status}`);
    }

    let proximoPasso = '—';
    if (px && px.mc.status !== 'realizado') proximoPasso = `Agendar ${px.m.rotulo} (${px.mc.status})`;
    else if (emPreOp(patient)) {
      const f = (patient.exames || []).filter((e) => !e.feito).length;
      proximoPasso = f ? `Concluir ${f} exame(s)` : 'Pronta para cirurgia';
    } else if (patient.recall?.proxima) proximoPasso = `Contato em ${fmtLonga(patient.recall.proxima)}`;

    const uc = ultimoContato(patient);
    const obs = [patient.obs, uc ? `${uc.canal}: ${uc.resultado}` : ''].filter(Boolean).join(' · ');

    const text = [
      'Resumo da Paciente', '',
      `• Nome: ${patient.nome}`,
      `• Procedimento: ${patient.procedimento || '—'}`,
      `• Status: ${emPreOp(patient) ? 'Pré-op' : 'Pós-op'}`,
      `• Pendências: ${pendencias.length ? pendencias.join('; ') : 'Nenhuma'}`,
      `• Próximo passo: ${proximoPasso}`,
      `• Observações importantes: ${obs || '—'}`,
    ].join('\n');

    return { text, provider: 'local' };
  }
}

export class ClientGeminiProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  get configured() {
    return Boolean(this.apiKey);
  }
  async generate(patient) {
    const prompt = `Resumo da Paciente em português (bullet points): Nome, Procedimento, Status, Pendências, Próximo passo, Observações.\n\n${JSON.stringify(patient)}`;
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

  setGeminiKey(key) {
    this.clientGemini = key ? new ClientGeminiProvider(key) : null;
  }

  /** Preferência: Apps Script Gemini (como Sheets) → cliente Gemini → local */
  async summarize(patient, { preferAi = true } = {}) {
    if (preferAi && this.sheetsApi?.configured) {
      try {
        const result = await this.sheetsApi.summarizePatient(patient);
        return { text: result.text, provider: result.provider || 'gemini-sheets' };
      } catch (_) {}
    }
    if (preferAi && this.clientGemini?.configured) {
      try {
        return await this.clientGemini.generate(patient);
      } catch (_) {}
    }
    return this.local.generate(patient);
  }
}
