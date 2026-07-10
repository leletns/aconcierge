export const uid = () =>
  'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = (t) =>
  String(t ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

export const retry = async (fn, { attempts = 3, delayMs = 500, backoff = 2 } = {}) => {
  let lastError;
  let wait = delayMs;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, wait));
        wait *= backoff;
      }
    }
  }
  throw lastError;
};

export const iniciais = (nome) =>
  nome
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
