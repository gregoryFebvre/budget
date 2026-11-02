import { summarizeMonth } from '../domain/calculations';
import { addItem, createEmptyData, createYear, newId, selectYear, setAmount, toggleChecked, updateItem } from '../domain/mutations';
import { Y, idOf, withItem } from './fixtures';

describe('createYear', () => {
  const base = () => {
    let d = createYear(createEmptyData(), 2030);
    d = withItem(d, 'Loyer', 'depenses_fixes', { 1: 70000, 2: 70000 }, { year: 2030, checked: [1] });
    d = withItem(d, 'Ancien contrat', 'depenses_fixes', { 1: 500 }, { year: 2030 });
    return updateItem(d, idOf(d, 'Ancien contrat'), { archived: true });
  };

  it('structure seule : éléments repris, montants vierges', () => {
    const d = createYear(base(), 2031, { fromYear: 2030 });
    expect(d.years['2031']!.itemIds).toEqual([idOf(d, 'Loyer')]);
    expect(d.years['2031']!.entries).toEqual({});
    expect(d.years['2031']!.derivedFromYear).toBe(2030);
  });

  it('structure + montants : montants copiés, pointage jamais copié, année source intacte', () => {
    const before = base();
    const d = createYear(before, 2031, { fromYear: 2030, copyAmounts: true });
    const id = idOf(d, 'Loyer');
    expect(d.years['2031']!.entries[id]).toEqual({ 1: { amount: 70000 }, 2: { amount: 70000 } });
    expect(d.years['2030']).toEqual(before.years['2030']);
    expect(d.years['2030']!.entries[id]![1]!.checked).toBe(true);
  });

  it('refuse d\'écraser une année existante ou une année invalide', () => {
    expect(() => createYear(base(), 2030)).toThrow(/existe déjà/);
    expect(() => createYear(base(), 1800)).toThrow();
    expect(() => createYear(base(), 2031, { fromYear: 1999 })).toThrow(/introuvable/);
  });
});

describe('éléments et catégories', () => {
  it('renommer ou changer de catégorie conserve montants et pointage', () => {
    let d = withItem(createYear(createEmptyData(), Y), 'Eau', 'depenses_fixes', { 3: 17000 }, { checked: [3] });
    const id = idOf(d, 'Eau');
    d = addItem(d, { label: 'Autre', familyId: 'depenses_fixes', categoryLabel: 'Ressource', year: Y });
    const catId = Object.values(d.categories)[0]!.id;
    d = updateItem(d, id, { label: 'Eau potable', categoryId: catId });
    expect(d.items[id]!.label).toBe('Eau potable');
    expect(d.years[String(Y)]!.entries[id]![3]).toEqual({ amount: 17000, checked: true });
    expect(summarizeMonth(d, d.years[String(Y)]!, 3).resteAProvisionner).toBe(0);
  });

  it('valide les entrées', () => {
    const d = createYear(createEmptyData(), Y);
    expect(() => addItem(d, { label: '  ', familyId: 'revenus', year: Y })).toThrow();
    expect(() => addItem(d, { label: 'x', familyId: 'revenus', year: 1999 })).toThrow();
    expect(() => setAmount(d, Y, 'inconnu', 1, 100)).toThrow();
    expect(() => selectYear(d, 1999)).toThrow();
  });

  it('les mutations sont immuables', () => {
    const d = withItem(createYear(createEmptyData(), Y), 'Eau', 'depenses_fixes', { 3: 1 });
    const snapshot = JSON.stringify(d);
    toggleChecked(d, Y, idOf(d, 'Eau'), 3);
    setAmount(d, Y, idOf(d, 'Eau'), 3, 99);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it('génère des identifiants uniques', () => {
    expect(new Set(Array.from({ length: 50 }, newId)).size).toBe(50);
  });
});
