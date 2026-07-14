/**
 * Protocolo interno — solicitação de exames pré-operatórios (PDF clínica blue.).
 * Checklist aplicado automaticamente no pré-op conforme o texto da cirurgia.
 */
import { normalizeNome } from './matching.js';

/** exames genéricos (quando a cirurgia não bate em nenhum protocolo) */
export const EXAMES_GENERICOS = [
  'Pré-Operatório Laboratorial (sangue e EAS)',
  'Raio X de Tórax',
  'Eletrocardiograma',
  'Risco Cirúrgico',
  'Ecocardiograma (se > 40 anos)',
];

/**
 * Protocols ordered from most specific combo → generic.
 * `matchAll` = todos os termos devem aparecer no nome da cirurgia.
 * `matchAny` = basta um termo.
 */
export const PROTOCOLOS_PREOP = [
  {
    id: 'abdominoplastia-mama',
    nome: 'Abdominoplastia + Mama',
    matchAll: ['abdominoplastia', 'mama'],
    matchAny: ['mastopexia', 'mamoplastia'],
    // combo: abdominoplastia AND (mama OR mastopexia OR mamoplastia)
    match: (t) => t.includes('abdominoplastia') && (t.includes('mama') || t.includes('mastopexia') || t.includes('mamoplastia')),
    exames: [
      'USG Abdômen Total',
      'USG Parede Abdominal',
      'USG Mamas',
      'Pré-Operatório Laboratorial',
      'Raio X de Tórax',
      'Eletrocardiograma',
      'Risco Cirúrgico',
      'Ecocardiograma (se > 40 anos)',
      'Mamografia (> 35 anos)',
      'Doppler Venoso MMII Bilateral',
    ],
  },
  {
    id: 'abdominoplastia-lipo',
    nome: 'Abdominoplastia + Lipoaspiração',
    match: (t) => t.includes('abdominoplastia') && (t.includes('lipoaspiracao') || t.includes('lipo ')),
    exames: [
      'USG Abdômen Total',
      'USG Parede Abdominal',
      'Pré-Operatório Laboratorial',
      'Raio X de Tórax',
      'Eletrocardiograma',
      'Risco Cirúrgico',
      'Ecocardiograma (se > 40 anos)',
      'Doppler Venoso MMII Bilateral (> 35 anos)',
    ],
  },
  {
    id: 'lipo-mama',
    nome: 'Lipoaspiração + Mama',
    match: (t) =>
      (t.includes('lipoaspiracao') || t.includes('lipo ')) &&
      (t.includes('mama') || t.includes('mastopexia') || t.includes('mamoplastia')),
    exames: [
      'USG Mamas',
      'USG Parede Abdominal',
      'Pré-Operatório Laboratorial',
      'Raio X de Tórax',
      'Eletrocardiograma',
      'Risco Cirúrgico',
      'Ecocardiograma (se > 40 anos)',
      'Mamografia (> 35 anos)',
      'Doppler Venoso MMII Bilateral (> 35 anos)',
    ],
  },
  {
    id: 'lipedema',
    nome: 'Lipedema',
    match: (t) => t.includes('lipedema'),
    exames: [
      'Exame Laboratorial (sangue e EAS)',
      'Raio X de Tórax',
      'Eletrocardiograma',
      'Risco Cirúrgico',
      'Ecocardiograma (se > 40 anos)',
      'Doppler Venoso MMII Bilateral',
    ],
  },
  {
    id: 'mama',
    nome: 'Mama',
    match: (t) =>
      (t.includes('mama') || t.includes('mastopexia') || t.includes('mamoplastia') || t.includes('implante')) &&
      !t.includes('abdominoplastia') &&
      !t.includes('lipoaspiracao'),
    exames: [
      'USG Mamas',
      'Pré-Operatório Laboratorial',
      'Raio X de Tórax',
      'Eletrocardiograma',
      'Risco Cirúrgico',
      'Ecocardiograma (se > 40 anos)',
      'Doppler Venoso MMII Bilateral (mastopexia, se > 35 anos)',
      'Mamografia (> 35 anos)',
    ],
  },
  {
    id: 'abdominoplastia',
    nome: 'Abdominoplastia',
    match: (t) => t.includes('abdominoplastia'),
    exames: [
      'USG Abdômen Total',
      'USG Parede Abdominal',
      'Pré-Operatório Laboratorial',
      'Raio X de Tórax',
      'Eletrocardiograma',
      'Risco Cirúrgico',
      'Ecocardiograma (se > 40 anos)',
      'Doppler Venoso MMII Bilateral (> 35 anos)',
    ],
  },
  {
    id: 'lipoaspiracao',
    nome: 'Lipoaspiração',
    match: (t) => t.includes('lipoaspiracao') || t.includes('lipo ') || t.includes('lipodefinition') || t.includes('lipe definition'),
    exames: [
      'USG Abdômen Total',
      'USG Parede Abdominal',
      'Pré-Operatório Laboratorial',
      'Raio X de Tórax',
      'Eletrocardiograma',
      'Risco Cirúrgico',
      'Ecocardiograma (se > 40 anos)',
      'Doppler Venoso MMII Bilateral (> 35 anos)',
    ],
  },
  {
    id: 'blefaroplastia',
    nome: 'Blefaroplastia',
    match: (t) => t.includes('blefaroplastia') || t.includes('blefaro'),
    exames: [
      'Pré-Operatório Laboratorial',
      'Raio X de Tórax',
      'Eletrocardiograma',
      'Risco Cirúrgico',
      // PDF: NÃO solicitar Ecocardiograma
    ],
  },
];

export const OBSERVACOES_PREOP = [
  'Caso a paciente tenha prótese, solicitar Ressonância Magnética.',
  'Ecocardiograma apenas se a paciente tiver mais de 40 anos (exceto blefaroplastia).',
  'Mamografia a partir dos 35 anos.',
  'Doppler Venoso MMII Bilateral a partir dos 35 anos.',
  'Se a paciente fizer Ressonância de Mamas, não solicitar USG Mamas nem Mamografia.',
];

export function protocoloParaCirurgia(textoCirurgia) {
  const t = normalizeNome(textoCirurgia || '');
  if (!t) return { id: 'generico', nome: 'Pré-op geral', exames: EXAMES_GENERICOS };
  for (const p of PROTOCOLOS_PREOP) {
    if (p.match(t)) return p;
  }
  return { id: 'generico', nome: 'Pré-op geral', exames: EXAMES_GENERICOS };
}

export function examesDoProtocolo(textoCirurgia) {
  const p = protocoloParaCirurgia(textoCirurgia);
  return {
    protocoloId: p.id,
    protocoloNome: p.nome,
    exames: (p.exames || EXAMES_GENERICOS).map((nome) => ({ nome, feito: false })),
  };
}

/** Detecta se a lista atual ainda é o placeholder genérico antigo (pode substituir pelo protocolo) */
export function podeAplicarProtocolo(extras, textoCirurgia) {
  if (!extras?.exames?.length) return true;
  if (extras.protocoloId && extras.protocoloId === protocoloParaCirurgia(textoCirurgia).id) return false;
  if (extras.examesCustom) return false; // Helen editou manualmente
  const feitos = extras.exames.some((e) => e.feito);
  if (feitos) return false;
  return true;
}
