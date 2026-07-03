/** Auto-save form fields with debounce */
import { debounce } from '../utils/helpers.js';

export function setupAutoSave(formEl, getValues, onSave, delayMs = 600) {
  const debounced = debounce(() => {
    const values = getValues();
    if (values.nome?.trim()) onSave(values, { auto: true });
  }, delayMs);

  formEl.querySelectorAll('input, select, textarea').forEach((el) => {
    el.addEventListener('input', debounced);
    el.addEventListener('change', debounced);
  });
}

/** Keyboard navigation between form fields (Enter → next) */
export function setupFormKeyboardNav(formEl) {
  const fields = [...formEl.querySelectorAll('input, select, textarea')].filter(
    (f) => !f.disabled && f.type !== 'hidden',
  );

  fields.forEach((field, i) => {
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && field.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const next = fields[i + 1];
        if (next) next.focus();
      }
    });
  });
}

export function focusFirstField(formEl, selector = 'input, select, textarea') {
  setTimeout(() => formEl.querySelector(selector)?.focus(), 80);
}
