/**
 * Lembretes da Helen — espelha o comportamento do app Lembretes do Mac:
 *
 * - prioridade (nenhuma / ! baixa / !! média / !!! alta)
 * - "lembrar em" (data + hora opcional) e repetição (diário … anual)
 * - ao concluir um lembrete com repetição, ele salta para a próxima
 *   ocorrência em vez de sumir (igual ao app do Mac)
 * - exportação .ics (VTODO + PRIORITY + RRULE) — ao abrir o arquivo no Mac,
 *  o lembrete entra direto no app Lembretes
 * - enquanto o app está aberto, lembretes da hora disparam notificação
 *   nativa do macOS (Notification API)
 *
 * Tudo fica no Mac (localStorage), independente das planilhas.
 */
import { LEMBRETES_KEY, PRIORIDADES_LEMBRETE, REPETICAO_LEMBRETE } from '../utils/constants.js';
import { isoHoje, paraData } from '../utils/dates.js';

const uid = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const prioridadeDe = (id) =>
  PRIORIDADES_LEMBRETE.find((p) => p.id === id) || PRIORIDADES_LEMBRETE[0];

export const repeticaoDe = (id) =>
  REPETICAO_LEMBRETE.find((r) => r.id === id) || REPETICAO_LEMBRETE[0];

/** próxima ocorrência sempre no futuro (pula ocorrências perdidas) */
function avancarData(iso, repetir) {
  const d = paraData(iso);
  if (!d) return iso;
  const passo = () => {
    if (repetir === 'diario') d.setDate(d.getDate() + 1);
    else if (repetir === 'semanal') d.setDate(d.getDate() + 7);
    else if (repetir === 'quinzenal') d.setDate(d.getDate() + 14);
    else if (repetir === 'mensal') d.setMonth(d.getMonth() + 1);
    else if (repetir === 'anual') d.setFullYear(d.getFullYear() + 1);
  };
  passo();
  const h = paraData(isoHoje());
  let guarda = 0;
  while (d <= h && guarda < 400) {
    passo();
    guarda++;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class RemindersStore {
  constructor({ onChange } = {}) {
    this.onChange = onChange || (() => {});
    this.lembretes = [];
    try {
      const bruto = localStorage.getItem(LEMBRETES_KEY);
      if (bruto) {
        const arr = JSON.parse(bruto);
        if (Array.isArray(arr)) this.lembretes = arr;
      }
    } catch (_) {}
  }

  _persist() {
    try {
      localStorage.setItem(LEMBRETES_KEY, JSON.stringify(this.lembretes));
    } catch (_) {}
    this.onChange();
  }

  get lista() {
    return this.lembretes;
  }

  get(id) {
    return this.lembretes.find((l) => l.id === id) || null;
  }

  adicionar(base = {}) {
    const l = {
      id: uid(),
      titulo: '',
      notas: '',
      prioridade: 'nenhuma',
      dataISO: '',
      hora: '',
      repetir: 'nunca',
      feito: false,
      criadoEm: new Date().toISOString(),
      concluidoEm: '',
      notificadoEm: '',
      ...base,
    };
    this.lembretes.push(l);
    this._persist();
    return l;
  }

  atualizar(id, patch) {
    const l = this.get(id);
    if (!l) return null;
    // mudou data/hora → volta a ser elegível para notificação
    if (
      (patch.dataISO !== undefined && patch.dataISO !== l.dataISO) ||
      (patch.hora !== undefined && patch.hora !== l.hora)
    ) {
      l.notificadoEm = '';
    }
    Object.assign(l, patch);
    this._persist();
    return l;
  }

  remover(id) {
    this.lembretes = this.lembretes.filter((l) => l.id !== id);
    this._persist();
  }

  /** concluir lembrete com repetição → pula para a próxima data (como no Mac) */
  alternarFeito(id) {
    const l = this.get(id);
    if (!l) return;
    if (!l.feito && l.repetir && l.repetir !== 'nunca' && l.dataISO) {
      l.dataISO = avancarData(l.dataISO, l.repetir);
      l.notificadoEm = '';
    } else {
      l.feito = !l.feito;
      l.concluidoEm = l.feito ? new Date().toISOString() : '';
    }
    this._persist();
  }

  /** abertos com data até hoje (vencidos + do dia) — alimenta o badge */
  vencidos() {
    const h = isoHoje();
    return this.lembretes.filter((l) => !l.feito && l.dataISO && l.dataISO <= h);
  }

  /** devidos agora e ainda não notificados nesta data/hora */
  paraNotificar() {
    const h = isoHoje();
    const agora = new Date();
    const hhmm = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    return this.lembretes.filter((l) => {
      if (l.feito || l.notificadoEm || !l.dataISO) return false;
      if (l.dataISO < h) return true;
      return !l.hora || l.hora <= hhmm;
    });
  }

  marcarNotificado(id) {
    const l = this.get(id);
    if (!l) return;
    l.notificadoEm = new Date().toISOString();
    this._persist();
  }
}

/* ---------- exportação .ics (entra no app Lembretes do Mac) ---------- */

const icsEsc = (s) =>
  String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

function icsDatas(l) {
  if (!l.dataISO) return [];
  const d = l.dataISO.replace(/-/g, '');
  if (l.hora) {
    const t = l.hora.replace(':', '') + '00';
    return [`DTSTART;TZID=America/Sao_Paulo:${d}T${t}`, `DUE;TZID=America/Sao_Paulo:${d}T${t}`];
  }
  return [`DTSTART;VALUE=DATE:${d}`, `DUE;VALUE=DATE:${d}`];
}

export function icsDos(lembretes) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//blue. central//lembretes//PT-BR',
    'CALSCALE:GREGORIAN',
  ];
  for (const l of lembretes) {
    linhas.push(
      'BEGIN:VTODO',
      `UID:${l.id}@blue-central`,
      `DTSTAMP:${stamp}`,
      `SUMMARY:${icsEsc(l.titulo) || 'lembrete'}`,
    );
    if (l.notas) linhas.push(`DESCRIPTION:${icsEsc(l.notas)}`);
    linhas.push(...icsDatas(l));
    const prio = prioridadeDe(l.prioridade);
    if (prio.peso) linhas.push(`PRIORITY:${prio.peso}`);
    const rep = repeticaoDe(l.repetir);
    if (rep.rrule) linhas.push(`RRULE:${rep.rrule}`);
    linhas.push(l.feito ? 'STATUS:COMPLETED' : 'STATUS:NEEDS-ACTION');
    linhas.push('END:VTODO');
  }
  linhas.push('END:VCALENDAR');
  return linhas.join('\r\n');
}

export function baixarIcs(nomeArquivo, lembretes) {
  const blob = new Blob([icsDos(lembretes)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 400);
}
