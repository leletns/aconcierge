/**
 * ⚙ Acompanhamentos — Helen edita os prazos de retorno.
 *
 * - Template global por procedimento: qualquer número de marcos, dias livres.
 * - Cada marco pode espelhar uma coluna real da planilha Cirurgias (03m/06m/1a)
 *   ou existir só no app.
 * - O mesmo editor de marcos é reutilizado na ficha para override por paciente.
 */
import { esc, debounce } from '../utils/helpers.js';
import { novoMarcoId, novoTemplateId } from '../utils/templates.js';

export const COL_LABELS = {
  '': 'só no app',
  m3m: 'coluna “03 meses”',
  m6m: 'coluna “06 meses”',
  m1a: 'coluna “01 ano”',
};

/** editor de lista de marcos — usado nos templates e no override por paciente */
export function marcosEditorHtml(marcos, prefixo) {
  const linhas = marcos
    .map(
      (m, i) => `
    <div class="marco-linha" data-i="${i}">
      <input class="campo marco-label" data-p="${prefixo}" value="${esc(m.label)}" placeholder="nome do marco">
      <div class="marco-dias">
        <input class="campo" type="number" min="1" max="3650" data-p="${prefixo}" value="${esc(m.dias)}">
        <span>dias após a cirurgia</span>
      </div>
      <select class="campo mini marco-col" data-p="${prefixo}">
        ${Object.entries(COL_LABELS)
          .map(([v, l]) => `<option value="${v}" ${String(m.col || '') === v ? 'selected' : ''}>${l}</option>`)
          .join('')}
      </select>
      <button type="button" class="marco-remover" data-p="${prefixo}" title="remover marco">×</button>
    </div>`,
    )
    .join('');
  return `
    <div class="marcos-editor" data-prefixo="${prefixo}">
      ${linhas}
      <button type="button" class="btn btn-fantasma marco-add" data-p="${prefixo}">＋ adicionar marco</button>
    </div>`;
}

/** lê os marcos do DOM do editor */
export function lerMarcosEditor(container, marcosAtuais) {
  const linhas = [...container.querySelectorAll('.marco-linha')];
  return linhas
    .map((el, i) => {
      const label = el.querySelector('.marco-label').value.trim();
      const dias = Number(el.querySelector('.marco-dias input').value);
      const col = el.querySelector('.marco-col').value || null;
      const atual = marcosAtuais[i] || {};
      if (!label || !dias || dias < 1) return null;
      return { id: atual.id || novoMarcoId(), label, dias, col };
    })
    .filter(Boolean)
    .sort((a, b) => a.dias - b.dias);
}

export function bindMarcosEditor(container, marcos, onChange) {
  const salvar = debounce(() => {
    const novos = lerMarcosEditor(container, marcos);
    if (novos.length) onChange(novos);
  }, 500);

  container.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', salvar);
    el.addEventListener('change', salvar);
  });
  container.querySelectorAll('.marco-remover').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      if (marcos.length <= 1) return;
      onChange(marcos.filter((_, j) => j !== i));
    });
  });
  container.querySelector('.marco-add')?.addEventListener('click', () => {
    const novos = lerMarcosEditor(container, marcos);
    const ultimo = novos[novos.length - 1];
    novos.push({ id: novoMarcoId(), label: 'novo marco', dias: (ultimo?.dias || 0) + 30, col: null });
    onChange(novos);
  });
}

export class AcompanhamentosScreen {
  constructor({ el, store, toast }) {
    this.el = el;
    this.store = store;
    this.toast = toast;
  }

  render() {
    const templates = this.store.appConfig.templates;

    this.el.innerHTML = templates
      .map(
        (t, ti) => `
      <div class="cartao tpl-cartao" data-tpl="${t.id}">
        <div class="tpl-topo">
          <input class="campo tpl-nome" value="${esc(t.nome)}" placeholder="nome do procedimento" ${t.padrao ? 'title="template padrão — usado quando nenhum outro combina com o nome da cirurgia"' : ''}>
          ${t.padrao
            ? '<span class="selo selo-azul">padrão</span>'
            : `<button type="button" class="btn btn-fantasma tpl-excluir" style="color:var(--coral)">excluir</button>`}
        </div>
        <div class="tpl-sub">${t.padrao
          ? 'usado em toda cirurgia sem template específico'
          : 'aplicado quando o nome da cirurgia contém este texto (ou por atribuição na ficha)'}</div>
        <div class="tpl-marcos" data-ti="${ti}">${marcosEditorHtml(t.marcos, 'tpl-' + ti)}</div>
      </div>`,
      )
      .join('') +
      `
      <button type="button" class="btn btn-azul" id="btn-novo-template" style="margin-top:6px">
        ＋ novo template de procedimento
      </button>
      <div class="tpl-nota cartao">
        <strong>Como funciona</strong>
        Os marcos ligados às colunas <em>03 meses / 06 meses / 01 ano</em> sincronizam com a planilha
        Cirurgias. Marcos “só no app” (ex.: Botox 15 dias) vivem apenas aqui.
        Para mudar os prazos de <u>uma</u> paciente, abra a ficha dela (⌘K) → “personalizar prazos”.
      </div>`;

    this.bind(templates);
  }

  salvar(templates, msg) {
    this.store.salvarTemplates(templates);
    if (msg) this.toast(msg);
    this.render();
  }

  bind(templates) {
    this.el.querySelectorAll('.tpl-cartao').forEach((cartao, ti) => {
      const t = templates[ti];

      const nome = cartao.querySelector('.tpl-nome');
      const salvarNome = debounce(() => {
        if (!nome.value.trim()) return;
        const novos = structuredClone(templates);
        novos[ti].nome = nome.value.trim();
        this.store.salvarTemplates(novos);
      }, 600);
      nome.addEventListener('input', salvarNome);

      cartao.querySelector('.tpl-excluir')?.addEventListener('click', () => {
        if (!confirm(`Excluir o template "${t.nome}"? As cirurgias que o usavam passam a usar o padrão.`)) return;
        this.salvar(templates.filter((_, j) => j !== ti), 'template excluído');
      });

      const editor = cartao.querySelector('.marcos-editor');
      bindMarcosEditor(editor, t.marcos, (novosMarcos) => {
        const novos = structuredClone(templates);
        novos[ti].marcos = novosMarcos;
        this.salvar(novos, 'prazos atualizados');
      });
    });

    this.el.querySelector('#btn-novo-template')?.addEventListener('click', () => {
      const novos = structuredClone(templates);
      novos.push({
        id: novoTemplateId(),
        nome: 'Novo procedimento',
        padrao: false,
        marcos: [
          { id: novoMarcoId(), label: '30 dias', dias: 30, col: null },
          { id: novoMarcoId(), label: '90 dias', dias: 90, col: 'm3m' },
        ],
      });
      this.salvar(novos, 'template criado — edite o nome e os prazos');
    });
  }
}
