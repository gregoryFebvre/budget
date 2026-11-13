import { createDemoData } from '../domain/demo';
import * as m from '../domain/mutations';
import {
  FILTER_FAMILIES, compare, compareCategories, compareItems, compareRates, cumulativeSavings, metricAnnual,
  metricMonthly, savingsRate, yearStats,
} from '../domain/stats';
import { idOf, withItem } from './fixtures';

const ys = (d: ReturnType<typeof createDemoData>, y: number, basis: 'planned' | 'checked' = 'planned') =>
  yearStats(d, d.years[String(y)]!, basis);

describe('indicateurs annuels', () => {
  const d = createDemoData(2030);

  it('totaux par famille et définitions (épargne hors consommation)', () => {
    const s = ys(d, 2030);
    expect(s.family.revenus).toBe(12 * 200000 + 50000);
    expect(s.family.depenses_fixes).toBe(12 * (70000 + 9000 + 6000 + 2500 + 3000) + 3 * 12000);
    expect(s.family.depenses_ponctuelles).toBe(25000 + 6 * 6000);
    expect(s.family.epargne).toBe(12 * 10000);
    const conso = s.family.depenses_fixes + s.family.depenses_ponctuelles;
    expect(metricAnnual(s, 'consommation')).toBe(conso);
    expect(metricAnnual(s, 'soldeAvantEpargne')).toBe(s.family.revenus - conso);
    expect(metricAnnual(s, 'soldeApresEpargne')).toBe(s.family.revenus - conso - s.family.epargne);
  });

  it('le total annuel est la somme des 12 mois, séries mensuelles cohérentes', () => {
    const s = ys(d, 2030);
    expect(metricMonthly(s, 'revenus')).toHaveLength(12);
    expect(metricMonthly(s, 'revenus')[5]).toBe(250000); // prime en juin
    expect(metricMonthly(s, 'soldeApresEpargne').reduce((a, b) => a + b, 0)).toBe(metricAnnual(s, 'soldeApresEpargne'));
  });

  it('taux d\'épargne ; null si revenus nuls', () => {
    expect(savingsRate(ys(d, 2030))).toBeCloseTo(120000 / 2450000, 6);
    const empty = m.createYear(m.createEmptyData(), 2030);
    expect(savingsRate(yearStats(empty, empty.years['2030']!, 'planned'))).toBeNull();
  });

  it('épargne cumulée', () => {
    const c = cumulativeSavings(ys(d, 2030));
    expect(c[0]).toBe(10000);
    expect(c[11]).toBe(120000);
  });

  it('base « pointé » : seuls les montants pointés comptent ; le prévu est inchangé', () => {
    const loyer = idOf(d, 'Loyer (démo)');
    const d2 = m.toggleChecked(m.toggleChecked(d, 2030, loyer, 1), 2030, loyer, 2);
    expect(ys(d2, 2030, 'checked').family.depenses_fixes).toBe(140000);
    expect(ys(d2, 2030, 'checked').family.revenus).toBe(0);
    expect(ys(d2, 2030, 'planned').family.depenses_fixes).toBe(ys(d, 2030).family.depenses_fixes);
  });
});

describe('compare : écarts et pourcentages', () => {
  it('cas normal', () => expect(compare(10000, 11000)).toEqual({ delta: 1000, pct: 0.1 }));
  it('baisse', () => expect(compare(10000, 8000).pct).toBeCloseTo(-0.2));
  it('base nulle : écart connu, % non calculable', () => expect(compare(0, 500)).toEqual({ delta: 500, pct: null, reason: 'base-nulle' }));
  it('valeur ou base absente', () => {
    expect(compare(null, 500)).toEqual({ delta: null, pct: null, reason: 'absent' });
    expect(compare(500, null).reason).toBe('absent');
  });
  it('0 → 0 : aucun pourcentage trompeur', () => expect(compare(0, 0)).toEqual({ delta: 0, pct: null, reason: 'base-nulle' }));
  it('taux : écart en points', () => {
    expect(compareRates(0.1, 0.125)).toBeCloseTo(2.5);
    expect(compareRates(null, 0.1)).toBeNull();
  });
});

describe('comparaison d\'éléments entre années', () => {
  const build = () => {
    let d = m.createYear(m.createEmptyData(), 2030);
    d = withItem(d, 'Loyer', 'depenses_fixes', { 1: 70000, 2: 70000 }, { year: 2030, category: 'Logement' });
    d = withItem(d, 'Ancien abonnement', 'depenses_fixes', { 1: 1000 }, { year: 2030, category: 'Loisirs' });
    d = withItem(d, 'Salaire', 'revenus', { 1: 200000 }, { year: 2030 });
    d = m.createYear(d, 2031, { fromYear: 2030, copyAmounts: true });
    d = m.updateItem(d, idOf(d, 'Ancien abonnement'), { archived: true });
    d = m.removeItemFromYear(m.setAmount(d, 2031, idOf(d, 'Ancien abonnement'), 1, null), 2031, idOf(d, 'Ancien abonnement'));
    d = withItem(d, 'Nouvelle charge', 'depenses_fixes', { 1: 3000 }, { year: 2031 });
    d = m.setAmount(d, 2031, idOf(d, 'Loyer'), 1, 77000);
    return d;
  };
  const all = { family: 'tout' as const, category: 'all' };

  it('totaux, écart € et %, éléments absents d\'une année', () => {
    const d = build();
    const rows = compareItems(d, [2030, 2031], 2030, 'planned', all);
    const loyer = rows.find((r) => r.label === 'Loyer')!;
    expect(loyer.totals).toEqual({ 2030: 140000, 2031: 147000 });
    expect(loyer.evolutions[2031]!.delta).toBe(7000);
    expect(loyer.evolutions[2031]!.pct).toBeCloseTo(0.05);
    const old = rows.find((r) => r.label === 'Ancien abonnement')!;
    expect(old.totals).toEqual({ 2030: 1000, 2031: null });
    expect(old.evolutions[2031]!.reason).toBe('absent');
    const neu = rows.find((r) => r.label === 'Nouvelle charge')!;
    expect(neu.totals).toEqual({ 2030: null, 2031: 3000 });
    expect(neu.evolutions[2031]).toEqual({ delta: null, pct: null, reason: 'absent' });
  });

  it('renommer un élément ne crée pas de nouvel élément dans les statistiques', () => {
    let d = build();
    d = m.updateItem(d, idOf(d, 'Loyer'), { label: 'Loyer principal' });
    const rows = compareItems(d, [2030, 2031], 2030, 'planned', all);
    expect(rows.filter((r) => r.label.startsWith('Loyer'))).toHaveLength(1);
    expect(rows.find((r) => r.label === 'Loyer principal')!.totals[2030]).toBe(140000);
  });

  it('part dans les REVENUS de l\'année (et non dans la famille), tri par montant de référence', () => {
    const d = build();
    const rows = compareItems(d, [2030, 2031], 2030, 'planned', all);
    const loyer = rows.find((r) => r.label === 'Loyer')!;
    expect(loyer.shares[2030]).toBeCloseTo(140000 / 200000, 6); // revenus 2030 = 200 000 (et non le total de la famille 141 000)
    expect(loyer.shares[2031]).toBeCloseTo(147000 / 200000, 6);
    expect(rows.find((r) => r.label === 'Salaire')!.shares[2030]).toBe(1);
    expect(rows.find((r) => r.label === 'Ancien abonnement')!.shares[2030]).toBeCloseTo(1000 / 200000, 6);
    expect(rows.find((r) => r.label === 'Ancien abonnement')!.shares[2031]).toBeNull(); // absent en 2031
    expect(rows.map((r) => r.label)).toEqual(['Salaire', 'Loyer', 'Ancien abonnement', 'Nouvelle charge']); // tri : total de référence décroissant, absents en dernier
  });

  it('la part dans les revenus s\'applique à toutes les familles, épargne comprise', () => {
    let d = m.createYear(m.createEmptyData(), 2030);
    d = withItem(d, 'Salaire', 'revenus', { 1: 200000 }, { year: 2030 });
    d = withItem(d, 'Livret', 'epargne', { 1: 10000 }, { year: 2030 });
    const rows = compareItems(d, [2030], 2030, 'planned', all);
    expect(rows.find((r) => r.label === 'Livret')!.shares[2030]).toBeCloseTo(0.05, 6); // 5 % des revenus (et non 100 % de la famille épargne)
  });

  it('revenus nuls : part non calculable (null), jamais 0 ni infini', () => {
    let d = m.createYear(m.createEmptyData(), 2030);
    d = withItem(d, 'Loyer', 'depenses_fixes', { 1: 70000 }, { year: 2030 });
    expect(compareItems(d, [2030], 2030, 'planned', all)[0]!.shares[2030]).toBeNull();
    d = withItem(d, 'Salaire', 'revenus', { 1: 0 }, { year: 2030 }); // revenus saisis à 0 : toujours non calculable
    expect(compareItems(d, [2030], 2030, 'planned', all).find((r) => r.label === 'Loyer')!.shares[2030]).toBeNull();
  });

  it('base « pointé » : part = montants pointés de l\'élément / revenus pointés', () => {
    let d = m.createYear(m.createEmptyData(), 2030);
    d = withItem(d, 'Salaire', 'revenus', { 1: 200000 }, { year: 2030, checked: [1] });
    d = withItem(d, 'Loyer', 'depenses_fixes', { 1: 70000, 2: 70000 }, { year: 2030, checked: [1] });
    const loyer = (basis: 'planned' | 'checked') => compareItems(d, [2030], 2030, basis, all).find((r) => r.label === 'Loyer')!;
    expect(loyer('planned').shares[2030]).toBeCloseTo(140000 / 200000, 6);
    expect(loyer('checked').shares[2030]).toBeCloseTo(70000 / 200000, 6);
    const unchecked = m.toggleChecked(d, 2030, idOf(d, 'Salaire'), 1); // plus aucun revenu pointé
    expect(compareItems(unchecked, [2030], 2030, 'checked', all).find((r) => r.label === 'Loyer')!.shares[2030]).toBeNull();
  });

  it('filtres famille et catégorie', () => {
    const d = build();
    expect(compareItems(d, [2030], 2030, 'planned', { family: 'revenus', category: 'all' }).map((r) => r.label)).toEqual(['Salaire']);
    const cat = Object.values(d.categories).find((c) => c.label === 'Logement')!.id;
    expect(compareItems(d, [2030], 2030, 'planned', { family: 'tout', category: cat }).map((r) => r.label)).toEqual(['Loyer']);
    expect(compareItems(d, [2030], 2030, 'planned', { family: 'tout', category: 'none' }).map((r) => r.label)).toEqual(['Salaire']);
    expect(FILTER_FAMILIES.sorties).not.toContain('revenus');
  });

  it('catégories transversales : totaux toutes familles du filtre confondues, sans double compte', () => {
    let d = build();
    d = withItem(d, 'VPN', 'depenses_ponctuelles', { 1: 500 }, { year: 2030, category: 'logement' });
    const rows = compareCategories(d, [2030, 2031], 2030, 'planned', 'sorties');
    const logement = rows.find((r) => r.label === 'Logement')!;
    expect(logement.totals[2030]).toBe(140000 + 500);
    expect(rows.reduce((a, r) => a + (r.totals[2030] ?? 0), 0)).toBe(ys2030(d));
    expect(rows.find((r) => r.label === 'Loisirs')!.totals[2031]).toBeNull();
  });

  it('base « pointé » dans les comparaisons', () => {
    let d = build();
    d = m.toggleChecked(d, 2030, idOf(d, 'Loyer'), 1);
    const row = compareItems(d, [2030], 2030, 'checked', all).find((r) => r.label === 'Loyer')!;
    expect(row.totals[2030]).toBe(70000);
  });

  it('ne modifie pas les données', () => {
    const d = build();
    const snap = JSON.stringify(d);
    compareItems(d, [2030, 2031], 2030, 'planned', all);
    compareCategories(d, [2030, 2031], 2030, 'checked', 'tout');
    expect(JSON.stringify(d)).toBe(snap);
  });
});

function ys2030(d: ReturnType<typeof createDemoData>): number {
  const s = yearStats(d, d.years['2030']!, 'planned');
  return s.family.depenses_fixes + s.family.depenses_ponctuelles + s.family.epargne;
}
