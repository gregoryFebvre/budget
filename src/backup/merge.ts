/**
 * Fusion DÉTERMINISTE de deux budgets, fondée sur les identifiants stables.
 *
 * Règles (aucun écrasement silencieux) :
 *  - Ce qui n'existe que d'un côté est AJOUTÉ (année, élément, catégorie, cellule).
 *  - Ce qui est identique des deux côtés est ignoré.
 *  - Ce qui existe des deux côtés avec des valeurs différentes est un CONFLIT, toujours listé.
 *    Par défaut on conserve la valeur LOCALE ; `prefer: 'imported'` retient celle du fichier.
 *  - Catégories : rapprochées par id ; à défaut par libellé (insensible à la casse), pour ne pas
 *    créer de doublon. Éléments : rapprochés par id uniquement (jamais par libellé).
 *  - Les paramètres locaux (année ouverte, date d'export) sont toujours conservés.
 *  - Ordre d'affichage : les éléments/catégories ajoutés sont placés après les existants.
 *  - Les familles ne sont jamais ajoutées ni supprimées (seul un libellé peut différer).
 *
 * Limites (v1) : une suppression faite d'un côté n'est pas propagée (la fusion n'efface jamais
 * rien) ; les dates de création et `derivedFromYear` locales sont conservées.
 */
import { formatEuros } from '../domain/money';
import { FAMILY_IDS, MONTHS } from '../domain/types';
import type { BudgetData, BudgetItem, BudgetYear, Category, ItemEntries } from '../domain/types';
import { MONTH_NAMES } from '../domain/constants';
import { checkIntegrity } from '../schema';

export type MergePreference = 'local' | 'imported';

export interface MergeConflict {
  kind: 'famille' | 'categorie' | 'element' | 'montant' | 'pointage';
  /** Libellé lisible de l'objet concerné. */
  subject: string;
  /** Année / mois pour les cellules. */
  where?: string;
  local: string;
  imported: string;
}

export interface MergeReport {
  addedYears: number[];
  addedCategories: number;
  addedItems: number;
  addedCells: number;
  identicalCells: number;
  remappedCategories: number;
  conflicts: MergeConflict[];
}

export function mergeData(
  local: BudgetData,
  incoming: BudgetData,
  prefer: MergePreference = 'local',
): { data: BudgetData; report: MergeReport } {
  const useImported = prefer === 'imported';
  const report: MergeReport = {
    addedYears: [],
    addedCategories: 0,
    addedItems: 0,
    addedCells: 0,
    identicalCells: 0,
    remappedCategories: 0,
    conflicts: [],
  };

  // --- Familles : seul le libellé peut différer
  const families = { ...local.families };
  for (const f of FAMILY_IDS) {
    const l = local.families[f];
    const i = incoming.families[f];
    if (l.label !== i.label) {
      report.conflicts.push({ kind: 'famille', subject: 'Famille', local: l.label, imported: i.label });
      if (useImported) families[f] = { ...l, label: i.label };
    }
  }

  // --- Catégories
  const categories: Record<string, Category> = { ...local.categories };
  const catMap = new Map<string, string>(); // id importé → id local
  let nextCatOrder = Math.max(0, ...Object.values(local.categories).map((c) => c.order));
  const byLabel = (label: string) => Object.values(local.categories).find((c) => c.label.toLowerCase() === label.toLowerCase());
  for (const c of Object.values(incoming.categories).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    const same = local.categories[c.id];
    if (same) {
      catMap.set(c.id, same.id);
      if (same.label !== c.label || same.archived !== c.archived) {
        report.conflicts.push({
          kind: 'categorie',
          subject: 'Catégorie',
          local: `${same.label}${same.archived ? ' (archivée)' : ''}`,
          imported: `${c.label}${c.archived ? ' (archivée)' : ''}`,
        });
        const labelTaken = Object.values(local.categories).some((o) => o.id !== same.id && o.label.toLowerCase() === c.label.toLowerCase());
        if (useImported) categories[same.id] = { ...same, label: labelTaken ? same.label : c.label, archived: c.archived };
      }
      continue;
    }
    const twin = byLabel(c.label);
    if (twin) {
      catMap.set(c.id, twin.id);
      report.remappedCategories += 1;
      continue;
    }
    nextCatOrder += 1;
    categories[c.id] = { ...c, order: nextCatOrder };
    catMap.set(c.id, c.id);
    report.addedCategories += 1;
  }

  // --- Éléments
  const items: Record<string, BudgetItem> = { ...local.items };
  let nextItemOrder = Math.max(0, ...Object.values(local.items).map((i) => i.order));
  const describeItem = (i: BudgetItem, catLabel: string) =>
    `${i.label} · ${local.families[i.familyId].label} · ${catLabel}${i.archived ? ' · archivé' : ''}`;
  const catLabelOf = (id: string | null, source: BudgetData) => (id && source.categories[id] ? source.categories[id].label : 'sans catégorie');

  for (const inc of Object.values(incoming.items).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    const mappedCat = inc.categoryId === null ? null : (catMap.get(inc.categoryId) ?? null);
    const existing = local.items[inc.id];
    if (!existing) {
      nextItemOrder += 1;
      items[inc.id] = { ...inc, categoryId: mappedCat, order: nextItemOrder };
      report.addedItems += 1;
      continue;
    }
    const differs =
      existing.label !== inc.label ||
      existing.familyId !== inc.familyId ||
      existing.categoryId !== mappedCat ||
      existing.archived !== inc.archived ||
      existing.nature !== inc.nature ||
      existing.feeRate !== inc.feeRate;
    if (differs) {
      report.conflicts.push({
        kind: 'element',
        subject: existing.label,
        local: describeItem(existing, catLabelOf(existing.categoryId, local)),
        imported: describeItem(inc, catLabelOf(inc.categoryId, incoming)),
      });
      if (useImported) {
        const merged: BudgetItem = { ...existing, label: inc.label, familyId: inc.familyId, categoryId: mappedCat, archived: inc.archived };
        if (inc.nature) merged.nature = inc.nature;
        else delete merged.nature;
        if (inc.feeRate !== undefined) merged.feeRate = inc.feeRate;
        else delete merged.feeRate;
        items[inc.id] = merged;
      }
    }
  }

  // --- Années
  const years: Record<string, BudgetYear> = { ...local.years };
  const itemLabel = (id: string) => items[id]?.label ?? local.items[id]?.label ?? incoming.items[id]?.label ?? id;

  for (const incYear of Object.values(incoming.years).sort((a, b) => a.year - b.year)) {
    const key = String(incYear.year);
    const localYear = local.years[key];
    if (!localYear) {
      years[key] = structuredClone(incYear);
      report.addedYears.push(incYear.year);
      for (const e of Object.values(incYear.entries)) report.addedCells += Object.keys(e).length;
      continue;
    }

    const itemIds = [...localYear.itemIds, ...incYear.itemIds.filter((id) => !localYear.itemIds.includes(id))];
    const entries: Record<string, ItemEntries> = { ...localYear.entries };
    for (const [itemId, incEntries] of Object.entries(incYear.entries).sort(([a], [b]) => a.localeCompare(b))) {
      const current: ItemEntries = { ...(entries[itemId] ?? {}) };
      for (const m of MONTHS) {
        const inc = incEntries[m];
        if (!inc) continue;
        const loc = current[m];
        if (!loc) {
          current[m] = { ...inc };
          report.addedCells += 1;
          continue;
        }
        const samePointage = Boolean(loc.checked) === Boolean(inc.checked);
        if (loc.amount === inc.amount && samePointage) {
          report.identicalCells += 1;
          continue;
        }
        const where = `${incYear.year} · ${MONTH_NAMES[m]}`;
        if (loc.amount === inc.amount) {
          report.conflicts.push({
            kind: 'pointage',
            subject: itemLabel(itemId),
            where,
            local: loc.checked ? 'pointé' : 'non pointé',
            imported: inc.checked ? 'pointé' : 'non pointé',
          });
        } else {
          report.conflicts.push({
            kind: 'montant',
            subject: itemLabel(itemId),
            where,
            local: `${formatEuros(loc.amount)}${loc.checked ? ' (pointé)' : ''}`,
            imported: `${formatEuros(inc.amount)}${inc.checked ? ' (pointé)' : ''}`,
          });
        }
        if (useImported) current[m] = { ...inc };
      }
      if (Object.keys(current).length) entries[itemId] = current;
    }
    years[key] = { ...localYear, itemIds, entries };
  }

  const data: BudgetData = { ...local, families, categories, items, years };
  const issues = checkIntegrity(data);
  if (issues.length) throw new Error(`Fusion annulée : incohérence détectée (${issues[0]}).`);
  return { data, report };
}
