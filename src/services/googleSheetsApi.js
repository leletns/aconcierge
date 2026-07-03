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

    const body = JSON.stringify({ action, secret: this.apiSecret, ...payload });

    return retry(async () => {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? body : undefined,
      };

      let url = this.webAppUrl;
      if (method === 'GET') {
        const params = new URLSearchParams({ action, secret: this.apiSecret, ...payload });
        url = `${url}?${params}`;
        delete opts.body;
        opts.method = 'GET';
      }

      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    });
  }

  async pullChanges(since) {
    const data = await this.request('sync', { since: since || '1970-01-01T00:00:00.000Z' }, 'GET');
    return (data.records || []).map(sheetRowToPatient).filter(Boolean);
  }

  async pushRecord(patient) {
    return this.request('syncRecord', { record: patientToSheetRow(patient) });
  }

  async createRecord(patient) {
    return this.request('createRecord', { record: patientToSheetRow(patient) });
  }

  async updateRecord(patient) {
    return this.request('updateRecord', { record: patientToSheetRow(patient) });
  }

  async deleteRecord(id) {
    return this.request('deleteRecord', { id });
  }

  async pushBatch(records) {
    return this.request('batchSync', {
      records: records.map(patientToSheetRow),
    });
  }

  async healthCheck() {
    return this.request('health', {}, 'GET');
  }
}
