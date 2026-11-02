import type { Cents } from './types';

const numberFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const euroFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** « 1 234,50 » (sans symbole, pour les cellules du tableau). */
export function formatAmount(cents: Cents): string {
  return numberFormat.format(cents / 100);
}

/** « 1 234,50 € » */
export function formatEuros(cents: Cents): string {
  return euroFormat.format(cents / 100);
}

/** Valeur proposée à l'édition : « 1234,5 » */
export function toEditableString(cents: Cents): string {
  return String(cents / 100).replace('.', ',');
}

export type ParsedAmount = { ok: true; cents: Cents | null } | { ok: false; error: string };

const MAX_CENTS = 1_000_000_000 * 100;

/**
 * Analyse une saisie utilisateur.
 *  - vide → { ok: true, cents: null } (efface la valeur) ;
 *  - accepte « 1 234,56 », « 12.5 », « 45 € » et les expressions « =105+188 » ;
 *  - refuse les négatifs, les valeurs non finies et les expressions invalides.
 * L'évaluation passe par un analyseur dédié (jamais eval).
 */
export function parseAmountInput(raw: string): ParsedAmount {
  const cleaned = raw
    .replace(/[\s\u00a0\u202f€]/g, '')
    .replace(/^=/, '')
    .replace(/,/g, '.');
  if (cleaned === '') return { ok: true, cents: null };

  const tokens = cleaned.match(/\d+(?:\.\d+)?|\.\d+|[()+\-*/]/g);
  if (!tokens || tokens.join('') !== cleaned) {
    return { ok: false, error: 'Saisie non reconnue : utilisez des chiffres (ex. 1250,50 ou =105+188).' };
  }

  let pos = 0;
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  const factor = (): number => {
    const t = tokens[pos++];
    if (t === undefined) return fail('Expression incomplète.');
    if (t === '(') {
      const v = expr();
      if (tokens[pos++] !== ')') return fail('Parenthèse fermante manquante.');
      return v;
    }
    if (t === '-') return -factor();
    if (t === '+') return factor();
    const n = Number(t);
    return Number.isNaN(n) ? fail('Nombre invalide.') : n;
  };
  const term = (): number => {
    let v = factor();
    while (tokens[pos] === '*' || tokens[pos] === '/') {
      const op = tokens[pos++];
      const r = factor();
      if (op === '/' && r === 0) return fail('Division par zéro.');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (tokens[pos] === '+' || tokens[pos] === '-') {
      const op = tokens[pos++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };

  try {
    const value = expr();
    if (pos !== tokens.length) return { ok: false, error: 'Expression invalide.' };
    if (!Number.isFinite(value)) return { ok: false, error: 'Montant invalide.' };
    const cents = Math.round(value * 100);
    if (cents < 0) return { ok: false, error: 'Le montant doit être positif ou nul.' };
    if (cents > MAX_CENTS) return { ok: false, error: 'Montant trop élevé.' };
    return { ok: true, cents };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Saisie invalide.' };
  }
}
