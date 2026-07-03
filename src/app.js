import { MARCOS, STATUS_RECALL, STATUS_MARCO } from './utils/constants.js';
import { esc, iniciais, debounce } from './utils/helpers.js';
import {
  fmt,
  fmtLonga,
  isoHoje,
  somarDias,
  difDias,
  normalizarData,
} from './utils/dates.js';
import {
  emPosOp,
  emPreOp,
  proximoMarco,
  estadoMarco,
  ultimoContato,
  touchPatient,
} from './utils/patientModel.js';
import { parsePhone, formatPhoneDisplay, buildWhatsAppLink } from './utils/phone.js';
import { Store } from './services/store.js';
import { SyncService } from './services/syncService.js';
import { SummaryService } from './services/summaryService.js';
import { exportToXlsx } from './services/exportService.js';
import { loadConfig, saveConfig } from './services/storage.js';
import { showToast, showLoadingToast } from './components/Toast.js';
import { whatsAppButtonHtml, bindWhatsAppButtons } from './components/WhatsAppButton.js';
import { renderSyncIndicator, closeSummaryModal } from './components/SummaryModal.js';
import { setupAutoSave, setupFormKeyboardNav, focusFirstField } from './hooks/useFormUX.js';

const $ = (s) => document.querySelector(s);

let editando = null;
let contatoAtual = null;
let summaryPatientId = null;
let summaryText = '';
let csvLinhas = null;
let csvCabecalho = null;
let buscaIndice = 0;

const syncService = new SyncService(null);
const store = new Store({
  syncService,
  onChange: () => renderizarTudo(),
});
syncService.store = store;

const config = loadConfig();
const summaryService = new SummaryService({ geminiApiKey: config.geminiApiKey });
syncService.configure(config);
syncService.onStatus((s) => renderSyncIndicator(s));

function renderizarTudo() {
  renderizarHoje();
  renderizarRetornos();
  renderizarRecall();
  renderizarPreop();
  renderizarBadges();
  bindWhatsAppButtons();
}

function waMsgRetorno(p) {
  const px = proximoMarco(p);
  return `Olá, ${p.nome.split(' ')[0]}! Aqui é a Helen, da blue. Estou entrando em contato para agendarmos o seu retorno${px ? ' de ' + px.m.rotulo : ''} com o Dr. Rafael. Qual o melhor dia para você?`;
}

function waMsgRecall(p) {
  return `Olá, ${p.nome.split(' ')[0]}! Aqui é a Helen, da blue. Como você está? Estou entrando em contato para saber como tem sido a sua evolução e ver se podemos agendar uma avaliação com o Dr. Rafael.`;
}

function renderizarBadges() {
  const pts = store.patients;
  const atrasados = pts.filter((p) => emPosOp(p) && MARCOS.some((m) => estadoMarco(p, m) === 'atrasado')).length;
  const recallsHoje = pts.filter(
    (p) => p.recall.proxima && difDias(p.recall.proxima) <= 0 && !['arquivada', 'reativada'].includes(p.recall.status),
  ).length;
  const preopCritico = pts.filter((p) => emPreOp(p) && difDias(p.dataCirurgia) <= 10 && p.exames.some((e) => !e.feito)).length;
  $('#badge-retornos').textContent = atrasados || '';
  $('#badge-recall').textContent = recallsHoje || '';
  $('#badge-preop').textContent = preopCritico || '';
  $('#badge-hoje').textContent = atrasados + recallsHoje + preopCritico || '';
}

function renderizarHoje() {
  const h = new Date().getHours();
  const s = h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite';
  $('#saudacao').innerHTML = `${s}, Helen<span class="ponto">.</span>`;
  $('#data-hoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const retornos = [];
  store.patients.filter(emPosOp).forEach((p) => {
    const px = proximoMarco(p);
    if (!px) return;
    const dd = difDias(px.mc.data);
    if (dd <= 7) retornos.push({ p, px, dd });
  });
  retornos.sort((x, y) => x.dd - y.dd);

  const recalls = store.patients
    .filter((p) => p.recall.proxima && difDias(p.recall.proxima) <= 0 && !['arquivada', 'reativada'].includes(p.recall.status))
    .sort((x, y) => difDias(x.recall.proxima) - difDias(y.recall.proxima));

  const preops = store.patients
    .filter((p) => emPreOp(p) && p.exames.some((e) => !e.feito))
    .sort((x, y) => difDias(x.dataCirurgia) - difDias(y.dataCirurgia))
    .slice(0, 6);

  const bloco = (titulo, itens, vazioTitulo, vazioSub) => `
    <div class="cartao bloco-hoje">
      <h2>${titulo} <span class="contagem">${itens.length}</span></h2>
      ${itens.length ? itens.join('') : `<div class="vazio"><strong>${vazioTitulo}</strong>${vazioSub}</div>`}
    </div>`;

  const itensRet = retornos.map(({ p, px, dd }) => {
    const selo =
      dd < 0
        ? `<span class="selo selo-coral">atrasado ${Math.abs(dd)}d</span>`
        : dd === 0
          ? `<span class="selo selo-ambar">é hoje</span>`
          : `<span class="selo selo-azul">em ${dd}d</span>`;
    return `<div class="item-fila" data-ficha="${p.id}">
      <div class="info"><div class="nome">${esc(p.nome)}</div>
      <div class="detalhe">retorno de ${px.m.rotulo} · ${fmt(px.mc.data)} · ${px.mc.status}</div></div>${selo}</div>`;
  });

  const itensRec = recalls.map((p) => {
    const uc = ultimoContato(p);
    return `<div class="item-fila" data-ficha="${p.id}">
      <div class="info"><div class="nome">${esc(p.nome)}</div>
      <div class="detalhe">${uc ? 'último contato em ' + fmt(uc.data) + ' · ' + uc.resultado : 'nenhum contato registrado'}</div></div>
      <button class="btn btn-claro btn-contato" data-id="${p.id}" style="padding:6px 12px;font-size:.72rem">registrar</button></div>`;
  });

  const itensPre = preops.map((p) => {
    const dd = difDias(p.dataCirurgia);
    const pend = p.exames.filter((e) => !e.feito).length;
    const selo = dd <= 7 ? 'selo-coral' : dd <= 15 ? 'selo-ambar' : 'selo-azul';
    return `<div class="item-fila" data-nav="preop">
      <div class="info"><div class="nome">${esc(p.nome)}</div>
      <div class="detalhe">${pend} exame${pend > 1 ? 's' : ''} pendente${pend > 1 ? 's' : ''} · cirurgia em ${fmt(p.dataCirurgia)}</div></div>
      <span class="selo ${selo}">${dd === 0 ? 'é hoje' : 'faltam ' + dd + 'd'}</span></div>`;
  });

  const temExemplo = store.patients.some((p) => p.exemplo);
  $('#grade-hoje').innerHTML =
    bloco('retornos desta semana', itensRet, 'tudo em dia', 'nenhum retorno vencendo nos próximos 7 dias') +
    bloco('recall para hoje', itensRec, 'fila limpa', 'nenhuma paciente aguardando contato hoje') +
    bloco('pré-op em atenção', itensPre, 'exames em dia', 'nenhuma pendência de exame no momento') +
    (temExemplo
      ? `<div style="grid-column:1/-1;text-align:center;padding-top:4px">
      <button class="btn btn-fantasma" id="btn-limpar-exemplos">estes são dados de exemplo — clique para removê-los e começar do zero</button></div>`
      : '');

  $('#grade-hoje').querySelectorAll('[data-ficha]').forEach((el) => {
    el.addEventListener('click', () => abrirFicha(el.dataset.ficha));
  });
  $('#grade-hoje').querySelectorAll('.btn-contato').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirContato(el.dataset.id);
    });
  });
  $('#btn-limpar-exemplos')?.addEventListener('click', limparExemplos);
  $('#grade-hoje').querySelector('[data-nav="preop"]')?.addEventListener('click', () => irPara('preop'));
}

function renderizarRetornos() {
  const filtroRetornos = store.filters.retornos;
  const filtros = [{ id: 'todos', rotulo: 'todos' }, { id: 'atrasados', rotulo: 'atrasados' }, ...MARCOS.map((m) => ({ id: m.id, rotulo: m.rotulo }))];
  $('#filtros-retornos').innerHTML = filtros
    .map(
      (f) =>
        `<button class="filtro ${filtroRetornos === f.id ? 'ativo' : ''}" data-filtro-ret="${f.id}">${f.rotulo}</button>`,
    )
    .join('');

  $('#filtros-retornos').querySelectorAll('[data-filtro-ret]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setFilter('retornos', btn.dataset.filtroRet);
      renderizarRetornos();
    });
  });

  let lista = store.exportFilteredPatients();
  lista.sort((a, b) => {
    const pa = proximoMarco(a),
      pb = proximoMarco(b);
    return (pa ? difDias(pa.mc.data) : 9999) - (pb ? difDias(pb.mc.data) : 9999);
  });

  $('#corpo-retornos').innerHTML = lista.length
    ? lista
        .map((p) => {
          const px = proximoMarco(p);
          const trilho =
            `<div class="trilho">` +
            MARCOS.map(
              (m) =>
                `<div class="no ${estadoMarco(p, m)}"><div class="bola"></div><div class="rotulo">${m.rotulo.replace(' dias', 'd').replace(' mês', 'm').replace(' meses', 'm').replace(' ano', 'a')}</div></div>`,
            ).join('') +
            `</div>`;
          const proximo = px
            ? `<div style="font-weight:600">${px.m.rotulo}</div><div class="celula-sub">${fmtLonga(px.mc.data)}${difDias(px.mc.data) < 0 ? ' · <span style="color:var(--coral);font-weight:600">' + Math.abs(difDias(px.mc.data)) + 'd de atraso</span>' : ''}</div>`
            : `<span class="selo selo-verde">jornada completa</span>`;
          const statusSel = px
            ? `<select class="campo mini sel-marco" data-id="${p.id}" data-marco="${px.m.id}">` +
              STATUS_MARCO.map((s) => `<option ${px.mc.status === s ? 'selected' : ''}>${s}</option>`).join('') +
              `</select>`
            : '—';
          return `<tr>
      <td><div class="celula-nome" data-ficha="${p.id}">${esc(p.nome)}</div><div class="celula-sub">${esc(p.procedimento || '—')} · operada em ${fmt(p.dataCirurgia)}</div></td>
      <td>${trilho}</td>
      <td>${proximo}</td>
      <td>${statusSel}</td>
      <td style="white-space:nowrap;text-align:right">
        ${whatsAppButtonHtml(p, waMsgRetorno(p))}
        ${p.notion ? `<button class="btn btn-fantasma btn-notion" data-url="${esc(p.notion)}" title="abrir no notion">↗</button>` : ''}
      </td></tr>`;
        })
        .join('')
    : `<tr><td colspan="5"><div class="vazio"><strong>nenhuma paciente aqui</strong>cadastre uma paciente pós-operatória ou importe a planilha</div></td></tr>`;

  $('#corpo-retornos').querySelectorAll('[data-ficha]').forEach((el) => {
    el.addEventListener('click', () => abrirFicha(el.dataset.ficha));
  });
  $('#corpo-retornos').querySelectorAll('.sel-marco').forEach((el) => {
    el.addEventListener('change', () => mudarMarco(el.dataset.id, el.dataset.marco, el.value));
  });
  $('#corpo-retornos').querySelectorAll('.btn-notion').forEach((el) => {
    el.addEventListener('click', () => window.open(el.dataset.url));
  });
}

function renderizarRecall() {
  const filtroRecall = store.filters.recall;
  const filtros = [{ id: 'ativos', rotulo: 'ativos' }, { id: 'todos', rotulo: 'todos' }, ...STATUS_RECALL.map((s) => ({ id: s, rotulo: s }))];
  $('#filtros-recall').innerHTML = filtros
    .map((f) => `<button class="filtro ${filtroRecall === f.id ? 'ativo' : ''}" data-filtro-rec="${f.id}">${f.rotulo}</button>`)
    .join('');

  $('#filtros-recall').querySelectorAll('[data-filtro-rec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setFilter('recall', btn.dataset.filtroRec);
      renderizarRecall();
    });
  });

  const lista = store.exportFilteredPatients();
  lista.sort((a, b) => {
    const da = a.recall.proxima ? difDias(a.recall.proxima) : 999;
    const db = b.recall.proxima ? difDias(b.recall.proxima) : 999;
    return da - db;
  });

  $('#corpo-recall').innerHTML = lista.length
    ? lista
        .map((p) => {
          const uc = ultimoContato(p);
          const prox = p.recall.proxima;
          const dd = prox ? difDias(prox) : null;
          return `<tr>
      <td><div class="celula-nome" data-ficha="${p.id}">${esc(p.nome)}</div><div class="celula-sub">${esc(p.procedimento || '—')}</div></td>
      <td>${uc ? fmt(uc.data) + `<div class="celula-sub">${uc.canal} · ${uc.resultado}</div>` : '<span class="celula-sub">nunca contatada</span>'}</td>
      <td>${p.recall.historico.length}</td>
      <td>${prox ? `<span class="selo ${dd < 0 ? 'selo-coral' : dd === 0 ? 'selo-ambar' : 'selo-azul'}">${dd < 0 ? 'venceu há ' + Math.abs(dd) + 'd' : dd === 0 ? 'hoje' : 'em ' + dd + 'd'}</span><div class="celula-sub">${fmt(prox)}</div>` : '—'}</td>
      <td><select class="campo mini sel-recall" data-id="${p.id}">${STATUS_RECALL.map((s) => `<option ${p.recall.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td style="white-space:nowrap;text-align:right">
        <button class="btn btn-claro btn-contato" data-id="${p.id}" style="padding:6px 12px;font-size:.72rem">registrar contato</button>
        ${whatsAppButtonHtml(p, waMsgRecall(p))}
      </td></tr>`;
        })
        .join('')
    : `<tr><td colspan="6"><div class="vazio"><strong>fila de recall vazia</strong>importe a planilha de recall ou registre contatos pelas fichas</div></td></tr>`;

  $('#corpo-recall').querySelectorAll('[data-ficha]').forEach((el) => {
    el.addEventListener('click', () => abrirFicha(el.dataset.ficha));
  });
  $('#corpo-recall').querySelectorAll('.sel-recall').forEach((el) => {
    el.addEventListener('change', () => mudarRecall(el.dataset.id, el.value));
  });
  $('#corpo-recall').querySelectorAll('.btn-contato').forEach((el) => {
    el.addEventListener('click', () => abrirContato(el.dataset.id));
  });
}

function renderizarPreop() {
  const lista = store.exportFilteredPatients().sort((a, b) => difDias(a.dataCirurgia) - difDias(b.dataCirurgia));
  $('#grade-preop').innerHTML = lista.length
    ? lista
        .map((p) => {
          const dd = difDias(p.dataCirurgia);
          const feitos = p.exames.filter((e) => e.feito).length,
            total = p.exames.length;
          const pct = total ? Math.round((feitos / total) * 100) : 0;
          const cor = dd <= 7 && feitos < total ? 'var(--coral)' : dd <= 15 && feitos < total ? 'var(--ambar)' : 'var(--verde)';
          return `<div class="cartao cartao-preop">
      <div class="preop-topo">
        <div><div class="nome" data-ficha="${p.id}">${esc(p.nome)}</div>
        <div class="proc">${esc(p.procedimento || '—')} · ${fmtLonga(p.dataCirurgia)}</div></div>
        <div class="contagem-regressiva"><div class="dias" style="color:${cor}">${dd === 0 ? 'hoje' : dd}</div>
        <div class="rotulo">${dd === 0 ? 'é o dia' : 'dias'}</div></div>
      </div>
      <div class="legenda-exames"><span>exames</span><span>${feitos} de ${total}</span></div>
      <div class="barra-exames"><div style="width:${pct}%;background:${cor}"></div></div>
      <div class="lista-exames">${p.exames
        .map(
          (e, i) => `
        <div class="exame ${e.feito ? 'feito' : ''}" data-exame="${p.id}:${i}">
          <div class="caixa"></div><span>${esc(e.nome)}</span>
          <button class="remover btn-rem-exame" data-id="${p.id}" data-i="${i}">×</button>
        </div>`,
        )
        .join('')}
      </div>
      <div class="add-exame">
        <input class="campo add-exame-input" data-id="${p.id}" placeholder="adicionar exame">
      </div>
      <div class="preop-rodape">
        ${feitos === total ? '<span class="selo selo-verde">tudo pronto para a cirurgia</span>' : `<span class="selo ${dd <= 7 ? 'selo-coral' : dd <= 15 ? 'selo-ambar' : 'selo-azul'}">${total - feitos} pendente${total - feitos > 1 ? 's' : ''}</span>`}
        ${whatsAppButtonHtml(p, waMsgRecall(p), { label: 'WhatsApp' })}
      </div>
    </div>`;
        })
        .join('')
    : `<div class="cartao bloco-hoje" style="grid-column:1/-1"><div class="vazio"><strong>nenhuma cirurgia marcada</strong>cadastre uma nova cirurgia ou importe a planilha de pré-op</div></div>`;

  $('#grade-preop').querySelectorAll('[data-ficha]').forEach((el) => {
    el.addEventListener('click', () => abrirFicha(el.dataset.ficha));
  });
  $('#grade-preop').querySelectorAll('[data-exame]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-rem-exame')) return;
      const [id, i] = el.dataset.exame.split(':');
      alternarExame(id, +i);
    });
  });
  $('#grade-preop').querySelectorAll('.btn-rem-exame').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      removerExame(el.dataset.id, +el.dataset.i);
    });
  });
  $('#grade-preop').querySelectorAll('.add-exame-input').forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        adicionarExame(el.dataset.id, el.value);
        el.value = '';
      }
    });
  });
}

function mudarMarco(id, marcoId, valor) {
  const p = store.getPatient(id);
  if (!p) return;
  p.marcos[marcoId].status = valor;
  touchPatient(p);
  store.updatePatientLocal(p);
  showToast(valor === 'realizado' ? 'retorno concluído' : 'status atualizado');
}

function mudarRecall(id, valor) {
  const p = store.getPatient(id);
  if (!p) return;
  p.recall.status = valor;
  if (valor === 'reativada' || valor === 'arquivada') p.recall.proxima = '';
  touchPatient(p);
  store.updatePatientLocal(p);
  showToast('status de recall atualizado');
}

function abrirContato(id) {
  contatoAtual = id;
  const p = store.getPatient(id);
  $('#contato-sub').textContent = p.nome;
  $('#c-nota').value = '';
  $('#c-proxima').value = somarDias(isoHoje(), 7);
  abrir('veu-contato');
}

function salvarContato() {
  const p = store.getPatient(contatoAtual);
  if (!p) return;
  const resultado = $('#c-resultado').value;
  p.recall.historico.push({
    data: isoHoje(),
    canal: $('#c-canal').value,
    resultado,
    nota: $('#c-nota').value.trim(),
  });
  p.recall.proxima = $('#c-proxima').value;
  if (resultado === 'respondeu — agendou') p.recall.status = 'reativada';
  else if (resultado.startsWith('respondeu')) p.recall.status = 'em contato';
  else if (p.recall.historico.filter((h) => h.resultado === 'não respondeu').length >= 3)
    p.recall.status = 'sem resposta';
  touchPatient(p);
  store.updatePatientLocal(p);
  fechar('veu-contato');
  showToast('contato registrado');
}

function alternarExame(id, i) {
  const p = store.getPatient(id);
  p.exames[i].feito = !p.exames[i].feito;
  touchPatient(p);
  store.updatePatientLocal(p);
}

function removerExame(id, i) {
  const p = store.getPatient(id);
  p.exames.splice(i, 1);
  touchPatient(p);
  store.updatePatientLocal(p);
}

function adicionarExame(id, nome) {
  nome = nome.trim();
  if (!nome) return;
  const p = store.getPatient(id);
  p.exames.push({ nome, feito: false });
  touchPatient(p);
  store.updatePatientLocal(p);
  showToast('exame adicionado');
}

function abrirFicha(id) {
  summaryPatientId = id;
  const p = store.getPatient(id);
  if (!p) return;
  const hist = p.recall.historico
    .slice()
    .reverse()
    .map(
      (h) =>
        `<div class="hist-item"><div class="data">${fmt(h.data)}</div><div><strong style="font-weight:600">${h.canal}</strong> · ${h.resultado}${h.nota ? `<div class="celula-sub">${esc(h.nota)}</div>` : ''}</div></div>`,
    )
    .join('');
  $('#conteudo-ficha').innerHTML = `
    <div class="ficha-topo">
      <div class="avatar">${iniciais(p.nome)}</div>
      <div><div class="nome">${esc(p.nome)}</div>
      <div class="meta">${esc(p.procedimento || 'sem procedimento')} · ${p.dataCirurgia ? 'cirurgia em ' + fmtLonga(p.dataCirurgia) : 'sem data de cirurgia'}</div></div>
    </div>
    <div class="ficha-acoes">
      ${buildWhatsAppLink(p.telefone) ? `<button class="btn btn-wa btn-wa-ficha" data-id="${p.id}">WhatsApp</button>` : ''}
      ${p.notion ? `<button class="btn btn-claro btn-notion-ficha" data-url="${esc(p.notion)}">cronograma no notion ↗</button>` : ''}
      <button class="btn btn-claro" id="btn-ficha-contato">registrar contato</button>
      <button class="btn btn-claro" id="btn-ficha-resumir">✨ Resumir</button>
      <button class="btn btn-claro" id="btn-ficha-editar">editar dados</button>
    </div>
    ${emPosOp(p) ? `<div class="ficha-secao"><h4>jornada pós-op</h4>
      <div class="trilho" style="max-width:380px">${MARCOS.map((m) => `<div class="no ${estadoMarco(p, m)}"><div class="bola"></div><div class="rotulo">${m.rotulo}</div></div>`).join('')}</div></div>` : ''}
    ${p.obs ? `<div class="ficha-secao"><h4>observações</h4><div style="font-size:.85rem">${esc(p.obs)}</div></div>` : ''}
    <div class="ficha-secao"><h4>histórico de contato</h4>${hist || '<div class="celula-sub">nenhum contato registrado ainda</div>'}</div>
    <div class="modal-rodape">
      <button class="btn btn-fantasma btn-excluir" data-id="${p.id}" style="color:var(--coral)">excluir paciente</button>
      <button class="btn btn-azul" id="btn-ficha-fechar">fechar</button>
    </div>`;

  $('#btn-ficha-fechar')?.addEventListener('click', () => fechar('veu-ficha'));
  $('#btn-ficha-contato')?.addEventListener('click', () => {
    fechar('veu-ficha');
    abrirContato(p.id);
  });
  $('#btn-ficha-editar')?.addEventListener('click', () => editarPaciente(p.id));
  $('#btn-ficha-resumir')?.addEventListener('click', () => gerarResumo(p.id));
  $('.btn-wa-ficha')?.addEventListener('click', () => window.open(buildWhatsAppLink(p.telefone), '_blank'));
  $('.btn-notion-ficha')?.addEventListener('click', (e) => window.open(e.target.dataset.url));
  $('.btn-excluir')?.addEventListener('click', () => excluirPaciente(p.id));
  abrir('veu-ficha');
}

function excluirPaciente(id) {
  const p = store.getPatient(id);
  if (!confirm('Excluir ' + p.nome + '? Esta ação não pode ser desfeita.')) return;
  store.deletePatient(id);
  fechar('veu-ficha');
  showToast('paciente excluída');
}

function abrirNovaPaciente(preop) {
  editando = null;
  $('#titulo-paciente').innerHTML = 'nova paciente<span class="ponto">.</span>';
  ['p-nome', 'p-fone', 'p-proc', 'p-data', 'p-notion', 'p-obs'].forEach((i) => ($('#' + i).value = ''));
  $('#p-fase').value = preop === true ? 'preop' : 'preop';
  $('#fone-hint').textContent = '';
  $('#p-fone').classList.remove('invalid');
  abrir('veu-paciente');
  focusFirstField($('#veu-paciente .modal'));
}

function editarPaciente(id) {
  const p = store.getPatient(id);
  if (!p) return;
  editando = id;
  fechar('veu-ficha');
  $('#titulo-paciente').innerHTML = 'editar paciente<span class="ponto">.</span>';
  $('#p-nome').value = p.nome;
  $('#p-fone').value = formatPhoneDisplay(p.telefone) || p.telefone;
  $('#p-proc').value = p.procedimento;
  $('#p-data').value = p.dataCirurgia;
  $('#p-fase').value = p.fase;
  $('#p-notion').value = p.notion;
  $('#p-obs').value = p.obs;
  abrir('veu-paciente');
}

function salvarPaciente(opts = {}) {
  const nome = $('#p-nome').value.trim();
  if (!nome) {
    showToast('informe o nome da paciente');
    $('#p-nome').classList.add('invalid');
    return;
  }
  const base = {
    nome,
    telefone: $('#p-fone').value.trim(),
    procedimento: $('#p-proc').value.trim(),
    dataCirurgia: $('#p-data').value,
    fase: $('#p-fase').value,
    notion: $('#p-notion').value.trim(),
    obs: $('#p-obs').value.trim(),
  };
  if (editando) {
    store.updatePatient(editando, base);
    if (!opts.auto) showToast('dados atualizados');
  } else {
    store.createPatient(base);
    if (!opts.auto) showToast('paciente cadastrada');
    editando = store.patients[store.patients.length - 1]?.id;
  }
  if (!opts.auto) {
    fechar('veu-paciente');
    editando = null;
  }
}

function limparExemplos() {
  store.clearExamples();
  showToast('exemplos removidos');
}

async function exportarDados() {
  const patients = store.exportFilteredPatients();
  if (!patients.length) {
    showToast('nenhum registro para exportar');
    return;
  }
  showLoadingToast('exportando…');
  try {
    const filename = exportToXlsx(patients);
    showToast(`exportado: ${filename}`);
  } catch (e) {
    showToast('erro na exportação');
  }
}

async function gerarResumo(id, regenerate = false) {
  const p = store.getPatient(id || summaryPatientId);
  if (!p) return;
  summaryPatientId = p.id;
  abrir('veu-resumo');
  $('#resumo-conteudo').innerHTML = '<div class="loading-state"><span class="spinner"></span> Gerando resumo…</div>';

  try {
    const result = await summaryService.summarize(p, { preferAi: regenerate || Boolean(config.geminiApiKey) });
    summaryText = result.text;
    $('#resumo-sub').textContent = `${p.nome} · via ${result.provider}`;
    $('#resumo-conteudo').innerHTML = `<pre class="resumo-texto">${esc(summaryText)}</pre>`;
  } catch (e) {
    $('#resumo-conteudo').innerHTML = `<div class="vazio"><strong>Erro</strong>${esc(e.message)}</div>`;
  }
}

function bindSummaryModal() {
  $('#btn-resumo-copiar')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(summaryText);
    showToast('copiado');
  });
  $('#btn-resumo-regenerar')?.addEventListener('click', () => gerarResumo(summaryPatientId, true));
  $('#btn-resumo-notas')?.addEventListener('click', () => {
    const p = store.getPatient(summaryPatientId);
    if (!p) return;
    const block = '\n\n--- Resumo ---\n' + summaryText;
    p.obs = (p.obs || '') + block;
    touchPatient(p);
    store.updatePatientLocal(p);
    showToast('inserido em observações');
    closeSummaryModal();
  });
  $('#btn-resumo-fechar')?.addEventListener('click', () => closeSummaryModal());
}

function bindConfigModal() {
  $('#cfg-webapp').value = config.webAppUrl || '';
  $('#cfg-secret').value = config.apiSecret || '';
  $('#cfg-gemini').value = config.geminiApiKey || '';

  $('#btn-salvar-config')?.addEventListener('click', () => {
    const next = {
      webAppUrl: $('#cfg-webapp').value.trim(),
      apiSecret: $('#cfg-secret').value.trim(),
      geminiApiKey: $('#cfg-gemini').value.trim(),
      lastSyncAt: config.lastSyncAt,
    };
    Object.assign(config, next);
    saveConfig(config);
    summaryService.setGeminiKey(next.geminiApiKey);
    syncService.configure(next);
    fechar('veu-config');
    showToast('configuração salva');
  });
}

function validatePhoneInput() {
  const el = $('#p-fone');
  const hint = $('#fone-hint');
  const v = el.value.trim();
  if (!v) {
    el.classList.remove('invalid');
    hint.textContent = '';
    hint.className = 'campo-hint';
    return;
  }
  const p = parsePhone(v);
  if (p.valid) {
    el.classList.remove('invalid');
    hint.textContent = p.display;
    hint.className = 'campo-ok';
  } else {
    el.classList.add('invalid');
    hint.textContent = 'número inválido';
    hint.className = 'campo-hint';
  }
}

/* CSV import — preserved from v1 */
const CAMPOS_IMPORT = [
  { id: 'nome', rotulo: 'nome da paciente (obrigatório)' },
  { id: 'telefone', rotulo: 'telefone / whatsapp' },
  { id: 'procedimento', rotulo: 'procedimento' },
  { id: 'dataCirurgia', rotulo: 'data da cirurgia' },
  { id: 'proxima', rotulo: 'próxima ação / próximo contato (recall)' },
  { id: 'obs', rotulo: 'observações' },
  { id: '', rotulo: '— ignorar esta coluna —' },
];

function abrirImportar(tipo) {
  csvLinhas = null;
  csvCabecalho = null;
  $('#mapa-colunas').innerHTML = '';
  $('#btn-confirmar-import').style.display = 'none';
  if (tipo) $('#imp-tipo').value = tipo;
  abrir('veu-importar');
}

function parseCSV(texto) {
  const linhas = [];
  let linha = [],
    campo = '',
    aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else {
      if (c === '"') aspas = true;
      else if (c === ',' || c === ';') {
        linha.push(campo);
        campo = '';
      } else if (c === '\n' || c === '\r') {
        if (campo !== '' || linha.length) {
          linha.push(campo);
          linhas.push(linha);
          linha = [];
          campo = '';
        }
        if (c === '\r' && texto[i + 1] === '\n') i++;
      } else campo += c;
    }
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((x) => x.trim() !== ''));
}

function adivinharCampo(cab) {
  const c = cab.toLowerCase();
  if (/nome|paciente/.test(c)) return 'nome';
  if (/tel|whats|celular|fone|contato/.test(c)) return 'telefone';
  if (/proced|cirurgia(?!.*data)|tipo/.test(c) && !/data/.test(c)) return 'procedimento';
  if (/data.*(cirurgia|opera)|cirurgia.*data|dt.*cir/.test(c)) return 'dataCirurgia';
  if (/próxim|proxim|retorno|recall|ação|acao/.test(c)) return 'proxima';
  if (/obs|nota|coment/.test(c)) return 'obs';
  if (/^data$/.test(c)) return 'dataCirurgia';
  return '';
}

function prepararArquivo(file) {
  const leitor = new FileReader();
  leitor.onload = (e) => {
    const linhas = parseCSV(e.target.result);
    if (linhas.length < 2) {
      showToast('a planilha parece vazia');
      return;
    }
    csvCabecalho = linhas[0];
    csvLinhas = linhas.slice(1);
    $('#mapa-colunas').innerHTML =
      `<div style="font-size:.74rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--tinta-suave);margin-bottom:2px">confira o mapeamento — ${csvLinhas.length} linha${csvLinhas.length > 1 ? 's' : ''} encontrada${csvLinhas.length > 1 ? 's' : ''}</div>` +
      csvCabecalho
        .map(
          (cab, i) => `
        <div class="mapa-linha">
          <div class="origem" title="${esc(cab)}">${esc(cab || 'coluna ' + (i + 1))}</div>
          <div class="seta">→</div>
          <select class="campo mini" data-coluna="${i}">
            ${CAMPOS_IMPORT.map((f) => `<option value="${f.id}" ${adivinharCampo(cab) === f.id ? 'selected' : ''}>${f.rotulo}</option>`).join('')}
          </select>
        </div>`,
        )
        .join('');
    $('#btn-confirmar-import').style.display = 'inline-flex';
  };
  leitor.readAsText(file, 'utf-8');
}

function confirmarImportacao() {
  const tipo = $('#imp-tipo').value;
  const mapa = {};
  document.querySelectorAll('#mapa-colunas select').forEach((s) => {
    if (s.value) mapa[s.dataset.coluna] = s.value;
  });
  if (!Object.values(mapa).includes('nome')) {
    showToast('mapeie a coluna do nome da paciente');
    return;
  }

  let novas = 0,
    atualizadas = 0;
  csvLinhas.forEach((linha) => {
    const reg = {};
    Object.entries(mapa).forEach(([col, campo]) => (reg[campo] = (linha[col] || '').trim()));
    if (!reg.nome) return;
    let p = store.patients.find((x) => x.nome.toLowerCase() === reg.nome.toLowerCase());
    const dataCir = normalizarData(reg.dataCirurgia);
    if (!p) {
      p = store.createPatient({
        nome: reg.nome,
        telefone: reg.telefone || '',
        procedimento: reg.procedimento || '',
        dataCirurgia: dataCir,
        obs: reg.obs || '',
        fase: tipo === 'preop' ? 'preop' : 'posop',
      });
      novas++;
    } else {
      store.updatePatient(p.id, {
        telefone: reg.telefone || p.telefone,
        procedimento: reg.procedimento || p.procedimento,
        dataCirurgia: dataCir || p.dataCirurgia,
        obs: reg.obs || p.obs,
      });
      atualizadas++;
    }
    if (tipo === 'recall') {
      const prox = normalizarData(reg.proxima);
      p.recall.proxima = prox || p.recall.proxima || isoHoje();
      if (['reativada', 'arquivada'].includes(p.recall.status)) p.recall.status = 'aguardando contato';
      touchPatient(p);
      store.updatePatientLocal(p);
    }
  });
  fechar('veu-importar');
  showToast(`importação concluída — ${novas} nova${novas !== 1 ? 's' : ''}, ${atualizadas} atualizada${atualizadas !== 1 ? 's' : ''}`);
}

function irPara(tela) {
  store.setActiveScreen(tela);
  document.querySelectorAll('.tela').forEach((t) => t.classList.remove('ativa'));
  $('#tela-' + tela).classList.add('ativa');
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === tela));
  $('.principal').scrollTop = 0;
}

function abrir(id) {
  $('#' + id).classList.add('aberto');
}

function fechar(id) {
  $('#' + id).classList.remove('aberto');
}

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
        .map(
          (p, i) => `
    <div class="busca-item ${i === 0 ? 'marcado' : ''}" data-id="${p.id}">
      <div class="avatar">${iniciais(p.nome)}</div>
      <div><div class="nome">${esc(p.nome)}</div>
      <div class="meta">${esc(p.procedimento || '—')} · ${emPreOp(p) ? 'pré-op' : 'pós-op'}${p.dataCirurgia ? ' · cirurgia ' + fmt(p.dataCirurgia) : ''}</div></div>
    </div>`,
        )
        .join('')
    : '<div class="vazio">nenhuma paciente encontrada</div>';

  $('#busca-resultados').querySelectorAll('.busca-item').forEach((el) => {
    el.addEventListener('click', () => {
      fechar('veu-busca');
      abrirFicha(el.dataset.id);
    });
  });
}

function initApp() {
  document.querySelectorAll('#nav button').forEach((b) => {
    b.addEventListener('click', () => irPara(b.dataset.tela));
  });

  document.querySelectorAll('.veu').forEach((v) => {
    v.addEventListener('mousedown', (e) => {
      if (e.target === v) v.classList.remove('aberto');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.veu.aberto').forEach((v) => v.classList.remove('aberto'));
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      abrirBusca();
    }
  });

  $('#btn-nova-paciente')?.addEventListener('click', () => abrirNovaPaciente());
  $('#btn-nova-paciente-ret')?.addEventListener('click', () => abrirNovaPaciente());
  $('#btn-nova-cirurgia')?.addEventListener('click', () => abrirNovaPaciente(true));
  $('#btn-importar')?.addEventListener('click', () => abrirImportar());
  $('#btn-importar-recall')?.addEventListener('click', () => abrirImportar('recall'));
  $('#btn-exportar')?.addEventListener('click', () => exportarDados());
  $('#btn-config')?.addEventListener('click', () => abrir('veu-config'));
  $('#btn-salvar-paciente')?.addEventListener('click', () => salvarPaciente());
  $('#btn-salvar-contato')?.addEventListener('click', () => salvarContato());
  $('#btn-confirmar-import')?.addEventListener('click', () => confirmarImportacao());
  $('#fab-resumir')?.addEventListener('click', () => {
    const active = summaryPatientId || store.patients[0]?.id;
    if (active) gerarResumo(active);
    else showToast('cadastre uma paciente primeiro');
  });

  $('#p-fone')?.addEventListener('input', debounce(validatePhoneInput, 200));

  const formPaciente = $('#veu-paciente .modal');
  if (formPaciente) {
    setupFormKeyboardNav(formPaciente);
    setupAutoSave(
      formPaciente,
      () => ({
        nome: $('#p-nome').value.trim(),
        telefone: $('#p-fone').value.trim(),
        procedimento: $('#p-proc').value.trim(),
        dataCirurgia: $('#p-data').value,
        fase: $('#p-fase').value,
        notion: $('#p-notion').value.trim(),
        obs: $('#p-obs').value.trim(),
      }),
      (values, opts) => {
        if (editando && values.nome) salvarPaciente(opts);
      },
    );
  }

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

  const zona = $('#zona-solta');
  const inputCSV = $('#arquivo-csv');
  zona?.addEventListener('click', () => inputCSV.click());
  inputCSV?.addEventListener('change', () => {
    if (inputCSV.files[0]) prepararArquivo(inputCSV.files[0]);
    inputCSV.value = '';
  });
  ['dragover', 'dragenter'].forEach((ev) =>
    zona?.addEventListener(ev, (e) => {
      e.preventDefault();
      zona.classList.add('sobre');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    zona?.addEventListener(ev, (e) => {
      e.preventDefault();
      zona.classList.remove('sobre');
    }),
  );
  zona?.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) prepararArquivo(f);
  });

  bindSummaryModal();
  bindConfigModal();
  renderizarTudo();

  if (!syncService.configured) renderSyncIndicator({ status: 'offline', detail: 'Configure Google Sheets em ⚙' });
}

initApp();

export { store, syncService, exportarDados, gerarResumo };
