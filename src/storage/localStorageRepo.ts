/**
 * Accès au localStorage : lecture validée, écriture VÉRIFIÉE.
 * Une sauvegarde n'est jamais déclarée réussie si l'écriture a échoué.
 * (Le localStorage n'est pas chiffré et reste lié à ce navigateur : le fichier JSON
 * exporté constitue la sauvegarde externe.)
 */
import { parseBudgetData } from '../schema';
import type { BudgetData } from '../domain/types';

export const STORAGE_KEY = 'budget:data';
export const BACKUP_KEY = 'budget:data:previous';
export const CORRUPT_KEY = 'budget:data:corrupt';

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; data: BudgetData; recoveredFromBackup: boolean }
  | { status: 'corrupt'; message: string; raw: string | null }
  | { status: 'too-new'; version: number; message: string; raw: string }
  | { status: 'unavailable'; message: string };

export function getBrowserStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__budget_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function tryParse(raw: string): ReturnType<typeof parseBudgetData> {
  try {
    return parseBudgetData(JSON.parse(raw));
  } catch {
    return { ok: false, kind: 'invalid', message: 'Le contenu enregistré n\'est pas du JSON lisible.' };
  }
}

export function loadData(storage: Storage | null): LoadResult {
  if (!storage) {
    return { status: 'unavailable', message: 'Le stockage du navigateur est indisponible (navigation privée ou accès bloqué).' };
  }
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable', message: 'Lecture du stockage du navigateur impossible.' };
  }
  if (raw === null) return { status: 'empty' };

  const main = tryParse(raw);
  if (main.ok) return { status: 'ok', data: main.data, recoveredFromBackup: false };
  if (main.kind === 'too-new') return { status: 'too-new', version: main.version, message: main.message, raw };

  // Données principales illisibles : on conserve une copie brute, puis on tente la copie de secours.
  try {
    storage.setItem(CORRUPT_KEY, raw);
  } catch {
    /* best effort */
  }
  let backupRaw: string | null = null;
  try {
    backupRaw = storage.getItem(BACKUP_KEY);
  } catch {
    /* ignoré */
  }
  if (backupRaw !== null) {
    const backup = tryParse(backupRaw);
    if (backup.ok) return { status: 'ok', data: backup.data, recoveredFromBackup: true };
  }
  return { status: 'corrupt', message: main.message, raw };
}

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'quota' | 'conflict' | 'verify' | 'error'; message: string };

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)
  );
}

function storedRevision(raw: string | null): number | null {
  if (raw === null) return null;
  try {
    const r = (JSON.parse(raw) as { revision?: unknown }).revision;
    return typeof r === 'number' ? r : null;
  } catch {
    return null;
  }
}

/**
 * Écrit les données. `expectedRevision` = révision connue du contenu stocké (null = rien d'enregistré).
 * Si le stockage contient autre chose, un autre onglet a écrit entre-temps : on refuse d'écraser.
 */
export function saveData(storage: Storage | null, data: BudgetData, expectedRevision: number | null): SaveResult {
  if (!storage) {
    return { ok: false, reason: 'unavailable', message: 'Stockage du navigateur indisponible : les modifications ne sont pas enregistrées.' };
  }
  let current: string | null;
  try {
    current = storage.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, reason: 'error', message: 'Lecture du stockage impossible : modification non enregistrée.' };
  }
  if (storedRevision(current) !== expectedRevision) {
    return {
      ok: false,
      reason: 'conflict',
      message: 'Les données ont été modifiées dans un autre onglet. Rechargez la page pour éviter toute perte.',
    };
  }

  const json = JSON.stringify(data);
  const write = (): void => {
    if (current !== null) {
      try {
        storage.setItem(BACKUP_KEY, current); // copie de l'état précédent (retour arrière d'un cran)
      } catch {
        try {
          storage.removeItem(BACKUP_KEY);
        } catch {
          /* ignoré */
        }
      }
    }
    storage.setItem(STORAGE_KEY, json);
  };

  try {
    write();
  } catch (e) {
    if (isQuotaError(e)) {
      try {
        storage.removeItem(BACKUP_KEY);
        storage.removeItem(CORRUPT_KEY);
        storage.setItem(STORAGE_KEY, json);
      } catch (e2) {
        return {
          ok: false,
          reason: isQuotaError(e2) ? 'quota' : 'error',
          message: 'Espace de stockage du navigateur saturé : modification NON enregistrée. Exportez une sauvegarde JSON.',
        };
      }
    } else {
      return { ok: false, reason: 'error', message: 'Écriture impossible dans le stockage du navigateur : modification NON enregistrée.' };
    }
  }

  try {
    if (storage.getItem(STORAGE_KEY) !== json) {
      return { ok: false, reason: 'verify', message: 'Vérification d\'écriture échouée : modification peut-être NON enregistrée.' };
    }
  } catch {
    return { ok: false, reason: 'verify', message: 'Vérification d\'écriture impossible.' };
  }
  return { ok: true };
}
