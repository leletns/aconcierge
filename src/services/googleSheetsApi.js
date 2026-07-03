import { retry } from '../utils/helpers.js';
import { patientToSheetRow, sheetRowToPatient } from '../utils/patientModel.js';

export class GoogleSheetsApi {
  constructor({ webAppUrl, apiSecret }) {
    this.webAppUrl = (webAppUrl || '').replace(/\/$/, '');
    this.apiSecret = apiSecret || '';
  }

  get configured() {
    return Boolean(this.webAppUrl && this.apiSecret);
  }

  async request(action, payload = {}, method = 'POST') {
    if (!this.configured) throw new Error('Google Sheets sync não configurado');

    return retry(async () => {
      let url = this.webAppUrl;
      const opts = { method, headers: { 'Content-Type': 'application/json' }, redirect: 'follow' };

      if (method === 'GET') {
        const params = new URLSearchParams({ action, secret: this.apiSecret, ...payload });
        url = `${url}?${params.toString()}`;
      } else {
        opts.method = 'POST';
        opts.body = JSON.stringify({ action, secret: this.apiSecret, ...payload });
      }

      const res = await fetch(url, opts);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        throw new Error('Resposta inválida do Apps Script — verifique a URL do Web App');
      }
      if (data.error) throw new Error(data.error);
      return data;
    }, { attempts: 4, delayMs: 400 });
  }

  async pullChanges(since) {
    const data = await this.request('sync', { since: since || '1970-01-01T00:00:00.000Z' }, 'GET');
    return (data.records || []).map(sheetRowToPatient).filter(Boolean);
  }

  async fullPull() {
    const data = await this.request('fullSync', {}, 'GET');
    return (data.records || []).map(sheetRowToPatient).filter(Boolean);
  }

  async pushBatch(records) {
    return this.request('batchSync', { records: records.map(patientToSheetRow) });
  }

  async summarizePatient(patient) {
    const data = await this.request('summarize', {
      id: patient.id,
      record: patientToSheetRow(patient),
    });
    if (data.summary) return data.summary;
    if (data.result?.text) return data.result;
    throw new Error('Sem resumo');
  }

  async healthCheck() {
    return this.request('health', {}, 'GET');
  }
}
