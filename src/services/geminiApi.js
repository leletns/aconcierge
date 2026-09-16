/**
 * Gemini Flash direto do navegador (chave grátis do Google AI Studio).
 *
 * Por que Flash-Lite como padrão: no nível gratuito o Flash-Lite tem cota
 * diária muito maior que o Flash, e a Helen usa o assistente o dia inteiro.
 * Se o modelo pedido não existir mais (o Google renomeia/aposenta modelos),
 * caímos automaticamente para o próximo da lista — os aliases `*-latest`
 * acompanham a versão nova sem precisar mexer no código.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const MODELOS_GEMINI = [
  { id: 'gemini-flash-lite-latest', label: 'Flash-Lite (mais chamadas grátis por dia)' },
  { id: 'gemini-flash-latest', label: 'Flash (respostas mais elaboradas)' },
];

const CADEIA_FALLBACK = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash'];

function mensagemAmigavel(msg = '', status = 0) {
  const t = String(msg);
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(t)) {
    return 'chave do Gemini inválida — confira em aistudio.google.com/apikey';
  }
  if (status === 403) return 'chave sem permissão para a Gemini API (ative a API no projeto)';
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(t)) {
    return 'cota grátis do Gemini esgotada por hoje — tente de novo mais tarde';
  }
  if (status === 404) return 'modelo do Gemini indisponível';
  if (/Failed to fetch|NetworkError/i.test(t)) return 'sem conexão com o Gemini';
  return t || 'erro no Gemini';
}

export class GeminiApi {
  constructor({ apiKey = '', modelo = MODELOS_GEMINI[0].id } = {}) {
    this.apiKey = (apiKey || '').trim();
    this.modelo = modelo || MODELOS_GEMINI[0].id;
    this.modeloEmUso = '';
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  configurar({ apiKey, modelo }) {
    if (apiKey !== undefined) this.apiKey = (apiKey || '').trim();
    if (modelo) this.modelo = modelo;
    this.modeloEmUso = '';
  }

  /** ordem de tentativa: modelo escolhido primeiro, depois a cadeia de reserva */
  _modelos() {
    return [this.modelo, ...CADEIA_FALLBACK.filter((m) => m !== this.modelo)];
  }

  async _chamar(modelo, corpo) {
    const res = await fetch(`${BASE}/models/${modelo}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok || data.error) {
      const err = new Error(mensagemAmigavel(data.error?.message, res.status));
      err.status = res.status;
      throw err;
    }
    const partes = data.candidates?.[0]?.content?.parts || [];
    const texto = partes.map((p) => p.text || '').join('').trim();
    if (!texto) throw new Error('o Gemini respondeu vazio');
    return texto;
  }

  /**
   * @param {string} prompt
   * @param {{sistema?:string, temperatura?:number, maxTokens?:number}} opts
   */
  async gerar(prompt, { sistema = '', temperatura = 0.4, maxTokens = 1200 } = {}) {
    if (!this.configured) throw new Error('Gemini não configurado — cole a chave em conectar planilhas');
    const corpo = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens },
    };
    if (sistema) corpo.systemInstruction = { parts: [{ text: sistema }] };

    let ultimoErro;
    for (const modelo of this._modelos()) {
      try {
        const texto = await this._chamar(modelo, corpo);
        this.modeloEmUso = modelo;
        return texto;
      } catch (e) {
        ultimoErro = e;
        // só vale tentar outro modelo quando o problema é o modelo em si
        if (e.status !== 404 && e.status !== 400) throw e;
      }
    }
    throw ultimoErro || new Error('erro no Gemini');
  }

  /** valida a chave sem gastar cota de geração */
  async testar() {
    if (!this.configured) throw new Error('cole a chave do Gemini primeiro');
    const res = await fetch(`${BASE}/models?key=${encodeURIComponent(this.apiKey)}`);
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok || data.error) throw new Error(mensagemAmigavel(data.error?.message, res.status));
    const nomes = (data.models || []).map((m) => String(m.name || '').replace('models/', ''));
    const disponivel = this._modelos().find((m) => nomes.includes(m)) || '';
    return { ok: true, total: nomes.length, modelo: disponivel };
  }
}
