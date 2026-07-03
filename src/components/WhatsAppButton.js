import { esc } from '../utils/helpers.js';
import { buildWhatsAppLink } from '../utils/phone.js';

const WA_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .611.611l4.458-1.495A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.372l-.357-.212-3.028 1.015 1.015-3.028-.212-.357A9.818 9.818 0 1 1 12 21.818z"/></svg>`;

export function whatsAppButtonHtml(patient, message, { label = 'WhatsApp', className = 'btn btn-wa' } = {}) {
  const url = buildWhatsAppLink(patient.telefone, message);
  if (!url) return `<span class="celula-sub">sem tel.</span>`;
  return `<button type="button" class="${className}" data-wa-url="${esc(url)}" title="Abrir conversa no WhatsApp">${WA_SVG} ${label}</button>`;
}

export function bindWhatsAppButtons(root = document) {
  root.querySelectorAll('[data-wa-url]').forEach((btn) => {
    if (btn._waBound) return;
    btn._waBound = true;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const url = btn.getAttribute('data-wa-url');
      if (url) window.location.href = url;
    });
  });
}
