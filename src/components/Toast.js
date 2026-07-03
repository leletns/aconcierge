let toastTimer;

export function showToast(msg, root = document) {
  let el = root.getElementById?.('toast') || document.getElementById('toast');
  if (!el) return;
  el.innerHTML = msg + ' <span class="ponto">●</span>';
  el.classList.add('visivel');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visivel'), 2600);
}

export function showLoadingToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span class="spinner-inline"></span> ${msg}`;
  el.classList.add('visivel');
}

export function hideToast() {
  document.getElementById('toast')?.classList.remove('visivel');
}
