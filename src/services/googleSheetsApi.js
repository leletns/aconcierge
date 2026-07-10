import { retry } from '../utils/helpers.js';

/**
 * Cliente do Web App (apps-script/Code.gs) — protocolo dual-sheet.
 *
 * GET  action=health            → { ok, recall:{titulo}, cirurgias:{titulo} }
 * GET  action=fullSync          → { ok, recall:{rows}, cirurgias:{rows}, appConfig, lastChange }
 * GET  action=sync&since=ISO    → { ok, changed, ...idem quando changed }
 * POST action=push  ops=[...]   → { ok, results:[{key,row,skipped?}], lastChange }
 * POST action=setConfig         → { ok }
 * POST action=summarize         → { ok, summary:{text,provider} }
 */
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
      const opts = { method, redirect: 'follow' };

      if (method === 'GET') {
        const params = new URLSearchParams({ action, secret: this.apiSecret, ...payload });
        url = `${url}?${params.toString()}`;
      } else {
        // text/plain evita preflight CORS no Apps Script
        opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
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

  async healthCheck() {
    return this.request('health', {}, 'GET');
  }

  async fullSync() {
    return this.request('fullSync', {}, 'GET');
  }

  async syncSince(since) {
    return this.request('sync', { since: since || '' }, 'GET');
  }

  async push(ops) {
    return this.request('push', { ops });
  }

  async setConfig(appConfig) {
    return this.request('setConfig', { appConfig });
  }

  async summarize(record) {
    const data = await this.request('summarize', { record });
    if (data.summary) return data.summary;
    throw new Error('Sem resumo');
  }
}
