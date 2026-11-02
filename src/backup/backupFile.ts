/**
 * Format de sauvegarde JSON (export / import).
 *
 * {
 *   "app": "budget",
 *   "schemaVersion": 1,
 *   "exportedAt": "2026-10-30T12:00:00.000Z",
 *   "data": { ...BudgetData complet : familles, catégories, éléments, toutes les années, pointage, paramètres }
 * }
 *
 * Aucune donnée n'est jamais envoyée : le fichier est généré et relu localement.
 */
import { parseBudgetData } from '../schema';
import { MONTHS, SCHEMA_VERSION } from '../domain/types';
import type { BudgetData } from '../domain/types';

export const BACKUP_APP = 'budget';
export const MAX_BACKUP_CHARS = 20 * 1024 * 1024;

export interface BackupEnvelope {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  data: BudgetData;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `budget-backup-2026-10-30.json` (date locale réelle de l'export). */
export function backupFilename(now: Date, suffix = ''): string {
  return `budget-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}${suffix}.json`;
}

export function buildBackup(data: BudgetData, now: Date = new Date()): { filename: string; content: string; exportedAt: string } {
  const exportedAt = now.toISOString();
  const envelope: BackupEnvelope = {
    app: BACKUP_APP,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    // Le fichier est lui-même une sauvegarde : restaurer ce fichier restaure aussi cette date.
    data: { ...data, settings: { ...data.settings, lastExportAt: exportedAt } },
  };
  return { filename: backupFilename(now), content: JSON.stringify(envelope, null, 2), exportedAt };
}

export type ParsedBackup = { ok: true; data: BudgetData; exportedAt: string | null } | { ok: false; message: string };

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function hasForbiddenKey(value: unknown, depth = 0): boolean {
  if (depth > 12 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((v) => hasForbiddenKey(v, depth + 1));
  return Object.keys(value).some((k) => FORBIDDEN_KEYS.has(k) || hasForbiddenKey((value as Record<string, unknown>)[k], depth + 1));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (message: string): ParsedBackup => ({ ok: false, message });

/**
 * Lecture + validation complète, SANS rien modifier :
 * JSON valide → enveloppe → version → schéma → intégrité des relations.
 */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_CHARS) return fail('Fichier trop volumineux : ce n\'est pas une sauvegarde Budget.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('Ce fichier n\'est pas un JSON lisible (fichier tronqué ou modifié ?).');
  }
  if (hasForbiddenKey(raw)) return fail('Le fichier contient des clés interdites : import refusé par sécurité.');
  if (!isObject(raw) || raw.app !== BACKUP_APP || !isObject(raw.data)) {
    return fail('Ce fichier n\'est pas une sauvegarde de l\'application Budget.');
  }
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion !== raw.data.schemaVersion) {
    return fail('La version du format est absente ou incohérente dans ce fichier.');
  }
  const parsed = parseBudgetData(raw.data);
  if (!parsed.ok) {
    return fail(
      parsed.kind === 'too-new'
        ? `${parsed.message} Mettez à jour l'application avant d'importer ce fichier.`
        : `Le contenu de la sauvegarde est invalide. ${parsed.message}`,
    );
  }
  return { ok: true, data: parsed.data, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null };
}

export interface DataSummary {
  years: number[];
  items: number;
  archivedItems: number;
  categories: number;
  cells: number;
  checkedCells: number;
}

export function summarizeData(data: BudgetData): DataSummary {
  let cells = 0;
  let checkedCells = 0;
  for (const y of Object.values(data.years)) {
    for (const entries of Object.values(y.entries)) {
      for (const m of MONTHS) {
        const c = entries[m];
        if (!c) continue;
        cells += 1;
        if (c.checked) checkedCells += 1;
      }
    }
  }
  const items = Object.values(data.items);
  return {
    years: Object.values(data.years).map((y) => y.year).sort((a, b) => a - b),
    items: items.length,
    archivedItems: items.filter((i) => i.archived).length,
    categories: Object.keys(data.categories).length,
    cells,
    checkedCells,
  };
}

export function isEmptyData(data: BudgetData): boolean {
  return Object.keys(data.years).length === 0 && Object.keys(data.items).length === 0 && Object.keys(data.categories).length === 0;
}

/** Remplacement complet : le contenu du fichier devient les données actuelles (la révision est gérée par le store). */
export function planReplace(current: BudgetData, incoming: BudgetData): BudgetData {
  return structuredClone({ ...incoming, revision: current.revision });
}
