/**
 * Validation des données (localStorage, et plus tard import JSON) :
 * migration de version → schéma Zod → contrôles d'intégrité référentielle.
 */
import { z } from 'zod';
import { FAMILY_IDS, SCHEMA_VERSION } from '../domain/types';
import type { BudgetData } from '../domain/types';

const cellSchema = z.object({
  amount: z.number().int().min(0),
  checked: z.boolean().optional(),
});
const monthKey = z.string().regex(/^(?:[1-9]|1[0-2])$/);

const budgetDataSchema = z.object({
  schemaVersion: z.number().int(),
  revision: z.number().int().min(0),
  families: z.record(
    z.string(),
    z.object({
      id: z.enum(FAMILY_IDS),
      label: z.string().min(1),
      kind: z.enum(['income', 'consumption', 'savings']),
      order: z.number(),
    }),
  ),
  categories: z.record(
    z.string(),
    z.object({ id: z.string(), label: z.string().min(1), order: z.number(), archived: z.boolean() }),
  ),
  items: z.record(
    z.string(),
    z.object({
      id: z.string(),
      label: z.string().min(1),
      familyId: z.enum(FAMILY_IDS),
      categoryId: z.string().nullable(),
      order: z.number(),
      archived: z.boolean(),
      nature: z.enum(['ponctuelle', 'recurrente_temporaire']).optional(),
      feeRate: z.number().min(0).max(1).optional(),
      createdAt: z.string(),
    }),
  ),
  years: z.record(
    z.string(),
    z.object({
      year: z.number().int(),
      itemIds: z.array(z.string()),
      entries: z.record(z.string(), z.record(monthKey, cellSchema)),
      createdAt: z.string(),
      derivedFromYear: z.number().int().optional(),
    }),
  ),
  settings: z.object({
    lastOpenedYear: z.number().int().nullable(),
    lastExportAt: z.string().nullable(),
  }),
});

const SAFE_KEY = /^[\w-]{1,64}$/;

/** Liste lisible des incohérences structurelles (vide = données saines). */
export function checkIntegrity(data: BudgetData): string[] {
  const issues: string[] = [];
  const unsafe = [
    ...Object.keys(data.categories),
    ...Object.keys(data.items),
    ...Object.keys(data.years),
    ...Object.values(data.years).flatMap((y) => [...y.itemIds, ...Object.keys(y.entries)]),
  ].find((k) => !SAFE_KEY.test(k));
  if (unsafe !== undefined) issues.push('Identifiant invalide dans les données.');
  for (const f of FAMILY_IDS) {
    if (!data.families[f] || data.families[f].id !== f) issues.push(`Famille manquante ou invalide : ${f}.`);
  }
  for (const [key, c] of Object.entries(data.categories)) {
    if (c.id !== key) issues.push(`Catégorie « ${c.label} » : identifiant incohérent.`);
  }
  for (const [key, item] of Object.entries(data.items)) {
    if (item.id !== key) issues.push(`Élément « ${item.label} » : identifiant incohérent.`);
    if (item.categoryId !== null && !data.categories[item.categoryId]) {
      issues.push(`Élément « ${item.label} » : catégorie inconnue.`);
    }
  }
  for (const [key, y] of Object.entries(data.years)) {
    if (String(y.year) !== key) issues.push(`Année ${key} : clé incohérente.`);
    const members = new Set(y.itemIds);
    if (members.size !== y.itemIds.length) issues.push(`Année ${key} : éléments en double.`);
    for (const id of y.itemIds) if (!data.items[id]) issues.push(`Année ${key} : élément inconnu (${id}).`);
    for (const id of Object.keys(y.entries)) {
      if (!members.has(id)) issues.push(`Année ${key} : valeurs pour un élément absent de l'année (${id}).`);
    }
  }
  return issues;
}

export type ParseResult =
  | { ok: true; data: BudgetData }
  | { ok: false; kind: 'too-new'; version: number; message: string }
  | { ok: false; kind: 'invalid'; message: string };

/** Migrations explicites : migrations[n] transforme la version n en n+1. */
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function parseBudgetData(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, kind: 'invalid', message: 'Le contenu n\'est pas un budget valide.' };
  }
  let obj = raw as Record<string, unknown>;
  const version = obj.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, kind: 'invalid', message: 'Version du format de données absente ou invalide.' };
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      kind: 'too-new',
      version,
      message: `Ces données ont été créées par une version plus récente de l'application (format ${version}, cette version gère jusqu'au format ${SCHEMA_VERSION}).`,
    };
  }
  for (let v = version; v < SCHEMA_VERSION; v += 1) {
    const step = migrations[v];
    if (!step) return { ok: false, kind: 'invalid', message: `Aucune migration disponible depuis le format ${v}.` };
    obj = { ...step(obj), schemaVersion: v + 1 };
  }

  const parsed = budgetDataSchema.safeParse(obj);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join(' › ') : '';
    return { ok: false, kind: 'invalid', message: `Structure invalide${where ? ` (${where})` : ''}.` };
  }
  const data = parsed.data as unknown as BudgetData;
  const issues = checkIntegrity(data);
  if (issues.length) {
    return { ok: false, kind: 'invalid', message: `Incohérences détectées : ${issues.slice(0, 3).join(' ')}` };
  }
  return { ok: true, data };
}
