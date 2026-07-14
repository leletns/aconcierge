/**
 * SpreadsheetGrid — grade editável que espelha uma planilha do Google.
 *
 * - clique na célula → edita inline (texto, select ou data livre)
 * - Enter/Tab confirma e navega · Esc cancela · auto-save no blur
 * - busca ⌘F, filtros por status + filtros inteligentes (recall)
 * - botão WhatsApp na coluna de telefone (+ mensagem template opcional)
 * - ações por linha (ex.: registrar contato) sem sair da grade
 */
import { esc } from '../utils/helpers.js';
import { parsePhone, buildWhatsAppLink, formatPhoneDisplay } from '../utils/phone.js';
import { parseDataPt, difDias } from '../utils/dates.js';
import { normalizeNome } from '../utils/matching.js';

const WA_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .611.611l4.458-1.495A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.372l-.357-.212-3.028 1.015 1.015-3.028-.212-.357A9.818 9.818 0 1 1 12 21.818z"/></svg>`;

const SELO_STATUS = {
  Pendente: 'selo-ambar',
  Agendado: 'selo-verde',
  'Não agendou': 'selo-neutro',
  'Sem Resposta': 'selo-coral',
  'Em Acompanhamento': 'selo-azul',
  'Sem interesse': 'selo-neutro',
  Realizada: 'selo-verde',
  Marcada: 'selo-azul',
  'Sem resposta': 'selo-coral',
};

export class SpreadsheetGrid {
  /**
   * @param {object} opts
   *   el, colunas, getRows, onEdit, onAddRow, onOpenFicha
   *   nomeField, statusField, headerLabel
   *   smartFilters  [{ id, label, test(row) }]
   *   rowActions    [{ id, label, onClick(linha) }]
   *   waMessage     (linha) => string mensagem WhatsApp
   *   emptyHint     () => { titulo, sub } quando 0 linhas (considerando conexão)
   *   isConnected   () => boolean
   *   dateField     campo usado nos smartFilters de data (ex.: proximoContato)
   */
  constructor(opts) {
    this.o = opts;
    this.busca = '';
    this.statusFiltro = 'todos';
    this.smartFiltro = 'todos';
    this.editando = null;
  }

  focusBusca() {
    this.o.el.querySelector('.grade-busca input')?.focus();
  }

  rowsVisiveis() {
    let rows = this.o.getRows();
    if (this.smartFiltro !== 'todos' && this.o.smartFilters) {
      const sf = this.o.smartFilters.find((f) => f.id === this.smartFiltro);
      if (sf) rows = rows.filter((r) => sf.test(r));
    }
    if (this.statusFiltro !== 'todos') {
      rows = rows.filter((r) => (r[this.o.statusField] || '') === this.statusFiltro);
    }
    if (this.busca.trim()) {
      const t = normalizeNome(this.busca);
      rows = rows.filter((r) =>
        this.o.colunas.some((c) => normalizeNome(String(r[c.field] || '')).includes(t)),
      );
    }
    return rows;
  }

  render() {
    const { el, colunas, statusField } = this.o;
    const allRows = this.o.getRows();
    const rows = this.rowsVisiveis();
    const statusCol = colunas.find((c) => c.field === statusField);
    const statusOpts = (statusCol?.options || []).filter(Boolean);
    const hasActions = (this.o.rowActions || []).length > 0;
    const colCount = colunas.length + (hasActions ? 1 : 0);

    const smart = (this.o.smartFilters || [])
      .map(
        (f) =>
          `<button class="filtro ${this.smartFiltro === f.id ? 'ativo' : ''}" data-sf="${esc(f.id)}">${esc(f.label)}</button>`,
      )
      .join('');

    const filtros = ['todos', ...statusOpts]
      .map(
        (s) =>
          `<button class="filtro ${this.statusFiltro === s ? 'ativo' : ''}" data-gf="${esc(s)}">${s === 'todos' ? 'todas' : esc(s)}</button>`,
      )
      .join('');

    const ths =
      colunas
        .map((c) => {
          const label = this.o.headerLabel ? this.o.headerLabel(c.field) || c.label : c.label;
          return `<th style="min-width:${c.width}px">${esc(label)}</th>`;
        })
        .join('') + (hasActions ? '<th style="min-width:140px">ações</th>' : '');

    let corpo;
    if (!rows.length) {
      let titulo = 'nenhuma linha';
      let sub = 'ajuste a busca ou os filtros';
      if (typeof this.o.emptyHint === 'function') {
        const hint = this.o.emptyHint({
          connected: this.o.isConnected ? this.o.isConnected() : true,
          total: allRows.length,
          filtrado: this.smartFiltro !== 'todos' || this.statusFiltro !== 'todos' || this.busca.trim(),
        });
        if (hint) {
          titulo = hint.titulo;
          sub = hint.sub;
        }
      }
      corpo = `<tr><td colspan="${colCount}"><div class="vazio"><strong>${esc(titulo)}</strong>${esc(sub)}</div></td></tr>`;
    } else {
      corpo = rows
        .map((r) => {
          const tds = colunas.map((c) => this.tdHtml(r, c)).join('');
          const actions = hasActions
            ? `<td class="celula celula-acoes">${this.o.rowActions
                .map(
                  (a) =>
                    `<button type="button" class="btn btn-claro btn-mini" data-row-action="${esc(a.id)}" data-row-key="${esc(r.key)}">${esc(a.label)}</button>`,
                )
                .join('')}</td>`
            : '';
          const overdue =
            this.o.dateField &&
            (() => {
              const iso = parseDataPt(r[this.o.dateField]);
              return iso && difDias(iso) < 0 && !['Agendado', 'Sem interesse'].includes(r.status);
            })();
          return `<tr data-row="${r.key}" class="${overdue ? 'linha-vencida' : ''}">${tds}${actions}</tr>`;
        })
        .join('');
    }

    el.innerHTML = `
      <div class="grade-barra">
        ${smart ? `<div class="filtros grade-filtros grade-smart">${smart}</div>` : ''}
        <div class="filtros grade-filtros">${filtros}</div>
        <div class="grade-busca">
          <svg viewBox="0 0 24 24" width="14" height="14"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input type="search" placeholder="buscar na planilha… (⌘F)" value="${esc(this.busca)}">
          <span class="grade-contagem">${rows.length} linha${rows.length !== 1 ? 's' : ''}${allRows.length !== rows.length ? ` de ${allRows.length}` : ''}</span>
        </div>
      </div>
      <div class="cartao tabela-envolto grade-envolto">
        <table class="grade">
          <thead><tr>${ths}</tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
      <div class="grade-rodape">
        <button class="btn btn-claro" data-add-row>＋ nova paciente</button>
        <span class="grade-dica">edite aqui — sincroniza sozinho com o Google · Enter salva · Esc cancela · duplo clique no nome = ficha</span>
      </div>`;

    this.bind();
  }

  tdHtml(r, c) {
    const raw = String(r[c.field] ?? '');
    let conteudo;

    if (c.type === 'phone') {
      const p = parsePhone(raw);
      const msg = typeof this.o.waMessage === 'function' ? this.o.waMessage(r) : '';
      const wa = buildWhatsAppLink(raw, msg);
      conteudo = `<div class="celula-fone">
        ${wa ? `<button type="button" class="wa-mini" data-wa-url="${esc(wa)}" title="abrir WhatsApp">${WA_SVG}</button>` : ''}
        <span class="celula-texto">${esc(p.valid ? formatPhoneDisplay(raw) : raw) || '<i class="celula-vazia">—</i>'}</span>
      </div>`;
    } else if (c.type === 'select') {
      const selo = SELO_STATUS[raw] || 'selo-neutro';
      conteudo = raw
        ? `<span class="selo ${selo}">${esc(raw)}</span>`
        : '<i class="celula-vazia">—</i>';
    } else if (c.type === 'datelivre' || c.type === 'dataPt') {
      const iso = parseDataPt(raw);
      const dd = iso ? difDias(iso) : null;
      const alerta = dd !== null && dd < 0 && (c.field === 'proximoContato' || c.field === 'dataAgendada');
      let hint = '';
      if (dd === 0) hint = ' · hoje';
      else if (dd === 1) hint = ' · amanhã';
      else if (dd === -1) hint = ' · ontem';
      else if (dd != null && dd > 1 && dd <= 14) hint = ` · em ${dd}d`;
      else if (dd != null && dd < -1 && Math.abs(dd) <= 30) hint = ` · há ${Math.abs(dd)}d`;
      conteudo = raw
        ? `<span class="celula-texto ${alerta ? 'celula-vencida' : ''}">${esc(raw)}${hint ? `<em class="celula-hint">${hint}</em>` : ''}</span>`
        : '<i class="celula-vazia">—</i>';
    } else {
      const nomeCol = c.field === this.o.nomeField;
      conteudo = raw
        ? `<span class="celula-texto ${nomeCol ? 'celula-nome-grade' : ''}">${esc(raw)}</span>`
        : '<i class="celula-vazia">—</i>';
    }

    return `<td class="celula" data-field="${c.field}" title="${esc(raw)}">${conteudo}</td>`;
  }

  bind() {
    const { el } = this.o;

    el.querySelectorAll('[data-sf]').forEach((b) =>
      b.addEventListener('click', () => {
        this.smartFiltro = b.dataset.sf;
        this.render();
      }),
    );

    el.querySelectorAll('[data-gf]').forEach((b) =>
      b.addEventListener('click', () => {
        this.statusFiltro = b.dataset.gf;
        this.render();
      }),
    );

    const busca = el.querySelector('.grade-busca input');
    busca?.addEventListener('input', () => {
      this.busca = busca.value;
      const pos = busca.selectionStart;
      this.render();
      const nb = el.querySelector('.grade-busca input');
      nb.focus();
      nb.setSelectionRange(pos, pos);
    });

    el.querySelector('[data-add-row]')?.addEventListener('click', () => {
      this.o.onAddRow();
      this.render();
      const primeira = el.querySelector('tbody tr:last-child td');
      if (primeira) this.abrirEditor(primeira);
    });

    el.querySelectorAll('.wa-mini').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(b.dataset.waUrl, '_blank', 'noopener');
      }),
    );

    el.querySelectorAll('[data-row-action]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (this.o.rowActions || []).find((a) => a.id === b.dataset.rowAction);
        const linha = this.o.getRows().find((r) => r.key === b.dataset.rowKey);
        if (action && linha) action.onClick(linha);
      }),
    );

    el.querySelectorAll('td.celula:not(.celula-acoes)').forEach((td) => {
      td.addEventListener('click', (e) => {
        if (e.target.closest('.wa-mini') || e.target.closest('[data-row-action]')) return;
        if (e.altKey || e.metaKey) {
          const linha = this.linhaDoTd(td);
          if (linha && this.o.onOpenFicha) this.o.onOpenFicha(linha);
          return;
        }
        this.abrirEditor(td);
      });
      if (td.dataset.field === this.o.nomeField) {
        td.addEventListener('dblclick', () => {
          const linha = this.linhaDoTd(td);
          if (linha && this.o.onOpenFicha) this.o.onOpenFicha(linha);
        });
      }
    });
  }

  linhaDoTd(td) {
    const key = td.closest('tr')?.dataset.row;
    return this.o.getRows().find((r) => r.key === key) || null;
  }

  abrirEditor(td) {
    if (td.classList.contains('celula-acoes')) return;
    const field = td.dataset.field;
    const col = this.o.colunas.find((c) => c.field === field);
    const linha = this.linhaDoTd(td);
    if (!col || !linha) return;
    if (this.editando) this.fecharEditor(false);
    this.editando = { rowKey: linha.key, field };

    const valor = String(linha[field] ?? '');
    td.classList.add('editando');

    let input;
    if (col.type === 'select') {
      input = document.createElement('select');
      input.className = 'campo celula-editor';
      const opts = [...(col.options || [])];
      if (valor && !opts.includes(valor)) opts.unshift(valor);
      input.innerHTML = opts
        .map((o) => `<option value="${esc(o)}" ${o === valor ? 'selected' : ''}>${o === '' ? '—' : esc(o)}</option>`)
        .join('');
    } else if (col.type === 'longtext') {
      input = document.createElement('textarea');
      input.className = 'campo celula-editor celula-editor-longa';
      input.rows = 2;
      input.value = valor;
    } else {
      input = document.createElement('input');
      input.className = 'campo celula-editor';
      input.value = valor;
      if (col.type === 'datelivre') input.placeholder = 'dd/mm/aaaa';
      if (col.type === 'dataPt') input.placeholder = 'seg., 05 jan. 2026';
      if (col.type === 'phone') input.inputMode = 'tel';
    }

    td.dataset.original = td.innerHTML;
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    if (input.select) input.select();

    const commit = (navegar) => {
      const novo = input.value;
      this.fecharEditor(false);
      if (novo !== valor) this.o.onEdit(linha.key, field, novo);
      this.render();
      if (navegar) this.focarProxima(linha.key, field, navegar);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !(col.type === 'longtext' && e.shiftKey)) {
        e.preventDefault();
        commit('baixo');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commit(e.shiftKey ? 'esquerda' : 'direita');
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        this.fecharEditor(true);
      }
    });
    input.addEventListener('blur', () => {
      if (this.editando) commit(null);
    });
    if (col.type === 'select') {
      input.addEventListener('change', () => commit(null));
    }
  }

  fecharEditor(restaurar) {
    if (!this.editando) return;
    const { rowKey, field } = this.editando;
    this.editando = null;
    if (restaurar) {
      const td = this.o.el.querySelector(`tr[data-row="${rowKey}"] td[data-field="${field}"]`);
      if (td && td.dataset.original != null) {
        td.innerHTML = td.dataset.original;
        td.classList.remove('editando');
        this.bind();
      }
    }
  }

  focarProxima(rowKey, field, direcao) {
    const { colunas } = this.o;
    const rows = this.rowsVisiveis();
    const ri = rows.findIndex((r) => r.key === rowKey);
    const ci = colunas.findIndex((c) => c.field === field);
    let nr = ri;
    let nc = ci;
    if (direcao === 'baixo') nr = ri + 1;
    if (direcao === 'direita') nc = ci + 1;
    if (direcao === 'esquerda') nc = ci - 1;
    if (nc >= colunas.length) {
      nc = 0;
      nr = ri + 1;
    }
    if (nc < 0) {
      nc = colunas.length - 1;
      nr = ri - 1;
    }
    const alvoRow = rows[nr];
    const alvoCol = colunas[nc];
    if (!alvoRow || !alvoCol) return;
    const td = this.o.el.querySelector(`tr[data-row="${alvoRow.key}"] td[data-field="${alvoCol.field}"]`);
    if (td) this.abrirEditor(td);
  }
}
