/**
 * blue. Central — orquestrador da UI
 * Uma única aplicação: Hoje · Planilha Recall · Planilha Cirurgias · Retornos · Pré-op · ⚙ Acompanhamentos
 */
import { RECALL_COLS, CIRURGIAS_COLS, STATUS_MARCO } from './utils/constants.js';
import { esc, iniciais, debounce } from './utils/helpers.js';
import {
  fmt,
  fmtLonga,
  isoHoje,
  somarDias,
  difDias,
  parseDataPt,
  fmtDataPlanilhaRecall,
  fmtDataPlanilhaCirurgias,
} from './utils/dates.js';
import { parsePhone, formatPhoneDisplay, buildWhatsAppLink } from './utils/phone.js';
import { patientKey } from './utils/matching.js';
import { marcosEfetivos, estadoMarco, proximoMarco, templateParaCirurgia } from './utils/templates.js';
import { Store } from './services/store.js';
import { SyncService } from './services/syncService.js';
import { SummaryService, pacienteSnapshot } from './services/summaryService.js';
import { exportToXlsx } from './services/exportService.js';
import { showToast, showLoadingToast } from './components/Toast.js';
import { renderSyncIndicator } from './components/SummaryModal.js';
import { SpreadsheetGrid } from './components/SpreadsheetGrid.js';
import { AcompanhamentosScreen, marcosEditorHtml, bindMarcosEditor } from './screens/acompanhamentos.js';

const $ = (s) => document.querySelector(s);

let fichaAtual = null; // patientKey da ficha aberta
let contatoAtual = null; // key da linha de recall no modal de contato
let resumoAtual = null; // patientKey do resumo
let resumoTexto = '';
let buscaIndice = 0;

/* ---------- estado central ---------- */

const store = new Store({ onChange: () => renderizarTudo() });
const syncService = new SyncService(store);
store.sync = syncService;

const summaryService = new SummaryService({ geminiApiKey: store.config.geminiApiKey });
summaryService.setSheetsApi(syncService.api);
syncService.onStatus((s) => renderSyncIndicator(s));

/* ---------- rótulos dinâmicos das colunas de marcos ---------- */

function headerLabelCirurgias(field) {
  if (!['m3m', 'm6m', 'm1a'].includes(field)) return null;
  for (const t of store.appConfig.templates) {
    if (!t.padrao) continue;
    const m = t.marcos.find((x) => x.col === field);
    if (m) return m.label;
  }
  return null;
}

/* ---------- grades ---------- */

const gridRecall = new SpreadsheetGrid({
  el: null,
  colunas: RECALL_COLS,
  nomeField: 'nome',
  statusField: 'status',
  getRows: () => store.recall,
  onEdit: (key, field, value) => store.editarCelula('recall', key, field, value),
  onAddRow: () => store.adicionarLinha('recall'),
  onOpenFicha: (linha) => abrirFichaDaLinha(linha, 'recall'),
});

const gridCirurgias = new SpreadsheetGrid({
  el: null,
  colunas: CIRURGIAS_COLS,
  nomeField: 'paciente',
  statusField: 'm3m',
  getRows: () => store.cirurgias,
  onEdit: (key, field, value) => store.editarCelula('cirurgias', key, field, value),
  onAddRow: () => store.adicionarLinha('cirurgias'),
  onOpenFicha: (linha) => abrirFichaDaLinha(linha, 'cirurgias'),
  headerLabel: headerLabelCirurgias,
});

let acompanhamentosScreen = null;

/* ---------- mensagens WhatsApp ---------- */

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

function waMsgRetorno(nome, marcoLabel) {
  return `Olá, ${primeiroNome(nome)}! Aqui é a Helen, da blue. Estou entrando em contato para agendarmos o seu retorno${marcoLabel ? ' de ' + marcoLabel : ''} com o Dr. Rafael. Qual o melhor dia para você?`;
}

function waMsgRecall(nome) {
  return `Olá, ${primeiroNome(nome)}! Aqui é a Helen, da blue. Como você está? Estou entrando em contato para saber como tem sido a sua evolução e ver se podemos agendar uma avaliação com o Dr. Rafael.`;
}

function waBtn(telefone, msg, rotulo = '') {
  const url = buildWhatsAppLink(telefone, msg);
  if (!url) return '<span class="celula-sub">sem tel.</span>';
  return `<button type="button" class="btn btn-wa" data-wa="${esc(url)}">${rotulo || 'WhatsApp'}</button>`;
}

function bindWa(root) {
  root.querySelectorAll('[data-wa]').forEach((b) => {
    if (b._wa) return;
    b._wa = true;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(b.dataset.wa, '_blank', 'noopener');
    });
  });
}

/* ---------- render principal ---------- */

function renderizarTudo() {
  const tela = store.filters.tela;
  renderizarBadges();
  if (tela === 'hoje') renderizarHoje();
  if (tela === 'grid-recall' && !gridRecall.editando) gridRecall.render();
  if (tela === 'grid-cirurgias' && !gridCirurgias.editando) gridCirurgias.render();
  if (tela === 'retornos') renderizarRetornos();
  if (tela === 'preop') renderizarPreop();
  if (tela === 'acompanhamentos') {
    const el = $('#acompanhamentos-lista');
    const digitando = el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (!digitando) acompanhamentosScreen.render();
  }
}

function renderizarBadges() {
  const recallsHoje = store.recallsVencidos().length;

  let marcosAtrasados = 0;
  for (const c of store.cirurgiasPassadas()) {
    const marcos = store.marcosDe(c);
    if (marcos.some((m) => estadoMarco(m) === 'atrasado')) marcosAtrasados++;
  }

  let preopCritico = 0;
  for (const { c, iso } of store.cirurgiasFuturas()) {
    if (difDias(iso) > 15) continue;
    const p = store.pacienteDaLinha(c, 'cirurgias');
    const extras = store.extrasDe(p ? p.key : patientKey(c.paciente));
    if (extras.exames.some((e) => !e.feito)) preopCritico++;
  }

  $('#badge-recall').textContent = recallsHoje || '';
  $('#badge-retornos').textContent = marcosAtrasados || '';
  $('#badge-preop').textContent = preopCritico || '';
  $('#badge-hoje').textContent = recallsHoje + marcosAtrasados + preopCritico || '';
}

/* ---------- HOJE ---------- */

function renderizarHoje() {
  const h = new Date().getHours();
  const s = h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite';
  $('#saudacao').innerHTML = `${s}, Helen<span class="ponto">.</span>`;
  $('#data-hoje').textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const bloco = (titulo, itens, vazioTitulo, vazioSub) => `
    <div class="cartao bloco-hoje">
      <h2>${titulo} <span class="contagem">${itens.length}</span></h2>
      ${itens.length ? itens.slice(0, 8).join('') : `<div class="vazio"><strong>${vazioTitulo}</strong>${vazioSub}</div>`}
    </div>`;

  // 1. recall vencido
  const itensRec = store.recallsVencidos().map((r) => {
    const prox = parseDataPt(r.proximoContato) || parseDataPt(r.dataContato);
    const dd = difDias(prox);
    const selo =
      dd < 0
        ? `<span class="selo selo-coral">venceu há ${Math.abs(dd)}d</span>`
        : `<span class="selo selo-ambar">é hoje</span>`;
    return `<div class="item-fila" data-ficha-linha="recall:${r.key}">
      <div class="info"><div class="nome">${esc(r.nome)}</div>
      <div class="detalhe">${esc(r.status || '—')}${r.obs ? ' · ' + esc(r.obs.slice(0, 60)) : ''}</div></div>
      ${selo}
      <button class="btn btn-claro btn-mini-contato" data-contato="${r.key}">registrar</button>
    </div>`;
  });

  // 2. retornos vencendo (próximos 7 dias ou atrasados)
  const retornos = [];
  for (const c of store.cirurgiasPassadas()) {
    const marcos = store.marcosDe(c);
    const px = proximoMarco(marcos);
    if (!px || !px.dataISO) continue;
    const dd = difDias(px.dataISO);
    if (dd <= 7) retornos.push({ c, px, dd });
  }
  retornos.sort((a, b) => a.dd - b.dd);
  const itensRet = retornos.map(({ c, px, dd }) => {
    const selo =
      dd < 0
        ? `<span class="selo selo-coral">atrasado ${Math.abs(dd)}d</span>`
        : dd === 0
          ? `<span class="selo selo-ambar">é hoje</span>`
          : `<span class="selo selo-azul">em ${dd}d</span>`;
    return `<div class="item-fila" data-ficha-linha="cirurgias:${c.key}">
      <div class="info"><div class="nome">${esc(c.paciente)}</div>
      <div class="detalhe">retorno ${esc(px.label)} · ${fmt(px.dataISO)} · ${esc(px.status)}</div></div>${selo}</div>`;
  });

  // 3. pré-op em atenção
  const itensPre = store
    .cirurgiasFuturas()
    .filter(({ iso }) => difDias(iso) <= 21)
    .map(({ c, iso }) => {
      const dd = difDias(iso);
      const p = store.pacienteDaLinha(c, 'cirurgias');
      const extras = store.extrasDe(p ? p.key : patientKey(c.paciente));
      const pend = extras.exames.filter((e) => !e.feito).length;
      const selo = dd <= 7 ? 'selo-coral' : dd <= 15 ? 'selo-ambar' : 'selo-azul';
      return `<div class="item-fila" data-nav="preop">
        <div class="info"><div class="nome">${esc(c.paciente)}</div>
        <div class="detalhe">${pend ? pend + ' exame(s) pendente(s) · ' : ''}cirurgia em ${fmt(iso)}</div></div>
        <span class="selo ${selo}">${dd === 0 ? 'é hoje' : 'faltam ' + dd + 'd'}</span></div>`;
    });

  $('#grade-hoje').innerHTML =
    bloco('recall para hoje', itensRec, 'fila limpa', 'nenhuma paciente aguardando contato hoje') +
    bloco('retornos desta semana', itensRet, 'tudo em dia', 'nenhum retorno vencendo nos próximos 7 dias') +
    bloco('pré-op em atenção', itensPre, 'exames em dia', 'nenhuma cirurgia nos próximos 21 dias') +
    (store.temExemplos
      ? `<div style="grid-column:1/-1;text-align:center;padding-top:4px">
        <button class="btn btn-fantasma" id="btn-limpar-exemplos">estes são dados de exemplo — conecte as planilhas ou clique para removê-los</button></div>`
      : '');

  $('#grade-hoje').querySelectorAll('[data-ficha-linha]').forEach((el) =>
    el.addEventListener('click', () => {
      const [tipo, key] = el.dataset.fichaLinha.split(':');
      const linha = tipo === 'recall' ? store.getRecallRow(key) : store.getCirurgiaRow(key);
      if (linha) abrirFichaDaLinha(linha, tipo);
    }),
  );
  $('#grade-hoje').querySelectorAll('.btn-mini-contato').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirContato(el.dataset.contato);
    }),
  );
  $('#grade-hoje').querySelectorAll('[data-nav="preop"]').forEach((el) =>
    el.addEventListener('click', () => irPara('preop')),
  );
  $('#btn-limpar-exemplos')?.addEventListener('click', () => {
    store.limparExemplos();
    showToast('exemplos removidos');
  });
}

/* ---------- RETORNOS ---------- */

function renderizarRetornos() {
  const filtro = store.filters.retornos;
  const filtros = [
    { id: 'todos', rotulo: 'todos' },
    { id: 'atrasados', rotulo: 'atrasados' },
    { id: '30d', rotulo: 'próximos 30 dias' },
    { id: 'completos', rotulo: 'jornada completa' },
  ];
  $('#filtros-retornos').innerHTML = filtros
    .map((f) => `<button class="filtro ${filtro === f.id ? 'ativo' : ''}" data-fr="${f.id}">${f.rotulo}</button>`)
    .join('');
  $('#filtros-retornos').querySelectorAll('[data-fr]').forEach((b) =>
    b.addEventListener('click', () => store.setFilter('retornos', b.dataset.fr)),
  );

  let lista = store
    .cirurgiasPassadas()
    .filter((c) => parseDataPt(c.data))
    .map((c) => {
      const marcos = store.marcosDe(c);
      return { c, marcos, px: proximoMarco(marcos) };
    });

  if (filtro === 'atrasados') lista = lista.filter(({ marcos }) => marcos.some((m) => estadoMarco(m) === 'atrasado'));
  else if (filtro === '30d')
    lista = lista.filter(({ px }) => px && px.dataISO && difDias(px.dataISO) >= 0 && difDias(px.dataISO) <= 30);
  else if (filtro === 'completos') lista = lista.filter(({ px }) => !px);

  lista.sort((a, b) => {
    const da = a.px?.dataISO ? difDias(a.px.dataISO) : 9999;
    const db = b.px?.dataISO ? difDias(b.px.dataISO) : 9999;
    return da - db;
  });

  $('#corpo-retornos').innerHTML = lista.length
    ? lista
        .map(({ c, marcos, px }) => {
          const p = store.pacienteDaLinha(c, 'cirurgias');
          const trilho =
            `<div class="trilho">` +
            marcos
              .map(
                (m) =>
                  `<div class="no ${estadoMarco(m)}" title="${esc(m.label)} · ${esc(m.status)}"><div class="bola"></div><div class="rotulo">${esc(m.label.replace(' dias', 'd').replace(' meses', 'm').replace(' ano', 'a'))}</div></div>`,
              )
              .join('') +
            `</div>`;
          const proximo = px
            ? `<div style="font-weight:600">${esc(px.label)}</div><div class="celula-sub">${fmtLonga(px.dataISO)}${px.dataISO && difDias(px.dataISO) < 0 ? ' · <span style="color:var(--coral);font-weight:600">' + Math.abs(difDias(px.dataISO)) + 'd de atraso</span>' : ''}</div>`
            : `<span class="selo selo-verde">jornada completa</span>`;
          const statusSel = px
            ? `<select class="campo mini sel-marco" data-cir="${c.key}" data-marco="${px.id}">` +
              STATUS_MARCO.map((s) => `<option ${px.status === s ? 'selected' : ''}>${s}</option>`).join('') +
              `</select>`
            : '—';
          return `<tr>
        <td><div class="celula-nome" data-ficha-cir="${c.key}">${esc(c.paciente)}</div><div class="celula-sub">operada em ${esc(c.data)}</div></td>
        <td><div class="celula-sub" style="max-width:220px;white-space:normal">${esc(c.cirurgia || '—')}</div></td>
        <td>${trilho}</td>
        <td>${proximo}</td>
        <td>${statusSel}</td>
        <td style="white-space:nowrap;text-align:right">${waBtn(p?.telefone, waMsgRetorno(c.paciente, px?.label), 'WhatsApp')}</td>
      </tr>`;
        })
        .join('')
    : `<tr><td colspan="6"><div class="vazio"><strong>nenhuma cirurgia realizada</strong>as cirurgias com data passada aparecem aqui automaticamente</div></td></tr>`;

  $('#corpo-retornos').querySelectorAll('[data-ficha-cir]').forEach((el) =>
    el.addEventListener('click', () => {
      const linha = store.getCirurgiaRow(el.dataset.fichaCir);
      if (linha) abrirFichaDaLinha(linha, 'cirurgias');
    }),
  );
  $('#corpo-retornos').querySelectorAll('.sel-marco').forEach((el) =>
    el.addEventListener('change', () => {
      const c = store.getCirurgiaRow(el.dataset.cir);
      if (!c) return;
      const marco = store.marcosDe(c).find((m) => m.id === el.dataset.marco);
      if (!marco) return;
      store.setMarcoStatus(c, marco, el.value);
      showToast(el.value === 'Realizada' ? 'retorno concluído' : 'status atualizado');
    }),
  );
  bindWa($('#corpo-retornos'));
}

/* ---------- PRÉ-OP ---------- */

function renderizarPreop() {
  const lista = store.cirurgiasFuturas();
  $('#grade-preop').innerHTML = lista.length
    ? lista
        .map(({ c, iso }) => {
          const dd = difDias(iso);
          const p = store.pacienteDaLinha(c, 'cirurgias');
          const pKey = p ? p.key : patientKey(c.paciente);
          const extras = store.extrasDe(pKey);
          const feitos = extras.exames.filter((e) => e.feito).length;
          const total = extras.exames.length;
          const pct = total ? Math.round((feitos / total) * 100) : 0;
          const cor = dd <= 7 && feitos < total ? 'var(--coral)' : dd <= 15 && feitos < total ? 'var(--ambar)' : 'var(--verde)';
          return `<div class="cartao cartao-preop">
        <div class="preop-topo">
          <div><div class="nome" data-ficha-cir="${c.key}">${esc(c.paciente)}</div>
          <div class="proc">${esc(c.cirurgia || '—')} · ${esc(c.data)}${c.hospital ? ' · ' + esc(c.hospital) : ''}</div></div>
          <div class="contagem-regressiva"><div class="dias" style="color:${cor}">${dd === 0 ? 'hoje' : dd}</div>
          <div class="rotulo">${dd === 0 ? 'é o dia' : 'dias'}</div></div>
        </div>
        <div class="legenda-exames"><span>exames</span><span>${feitos} de ${total}</span></div>
        <div class="barra-exames"><div style="width:${pct}%;background:${cor}"></div></div>
        <div class="lista-exames">${extras.exames
          .map(
            (e, i) => `
          <div class="exame ${e.feito ? 'feito' : ''}" data-exame="${pKey}:${i}">
            <div class="caixa"></div><span>${esc(e.nome)}</span>
            <button class="remover btn-rem-exame" data-pk="${pKey}" data-i="${i}">×</button>
          </div>`,
          )
          .join('')}
        </div>
        <div class="add-exame">
          <input class="campo add-exame-input" data-pk="${pKey}" placeholder="adicionar exame (Enter)">
        </div>
        <div class="preop-rodape">
          ${feitos === total ? '<span class="selo selo-verde">tudo pronto para a cirurgia</span>' : `<span class="selo ${dd <= 7 ? 'selo-coral' : dd <= 15 ? 'selo-ambar' : 'selo-azul'}">${total - feitos} pendente${total - feitos > 1 ? 's' : ''}</span>`}
          ${waBtn(p?.telefone, waMsgRecall(c.paciente), 'WhatsApp')}
        </div>
      </div>`;
        })
        .join('')
    : `<div class="cartao bloco-hoje" style="grid-column:1/-1"><div class="vazio"><strong>nenhuma cirurgia marcada</strong>adicione uma linha na planilha cirurgias com data futura</div></div>`;

  $('#grade-preop').querySelectorAll('[data-ficha-cir]').forEach((el) =>
    el.addEventListener('click', () => {
      const linha = store.getCirurgiaRow(el.dataset.fichaCir);
      if (linha) abrirFichaDaLinha(linha, 'cirurgias');
    }),
  );
  $('#grade-preop').querySelectorAll('[data-exame]').forEach((el) =>
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-rem-exame')) return;
      const [pk, i] = el.dataset.exame.split(':');
      const extras = store.extrasDe(pk);
      extras.exames[+i].feito = !extras.exames[+i].feito;
      store.salvarExtras();
    }),
  );
  $('#grade-preop').querySelectorAll('.btn-rem-exame').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const extras = store.extrasDe(el.dataset.pk);
      extras.exames.splice(+el.dataset.i, 1);
      store.salvarExtras();
    }),
  );
  $('#grade-preop').querySelectorAll('.add-exame-input').forEach((el) =>
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && el.value.trim()) {
        const extras = store.extrasDe(el.dataset.pk);
        extras.exames.push({ nome: el.value.trim(), feito: false });
        store.salvarExtras();
        showToast('exame adicionado');
      }
    }),
  );
  bindWa($('#grade-preop'));
}

/* ---------- FICHA UNIFICADA ---------- */

function abrirFichaDaLinha(linha, tipo) {
  const p = store.pacienteDaLinha(linha, tipo);
  if (p) abrirFicha(p.key);
}

function abrirFicha(pKey) {
  const p = store.getPaciente(pKey);
  if (!p) return;
  fichaAtual = pKey;
  resumoAtual = pKey;
  const extras = store.extrasDe(pKey);
  const appCfg = store.appConfig;

  const recallHtml = p.recallRows
    .map(
      (r) => `
    <div class="ficha-recall-linha">
      <div><span class="selo ${r.status === 'Agendado' ? 'selo-verde' : r.status === 'Sem Resposta' ? 'selo-coral' : 'selo-ambar'}">${esc(r.status || '—')}</span>
        ${r.motivoRecusa ? `<span class="celula-sub"> · motivo: ${esc(r.motivoRecusa)}</span>` : ''}</div>
      <div class="celula-sub">última consulta: ${esc(r.ultimaConsulta || '—')} · contato: ${esc(r.dataContato || '—')} · próximo: ${esc(r.proximoContato || '—')}</div>
      ${r.obs ? `<div class="celula-sub">obs: ${esc(r.obs)}</div>` : ''}
      <button class="btn btn-claro btn-mini" data-contato="${r.key}">registrar contato</button>
    </div>`,
    )
    .join('');

  const cirurgiasHtml = p.cirurgiaRows
    .map((c) => {
      const marcos = store.marcosDe(c);
      const trilho = marcos
        .map(
          (m) => `
        <div class="ficha-marco">
          <div class="no ${estadoMarco(m)}"><div class="bola"></div></div>
          <div class="ficha-marco-info">
            <div class="ficha-marco-label">${esc(m.label)} <span class="celula-sub">(${m.dias}d${m.col ? ' · planilha' : ' · só no app'})</span></div>
            <div class="celula-sub">${m.dataISO ? fmtLonga(m.dataISO) : 'sem data'}</div>
          </div>
          <select class="campo mini sel-marco-ficha" data-cir="${c.key}" data-marco="${m.id}">
            ${STATUS_MARCO.map((s) => `<option ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>`,
        )
        .join('');
      const tpl = templateParaCirurgia(c, appCfg, pKey);
      return `
      <div class="ficha-cirurgia">
        <div class="ficha-cirurgia-topo">
          <strong>${esc(c.cirurgia || 'cirurgia')}</strong>
          <span class="celula-sub">${esc(c.data || 'sem data')}${c.hospital ? ' · ' + esc(c.hospital) : ''} · template: ${esc(tpl.nome)}</span>
        </div>
        ${trilho}
      </div>`;
    })
    .join('');

  const temOverride = Boolean(appCfg.overrides[pKey]?.length);
  const marcosBase = temOverride
    ? appCfg.overrides[pKey]
    : p.cirurgiaRows.length
      ? marcosEfetivos(p.cirurgiaRows[0], appCfg, pKey, extras).map(({ id, label, dias, col }) => ({ id, label, dias, col }))
      : [];

  const tplOptions = appCfg.templates
    .map(
      (t) =>
        `<option value="${t.id}" ${appCfg.assignments[pKey] === t.id ? 'selected' : ''}>${esc(t.nome)}${t.padrao ? ' (padrão)' : ''}</option>`,
    )
    .join('');

  $('#conteudo-ficha').innerHTML = `
    <div class="ficha-topo">
      <div class="avatar">${iniciais(p.nome)}</div>
      <div><div class="nome">${esc(p.nome)}</div>
      <div class="meta">${p.telefone ? esc(formatPhoneDisplay(p.telefone)) : 'sem telefone'} ·
        ${p.recallRows.length ? 'recall' : ''}${p.recallRows.length && p.cirurgiaRows.length ? ' + ' : ''}${p.cirurgiaRows.length ? p.cirurgiaRows.length + ' cirurgia(s)' : ''}</div></div>
    </div>
    <div class="ficha-acoes">
      ${waBtn(p.telefone, waMsgRecall(p.nome), 'WhatsApp')}
      <button type="button" class="btn btn-gemini" id="btn-ficha-resumir">✨ Resumir com Gemini</button>
    </div>
    ${p.recallRows.length ? `<div class="ficha-secao"><h4>recall</h4>${recallHtml}</div>` : ''}
    ${p.cirurgiaRows.length ? `<div class="ficha-secao"><h4>cirurgias e retornos</h4>${cirurgiasHtml}</div>` : ''}
    ${p.cirurgiaRows.length
      ? `<div class="ficha-secao"><h4>prazos de acompanhamento</h4>
        <div class="linha-campos" style="align-items:center">
          <div class="campo-grupo" style="flex:1"><label>template do procedimento</label>
            <select class="campo" id="ficha-tpl">${tplOptions}</select></div>
          <button class="btn btn-claro" id="btn-ficha-override" style="margin-top:14px">${temOverride ? 'editar prazos desta paciente' : 'personalizar prazos desta paciente'}</button>
        </div>
        ${temOverride ? '<div class="celula-sub">⚠ esta paciente usa prazos personalizados (override)</div>' : ''}
        <div id="ficha-override-editor" style="display:none"></div>
      </div>`
      : ''}
    <div class="ficha-secao"><h4>histórico de contato (app)</h4>
      ${extras.historico.length
        ? extras.historico
            .slice()
            .reverse()
            .map(
              (hh) =>
                `<div class="hist-item"><div class="data">${fmt(hh.data)}</div><div><strong style="font-weight:600">${esc(hh.canal)}</strong> · ${esc(hh.resultado)}${hh.nota ? `<div class="celula-sub">${esc(hh.nota)}</div>` : ''}</div></div>`,
            )
            .join('')
        : '<div class="celula-sub">nenhum contato registrado pelo app ainda</div>'}
    </div>
    <div class="modal-rodape">
      <button class="btn btn-azul" id="btn-ficha-fechar">fechar</button>
    </div>`;

  // binds
  $('#btn-ficha-fechar')?.addEventListener('click', () => fechar('veu-ficha'));
  $('#btn-ficha-resumir')?.addEventListener('click', () => gerarResumo(pKey));
  $('#conteudo-ficha').querySelectorAll('[data-contato]').forEach((b) =>
    b.addEventListener('click', () => {
      fechar('veu-ficha');
      abrirContato(b.dataset.contato);
    }),
  );
  $('#conteudo-ficha').querySelectorAll('.sel-marco-ficha').forEach((el) =>
    el.addEventListener('change', () => {
      const c = store.getCirurgiaRow(el.dataset.cir);
      const marco = c && store.marcosDe(c).find((m) => m.id === el.dataset.marco);
      if (marco) {
        store.setMarcoStatus(c, marco, el.value);
        showToast('status atualizado');
        abrirFicha(pKey);
      }
    }),
  );
  $('#ficha-tpl')?.addEventListener('change', (e) => {
    const tplId = e.target.value;
    const padrao = store.appConfig.templates.find((t) => t.padrao)?.id;
    store.atribuirTemplate(pKey, tplId === padrao ? '' : tplId);
    showToast('template atribuído');
    abrirFicha(pKey);
  });
  $('#btn-ficha-override')?.addEventListener('click', () => {
    const box = $('#ficha-override-editor');
    if (box.style.display !== 'none') {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    box.innerHTML =
      marcosEditorHtml(marcosBase, 'ov') +
      `<button class="btn btn-fantasma" id="btn-ficha-override-reset" style="color:var(--coral)">restaurar prazos do template</button>`;
    bindMarcosEditor(box.querySelector('.marcos-editor'), marcosBase, (novos) => {
      store.salvarOverride(pKey, novos);
      showToast('prazos personalizados salvos');
      abrirFicha(pKey);
      $('#ficha-override-editor').style.display = 'block';
    });
    $('#btn-ficha-override-reset')?.addEventListener('click', () => {
      store.salvarOverride(pKey, null);
      showToast('prazos restaurados para o template');
      abrirFicha(pKey);
    });
  });
  bindWa($('#conteudo-ficha'));
  abrir('veu-ficha');
}

/* ---------- REGISTRAR CONTATO (escreve na planilha Recall) ---------- */

function abrirContato(recallKey) {
  const r = store.getRecallRow(recallKey);
  if (!r) return;
  contatoAtual = recallKey;
  $('#contato-sub').textContent = `${r.nome} — grava direto na planilha Recall`;
  $('#c-nota').value = '';
  $('#c-agendada').value = '';
  $('#c-proxima').value = somarDias(isoHoje(), 7);
  abrir('veu-contato');
}

function salvarContato() {
  const r = store.getRecallRow(contatoAtual);
  if (!r) return;
  const status = $('#c-resultado').value;
  const canal = $('#c-canal').value;
  const nota = $('#c-nota').value.trim();
  const agendada = $('#c-agendada').value;
  const proxima = $('#c-proxima').value;

  store.editarCelula('recall', r.key, 'status', status);
  store.editarCelula('recall', r.key, 'dataContato', fmtDataPlanilhaRecall(isoHoje()));
  if (proxima) store.editarCelula('recall', r.key, 'proximoContato', fmtDataPlanilhaRecall(proxima));
  if (agendada) store.editarCelula('recall', r.key, 'dataAgendada', fmtDataPlanilhaRecall(agendada));
  if (nota) store.editarCelula('recall', r.key, 'obs', nota);

  const p = store.pacienteDaLinha(r, 'recall');
  if (p) {
    store.extrasDe(p.key).historico.push({ data: isoHoje(), canal, resultado: status, nota });
    store.salvarExtras();
  }
  fechar('veu-contato');
  showToast('contato salvo na planilha');
}

/* ---------- RESUMO ✨ ---------- */

async function gerarResumo(pKey) {
  const p = store.getPaciente(pKey || resumoAtual || '');
  if (!p) {
    showToast('abra uma paciente primeiro (⌘K)');
    return;
  }
  resumoAtual = p.key;
  abrir('veu-resumo');
  $('#resumo-sub').textContent = p.nome;
  $('#resumo-conteudo').innerHTML =
    '<div class="loading-state"><span class="spinner"></span> Gerando resumo com Gemini…</div>';
  try {
    const snapshot = pacienteSnapshot(p, store);
    const result = await summaryService.summarize(snapshot);
    resumoTexto = result.text;
    const via = { gemini: 'Gemini', local: 'resumo local (sem API)' }[result.provider] || result.provider;
    $('#resumo-sub').textContent = `${p.nome} · ${via}`;
    $('#resumo-conteudo').innerHTML = `<pre class="resumo-texto">${esc(resumoTexto)}</pre>`;
  } catch (e) {
    $('#resumo-conteudo').innerHTML = `<div class="vazio"><strong>Erro</strong>${esc(e.message)}</div>`;
  }
}

function bindResumoModal() {
  $('#btn-resumo-copiar')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(resumoTexto);
    showToast('copiado');
  });
  $('#btn-resumo-regenerar')?.addEventListener('click', () => gerarResumo(resumoAtual));
  $('#btn-resumo-notas')?.addEventListener('click', () => {
    const p = store.getPaciente(resumoAtual);
    const r = p?.recallRows[p.recallRows.length - 1];
    if (r) {
      const novo = (r.obs ? r.obs + ' · ' : '') + resumoTexto.replace(/\n+/g, ' ').slice(0, 400);
      store.editarCelula('recall', r.key, 'obs', novo);
      showToast('inserido em OBSERVAÇÕES da planilha');
    } else {
      showToast('paciente sem linha na planilha Recall');
    }
    fechar('veu-resumo');
  });
  $('#btn-resumo-fechar')?.addEventListener('click', () => fechar('veu-resumo'));
}

/* ---------- EXPORT XLSX ---------- */

function exportarDados() {
  showLoadingToast('gerando XLSX…');
  try {
    const filename = exportToXlsx({
      recallRows: store.recall,
      cirurgiaRows: store.cirurgias,
      headerLabel: headerLabelCirurgias,
    });
    showToast(`✓ ${filename}`);
  } catch (e) {
    showToast('erro: ' + (e.message || 'exportação falhou'));
  }
}

/* ---------- CONFIG / CONEXÃO ---------- */

function bindConfigModal() {
  $('#cfg-webapp').value = store.config.webAppUrl || '';
  $('#cfg-secret').value = store.config.apiSecret || '';
  $('#cfg-url-recall').value = store.config.recallSheetUrl || '';
  $('#cfg-url-cirurgias').value = store.config.cirurgiasSheetUrl || '';

  $('#btn-salvar-config')?.addEventListener('click', async () => {
    const btn = $('#btn-salvar-config');
    btn.classList.add('loading');
    btn.textContent = 'sincronizando…';
    Object.assign(store.config, {
      webAppUrl: $('#cfg-webapp').value.trim(),
      apiSecret: $('#cfg-secret').value.trim(),
      recallSheetUrl: $('#cfg-url-recall').value.trim(),
      cirurgiasSheetUrl: $('#cfg-url-cirurgias').value.trim(),
    });
    store.persistConfig();
    try {
      await syncService.configure(store.config);
      summaryService.setSheetsApi(syncService.api);
      atualizarLinksPlanilhas();
      fechar('veu-config');
      showToast('planilhas conectadas — sync automático ativo');
    } catch (e) {
      showToast('erro: ' + e.message);
    } finally {
      btn.classList.remove('loading');
      btn.textContent = 'conectar e sincronizar';
    }
  });
}

function atualizarLinksPlanilhas() {
  const br = $('#btn-abrir-recall');
  const bc = $('#btn-abrir-cirurgias');
  if (store.config.recallSheetUrl) {
    br.style.display = 'inline-flex';
    br.onclick = () => window.open(store.config.recallSheetUrl, '_blank');
  }
  if (store.config.cirurgiasSheetUrl) {
    bc.style.display = 'inline-flex';
    bc.onclick = () => window.open(store.config.cirurgiasSheetUrl, '_blank');
  }
}

/* ---------- BUSCA ⌘K ---------- */

function abrirBusca() {
  abrir('veu-busca');
  $('#campo-busca').value = '';
  renderizarBusca('');
  setTimeout(() => $('#campo-busca').focus(), 60);
}

function renderizarBusca(termo) {
  const res = store.search(termo);
  buscaIndice = 0;
  $('#busca-resultados').innerHTML = res.length
    ? res
        .map((p, i) => {
          const cir = p.cirurgiaRows[0];
          const rec = p.recallRows[p.recallRows.length - 1];
          const meta = [
            cir ? `cirurgia ${cir.data}` : '',
            rec ? `recall: ${rec.status || '—'}` : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return `
      <div class="busca-item ${i === 0 ? 'marcado' : ''}" data-pk="${p.key}">
        <div class="avatar">${iniciais(p.nome)}</div>
        <div><div class="nome">${esc(p.nome)}</div>
        <div class="meta">${esc(meta || 'sem registros')}</div></div>
      </div>`;
        })
        .join('')
    : '<div class="vazio">nenhuma paciente encontrada</div>';

  $('#busca-resultados').querySelectorAll('.busca-item').forEach((el) =>
    el.addEventListener('click', () => {
      fechar('veu-busca');
      abrirFicha(el.dataset.pk);
    }),
  );
}

/* ---------- navegação / modais ---------- */

function irPara(tela) {
  store.setActiveScreen(tela);
  document.querySelectorAll('.tela').forEach((t) => t.classList.remove('ativa'));
  $('#tela-' + tela).classList.add('ativa');
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === tela));
  $('.principal').scrollTop = 0;
  renderizarTudo();
}

function abrir(id) {
  $('#' + id).classList.add('aberto');
}

function fechar(id) {
  $('#' + id).classList.remove('aberto');
}

/* ---------- init ---------- */

function initApp() {
  gridRecall.o.el = $('#grid-recall');
  gridCirurgias.o.el = $('#grid-cirurgias');
  acompanhamentosScreen = new AcompanhamentosScreen({
    el: $('#acompanhamentos-lista'),
    store,
    toast: showToast,
  });

  document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.tela)));
  $('#btn-alternar-cirurgias')?.addEventListener('click', () => irPara('grid-cirurgias'));
  $('#btn-alternar-recall')?.addEventListener('click', () => irPara('grid-recall'));

  document.querySelectorAll('.veu').forEach((v) =>
    v.addEventListener('mousedown', (e) => {
      if (e.target === v) v.classList.remove('aberto');
    }),
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.veu.aberto').forEach((v) => v.classList.remove('aberto'));
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      abrirBusca();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      const tela = store.filters.tela;
      if (tela === 'grid-recall') {
        e.preventDefault();
        gridRecall.focusBusca();
      } else if (tela === 'grid-cirurgias') {
        e.preventDefault();
        gridCirurgias.focusBusca();
      }
    }
  });

  $('#btn-hoje-recall')?.addEventListener('click', () => {
    irPara('grid-recall');
    store.adicionarLinha('recall');
    gridRecall.render();
  });
  $('#btn-hoje-cirurgia')?.addEventListener('click', () => {
    irPara('grid-cirurgias');
    store.adicionarLinha('cirurgias', { data: fmtDataPlanilhaCirurgias(isoHoje()) });
    gridCirurgias.render();
  });
  $('#btn-nova-cirurgia')?.addEventListener('click', () => {
    irPara('grid-cirurgias');
    store.adicionarLinha('cirurgias', { data: fmtDataPlanilhaCirurgias(somarDias(isoHoje(), 30)) });
    gridCirurgias.render();
  });

  $('#btn-exportar')?.addEventListener('click', exportarDados);
  $('#btn-config')?.addEventListener('click', () => abrir('veu-config'));
  $('#btn-salvar-contato')?.addEventListener('click', salvarContato);
  $('#fab-resumir')?.addEventListener('click', () => {
    if (resumoAtual) gerarResumo(resumoAtual);
    else abrirBusca();
  });

  const debouncedSearch = debounce((v) => renderizarBusca(v), 50);
  $('#campo-busca')?.addEventListener('input', (e) => debouncedSearch(e.target.value));
  $('#campo-busca')?.addEventListener('keydown', (e) => {
    const itens = [...document.querySelectorAll('.busca-item')];
    if (!itens.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buscaIndice = Math.min(buscaIndice + 1, itens.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buscaIndice = Math.max(buscaIndice - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      itens[buscaIndice].click();
      return;
    }
    itens.forEach((el, i) => el.classList.toggle('marcado', i === buscaIndice));
  });

  bindResumoModal();
  bindConfigModal();
  atualizarLinksPlanilhas();
  renderizarTudo();

  if (syncService.configured || (store.config.webAppUrl && store.config.apiSecret)) {
    syncService
      .configure(store.config)
      .then(() => summaryService.setSheetsApi(syncService.api))
      .catch((e) => renderSyncIndicator({ status: 'error', detail: e.message }));
  } else {
    renderSyncIndicator({ status: 'offline', detail: 'Conecte as planilhas Google' });
    setTimeout(() => abrir('veu-config'), 1200);
  }
}

initApp();

export { store, syncService, exportarDados, gerarResumo };
