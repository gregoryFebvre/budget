import { itemYearTotals, summarizeMonth } from '../domain/calculations';
import * as m from '../domain/mutations';
import { Y, idOf, withItem } from './fixtures';

const base = () => {
  let d = m.createYear(m.createEmptyData(), 2030);
  d = withItem(d, 'Loyer', 'depenses_fixes', { 1: 70000, 2: 70000 }, { year: 2030, checked: [1], category: 'Logement' });
  d = withItem(d, 'Eau', 'depenses_fixes', {}, { year: 2030, category: 'Logement' });
  return d;
};

describe('suppression d\'éléments', () => {
  it('refusée si des montants existent (même dans une seule année), l\'historique est intact', () => {
    const d = base();
    expect(() => m.deleteItem(d, idOf(d, 'Loyer'))).toThrow(/archivez-le/);
    expect(d.years['2030']!.entries[idOf(d, 'Loyer')]).toBeDefined();
  });

  it('autorisée sans aucun montant : retirée de l\'élément global ET de toutes les années', () => {
    let d = base();
    d = m.createYear(d, 2031, { fromYear: 2030 });
    const id = idOf(d, 'Eau');
    d = m.deleteItem(d, id);
    expect(d.items[id]).toBeUndefined();
    expect(d.years['2030']!.itemIds).not.toContain(id);
    expect(d.years['2031']!.itemIds).not.toContain(id);
  });

  it('retrait d\'une année : refusé si montants, accepté sinon, réversible', () => {
    let d = base();
    expect(() => m.removeItemFromYear(d, 2030, idOf(d, 'Loyer'))).toThrow(/montants/);
    const eau = idOf(d, 'Eau');
    d = m.removeItemFromYear(d, 2030, eau);
    expect(d.years['2030']!.itemIds).not.toContain(eau);
    d = m.addExistingItemToYear(d, 2030, eau);
    expect(d.years['2030']!.itemIds).toContain(eau);
  });
});

describe('archivage et historique', () => {
  it('un élément archivé garde ses montants, son pointage et ses totaux', () => {
    let d = base();
    d = m.updateItem(d, idOf(d, 'Loyer'), { archived: true });
    expect(summarizeMonth(d, d.years['2030']!, 1).planned.depenses_fixes).toBe(70000);
    expect(d.years['2030']!.entries[idOf(d, 'Loyer')]![1]!.checked).toBe(true);
  });

  it('un archivé n\'est pas repris dans une nouvelle année', () => {
    let d = base();
    d = m.updateItem(d, idOf(d, 'Eau'), { archived: true });
    expect(m.createYear(d, 2031, { fromYear: 2030 }).years['2031']!.itemIds).toEqual([idOf(d, 'Loyer')]);
  });

  it('historique par année : présence et total', () => {
    let d = m.createYear(base(), 2031);
    d = m.addExistingItemToYear(d, 2031, idOf(d, 'Loyer'));
    expect(itemYearTotals(d, idOf(d, 'Loyer'))).toEqual([
      { year: 2030, present: true, total: 140000, filled: 2 },
      { year: 2031, present: true, total: 0, filled: 0 },
    ]);
  });
});

describe('changement de famille', () => {
  it('reclasse montants et pointage ; nature gérée selon la famille', () => {
    let d = base();
    const id = idOf(d, 'Loyer');
    d = m.updateItem(d, id, { familyId: 'depenses_ponctuelles' });
    expect(d.items[id]!.nature).toBe('ponctuelle');
    const s = summarizeMonth(d, d.years['2030']!, 1);
    expect(s.planned.depenses_fixes).toBe(0);
    expect(s.planned.depenses_ponctuelles).toBe(70000);
    expect(s.resteAProvisionner).toBe(0); // toujours pointé
    d = m.updateItem(d, id, { familyId: 'epargne' });
    expect(d.items[id]!.nature).toBeUndefined();
  });
});

describe('duplication', () => {
  it('crée un nouvel élément indépendant, sans pointage', () => {
    let d = base();
    const src = idOf(d, 'Loyer');
    d = m.duplicateItem(d, src, { year: 2030, label: 'Loyer 2', copyAmounts: true });
    const copy = idOf(d, 'Loyer 2');
    expect(copy).not.toBe(src);
    expect(d.years['2030']!.entries[copy]).toEqual({ 1: { amount: 70000 }, 2: { amount: 70000 } });
    d = m.setAmount(d, 2030, copy, 1, 1);
    expect(d.years['2030']!.entries[src]![1]).toEqual({ amount: 70000, checked: true });
  });

  it('sans copie des montants : historique vierge', () => {
    let d = base();
    d = m.duplicateItem(d, idOf(d, 'Loyer'), { year: 2030 });
    expect(d.years['2030']!.entries[idOf(d, 'Loyer (copie)')]).toBeUndefined();
  });
});

describe('ordre', () => {
  it('monter / descendre échange avec le voisin de la même famille', () => {
    let d = base();
    d = withItem(d, 'Salaire', 'revenus', {}, { year: 2030 });
    const [loyer, eau] = [idOf(d, 'Loyer'), idOf(d, 'Eau')];
    expect(d.items[loyer]!.order).toBeLessThan(d.items[eau]!.order);
    d = m.moveItem(d, eau, -1);
    expect(d.items[eau]!.order).toBeLessThan(d.items[loyer]!.order);
    expect(m.moveItem(d, eau, -1)).toBe(d); // déjà premier de sa famille
  });
});

describe('catégories', () => {
  it('suppression refusée tant qu\'un élément y est rattaché ; réaffectation puis suppression', () => {
    let d = base();
    const cat = Object.values(d.categories)[0]!.id;
    expect(() => m.deleteCategory(d, cat)).toThrow(/réaffectez/);
    d = m.reassignCategory(d, cat, null);
    expect(d.items[idOf(d, 'Loyer')]!.categoryId).toBeNull();
    d = m.deleteCategory(d, cat);
    expect(d.categories[cat]).toBeUndefined();
    expect(d.years['2030']!.entries[idOf(d, 'Loyer')]![1]!.checked).toBe(true); // rien perdu
  });

  it('renommage, doublons (insensible à la casse), archivage, ordre', () => {
    let d = m.addCategory(m.createEmptyData(), 'Maison');
    expect(() => m.addCategory(d, 'MAISON')).toThrow(/existe déjà/);
    d = m.addCategory(d, 'Auto');
    const [a, b] = Object.values(d.categories).sort((x, y) => x.order - y.order);
    expect(() => m.renameCategory(d, b!.id, 'maison')).toThrow();
    d = m.renameCategory(d, a!.id, 'Habitat');
    expect(d.categories[a!.id]!.label).toBe('Habitat');
    d = m.moveCategory(d, b!.id, -1);
    expect(d.categories[b!.id]!.order).toBeLessThan(d.categories[a!.id]!.order);
    expect(m.setCategoryArchived(d, a!.id, true).categories[a!.id]!.archived).toBe(true);
  });

  it('renommer une catégorie ne casse pas le rattachement', () => {
    let d = base();
    const cat = Object.values(d.categories)[0]!.id;
    d = m.renameCategory(d, cat, 'Habitat');
    expect(d.items[idOf(d, 'Loyer')]!.categoryId).toBe(cat);
  });
});

describe('familles', () => {
  it('seul le libellé change', () => {
    const d = m.setFamilyLabel(m.createEmptyData(), 'epargne', ' Placements ');
    expect(d.families.epargne).toMatchObject({ id: 'epargne', label: 'Placements', kind: 'savings' });
    expect(() => m.setFamilyLabel(d, 'epargne', ' ')).toThrow();
  });

  it('mutations refusées sur année inexistante', () => {
    expect(() => m.addExistingItemToYear(m.createEmptyData(), Y, 'x')).toThrow();
  });
});
