/**
 * Calculs budgétaires : fonctions PURES, indépendantes de React et du stockage.
 * Rien de ce qui est calculé ici n'est persisté.
 *
 * Règles (issues de BUDGET.xlsx et du cahier des charges, §5.4) :
 *  - Une cellule absente (non renseignée) est ignorée ; un 0 saisi compte pour 0.
 *  - Soldes successifs, comme dans l'Excel :
 *      soldeApresFixes       = revenus − dépenses fixes
 *      soldeApresPonctuelles = soldeApresFixes − dépenses ponctuelles
 *      soldeApresEpargne     = soldeApresPonctuelles − épargne
 *  - Reste à provisionner = montants renseignés NON POINTÉS des dépenses fixes,
 *    ponctuelles ET de l'épargne (les virements d'épargne sortent du compte courant).
 *  - Revenus restant à percevoir = revenus renseignés non pointés.
 *  - Solde prévisionnel = revenus restant à percevoir − reste à provisionner.
 *  - Le pointage ne modifie jamais les montants prévus.
 */
import { FAMILY_IDS, MONTHS } from './types';
import type { BudgetData, BudgetYear, Cents, FamilyId, ItemEntries, MonthIndex } from './types';

export interface Aggregate {
  planned: Cents;
  checked: Cents;
  remaining: Cents;
  /** Nombre de cellules renseignées. */
  filled: number;
  /** Nombre de cellules pointées. */
  checkedCount: number;
}

export type ByFamily<T> = Record<FamilyId, T>;

export interface MonthSummary {
  planned: ByFamily<Cents>;
  checked: ByFamily<Cents>;
  remaining: ByFamily<Cents>;
  filled: ByFamily<number>;
  checkedCount: ByFamily<number>;
  /** Dépenses fixes + ponctuelles (hors épargne). */
  consommation: Cents;
  soldeApresFixes: Cents;
  soldeApresPonctuelles: Cents;
  soldeApresEpargne: Cents;
  resteAProvisionner: Cents;
  revenusRestants: Cents;
  soldePrevisionnel: Cents;
}

export interface YearSummary {
  months: Record<MonthIndex, MonthSummary>;
  /** Somme des 12 mois (colonne « Annuel »). */
  annual: MonthSummary;
}

const byFamily = <T>(make: (id: FamilyId) => T): ByFamily<T> => ({
  revenus: make('revenus'),
  depenses_fixes: make('depenses_fixes'),
  depenses_ponctuelles: make('depenses_ponctuelles'),
  epargne: make('epargne'),
});

/** Agrège un ensemble d'éléments pour un mois. */
export function aggregateItems(year: BudgetYear, itemIds: readonly string[], month: MonthIndex): Aggregate {
  let planned = 0;
  let checked = 0;
  let filled = 0;
  let checkedCount = 0;
  for (const id of itemIds) {
    const cell = year.entries[id]?.[month];
    if (!cell) continue;
    filled += 1;
    planned += cell.amount;
    if (cell.checked) {
      checked += cell.amount;
      checkedCount += 1;
    }
  }
  return { planned, checked, remaining: planned - checked, filled, checkedCount };
}

/** Total annuel (prévu) des valeurs d'un élément ; 0 si aucune cellule. */
export function entriesAnnualTotal(entries: ItemEntries | undefined): Cents {
  let total = 0;
  for (const m of MONTHS) total += entries?.[m]?.amount ?? 0;
  return total;
}

export function itemAnnualTotal(year: BudgetYear, itemId: string): Cents {
  return entriesAnnualTotal(year.entries[itemId]);
}

/** Ids des éléments d'une famille présents dans une année (ordre d'affichage). */
export function familyItemIds(data: BudgetData, year: BudgetYear, familyId: FamilyId): string[] {
  return year.itemIds
    .map((id) => data.items[id])
    .filter((item): item is NonNullable<typeof item> => item !== undefined && item.familyId === familyId)
    .sort((a, b) => a.order - b.order)
    .map((item) => item.id);
}

export function summarizeMonth(data: BudgetData, year: BudgetYear, month: MonthIndex): MonthSummary {
  const ids = byFamily((f) => familyItemIds(data, year, f));
  const agg = byFamily((f) => aggregateItems(year, ids[f], month));

  const planned = byFamily((f) => agg[f].planned);
  const remaining = byFamily((f) => agg[f].remaining);
  const soldeApresFixes = planned.revenus - planned.depenses_fixes;
  const soldeApresPonctuelles = soldeApresFixes - planned.depenses_ponctuelles;
  const resteAProvisionner = remaining.depenses_fixes + remaining.depenses_ponctuelles + remaining.epargne;

  return {
    planned,
    checked: byFamily((f) => agg[f].checked),
    remaining,
    filled: byFamily((f) => agg[f].filled),
    checkedCount: byFamily((f) => agg[f].checkedCount),
    consommation: planned.depenses_fixes + planned.depenses_ponctuelles,
    soldeApresFixes,
    soldeApresPonctuelles,
    soldeApresEpargne: soldeApresPonctuelles - planned.epargne,
    resteAProvisionner,
    revenusRestants: remaining.revenus,
    soldePrevisionnel: remaining.revenus - resteAProvisionner,
  };
}

function addSummaries(a: MonthSummary, b: MonthSummary): MonthSummary {
  const sum = (x: ByFamily<number>, y: ByFamily<number>) => byFamily((f) => x[f] + y[f]);
  return {
    planned: sum(a.planned, b.planned),
    checked: sum(a.checked, b.checked),
    remaining: sum(a.remaining, b.remaining),
    filled: sum(a.filled, b.filled),
    checkedCount: sum(a.checkedCount, b.checkedCount),
    consommation: a.consommation + b.consommation,
    soldeApresFixes: a.soldeApresFixes + b.soldeApresFixes,
    soldeApresPonctuelles: a.soldeApresPonctuelles + b.soldeApresPonctuelles,
    soldeApresEpargne: a.soldeApresEpargne + b.soldeApresEpargne,
    resteAProvisionner: a.resteAProvisionner + b.resteAProvisionner,
    revenusRestants: a.revenusRestants + b.revenusRestants,
    soldePrevisionnel: a.soldePrevisionnel + b.soldePrevisionnel,
  };
}

export function summarizeYear(data: BudgetData, year: BudgetYear): YearSummary {
  const months = {} as Record<MonthIndex, MonthSummary>;
  for (const m of MONTHS) months[m] = summarizeMonth(data, year, m);
  const annual = MONTHS.map((m) => months[m]).reduce(addSummaries);
  return { months, annual };
}

/** Nombre total / pointé de cellules renseignées, toutes familles confondues. */
export function pointageProgress(s: MonthSummary): { checked: number; total: number } {
  let checked = 0;
  let total = 0;
  for (const f of FAMILY_IDS) {
    checked += s.checkedCount[f];
    total += s.filled[f];
  }
  return { checked, total };
}

export interface ItemYearTotal {
  year: number;
  /** L'élément fait partie de la structure de cette année. */
  present: boolean;
  total: Cents;
  filled: number;
}

/** Historique d'un élément : une ligne par année existante (présence + total annuel prévu). */
export function itemYearTotals(data: BudgetData, itemId: string): ItemYearTotal[] {
  return Object.values(data.years)
    .sort((a, b) => a.year - b.year)
    .map((y) => ({
      year: y.year,
      present: y.itemIds.includes(itemId),
      total: entriesAnnualTotal(y.entries[itemId]),
      filled: Object.keys(y.entries[itemId] ?? {}).length,
    }));
}
