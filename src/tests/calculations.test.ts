import { aggregateItems, pointageProgress, summarizeMonth, summarizeYear } from '../domain/calculations';
import { createEmptyData, createYear, selectYear, setAmount, toggleChecked } from '../domain/mutations';
import { Y, idOf, specExample, withItem } from './fixtures';

const year = (d: ReturnType<typeof specExample>, y = Y) => d.years[String(y)]!;

describe('reste à provisionner — exemple du cahier des charges', () => {
  it('340 € → 250 € après pointage de l\'électricité → 280 € après passage des courses à 280 €', () => {
    let d = specExample();
    expect(summarizeMonth(d, year(d), 1).planned.depenses_fixes).toBe(130000);
    expect(summarizeMonth(d, year(d), 1).checked.depenses_fixes).toBe(96000);
    expect(summarizeMonth(d, year(d), 1).resteAProvisionner).toBe(34000);

    d = toggleChecked(d, Y, idOf(d, 'Électricité'), 1);
    expect(summarizeMonth(d, year(d), 1).resteAProvisionner).toBe(25000);

    d = setAmount(d, Y, idOf(d, 'Courses'), 1, 28000);
    expect(summarizeMonth(d, year(d), 1).resteAProvisionner).toBe(28000);
  });

  it('modifier le montant d\'un élément pointé conserve le pointage et recalcule', () => {
    let d = specExample();
    const id = idOf(d, 'Crédit immobilier');
    d = setAmount(d, Y, id, 1, 85000);
    expect(year(d).entries[id]![1]).toEqual({ amount: 85000, checked: true });
    expect(summarizeMonth(d, year(d), 1).resteAProvisionner).toBe(34000); // pointé : hors reste
    expect(summarizeMonth(d, year(d), 1).planned.depenses_fixes).toBe(135000);
  });
});

describe('indépendance du pointage', () => {
  it('par mois', () => {
    let d = withItem(createYear(createEmptyData(), Y), 'Loyer', 'depenses_fixes', { 1: 1000, 2: 1000 });
    d = toggleChecked(d, Y, idOf(d, 'Loyer'), 1);
    expect(year(d).entries[idOf(d, 'Loyer')]![1]!.checked).toBe(true);
    expect(year(d).entries[idOf(d, 'Loyer')]![2]!.checked).toBeUndefined();
    expect(summarizeMonth(d, year(d), 2).resteAProvisionner).toBe(1000);
  });

  it('par année', () => {
    let d = withItem(createYear(createEmptyData(), 2030), 'Loyer', 'depenses_fixes', { 1: 1000 });
    d = createYear(d, 2031, { fromYear: 2030, copyAmounts: true });
    const id = idOf(d, 'Loyer');
    d = toggleChecked(d, 2030, id, 1);
    expect(summarizeMonth(d, d.years['2030']!, 1).resteAProvisionner).toBe(0);
    expect(summarizeMonth(d, d.years['2031']!, 1).resteAProvisionner).toBe(1000);
  });
});

describe('valeurs nulles / non renseignées', () => {
  it('un élément sans montant ne génère aucun reste, un 0 explicite compte pour 0', () => {
    let d = withItem(createYear(createEmptyData(), Y), 'Eau', 'depenses_fixes', { 3: 17000 });
    expect(summarizeMonth(d, year(d), 1).resteAProvisionner).toBe(0);
    expect(summarizeMonth(d, year(d), 1).filled.depenses_fixes).toBe(0);
    d = setAmount(d, Y, idOf(d, 'Eau'), 1, 0);
    expect(summarizeMonth(d, year(d), 1).filled.depenses_fixes).toBe(1);
    expect(summarizeMonth(d, year(d), 1).resteAProvisionner).toBe(0);
  });

  it('une cellule vide ne peut pas être pointée', () => {
    const d = withItem(createYear(createEmptyData(), Y), 'Eau', 'depenses_fixes', { 3: 17000 });
    expect(toggleChecked(d, Y, idOf(d, 'Eau'), 1)).toBe(d);
  });

  it('effacer un montant retire aussi son pointage', () => {
    let d = withItem(createYear(createEmptyData(), Y), 'Eau', 'depenses_fixes', { 3: 17000 }, { checked: [3] });
    d = setAmount(d, Y, idOf(d, 'Eau'), 3, null);
    expect(year(d).entries[idOf(d, 'Eau')]).toBeUndefined();
  });
});

describe('soldes et familles', () => {
  const build = () => {
    let d = createYear(createEmptyData(), Y);
    d = withItem(d, 'Salaire', 'revenus', { 1: 200000 });
    d = withItem(d, 'Loyer', 'depenses_fixes', { 1: 70000 }, { checked: [1] });
    d = withItem(d, 'Réparation', 'depenses_ponctuelles', { 1: 25000 });
    d = withItem(d, 'Livret', 'epargne', { 1: 10000 });
    return d;
  };

  it('reproduit les soldes successifs du fichier de référence', () => {
    const d = build();
    const s = summarizeMonth(d, year(d), 1);
    expect(s.soldeApresFixes).toBe(130000);
    expect(s.soldeApresPonctuelles).toBe(105000);
    expect(s.soldeApresEpargne).toBe(95000);
    expect(s.consommation).toBe(95000); // l'épargne n'est pas de la consommation
  });

  it('le reste à provisionner inclut l\'épargne non pointée ; revenus restants et solde prévisionnel distincts', () => {
    const d = build();
    const s = summarizeMonth(d, year(d), 1);
    expect(s.remaining.depenses_fixes).toBe(0);
    expect(s.resteAProvisionner).toBe(25000 + 10000);
    expect(s.revenusRestants).toBe(200000);
    expect(s.soldePrevisionnel).toBe(200000 - 35000);
  });

  it('totaux par catégorie transversale cohérents avec les éléments', () => {
    let d = createYear(createEmptyData(), Y);
    d = withItem(d, 'Internet fixe', 'depenses_fixes', { 1: 3000 }, { category: 'Internet' });
    d = withItem(d, 'VPN', 'depenses_ponctuelles', { 1: 7000 }, { category: 'internet' });
    expect(Object.keys(d.categories)).toHaveLength(1); // une seule catégorie, partagée entre familles
    const ids = [idOf(d, 'Internet fixe'), idOf(d, 'VPN')];
    expect(aggregateItems(year(d), ids, 1).planned).toBe(10000);
  });

  it('le total annuel est la somme des 12 mois et la progression de pointage est comptée', () => {
    let d = withItem(createYear(createEmptyData(), Y), 'Loyer', 'depenses_fixes', { 1: 100, 2: 100, 3: 100 }, { checked: [1] });
    d = withItem(d, 'Eau', 'depenses_fixes', {});
    const y = summarizeYear(d, year(d));
    expect(y.annual.planned.depenses_fixes).toBe(300);
    expect(y.annual.resteAProvisionner).toBe(200);
    expect(pointageProgress(y.months[1])).toEqual({ checked: 1, total: 1 });
    expect(pointageProgress(y.annual)).toEqual({ checked: 1, total: 3 });
  });

  it('élément présent une année et absent d\'une autre', () => {
    let d = withItem(createYear(createEmptyData(), 2030), 'Canal', 'depenses_fixes', { 1: 2000 });
    d = createYear(d, 2031);
    expect(summarizeMonth(d, d.years['2031']!, 1).planned.depenses_fixes).toBe(0);
    expect(summarizeMonth(d, d.years['2030']!, 1).planned.depenses_fixes).toBe(2000);
    expect(selectYear(d, 2030).settings.lastOpenedYear).toBe(2030);
  });
});
