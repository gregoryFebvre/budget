/**
 * Statistiques et comparaisons : fonctions PURES, lecture seule (jamais de modification des données).
 *
 * Base de calcul (`Basis`) :
 *   - 'planned' : montants PRÉVUS (budget), pointés ou non — défaut ;
 *   - 'checked' : montants POINTÉS uniquement (réalisé constaté par la banque).
 *
 * Définitions (aucun montant compté deux fois) :
 *   consommation      = dépenses fixes + dépenses ponctuelles (hors épargne)
 *   soldeAvantEpargne = revenus − consommation
 *   soldeApresEpargne = revenus − consommation − épargne   (= « Solde 3 » de l'Excel)
 *   taux d'épargne    = épargne / revenus  (null si revenus nuls)
 *
 * Comparaison : l'année de RÉFÉRENCE est la base ; écart = valeur − base ; % = écart / base.
 *   - base nulle  → % « non calculable » (jamais de pourcentage trompeur) ;
 *   - élément absent d'une année → total `null` (distinct de 0).
 */
import { MONTHS } from './types';
import type { BudgetData, BudgetItem, BudgetYear, Cents, FamilyId, MonthCell, MonthIndex } from './types';
import { FAMILY_IDS } from './types';

export type Basis = 'planned' | 'checked';
export type MetricId = FamilyId | 'consommation' | 'soldeAvantEpargne' | 'soldeApresEpargne';
export type FamilyFilter = 'tout' | 'sorties' | 'depenses' | FamilyId;

export const FILTER_FAMILIES: Record<FamilyFilter, readonly FamilyId[]> = {
  tout: FAMILY_IDS,
  sorties: ['depenses_fixes', 'depenses_ponctuelles', 'epargne'],
  depenses: ['depenses_fixes', 'depenses_ponctuelles'],
  revenus: ['revenus'],
  depenses_fixes: ['depenses_fixes'],
  depenses_ponctuelles: ['depenses_ponctuelles'],
  epargne: ['epargne'],
};

export function cellValue(cell: MonthCell | undefined, basis: Basis): Cents {
  if (!cell) return 0;
  return basis === 'planned' ? cell.amount : cell.checked ? cell.amount : 0;
}

const zeros = (): Cents[] => MONTHS.map(() => 0);
const sumInto = (target: Cents[], add: readonly Cents[]) => add.forEach((v, i) => (target[i] = (target[i] ?? 0) + v));
export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** 12 valeurs mensuelles d'un élément. */
export function itemMonthly(year: BudgetYear, itemId: string, basis: Basis): Cents[] {
  return MONTHS.map((m: MonthIndex) => cellValue(year.entries[itemId]?.[m], basis));
}

export interface YearStats {
  year: number;
  basis: Basis;
  /** Totaux annuels par famille. */
  family: Record<FamilyId, Cents>;
  /** Séries mensuelles par famille (12 valeurs). */
  monthly: Record<FamilyId, Cents[]>;
}

export function yearStats(data: BudgetData, year: BudgetYear, basis: Basis): YearStats {
  const monthly = { revenus: zeros(), depenses_fixes: zeros(), depenses_ponctuelles: zeros(), epargne: zeros() };
  for (const id of year.itemIds) {
    const item = data.items[id];
    if (item) sumInto(monthly[item.familyId], itemMonthly(year, id, basis));
  }
  return {
    year: year.year,
    basis,
    monthly,
    family: {
      revenus: sum(monthly.revenus),
      depenses_fixes: sum(monthly.depenses_fixes),
      depenses_ponctuelles: sum(monthly.depenses_ponctuelles),
      epargne: sum(monthly.epargne),
    },
  };
}

export function metricMonthly(s: YearStats, metric: MetricId): Cents[] {
  const f = s.monthly;
  return MONTHS.map((_, i) => {
    const revenus = f.revenus[i] ?? 0;
    const conso = (f.depenses_fixes[i] ?? 0) + (f.depenses_ponctuelles[i] ?? 0);
    const epargne = f.epargne[i] ?? 0;
    switch (metric) {
      case 'consommation':
        return conso;
      case 'soldeAvantEpargne':
        return revenus - conso;
      case 'soldeApresEpargne':
        return revenus - conso - epargne;
      default:
        return f[metric][i] ?? 0;
    }
  });
}

export const metricAnnual = (s: YearStats, metric: MetricId): Cents => sum(metricMonthly(s, metric));

/** Taux d'épargne (0.12 = 12 %), null si les revenus sont nuls. */
export function savingsRate(s: YearStats): number | null {
  return s.family.revenus === 0 ? null : s.family.epargne / s.family.revenus;
}

/** Épargne cumulée mois après mois (évolution de l'épargne). */
export function cumulativeSavings(s: YearStats): Cents[] {
  let total = 0;
  return s.monthly.epargne.map((v) => (total += v));
}

// ---------------------------------------------------------------- comparaison

export interface Evolution {
  /** valeur − base ; null si l'une des deux valeurs est absente. */
  delta: Cents | null;
  /** (valeur − base) / base ; null si non calculable. */
  pct: number | null;
  reason?: 'absent' | 'base-nulle';
}

export function compare(base: Cents | null | undefined, value: Cents | null | undefined): Evolution {
  if (base === null || base === undefined || value === null || value === undefined) {
    return { delta: null, pct: null, reason: 'absent' };
  }
  if (base === 0) return { delta: value - base, pct: null, reason: 'base-nulle' };
  return { delta: value - base, pct: (value - base) / base };
}

/** Évolution d'un taux, en points de pourcentage ; null si l'un des taux est indéfini. */
export function compareRates(base: number | null, value: number | null): number | null {
  return base === null || value === null ? null : (value - base) * 100;
}

export interface ComparisonFilter {
  family: FamilyFilter;
  /** 'all' | 'none' (sans catégorie) | id de catégorie */
  category: string;
}

const itemMatches = (item: BudgetItem, f: ComparisonFilter): boolean =>
  FILTER_FAMILIES[f.family].includes(item.familyId) &&
  (f.category === 'all' || (f.category === 'none' ? item.categoryId === null : item.categoryId === f.category));

export interface ItemComparisonRow {
  itemId: string;
  label: string;
  familyId: FamilyId;
  categoryId: string | null;
  archived: boolean;
  /** Total annuel par année ; null = élément absent de cette année. */
  totals: Record<number, Cents | null>;
  /** Part dans les REVENUS de l'année (0..1, même base prévu/pointé que les montants) ; null si absent ou revenus nuls. */
  shares: Record<number, number | null>;
  /** Évolution par rapport à l'année de référence (clé = année comparée). */
  evolutions: Record<number, Evolution>;
  monthly: Record<number, Cents[] | null>;
}

export function compareItems(
  data: BudgetData,
  years: readonly number[],
  refYear: number,
  basis: Basis,
  filter: ComparisonFilter,
): ItemComparisonRow[] {
  const ys = years.map((y) => data.years[String(y)]).filter((y): y is BudgetYear => y !== undefined);
  const stats = new Map(ys.map((y) => [y.year, yearStats(data, y, basis)]));
  const ids = new Set<string>();
  for (const y of ys) y.itemIds.forEach((id) => ids.add(id));

  const rows: ItemComparisonRow[] = [];
  for (const id of ids) {
    const item = data.items[id];
    if (!item || !itemMatches(item, filter)) continue;
    const totals: Record<number, Cents | null> = {};
    const shares: Record<number, number | null> = {};
    const monthly: Record<number, Cents[] | null> = {};
    for (const y of ys) {
      if (!y.itemIds.includes(id)) {
        totals[y.year] = null;
        shares[y.year] = null;
        monthly[y.year] = null;
        continue;
      }
      const m = itemMonthly(y, id, basis);
      const total = sum(m);
      const revenus = stats.get(y.year)!.family.revenus;
      totals[y.year] = total;
      monthly[y.year] = m;
      shares[y.year] = revenus === 0 ? null : total / revenus;
    }
    const evolutions: Record<number, Evolution> = {};
    for (const y of ys) if (y.year !== refYear) evolutions[y.year] = compare(totals[refYear], totals[y.year]);
    rows.push({ itemId: id, label: item.label, familyId: item.familyId, categoryId: item.categoryId, archived: item.archived, totals, shares, evolutions, monthly });
  }
  return rows.sort((a, b) => (b.totals[refYear] ?? -1) - (a.totals[refYear] ?? -1) || a.label.localeCompare(b.label, 'fr'));
}

export interface CategoryComparisonRow {
  /** null = « Sans catégorie » */
  categoryId: string | null;
  label: string;
  totals: Record<number, Cents | null>;
  evolutions: Record<number, Evolution>;
}

/** Totaux par catégorie TRANSVERSALE (toutes familles du filtre confondues). */
export function compareCategories(
  data: BudgetData,
  years: readonly number[],
  refYear: number,
  basis: Basis,
  family: FamilyFilter,
): CategoryComparisonRow[] {
  const rows = compareItems(data, years, refYear, basis, { family, category: 'all' });
  const groups = new Map<string | null, ItemComparisonRow[]>();
  for (const r of rows) {
    const key = r.categoryId && data.categories[r.categoryId] ? r.categoryId : null;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: CategoryComparisonRow[] = [];
  for (const [categoryId, list] of groups) {
    const totals: Record<number, Cents | null> = {};
    for (const y of years) {
      const present = list.filter((r) => r.totals[y] !== null && r.totals[y] !== undefined);
      totals[y] = present.length ? sum(present.map((r) => r.totals[y] as number)) : null;
    }
    const evolutions: Record<number, Evolution> = {};
    for (const y of years) if (y !== refYear) evolutions[y] = compare(totals[refYear], totals[y]);
    out.push({ categoryId, label: categoryId ? (data.categories[categoryId]?.label ?? '—') : 'Sans catégorie', totals, evolutions });
  }
  return out.sort((a, b) => (b.totals[refYear] ?? -1) - (a.totals[refYear] ?? -1) || a.label.localeCompare(b.label, 'fr'));
}
