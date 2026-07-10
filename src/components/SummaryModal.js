import { esc } from '../utils/helpers.js';

export function closeSummaryModal() {
  document.getElementById('veu-resumo')?.classList.remove('aberto');
}

export function renderSyncIndicator({ status, detail, syncing }) {
  const el = document.getElementById('sync-status');
  if (!el) return;

  const labels = {
    online: 'sync ativo',
    syncing: 'sincronizando…',
    synced: 'sincronizado',
    queued: 'na fila',
    error: 'erro de sync',
    offline: 'somente local',
  };

  el.className = 'sync-status ' + (status || 'offline');
  el.title = detail || '';
  el.innerHTML = `<span class="sync-dot"></span><span>${labels[status] || status || 'local'}</span>`;
  if (syncing) el.classList.add('syncing');
}

export function renderSummaryModal({ text, loading, onCopy, onRegenerate, onInsertNotes }) {
  const veu = document.getElementById('veu-resumo');
  const body = document.getElementById('resumo-conteudo');
  if (!body) return;

  if (loading) {
    body.innerHTML = '<div class="loading-state"><span class="spinner"></span> Gerando resumo…</div>';
  } else {
    body.innerHTML = `<pre class="resumo-texto">${esc(text)}</pre>`;
  }

  document.getElementById('btn-resumo-copiar')?.replaceWith(
    bindBtn('btn-resumo-copiar', 'copiar', onCopy),
  );
  document.getElementById('btn-resumo-regenerar')?.replaceWith(
    bindBtn('btn-resumo-regenerar', 'regenerar', onRegenerate),
  );
  document.getElementById('btn-resumo-notas')?.replaceWith(
    bindBtn('btn-resumo-notas', 'inserir em notas', onInsertNotes),
  );

  veu?.classList.add('aberto');
}

function bindBtn(id, label, handler) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-claro';
  btn.id = id;
  btn.textContent = label;
  btn.addEventListener('click', handler);
  return btn;
}
