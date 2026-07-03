/**
 * Summary providers — local structured generator + Gemini API integration
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
      if (pendentes.length) {
        pendencias.push(`${pendentes.length} exame(s) pendente(s): ${pendentes.map((e) => e.nome).slice(0, 3).join(', ')}${pendentes.length > 3 ? '…' : ''}`);
      }
      const dd = difDias(patient.dataCirurgia);
      if (dd !== null && dd <= 10) pendencias.push(`cirurgia em ${dd === 0 ? 'hoje' : dd + ' dias'}`);
    }

    if (emPosOp(patient)) {
      MARCOS.forEach((m) => {
        const st = estadoMarco(patient, m);
        if (st === 'atrasado') pendencias.push(`retorno ${m.rotulo} atrasado`);
      });
    }

    if (patient.recall?.status === 'aguardando contato' || patient.recall?.status === 'sem resposta') {
      pendencias.push(`recall: ${patient.recall.status}`);
    }

    let proximoPasso = '—';
    if (px && px.mc.status !== 'realizado') {
      proximoPasso = `Agendar retorno de ${px.m.rotulo} (${px.mc.status})`;
    } else if (emPreOp(patient)) {
      const faltam = (patient.exames || []).filter((e) => !e.feito).length;
      proximoPasso = faltam ? `Concluir ${faltam} exame(s) pré-operatório(s)` : 'Paciente pronta para cirurgia';
    } else if (patient.recall?.proxima) {
      proximoPasso = `Próximo contato de recall em ${fmtLonga(patient.recall.proxima)}`;
    }

    const uc = ultimoContato(patient);
    const obs = [];
    if (patient.obs) obs.push(patient.obs);
    if (uc) obs.push(`Último contato: ${uc.canal} — ${uc.resultado}${uc.nota ? ' (' + uc.nota + ')' : ''}`);

    const status =
      emPreOp(patient)
        ? `Pré-operatório · cirurgia ${fmtLonga(patient.dataCirurgia)}`
        : `Pós-operatório · operada em ${fmtLonga(patient.dataCirurgia)}`;

    const lines = [
      'Resumo da Paciente',
      '',
      `• Nome: ${patient.nome}`,
      `• Procedimento: ${patient.procedimento || '—'}`,
      `• Telefone: ${formatPhoneDisplay(patient.telefone) || '—'}`,
      `• Status: ${status}`,
      `• Pendências: ${pendencias.length ? pendencias.join('; ') : 'Nenhuma pendência crítica'}`,
      `• Próximo passo: ${proximoPasso}`,
      `• Observações importantes: ${obs.length ? obs.join(' · ') : '—'}`,
    ];

    return { text: lines.join('\n'), provider: 'local' };
  }
}

export class GeminiSummaryProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async generate(patient) {
    const local = new LocalSummaryProvider();
    const context = await local.generate(patient);

    const prompt = `Você é assistente de uma concierge médica (cirurgia plástica). Com base nos dados abaixo, gere um resumo estruturado em português brasileiro com exatamente estas seções em bullet points:

Resumo da Paciente
• Nome
• Procedimento
• Status
• Pendências
• Próximo passo
• Observações importantes

Seja concisa e profissional. Dados:
${JSON.stringify({
  nome: patient.nome,
  procedimento: patient.procedimento,
  telefone: patient.telefone,
  dataCirurgia: patient.dataCirurgia,
  fase: patient.fase,
  recall: patient.recall,
  exames: patient.exames,
  marcos: patient.marcos,
  obs: patient.obs,
}, null, 2)}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
      },
    );

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error?.message || 'Erro na API Gemini');
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Resposta vazia da Gemini');
    return { text: text.trim(), provider: 'gemini' };
  }
}

export class SummaryService {
  constructor(config = {}) {
    this.local = new LocalSummaryProvider();
    this.gemini = config.geminiApiKey ? new GeminiSummaryProvider(config.geminiApiKey) : null;
  }

  setGeminiKey(key) {
    this.gemini = key ? new GeminiSummaryProvider(key) : null;
  }

  async summarize(patient, { preferAi = true } = {}) {
    if (preferAi && this.gemini?.configured) {
      try {
        return await this.gemini.generate(patient);
      } catch (_) {
        return this.local.generate(patient);
      }
    }
    return this.local.generate(patient);
  }
}
