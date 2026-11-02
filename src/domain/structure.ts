import type { BudgetData, BudgetItem, BudgetYear, Category, FamilyId } from './types';

export interface CategoryGroup {
  /** null = éléments sans catégorie. */
  category: Category | null;
  items: BudgetItem[];
}

/**
 * Éléments d'une famille pour une année, regroupés par catégorie transversale.
 * Ordre : catégories par `order`, puis « sans catégorie » ; éléments par `order`.
 */
export function groupFamilyItems(data: BudgetData, year: BudgetYear, familyId: FamilyId): CategoryGroup[] {
  const items = year.itemIds
    .map((id) => data.items[id])
    .filter((i): i is BudgetItem => i !== undefined && i.familyId === familyId)
    .sort((a, b) => a.order - b.order);

  const groups = new Map<string | null, BudgetItem[]>();
  for (const item of items) {
    const key = item.categoryId && data.categories[item.categoryId] ? item.categoryId : null;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const result: CategoryGroup[] = [];
  const cats = [...groups.keys()]
    .filter((k): k is string => k !== null)
    .map((k) => data.categories[k] as Category)
    .sort((a, b) => a.order - b.order);
  for (const category of cats) result.push({ category, items: groups.get(category.id) ?? [] });
  const orphans = groups.get(null);
  if (orphans) result.push({ category: null, items: orphans });
  return result;
}

/** Année affichée : dernière ouverte si elle existe encore, sinon la plus récente. */
export function resolveSelectedYear(data: BudgetData): number | null {
  const last = data.settings.lastOpenedYear;
  if (last !== null && data.years[String(last)]) return last;
  const all = Object.values(data.years).map((y) => y.year);
  return all.length ? Math.max(...all) : null;
}
