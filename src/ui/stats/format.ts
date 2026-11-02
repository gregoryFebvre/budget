import type { Cents } from '../../domain/types';
import type { Evolution } from '../../domain/stats';
import { formatEuros } from '../../domain/money';

const signedEuro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' });
const signedPct = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

export const euros = (cents: Cents | null): string => (cents === null ? '—' : formatEuros(cents));
export const percent = (v: number | null): string => (v === null ? 'non calculable' : pct.format(v));
export const toEuroUnits = (cents: Cents): number => cents / 100;
export const axisEuro = (v: number): string => `${compact.format(v)} €`;
export const tooltipEuro = (v: unknown): string => formatEuros(Math.round(Number(v) * 100));

/** « +120,00 € (+5,2 %) » ; jamais de pourcentage trompeur quand la base est nulle ou absente. */
export function evolutionText(e: Evolution): string {
  if (e.delta === null) return 'élément absent d\'une des deux années';
  const amount = e.delta === 0 ? '±0,00 €' : signedEuro.format(e.delta / 100);
  if (e.pct === null) return e.delta === 0 ? `${amount} (aucune variation)` : `${amount} (% non calculable : base nulle)`;
  return `${amount} (${signedPct.format(e.pct)})`;
}

export function pointsText(points: number | null): string {
  if (points === null) return 'non calculable';
  return `${points > 0 ? '+' : points < 0 ? '−' : '±'}${Math.abs(points).toFixed(1).replace('.', ',')} pt`;
}

export const YEAR_COLORS = ['#2f5fd0', '#d9641e', '#1b7f4c', '#7a3fb5', '#c2185b', '#00838f', '#6d4c41', '#546e7a'];
export const FAMILY_COLORS = { revenus: '#1b7f4c', depenses_fixes: '#2f5fd0', depenses_ponctuelles: '#b86a00', epargne: '#7a3fb5' } as const;
