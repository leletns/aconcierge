import { esc } from '../utils/helpers.js';
import { buildWhatsAppLink } from '../utils/phone.js';

export function whatsAppButtonHtml(patient, message, { label = 'WhatsApp', className = 'btn btn-wa' } = {}) {
  const url = buildWhatsAppLink(patient.telefone, message);
  if (!url) return '';
  return `<button type="button" class="${className}" data-wa-url="${esc(url)}" title="Abrir WhatsApp">${label}</button>`;
}

export function bindWhatsAppButtons(root = document) {
  root.querySelectorAll('[data-wa-url]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.getAttribute('data-wa-url');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
  });
}
