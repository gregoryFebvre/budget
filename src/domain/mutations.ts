/**
 * Transformations PURES et immuables de BudgetData.
 * Elles ne touchent ni au stockage ni à `revision` (géré par le store).
 */
import { DEFAULT_FAMILIES, MAX_YEAR, MIN_YEAR } from './constants';
import { MONTHS, SCHEMA_VERSION } from './types';
import type {
  BudgetData,
  BudgetItem,
  Cents,
  FamilyId,
  ItemEntries,
  ItemNature,
  MonthIndex,
} from './types';

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createEmptyData(): BudgetData {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    families: structuredClone(DEFAULT_FAMILIES),
    categories: {},
    items: {},
    years: {},
    settings: { lastOpenedYear: null, lastExportAt: null },
  };
}

export interface CreateYearOptions {
  /** Année dont on reprend la structure (éléments non archivés). */
  fromYear?: number;
  /** Copier aussi les montants (jamais le pointage). */
  copyAmounts?: boolean;
}

export function createYear(data: BudgetData, year: number, opts: CreateYearOptions = {}): BudgetData {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error(`Année invalide : ${year}`);
  }
  if (data.years[String(year)]) throw new Error(`L'année ${year} existe déjà.`);

  const source = opts.fromYear !== undefined ? data.years[String(opts.fromYear)] : undefined;
  if (opts.fromYear !== undefined && !source) throw new Error(`L'année source ${opts.fromYear} est introuvable.`);

  const itemIds = source ? source.itemIds.filter((id) => data.items[id] && !data.items[id].archived) : [];
  const entries: Record<string, ItemEntries> = {};
  if (source && opts.copyAmounts) {
    for (const id of itemIds) {
      const from = source.entries[id];
      if (!from) continue;
      const copy: ItemEntries = {};
      for (const m of MONTHS) {
        const cell = from[m];
        if (cell) copy[m] = { amount: cell.amount }; // le pointage n'est JAMAIS copié
      }
      if (Object.keys(copy).length) entries[id] = copy;
    }
  }

  return {
    ...data,
    years: {
      ...data.years,
      [String(year)]: {
        year,
        itemIds,
        entries,
        createdAt: new Date().toISOString(),
        ...(source ? { derivedFromYear: source.year } : {}),
      },
    },
  };
}

export function selectYear(data: BudgetData, year: number): BudgetData {
  if (!data.years[String(year)]) throw new Error(`L'année ${year} n'existe pas.`);
  return { ...data, settings: { ...data.settings, lastOpenedYear: year } };
}

/** Définit (ou efface avec null) le montant d'un mois. Effacer retire aussi le pointage. */
export function setAmount(
  data: BudgetData,
  year: number,
  itemId: string,
  month: MonthIndex,
  amount: Cents | null,
): BudgetData {
  const y = data.years[String(year)];
  if (!y || !y.itemIds.includes(itemId)) throw new Error('Élément ou année introuvable.');
  if (amount !== null && (!Number.isInteger(amount) || amount < 0)) throw new Error('Montant invalide.');

  const current = y.entries[itemId] ?? {};
  const nextItem: ItemEntries = { ...current };
  if (amount === null) delete nextItem[month];
  else nextItem[month] = { ...current[month], amount };

  const entries = { ...y.entries };
  if (Object.keys(nextItem).length) entries[itemId] = nextItem;
  else delete entries[itemId];

  return { ...data, years: { ...data.years, [String(year)]: { ...y, entries } } };
}

/** Pointe / dépointe une cellule renseignée. Sans effet sur une cellule vide. Ne modifie pas le montant. */
export function toggleChecked(data: BudgetData, year: number, itemId: string, month: MonthIndex): BudgetData {
  const y = data.years[String(year)];
  const cell = y?.entries[itemId]?.[month];
  if (!y || !cell) return data;
  const nextCell = cell.checked ? { amount: cell.amount } : { amount: cell.amount, checked: true };
  return {
    ...data,
    years: {
      ...data.years,
      [String(year)]: {
        ...y,
        entries: { ...y.entries, [itemId]: { ...y.entries[itemId], [month]: nextCell } },
      },
    },
  };
}

export interface AddItemInput {
  label: string;
  familyId: FamilyId;
  /** Libellé de catégorie : réutilise l'existante (insensible à la casse) ou la crée. */
  categoryLabel?: string;
  year: number;
  nature?: ItemNature;
}

export function addItem(data: BudgetData, input: AddItemInput): BudgetData {
  const label = input.label.trim();
  if (!label) throw new Error('Le libellé est obligatoire.');
  const y = data.years[String(input.year)];
  if (!y) throw new Error(`L'année ${input.year} n'existe pas.`);

  let categories = data.categories;
  let categoryId: string | null = null;
  const catLabel = input.categoryLabel?.trim();
  if (catLabel) {
    const existing = Object.values(categories).find((c) => c.label.toLowerCase() === catLabel.toLowerCase());
    if (existing) categoryId = existing.id;
    else {
      categoryId = newId();
      const order = Math.max(0, ...Object.values(categories).map((c) => c.order)) + 1;
      categories = { ...categories, [categoryId]: { id: categoryId, label: catLabel, order, archived: false } };
    }
  }

  const id = newId();
  const order = Math.max(0, ...Object.values(data.items).map((i) => i.order)) + 1;
  const item: BudgetItem = {
    id,
    label,
    familyId: input.familyId,
    categoryId,
    order,
    archived: false,
    createdAt: new Date().toISOString(),
    ...(input.familyId === 'depenses_ponctuelles' ? { nature: input.nature ?? 'ponctuelle' } : {}),
  };

  return {
    ...data,
    categories,
    items: { ...data.items, [id]: item },
    years: { ...data.years, [String(input.year)]: { ...y, itemIds: [...y.itemIds, id] } },
  };
}

export type ItemPatch = Partial<
  Pick<BudgetItem, 'label' | 'categoryId' | 'archived' | 'nature' | 'feeRate' | 'familyId'>
>;

/**
 * Modifie un élément sans toucher à son id : montants et pointage sont conservés.
 * Changer de famille reclasse AUSSI l'historique (classification globale, décision Q6).
 */
export function updateItem(data: BudgetData, itemId: string, patch: ItemPatch): BudgetData {
  const item = data.items[itemId];
  if (!item) throw new Error('Élément introuvable.');
  if (patch.label !== undefined && !patch.label.trim()) throw new Error('Le libellé est obligatoire.');
  if (patch.categoryId && !data.categories[patch.categoryId]) throw new Error('Catégorie introuvable.');
  const next: BudgetItem = { ...item, ...patch, label: patch.label !== undefined ? patch.label.trim() : item.label };
  if (next.familyId === 'depenses_ponctuelles') next.nature = next.nature ?? 'ponctuelle';
  else delete next.nature;
  return { ...data, items: { ...data.items, [itemId]: next } };
}

const hasValues = (entries: ItemEntries | undefined): boolean => entries !== undefined && Object.keys(entries).length > 0;

/** Années (triées) où l'élément a au moins un montant. */
export function yearsWithValues(data: BudgetData, itemId: string): number[] {
  return Object.values(data.years)
    .filter((y) => hasValues(y.entries[itemId]))
    .map((y) => y.year)
    .sort((a, b) => a - b);
}

/** Échange l'ordre d'affichage avec le voisin de la même famille. */
export function moveItem(data: BudgetData, itemId: string, direction: -1 | 1): BudgetData {
  const item = data.items[itemId];
  if (!item) throw new Error('Élément introuvable.');
  const siblings = Object.values(data.items)
    .filter((i) => i.familyId === item.familyId)
    .sort((a, b) => a.order - b.order);
  const idx = siblings.findIndex((i) => i.id === itemId);
  const other = siblings[idx + direction];
  if (!other) return data;
  return {
    ...data,
    items: {
      ...data.items,
      [item.id]: { ...item, order: other.order },
      [other.id]: { ...other, order: item.order },
    },
  };
}

export interface DuplicateItemOptions {
  year: number;
  label?: string;
  /** Copie les montants de cette même année (jamais le pointage). */
  copyAmounts?: boolean;
}

/** Crée un NOUVEL élément (nouvel id, historique vierge) à partir d'un existant. */
export function duplicateItem(data: BudgetData, itemId: string, opts: DuplicateItemOptions): BudgetData {
  const src = data.items[itemId];
  const y = data.years[String(opts.year)];
  if (!src) throw new Error('Élément introuvable.');
  if (!y) throw new Error(`L'année ${opts.year} n'existe pas.`);
  const label = (opts.label ?? `${src.label} (copie)`).trim();
  if (!label) throw new Error('Le libellé est obligatoire.');

  const id = newId();
  const order = Math.max(0, ...Object.values(data.items).map((i) => i.order)) + 1;
  const copy: BudgetItem = { ...src, id, label, order, archived: false, createdAt: new Date().toISOString() };

  const entries = { ...y.entries };
  const from = y.entries[itemId];
  if (opts.copyAmounts && from) {
    const values: ItemEntries = {};
    for (const m of MONTHS) {
      const cell = from[m];
      if (cell) values[m] = { amount: cell.amount };
    }
    if (hasValues(values)) entries[id] = values;
  }
  return {
    ...data,
    items: { ...data.items, [id]: copy },
    years: { ...data.years, [String(opts.year)]: { ...y, itemIds: [...y.itemIds, id], entries } },
  };
}

/** Suppression définitive : uniquement si l'élément n'a AUCUN montant dans aucune année. */
export function deleteItem(data: BudgetData, itemId: string): BudgetData {
  const item = data.items[itemId];
  if (!item) throw new Error('Élément introuvable.');
  const used = yearsWithValues(data, itemId);
  if (used.length) {
    throw new Error(`« ${item.label} » contient des montants (${used.join(', ')}) : archivez-le plutôt que de le supprimer.`);
  }
  const items = { ...data.items };
  delete items[itemId];
  const years = Object.fromEntries(
    Object.entries(data.years).map(([k, y]) => [k, { ...y, itemIds: y.itemIds.filter((id) => id !== itemId) }]),
  );
  return { ...data, items, years };
}

/** Retire un élément de la structure d'UNE année, uniquement si cette année n'a aucun montant pour lui. */
export function removeItemFromYear(data: BudgetData, year: number, itemId: string): BudgetData {
  const y = data.years[String(year)];
  if (!y || !y.itemIds.includes(itemId)) throw new Error('Élément absent de cette année.');
  if (hasValues(y.entries[itemId])) {
    throw new Error(`Cet élément a des montants en ${year} : effacez-les d'abord, ou archivez l'élément.`);
  }
  return {
    ...data,
    years: { ...data.years, [String(year)]: { ...y, itemIds: y.itemIds.filter((id) => id !== itemId) } },
  };
}

export function addExistingItemToYear(data: BudgetData, year: number, itemId: string): BudgetData {
  const y = data.years[String(year)];
  if (!y) throw new Error(`L'année ${year} n'existe pas.`);
  if (!data.items[itemId]) throw new Error('Élément introuvable.');
  if (y.itemIds.includes(itemId)) return data;
  return { ...data, years: { ...data.years, [String(year)]: { ...y, itemIds: [...y.itemIds, itemId] } } };
}

// ---------- Catégories (transversales) ----------

function assertCategoryLabelFree(data: BudgetData, label: string, exceptId?: string): void {
  const clash = Object.values(data.categories).find(
    (c) => c.id !== exceptId && c.label.toLowerCase() === label.toLowerCase(),
  );
  if (clash) throw new Error(`Une catégorie « ${clash.label} » existe déjà.`);
}

export function addCategory(data: BudgetData, label: string): BudgetData {
  const clean = label.trim();
  if (!clean) throw new Error('Le libellé est obligatoire.');
  assertCategoryLabelFree(data, clean);
  const id = newId();
  const order = Math.max(0, ...Object.values(data.categories).map((c) => c.order)) + 1;
  return { ...data, categories: { ...data.categories, [id]: { id, label: clean, order, archived: false } } };
}

export function renameCategory(data: BudgetData, id: string, label: string): BudgetData {
  const cat = data.categories[id];
  if (!cat) throw new Error('Catégorie introuvable.');
  const clean = label.trim();
  if (!clean) throw new Error('Le libellé est obligatoire.');
  assertCategoryLabelFree(data, clean, id);
  return { ...data, categories: { ...data.categories, [id]: { ...cat, label: clean } } };
}

export function setCategoryArchived(data: BudgetData, id: string, archived: boolean): BudgetData {
  const cat = data.categories[id];
  if (!cat) throw new Error('Catégorie introuvable.');
  return { ...data, categories: { ...data.categories, [id]: { ...cat, archived } } };
}

export function moveCategory(data: BudgetData, id: string, direction: -1 | 1): BudgetData {
  const cat = data.categories[id];
  if (!cat) throw new Error('Catégorie introuvable.');
  const sorted = Object.values(data.categories).sort((a, b) => a.order - b.order);
  const other = sorted[sorted.findIndex((c) => c.id === id) + direction];
  if (!other) return data;
  return {
    ...data,
    categories: {
      ...data.categories,
      [cat.id]: { ...cat, order: other.order },
      [other.id]: { ...other, order: cat.order },
    },
  };
}

/** Réaffecte tous les éléments d'une catégorie vers une autre (ou « sans catégorie » si toId = null). */
export function reassignCategory(data: BudgetData, fromId: string, toId: string | null): BudgetData {
  if (!data.categories[fromId]) throw new Error('Catégorie introuvable.');
  if (toId !== null && !data.categories[toId]) throw new Error('Catégorie de destination introuvable.');
  if (toId === fromId) return data;
  const items = Object.fromEntries(
    Object.entries(data.items).map(([k, i]) => [k, i.categoryId === fromId ? { ...i, categoryId: toId } : i]),
  );
  return { ...data, items };
}

export function countItemsInCategory(data: BudgetData, id: string): number {
  return Object.values(data.items).filter((i) => i.categoryId === id).length;
}

/** Suppression : refusée tant qu'un élément (même archivé) y est rattaché. */
export function deleteCategory(data: BudgetData, id: string): BudgetData {
  const cat = data.categories[id];
  if (!cat) throw new Error('Catégorie introuvable.');
  const n = countItemsInCategory(data, id);
  if (n > 0) {
    throw new Error(`« ${cat.label} » est utilisée par ${n} élément(s) : réaffectez-les ou archivez la catégorie.`);
  }
  const categories = { ...data.categories };
  delete categories[id];
  return { ...data, categories };
}

// ---------- Familles ----------

/** Les 4 familles ne sont ni supprimables ni déplaçables : seul le libellé change. */
export function setFamilyLabel(data: BudgetData, familyId: FamilyId, label: string): BudgetData {
  const family = data.families[familyId];
  const clean = label.trim();
  if (!clean) throw new Error('Le libellé est obligatoire.');
  return { ...data, families: { ...data.families, [familyId]: { ...family, label: clean } } };
}
