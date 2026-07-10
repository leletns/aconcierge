/**
 * Unificação de pacientes entre as planilhas Recall e Cirurgias.
 * Mesma paciente = telefone E.164 igual OU nome normalizado igual
 * OU um nome é prefixo do outro (ex.: "Kenia Fátima Pires" ⊂ "Kênia Fatima Pires Torres").
 */
import { parsePhone } from './phone.js';

export function normalizeNome(nome) {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function phoneKey(contato) {
  const p = parsePhone(contato);
  return p.valid ? p.e164 : '';
}

/** id estável de paciente derivado do nome normalizado */
export function patientKey(nome) {
  const n = normalizeNome(nome);
  if (!n) return '';
  let h = 5381;
  for (let i = 0; i < n.length; i++) h = ((h << 5) + h + n.charCodeAt(i)) >>> 0;
  return 'pk' + h.toString(36) + '_' + n.split(' ')[0];
}

function nomeEhPrefixo(a, b) {
  const ta = a.split(' ');
  const tb = b.split(' ');
  if (ta.length < 2 || tb.length < 2) return false;
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return curto.every((tok, i) => longo[i] === tok);
}

/**
 * Constrói o índice unificado a partir das linhas espelhadas das duas planilhas.
 * Retorna [{ key, nome, telefone, recallRows: [...], cirurgiaRows: [...] }]
 */
export function unificarPacientes(recallRows, cirurgiaRows) {
  const pacientes = [];
  const porFone = new Map();
  const porNome = new Map();

  const localizar = (nome, contato) => {
    const fone = phoneKey(contato);
    if (fone && porFone.has(fone)) return porFone.get(fone);
    const n = normalizeNome(nome);
    if (!n) return null;
    if (porNome.has(n)) return porNome.get(n);
    for (const p of pacientes) {
      if (nomeEhPrefixo(n, p._nomeNorm)) return p;
    }
    return null;
  };

  const registrar = (nome, contato) => {
    let p = localizar(nome, contato);
    if (!p) {
      const nomeNorm = normalizeNome(nome);
      p = {
        key: patientKey(nome),
        nome: String(nome || '').trim(),
        telefone: phoneKey(contato),
        _nomeNorm: nomeNorm,
        recallRows: [],
        cirurgiaRows: [],
      };
      pacientes.push(p);
      if (nomeNorm) porNome.set(nomeNorm, p);
    }
    // nome mais completo vence; telefone válido preenche vazio
    if (normalizeNome(nome).length > p._nomeNorm.length) {
      p.nome = String(nome).trim();
      p._nomeNorm = normalizeNome(nome);
      porNome.set(p._nomeNorm, p);
    }
    const fone = phoneKey(contato);
    if (fone) {
      if (!p.telefone) p.telefone = fone;
      porFone.set(fone, p);
    }
    return p;
  };

  for (const r of recallRows) {
    if (!String(r.nome || '').trim()) continue;
    registrar(r.nome, r.contato).recallRows.push(r);
  }
  for (const c of cirurgiaRows) {
    if (!String(c.paciente || '').trim()) continue;
    registrar(c.paciente, '').cirurgiaRows.push(c);
  }

  for (const p of pacientes) delete p._nomeNorm;
  return pacientes;
}
