import { createDemoData } from '../domain/demo';
import { toggleChecked } from '../domain/mutations';
import { parseBudgetData } from '../schema';
import { BACKUP_KEY, CORRUPT_KEY, STORAGE_KEY, loadData, saveData } from '../storage/localStorageRepo';
import { initializeStore, useBudgetStore } from '../store/budgetStore';
import { SCHEMA_VERSION } from '../domain/types';
import { idOf } from './fixtures';

const demo = () => createDemoData(2030);

function failingStorage(error: unknown): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: () => {
      throw error;
    },
  };
}

describe('lecture', () => {
  it('stockage vide', () => expect(loadData(localStorage)).toEqual({ status: 'empty' }));

  it('stockage indisponible', () => expect(loadData(null).status).toBe('unavailable'));

  it('aller-retour écriture / lecture', () => {
    const d = demo();
    expect(saveData(localStorage, d, null)).toEqual({ ok: true });
    const r = loadData(localStorage);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.data).toEqual(d);
  });

  it('données corrompues : aucune perte, copie brute conservée', () => {
    localStorage.setItem(STORAGE_KEY, '{pas du json');
    const r = loadData(localStorage);
    expect(r.status).toBe('corrupt');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{pas du json');
    expect(localStorage.getItem(CORRUPT_KEY)).toBe('{pas du json');
  });

  it('données corrompues : restauration de la copie de secours', () => {
    const d = demo();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, revision: 'x' }));
    localStorage.setItem(BACKUP_KEY, JSON.stringify(d));
    const r = loadData(localStorage);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.recoveredFromBackup).toBe(true);
  });

  it('version plus récente : refusée sans modification', () => {
    const raw = JSON.stringify({ ...demo(), schemaVersion: SCHEMA_VERSION + 1 });
    localStorage.setItem(STORAGE_KEY, raw);
    const r = loadData(localStorage);
    expect(r.status).toBe('too-new');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('détecte une incohérence référentielle', () => {
    const d = demo();
    const y = d.years['2030']!;
    const bad = { ...d, years: { ...d.years, '2030': { ...y, entries: { fantome: { 1: { amount: 1 } } } } } };
    const r = parseBudgetData(bad);
    expect(r.ok).toBe(false);
  });
});

describe('écriture', () => {
  it('quota dépassé : échec signalé, jamais de faux succès', () => {
    const r = saveData(failingStorage(new DOMException('plein', 'QuotaExceededError')), demo(), null);
    expect(r).toMatchObject({ ok: false, reason: 'quota' });
  });

  it('autre erreur d\'écriture : échec signalé', () => {
    expect(saveData(failingStorage(new Error('boom')), demo(), null)).toMatchObject({ ok: false, reason: 'error' });
  });

  it('stockage absent : échec signalé', () => {
    expect(saveData(null, demo(), null)).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('refuse d\'écraser une écriture faite par un autre onglet', () => {
    const d = demo();
    saveData(localStorage, { ...d, revision: 5 }, null);
    const r = saveData(localStorage, { ...d, revision: 1 }, 1); // je croyais être à la révision 1
    expect(r).toMatchObject({ ok: false, reason: 'conflict' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).revision).toBe(5);
  });

  it('conserve l\'état précédent comme copie de secours', () => {
    const d = demo();
    saveData(localStorage, { ...d, revision: 1 }, null);
    saveData(localStorage, { ...d, revision: 2 }, 1);
    expect(JSON.parse(localStorage.getItem(BACKUP_KEY)!).revision).toBe(1);
  });
});

describe('store : persistance et rechargement', () => {
  it('toute modification est enregistrée et survit à un rechargement', () => {
    initializeStore(localStorage);
    useBudgetStore.getState().loadDemo(2030);
    const id = idOf(useBudgetStore.getState().data, 'Loyer (démo)');
    useBudgetStore.getState().toggleChecked(2030, id, 4);
    useBudgetStore.getState().setAmount(2030, id, 4, 71234);
    expect(useBudgetStore.getState().save.kind).toBe('saved');

    initializeStore(localStorage); // simule F5
    const cell = useBudgetStore.getState().data.years['2030']!.entries[id]![4];
    expect(cell).toEqual({ amount: 71234, checked: true });
  });

  it('erreur d\'écriture : le store l\'indique et ne prétend pas avoir enregistré', () => {
    initializeStore(failingStorage(new DOMException('plein', 'QuotaExceededError')));
    useBudgetStore.getState().loadDemo(2030);
    expect(useBudgetStore.getState().save.kind).toBe('error');
  });

  it('données illisibles : aucune écriture tant que l\'utilisateur n\'a pas choisi', () => {
    localStorage.setItem(STORAGE_KEY, 'illisible');
    initializeStore(localStorage);
    expect(useBudgetStore.getState().boot.kind).toBe('corrupt');
    useBudgetStore.getState().loadDemo(2030);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('illisible');
  });

  it('modification concurrente (autre onglet) : conflit signalé, données de l\'autre onglet préservées', () => {
    initializeStore(localStorage);
    useBudgetStore.getState().loadDemo(2030);
    const other = JSON.stringify({ ...useBudgetStore.getState().data, revision: 99 });
    localStorage.setItem(STORAGE_KEY, other);
    const id = idOf(useBudgetStore.getState().data, 'Loyer (démo)');
    useBudgetStore.getState().toggleChecked(2030, id, 1);
    expect(useBudgetStore.getState().save.kind).toBe('conflict');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(other);
  });

  it('le pointage est sérialisé dans les données (donc dans les futures sauvegardes JSON)', () => {
    const base = demo();
    expect(JSON.stringify(base)).not.toContain('"checked":true');
    const d = toggleChecked(base, 2030, idOf(base, 'Loyer (démo)'), 1);
    expect(JSON.stringify(d)).toContain('"checked":true');
  });
});
