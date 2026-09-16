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

const DIAS_SEMANA = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1,
  terca: 2, ter: 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sabado: 6, sab: 6,
};

const semAcento = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const isoDe = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Interpreta o que a Helen digita no campo rápido e já preenche o lembrete:
 * "ligar pra Ana amanhã 14h !!" → título "ligar pra Ana", amanhã, 14:00, prioridade média.
 * Entende: hoje · amanhã · depois de amanhã · segunda…domingo · próxima sexta ·
 * em 3 dias · dia 12 · 12/03 · 14h · 14:30 · às 9 · ! !! !!! · "todo dia|toda semana|todo mês".
 * O texto reconhecido sai do título — o resto continua como ela escreveu.
 */
export function interpretarLembrete(textoBruto) {
  let titulo = String(textoBruto || '').trim();
  const out = { titulo, dataISO: '', hora: '', prioridade: 'nenhuma', repetir: 'nunca' };
  if (!titulo) return out;

  const hojeD = paraData(isoHoje());
  const corta = (re) => {
    const m = semAcento(titulo).match(re);
    if (!m) return null;
    // remove do título original preservando acentos (mesmo índice/comprimento)
    titulo = (titulo.slice(0, m.index) + ' ' + titulo.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
    return m;
  };

  // prioridade: !!! !! !
  const mPrio = corta(/(?:^|\s)(!{1,3})(?=\s|$)/);
  if (mPrio) out.prioridade = { 1: 'baixa', 2: 'media', 3: 'alta' }[mPrio[1].length];

  // repetição
  const mRep = corta(/(?:^|\s)(todo dia|todos os dias|diariamente|toda semana|semanalmente|todo mes|mensalmente|todo ano|anualmente)(?=\s|$)/);
  if (mRep) {
    const r = mRep[1];
    out.repetir = /dia|diariamente/.test(r)
      ? 'diario'
      : /semana/.test(r)
        ? 'semanal'
        : /mes|mensal/.test(r)
          ? 'mensal'
          : 'anual';
  }

  // hora: "14h", "14h30", "14:30", "às 9"
  const mHora = corta(/(?:^|\s)(?:as\s+)?([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?(?:\s*(?:hs|horas?))?(?=\s|$)/);
  if (mHora) out.hora = `${String(mHora[1]).padStart(2, '0')}:${mHora[2] || '00'}`;

  // datas relativas e nomeadas
  let data = null;
  if (corta(/(?:^|\s)depois de amanha(?=\s|$)/)) {
    data = new Date(hojeD);
    data.setDate(data.getDate() + 2);
  } else if (corta(/(?:^|\s)amanha(?=\s|$)/)) {
    data = new Date(hojeD);
    data.setDate(data.getDate() + 1);
  } else if (corta(/(?:^|\s)hoje(?=\s|$)/)) {
    data = new Date(hojeD);
  } else {
    const mEm = corta(/(?:^|\s)em\s+(\d{1,3})\s*(dias?|semanas?|meses|mes)(?=\s|$)/);
    if (mEm) {
      data = new Date(hojeD);
      const n = Number(mEm[1]);
      if (/semana/.test(mEm[2])) data.setDate(data.getDate() + n * 7);
      else if (/mes/.test(mEm[2])) data.setMonth(data.getMonth() + n);
      else data.setDate(data.getDate() + n);
    } else {
      const mDia = corta(
        /(?:^|\s)(?:na\s+|a\s+)?(?:(proxima|proximo)\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado|dom|seg|ter|qua|qui|sex|sab)(?:-feira|\s+feira)?(?=\s|$)/,
      );
      if (mDia) {
        const alvo = DIAS_SEMANA[mDia[2]];
        data = new Date(hojeD);
        let delta = (alvo - data.getDay() + 7) % 7;
        if (delta === 0) delta = 7; // "sexta" dito na sexta = próxima sexta
        if (mDia[1] && delta <= 0) delta += 7;
        data.setDate(data.getDate() + delta);
      } else {
        const mData = corta(/(?:^|\s)(?:dia\s+)?(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?(?=\s|$)/);
        if (mData) {
          const ano = mData[3] ? (mData[3].length === 2 ? 2000 + Number(mData[3]) : Number(mData[3])) : hojeD.getFullYear();
          data = new Date(ano, Number(mData[2]) - 1, Number(mData[1]));
          if (!mData[3] && data < hojeD) data.setFullYear(ano + 1);
        } else {
          const mSoDia = corta(/(?:^|\s)dia\s+(\d{1,2})(?=\s|$)/);
          if (mSoDia) {
            const n = Number(mSoDia[1]);
            data = new Date(hojeD.getFullYear(), hojeD.getMonth(), n);
            if (data < hojeD) data.setMonth(data.getMonth() + 1);
          }
        }
      }
    }
  }
  if (data && !Number.isNaN(data.getTime())) out.dataISO = isoDe(data);

  // hora sem data = hoje (ou amanhã se já passou)
  if (out.hora && !out.dataISO) {
    const agora = new Date();
    const [hh, mm] = out.hora.split(':').map(Number);
    const d = new Date(hojeD);
    if (hh * 60 + mm <= agora.getHours() * 60 + agora.getMinutes()) d.setDate(d.getDate() + 1);
    out.dataISO = isoDe(d);
  }

  out.titulo = titulo.replace(/\s+(de|para|pra|as|às|no|na|em)$/i, '').trim() || String(textoBruto).trim();
  return out;
}

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

  /** apaga definitivamente todos os concluídos (botão "limpar", como no Mac) */
  limparConcluidos() {
    const n = this.lembretes.filter((l) => l.feito).length;
    if (!n) return 0;
    this.lembretes = this.lembretes.filter((l) => !l.feito);
    this._persist();
    return n;
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
