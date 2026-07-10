/**
 * Intelligent phone parser — detects DDI, DDD, local number.
 * Storage format: E.164 (+5511999999999)
 */

const COUNTRY_CODES = [
  { code: '1', minLen: 10, maxLen: 11, name: 'US/CA' },
  { code: '34', minLen: 9, maxLen: 9, name: 'ES' },
  { code: '44', minLen: 10, maxLen: 10, name: 'GB' },
  { code: '49', minLen: 10, maxLen: 11, name: 'DE' },
  { code: '33', minLen: 9, maxLen: 9, name: 'FR' },
  { code: '39', minLen: 9, maxLen: 10, name: 'IT' },
  { code: '351', minLen: 9, maxLen: 9, name: 'PT' },
  { code: '420', minLen: 9, maxLen: 9, name: 'CZ' },
  { code: '31', minLen: 9, maxLen: 9, name: 'NL' },
  { code: '54', minLen: 10, maxLen: 11, name: 'AR' },
  { code: '55', minLen: 10, maxLen: 11, name: 'BR' },
  { code: '56', minLen: 9, maxLen: 9, name: 'CL' },
  { code: '57', minLen: 10, maxLen: 10, name: 'CO' },
  { code: '58', minLen: 10, maxLen: 10, name: 'VE' },
  { code: '52', minLen: 10, maxLen: 10, name: 'MX' },
  { code: '51', minLen: 9, maxLen: 9, name: 'PE' },
  { code: '598', minLen: 8, maxLen: 8, name: 'UY' },
  { code: '595', minLen: 9, maxLen: 9, name: 'PY' },
];

const DEFAULT_COUNTRY = '55';

function digitsOnly(input) {
  return String(input || '').replace(/\D/g, '');
}

function detectCountryCode(digits) {
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (digits.startsWith(c.code)) {
      const local = digits.slice(c.code.length);
      if (local.length >= c.minLen && local.length <= c.maxLen + 1) {
        return { countryCode: c.code, local, country: c.name };
      }
    }
  }
  return null;
}

function parseBrazilLocal(digits) {
  let local = digits;
  if (local.startsWith('0')) local = local.replace(/^0+/, '');

  if (local.length === 10 || local.length === 11) {
    const ddd = local.slice(0, 2);
    const number = local.slice(2);
    // celular BR de 11 dígitos começa com 9 após o DDD — "1 (770) 655-6389"
    // (EUA sem +) cai aqui e precisa seguir para a detecção internacional
    if (local.length === 11 && number[0] !== '9') return null;
    return { countryCode: '55', ddd, number, country: 'BR' };
  }
  if (local.length === 8 || local.length === 9) {
    return { countryCode: '55', ddd: '', number: local, country: 'BR' };
  }
  return null;
}

/**
 * @param {string} input
 */
export function parsePhone(input) {
  if (!input || !String(input).trim()) {
    return { e164: '', countryCode: '', ddd: '', number: '', display: '', valid: false, waDigits: '' };
  }

  const hasPlus = String(input).trim().startsWith('+');
  const digits = digitsOnly(input);

  if (!digits) {
    return { e164: '', countryCode: '', ddd: '', number: '', display: '', valid: false, waDigits: '' };
  }

  let countryCode = DEFAULT_COUNTRY;
  let ddd = '';
  let number = '';
  let country = 'BR';

  if (hasPlus || (digits.startsWith('55') && digits.length >= 12)) {
    const detected = detectCountryCode(digits);
    if (detected) {
      countryCode = detected.countryCode;
      country = detected.country;
      if (countryCode === '55') {
        const br = parseBrazilLocal(detected.local);
        if (br) {
          ddd = br.ddd;
          number = br.number;
        } else {
          number = detected.local;
        }
      } else {
        number = detected.local;
      }
    } else if (digits.startsWith('55')) {
      countryCode = '55';
      const br = parseBrazilLocal(digits.slice(2));
      if (br) {
        ddd = br.ddd;
        number = br.number;
      } else {
        number = digits.slice(2);
      }
    }
  } else {
    const br = parseBrazilLocal(digits);
    if (br) {
      countryCode = br.countryCode;
      ddd = br.ddd;
      number = br.number;
      country = br.country;
    } else {
      const detected = detectCountryCode(digits);
      if (detected && detected.countryCode !== '55') {
        countryCode = detected.countryCode;
        number = detected.local;
        country = detected.country;
      } else {
        countryCode = DEFAULT_COUNTRY;
        number = digits;
      }
    }
  }

  const e164 = '+' + countryCode + (ddd || '') + number;
  const waDigits = countryCode + (ddd || '') + number;
  const valid = waDigits.length >= 10;

  let display = e164;
  if (countryCode === '55' && ddd) {
    const n =
      number.length === 9
        ? `${number.slice(0, 5)}-${number.slice(5)}`
        : `${number.slice(0, 4)}-${number.slice(4)}`;
    display = `+55 (${ddd}) ${n}`;
  }

  return { e164, countryCode, ddd, number, display, valid, waDigits, country };
}

export function normalizePhone(input) {
  const p = parsePhone(input);
  return p.valid ? p.e164 : String(input || '').trim();
}

export function formatPhoneDisplay(stored) {
  if (!stored) return '';
  const p = parsePhone(stored);
  return p.display || stored;
}

export function buildWhatsAppLink(stored, message) {
  const p = parsePhone(stored);
  if (!p.valid) return null;
  const base = `https://wa.me/${p.waDigits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function openWhatsApp(stored, message) {
  const url = buildWhatsAppLink(stored, message);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
