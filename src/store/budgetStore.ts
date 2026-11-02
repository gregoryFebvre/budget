import { create } from 'zustand';
import { createDemoData } from '../domain/demo';
import * as m from '../domain/mutations';
import { resolveSelectedYear } from '../domain/structure';
import type { AddItemInput, CreateYearOptions } from '../domain/mutations';
import type { BudgetData, Cents, MonthIndex } from '../domain/types';
import { BACKUP_KEY, CORRUPT_KEY, STORAGE_KEY, getBrowserStorage, loadData, saveData } from '../storage/localStorageRepo';

export type BootState =
  | { kind: 'ready' }
  | { kind: 'recovered' }
  | { kind: 'memory-only'; message: string }
  | { kind: 'corrupt'; message: string; raw: string | null }
  | { kind: 'too-new'; message: string; raw: string };

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saved'; at: string }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; message: string };

interface Core {
  data: BudgetData;
  boot: BootState;
  save: SaveState;
  /** Révision du contenu actuellement stocké (null = rien d'enregistré). */
  persistedRevision: number | null;
}

interface BudgetStore extends Core {
  commit: (mutator: (d: BudgetData) => BudgetData) => void;
  selectYear: (year: number) => void;
  setAmount: (year: number, itemId: string, month: MonthIndex, amount: Cents | null) => void;
  toggleChecked: (year: number, itemId: string, month: MonthIndex) => void;
  addItem: (input: AddItemInput) => void;
  /** Retourne un message d'erreur, ou null si l'année a été créée. */
  createYear: (year: number, opts?: CreateYearOptions) => string | null;
  /** Applique une mutation ; retourne un message d'erreur (règle métier refusée) ou null. */
  apply: (mutator: (d: BudgetData) => BudgetData) => string | null;
  /**
   * Remplace l'état par `build(current)` SEULEMENT si l'écriture dans le stockage réussit :
   * en cas d'échec, mémoire ET localStorage restent intacts. Retourne un message d'erreur ou null.
   */
  importData: (build: (current: BudgetData) => BudgetData) => string | null;
  markExported: (isoDate: string) => void;
  loadDemo: (year: number) => void;
  resetToEmpty: () => void;
  /**
   * Efface TOUTES les données de ce navigateur (données, copie de secours, copie de données illisibles).
   * Retourne un message d'erreur si le stockage refuse la suppression (rien n'est alors modifié en mémoire).
   */
  wipeAllData: () => string | null;
}

let storage: Storage | null = null;
let listenerAttached = false;

function bootstrap(st: Storage | null): Core {
  const loaded = loadData(st);
  switch (loaded.status) {
    case 'ok':
      return {
        data: loaded.data,
        boot: loaded.recoveredFromBackup ? { kind: 'recovered' } : { kind: 'ready' },
        save: { kind: 'idle' },
        // Si on a récupéré la copie de secours, le contenu principal est illisible : rien de « connu » n'est stocké.
        persistedRevision: loaded.recoveredFromBackup ? null : loaded.data.revision,
      };
    case 'empty':
      return { data: m.createEmptyData(), boot: { kind: 'ready' }, save: { kind: 'idle' }, persistedRevision: null };
    case 'unavailable':
      return {
        data: m.createEmptyData(),
        boot: { kind: 'memory-only', message: loaded.message },
        save: { kind: 'error', message: 'Stockage indisponible : les modifications ne seront pas conservées.' },
        persistedRevision: null,
      };
    case 'corrupt':
      return {
        data: m.createEmptyData(),
        boot: { kind: 'corrupt', message: loaded.message, raw: loaded.raw },
        save: { kind: 'idle' },
        persistedRevision: null,
      };
    case 'too-new':
      return {
        data: m.createEmptyData(),
        boot: { kind: 'too-new', message: loaded.message, raw: loaded.raw },
        save: { kind: 'idle' },
        persistedRevision: null,
      };
  }
}

storage = getBrowserStorage();

export const useBudgetStore = create<BudgetStore>()((set, get) => ({
  ...bootstrap(storage),

  commit: (mutator) => {
    const { data, boot, persistedRevision } = get();
    if (boot.kind === 'corrupt' || boot.kind === 'too-new') return; // jamais d'écriture sur des données non comprises
    const next: BudgetData = { ...mutator(data), revision: data.revision + 1 };
    const result = saveData(storage, next, persistedRevision);
    if (result.ok) {
      set({ data: next, save: { kind: 'saved', at: new Date().toISOString() }, persistedRevision: next.revision });
    } else if (result.reason === 'conflict') {
      set({ data: next, save: { kind: 'conflict', message: result.message } });
    } else {
      set({ data: next, save: { kind: 'error', message: result.message } });
    }
  },

  selectYear: (year) => get().commit((d) => m.selectYear(d, year)),
  setAmount: (year, itemId, month, amount) => get().commit((d) => m.setAmount(d, year, itemId, month, amount)),
  toggleChecked: (year, itemId, month) => get().commit((d) => m.toggleChecked(d, year, itemId, month)),
  addItem: (input) => get().commit((d) => m.addItem(d, input)),

  createYear: (year, opts) => {
    try {
      m.createYear(get().data, year, opts); // validation à blanc
    } catch (e) {
      return e instanceof Error ? e.message : 'Création impossible.';
    }
    get().commit((d) => m.selectYear(m.createYear(d, year, opts), year));
    return null;
  },

  apply: (mutator) => {
    try {
      mutator(get().data); // validation à blanc : les mutations sont pures
    } catch (e) {
      return e instanceof Error ? e.message : 'Opération impossible.';
    }
    get().commit(mutator);
    return null;
  },

  importData: (build) => {
    const { data, boot, persistedRevision } = get();
    if (boot.kind === 'corrupt' || boot.kind === 'too-new') return 'Import impossible tant que les données actuelles sont illisibles.';
    let next: BudgetData;
    try {
      next = { ...build(data), revision: data.revision + 1 };
    } catch (e) {
      return e instanceof Error ? e.message : 'Import impossible.';
    }
    const result = saveData(storage, next, persistedRevision);
    if (!result.ok) return `${result.message} Vos données actuelles n'ont pas été modifiées.`;
    set({ data: next, save: { kind: 'saved', at: new Date().toISOString() }, persistedRevision: next.revision });
    return null;
  },

  markExported: (isoDate) => get().commit((d) => ({ ...d, settings: { ...d.settings, lastExportAt: isoDate } })),

  loadDemo: (year) => {
    const demo = createDemoData(year);
    get().commit((d) => ({ ...demo, revision: d.revision, settings: { ...demo.settings } }));
  },

  wipeAllData: () => {
    try {
      for (const key of [STORAGE_KEY, BACKUP_KEY, CORRUPT_KEY]) storage?.removeItem(key);
    } catch {
      return 'Le navigateur a refusé la suppression : les données n\'ont pas été effacées.';
    }
    set({ data: m.createEmptyData(), boot: { kind: 'ready' }, save: { kind: 'idle' }, persistedRevision: null });
    return null;
  },

  resetToEmpty: () => {
    // La copie brute des données illisibles reste conservée sous CORRUPT_KEY.
    set({ data: m.createEmptyData(), boot: { kind: 'ready' }, save: { kind: 'idle' }, persistedRevision: null });
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) storage?.setItem(CORRUPT_KEY, raw);
    } catch {
      /* best effort */
    }
  },
}));

/** (Ré)initialise le store depuis un stockage donné — utilisé au démarrage et dans les tests. */
export function initializeStore(st: Storage | null): void {
  storage = st;
  useBudgetStore.setState(bootstrap(st));
  if (!listenerAttached && typeof window !== 'undefined') {
    listenerAttached = true;
    window.addEventListener('storage', (e) => {
      if (e.storageArea === storage && (e.key === STORAGE_KEY || e.key === null)) {
        useBudgetStore.setState({
          save: {
            kind: 'conflict',
            message: 'Les données ont été modifiées dans un autre onglet. Rechargez la page pour éviter toute perte.',
          },
        });
      }
    });
  }
}

export function useSelectedYearNumber(): number | null {
  return useBudgetStore((s) => resolveSelectedYear(s.data));
}
