import { addItem, createEmptyData, createYear, setAmount, toggleChecked } from '../domain/mutations';
import type { BudgetData, FamilyId, MonthIndex } from '../domain/types';

export const Y = 2030; // année fictive

export function idOf(data: BudgetData, label: string): string {
  const item = Object.values(data.items).find((i) => i.label === label);
  if (!item) throw new Error(`Élément de test introuvable : ${label}`);
  return item.id;
}

export function withItem(
  data: BudgetData,
  label: string,
  familyId: FamilyId,
  amounts: Partial<Record<MonthIndex, number>>,
  opts: { year?: number; checked?: MonthIndex[]; category?: string } = {},
): BudgetData {
  const year = opts.year ?? Y;
  let d = addItem(data, { label, familyId, year, ...(opts.category ? { categoryLabel: opts.category } : {}) });
  const id = idOf(d, label);
  for (const [m, cents] of Object.entries(amounts)) d = setAmount(d, year, id, Number(m) as MonthIndex, cents);
  for (const m of opts.checked ?? []) d = toggleChecked(d, year, id, m);
  return d;
}

/** Exemple du cahier des charges §5.4.3 (montants fictifs) : janvier, reste à provisionner = 340 €. */
export function specExample(): BudgetData {
  let d = createYear(createEmptyData(), Y);
  d = withItem(d, 'Salaire (test)', 'revenus', { 1: 200000 });
  d = withItem(d, 'Crédit immobilier', 'depenses_fixes', { 1: 80000 }, { checked: [1] });
  d = withItem(d, 'Assurance', 'depenses_fixes', { 1: 12000 }, { checked: [1] });
  d = withItem(d, 'Électricité', 'depenses_fixes', { 1: 9000 });
  d = withItem(d, 'Courses', 'depenses_fixes', { 1: 25000 });
  d = withItem(d, 'Abonnement Internet', 'depenses_fixes', { 1: 4000 }, { checked: [1] });
  return d;
}
