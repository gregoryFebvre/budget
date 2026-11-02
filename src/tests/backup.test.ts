import { buildBackup, backupFilename, parseBackup, planReplace, summarizeData } from '../backup/backupFile';
import { mergeData } from '../backup/merge';
import { createDemoData } from '../domain/demo';
import * as m from '../domain/mutations';
import { SCHEMA_VERSION } from '../domain/types';
import { STORAGE_KEY } from '../storage/localStorageRepo';
import { initializeStore, useBudgetStore } from '../store/budgetStore';
import { Y, idOf, withItem } from './fixtures';

const demo = () => createDemoData(2030);
const envelope = (data: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ app: 'budget', schemaVersion: SCHEMA_VERSION, exportedAt: '2026-10-30T10:00:00.000Z', data, ...extra });

describe('export', () => {
  it('nom de fichier = date locale réelle', () => {
    expect(backupFilename(new Date(2026, 9, 30, 23, 59))).toBe('budget-backup-2026-10-30.json');
    expect(backupFilename(new Date(2027, 0, 5))).toBe('budget-backup-2027-01-05.json');
  });

  it('contient TOUTES les années, le pointage, les catégories et la version du schéma', () => {
    let d = createDemoData(2030);
    d = m.createYear(d, 2031, { fromYear: 2030, copyAmounts: true });
    d = m.toggleChecked(d, 2030, idOf(d, 'Loyer (démo)'), 1);
    const b = buildBackup(d, new Date(2026, 9, 30, 12));
    const file = JSON.parse(b.content);
    expect(b.filename).toBe('budget-backup-2026-10-30.json');
    expect(file).toMatchObject({ app: 'budget', schemaVersion: SCHEMA_VERSION });
    expect(Object.keys(file.data.years)).toEqual(['2030', '2031']);
    expect(b.content).toContain('"checked": true');
    expect(Object.keys(file.data.categories).length).toBeGreaterThan(0);
    expect(file.data.settings.lastExportAt).toBe(b.exportedAt);
  });

  it('aller-retour : ce qui est exporté est relu à l\'identique', () => {
    const base = demo();
    const d = m.toggleChecked(base, 2030, idOf(base, 'Loyer (démo)'), 1);
    const b = buildBackup(d);
    const r = parseBackup(b.content);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ ...d, settings: { ...d.settings, lastExportAt: b.exportedAt } });
  });
});

describe('import : validation avant toute modification', () => {
  it.each([
    ['JSON invalide', '{pas du json'],
    ['tableau', '[]'],
    ['autre application', JSON.stringify({ app: 'autre', schemaVersion: 1, data: {} })],
    ['bloc data absent', JSON.stringify({ app: 'budget', schemaVersion: 1 })],
    ['versions contradictoires', envelope(demo(), { schemaVersion: 7 })],
    ['structure invalide', envelope({ ...demo(), items: 'non' })],
    ['montant négatif', envelope(JSON.parse(JSON.stringify(demo()).replace('"amount":200000', '"amount":-5')))],
    ['montant décimal', envelope(JSON.parse(JSON.stringify(demo()).replace('"amount":200000', '"amount":12.5')))],
    ['clé dangereuse', '{"app":"budget","schemaVersion":1,"data":{"__proto__":{"x":1}}}'],
  ])('rejette : %s', (_label, text) => {
    expect(parseBackup(text).ok).toBe(false);
  });

  it('rejette un fichier trop volumineux', () => {
    expect(parseBackup(' '.repeat(21 * 1024 * 1024)).ok).toBe(false);
  });

  it('rejette une valeur rattachée à un élément inexistant (intégrité)', () => {
    const d = demo();
    const y = d.years['2030']!;
    const bad = { ...d, years: { '2030': { ...y, entries: { fantome: { 1: { amount: 1 } } } } } };
    const r = parseBackup(envelope(bad));
    expect(r.ok).toBe(false);
  });

  it('rejette un identifiant dangereux', () => {
    const d = demo();
    const id = Object.keys(d.items)[0]!;
    expect(parseBackup(envelope(JSON.parse(JSON.stringify(d).split(id).join('a b/../c')))).ok).toBe(false);
  });

  it('version plus récente : refusée, avec invitation à mettre à jour', () => {
    const r = parseBackup(envelope({ ...demo(), schemaVersion: SCHEMA_VERSION + 1 }, { schemaVersion: SCHEMA_VERSION + 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/plus récente/);
  });

  it('résumé du contenu', () => {
    expect(summarizeData(demo())).toMatchObject({ years: [2030], items: 11, categories: 4 });
  });
});

describe('remplacement complet (atomique)', () => {
  it('planReplace garde la révision courante (la détection multi-onglets reste valide)', () => {
    expect(planReplace({ ...m.createEmptyData(), revision: 9 }, demo()).revision).toBe(9);
  });

  it('remplace les données et les persiste', () => {
    initializeStore(localStorage);
    useBudgetStore.getState().loadDemo(2029);
    const incoming = demo();
    expect(useBudgetStore.getState().importData((c) => planReplace(c, incoming))).toBeNull();
    expect(Object.keys(useBudgetStore.getState().data.years)).toEqual(['2030']);
    expect(Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY)!).years)).toEqual(['2030']);
  });

  it('échec d\'écriture : mémoire ET stockage restent intacts', () => {
    initializeStore(localStorage);
    useBudgetStore.getState().loadDemo(2029);
    const before = localStorage.getItem(STORAGE_KEY);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('plein', 'QuotaExceededError');
    });
    const err = useBudgetStore.getState().importData((c) => planReplace(c, demo()));
    spy.mockRestore();
    expect(err).toMatch(/non enregistr|saturé|NON/i);
    expect(Object.keys(useBudgetStore.getState().data.years)).toEqual(['2029']);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});

describe('fusion déterministe', () => {
  const base = () => {
    let d = m.createYear(m.createEmptyData(), 2030);
    d = withItem(d, 'Loyer', 'depenses_fixes', { 1: 70000, 2: 70000 }, { year: 2030, category: 'Logement' });
    return d;
  };
  const loyer = (d: ReturnType<typeof base>) => idOf(d, 'Loyer');

  it('fusionner un fichier identique : rien ne change, aucun conflit (idempotence)', () => {
    const d = base();
    const { data, report } = mergeData(d, structuredClone(d));
    expect(data).toEqual(d);
    expect(report).toMatchObject({ conflicts: [], addedCells: 0, addedItems: 0, identicalCells: 2 });
  });

  it('ajoute années, éléments, catégories et montants manquants sans toucher à l\'existant', () => {
    const local = base();
    let inc = structuredClone(local);
    inc = withItem(inc, 'Assurance', 'depenses_fixes', { 3: 5000 }, { year: 2030, category: 'Contrats' });
    inc = m.createYear(inc, 2031, { fromYear: 2030, copyAmounts: true });
    inc = m.setAmount(inc, 2030, loyer(inc), 3, 70000);
    const { data, report } = mergeData(local, inc);
    expect(report).toMatchObject({ addedItems: 1, addedCategories: 1, addedYears: [2031], conflicts: [] });
    expect(data.years['2030']!.entries[loyer(local)]![3]).toEqual({ amount: 70000 });
    expect(data.years['2030']!.itemIds).toContain(idOf(inc, 'Assurance'));
    expect(Object.keys(data.years)).toEqual(['2030', '2031']);
    expect(local.years['2031']).toBeUndefined(); // entrée non modifiée
  });

  it('conflit de montant : valeur locale conservée par défaut, conflit toujours listé', () => {
    const local = base();
    const inc = m.setAmount(structuredClone(local), 2030, loyer(local), 1, 99900);
    const { data, report } = mergeData(local, inc);
    expect(data.years['2030']!.entries[loyer(local)]![1]!.amount).toBe(70000);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({ kind: 'montant', subject: 'Loyer' });
    expect(report.conflicts[0]!.where).toContain('janvier');
  });

  it('préférence « fichier » : la valeur importée remplace la locale', () => {
    const local = base();
    const inc = m.setAmount(structuredClone(local), 2030, loyer(local), 1, 99900);
    const { data } = mergeData(local, inc, 'imported');
    expect(data.years['2030']!.entries[loyer(local)]![1]!.amount).toBe(99900);
  });

  it('conflit de pointage (même montant)', () => {
    const local = base();
    const inc = m.toggleChecked(structuredClone(local), 2030, loyer(local), 1);
    const r = mergeData(local, inc);
    expect(r.report.conflicts[0]).toMatchObject({ kind: 'pointage', local: 'non pointé', imported: 'pointé' });
    expect(r.data.years['2030']!.entries[loyer(local)]![1]!.checked).toBeUndefined();
    expect(mergeData(local, inc, 'imported').data.years['2030']!.entries[loyer(local)]![1]!.checked).toBe(true);
  });

  it('conflit sur un élément (libellé) et une famille', () => {
    const local = base();
    let inc = m.updateItem(structuredClone(local), loyer(local), { label: 'Loyer principal' });
    inc = m.setFamilyLabel(inc, 'epargne', 'Placements');
    const r = mergeData(local, inc);
    expect(r.report.conflicts.map((c) => c.kind).sort()).toEqual(['element', 'famille']);
    expect(r.data.items[loyer(local)]!.label).toBe('Loyer');
    const r2 = mergeData(local, inc, 'imported');
    expect(r2.data.items[loyer(local)]!.label).toBe('Loyer principal');
    expect(r2.data.families.epargne.label).toBe('Placements');
  });

  it('catégorie de même libellé mais d\'id différent : rapprochée, pas de doublon', () => {
    const local = base();
    let other = m.createYear(m.createEmptyData(), 2030);
    other = withItem(other, 'Eau', 'depenses_fixes', { 1: 100 }, { year: 2030, category: 'logement' });
    const { data, report } = mergeData(local, other);
    expect(report.remappedCategories).toBe(1);
    expect(Object.keys(data.categories)).toHaveLength(1);
    expect(data.items[idOf(other, 'Eau')]!.categoryId).toBe(Object.keys(data.categories)[0]);
  });

  it('ne supprime jamais rien et ne propage pas les suppressions', () => {
    const local = withItem(base(), 'Eau', 'depenses_fixes', { 1: 100 }, { year: 2030 });
    const inc = m.deleteItem(m.setAmount(structuredClone(local), 2030, idOf(local, 'Eau'), 1, null), idOf(local, 'Eau'));
    const { data } = mergeData(local, inc);
    expect(data.items[idOf(local, 'Eau')]).toBeDefined();
    expect(data.years['2030']!.entries[idOf(local, 'Eau')]![1]!.amount).toBe(100);
  });

  it('résultat identique à chaque exécution et sans mutation des entrées', () => {
    const local = base();
    const inc = m.setAmount(withItem(structuredClone(local), 'Eau', 'depenses_fixes', { 1: 5 }, { year: 2030 }), 2030, loyer(local), 2, 1);
    const snapshot = JSON.stringify([local, inc]);
    const a = mergeData(local, inc);
    const b = mergeData(local, inc);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify([local, inc])).toBe(snapshot);
  });

  it('les paramètres locaux sont conservés', () => {
    const local = { ...base(), settings: { lastOpenedYear: 2030, lastExportAt: 'local' } };
    const inc = { ...structuredClone(local), settings: { lastOpenedYear: null, lastExportAt: 'importé' } };
    expect(mergeData(local, inc, 'imported').data.settings).toEqual(local.settings);
  });
});

it('année fixture cohérente', () => expect(Y).toBe(2030));
