import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { formatEuros } from '../domain/money';
import * as m from '../domain/mutations';
import { initializeStore, useBudgetStore } from '../store/budgetStore';
import { idOf, withItem } from './fixtures';

const eur = (cents: number) => formatEuros(cents).replace(/\s/g, ' ');

/** Données FICTIVES sur deux années. Bonus : base nulle en 2029. Nouvel abonnement : absent en 2029. */
function twoYears() {
  let d = m.createYear(m.createEmptyData(), 2029);
  d = m.createYear(d, 2030);
  d = withItem(d, 'Salaire', 'revenus', { 1: 200000 }, { year: 2029 });
  d = withItem(d, 'Loyer', 'depenses_fixes', { 1: 70000 }, { year: 2029, category: 'Logement' });
  d = withItem(d, 'Bonus', 'revenus', { 1: 0 }, { year: 2029 });
  d = withItem(d, 'Livret', 'epargne', { 1: 10000 }, { year: 2029 });
  const ids = (l: string) => idOf(d, l);
  for (const l of ['Salaire', 'Loyer', 'Bonus', 'Livret']) d = m.addExistingItemToYear(d, 2030, ids(l));
  d = m.setAmount(d, 2030, ids('Salaire'), 1, 220000);
  d = m.setAmount(d, 2030, ids('Loyer'), 1, 75000);
  d = m.toggleChecked(d, 2030, ids('Loyer'), 1);
  d = m.setAmount(d, 2030, ids('Bonus'), 1, 50000);
  d = m.setAmount(d, 2030, ids('Livret'), 1, 12000);
  d = withItem(d, 'Nouvel abonnement', 'depenses_fixes', { 1: 1000 }, { year: 2030 });
  return m.selectYear(d, 2030);
}

async function open(data = twoYears()) {
  initializeStore(localStorage);
  useBudgetStore.setState({ data });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Statistiques' }));
  await screen.findByRole('heading', { name: 'Statistiques et comparaisons' });
  return user;
}
const rowOf = (table: HTMLElement, name: RegExp | string) => within(table).getByRole('rowheader', { name }).closest('tr') as HTMLElement;
const indicators = () => screen.getByRole('table', { name: /Indicateurs annuels/ });

describe('écran Statistiques', () => {
  it('sans année : message explicite', async () => {
    initializeStore(localStorage);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Statistiques' }));
    expect(await screen.findByText(/Aucune année enregistrée/)).toBeInTheDocument();
  });

  it('indicateurs globaux : épargne hors consommation, évolution vs référence', async () => {
    await open();
    const t = indicators();
    // référence = année affichée (2030), comparée à 2029 : colonnes 2029 puis 2030
    const revenus = rowOf(t, 'Revenus');
    expect(revenus).toHaveTextContent(eur(200000));
    expect(revenus).toHaveTextContent(eur(270000));
    expect(rowOf(t, 'Total dépenses de consommation')).toHaveTextContent(eur(76000));
    expect(rowOf(t, 'Épargne')).toHaveTextContent(eur(12000));
    expect(rowOf(t, 'Solde avant épargne')).toHaveTextContent(eur(194000));
    expect(rowOf(t, 'Solde après épargne')).toHaveTextContent(eur(182000));
    expect(rowOf(t, /Taux d'épargne/)).toHaveTextContent('4,4 %');
  });

  it('année de référence ancienne : pourcentage « non calculable » quand la base est nulle, « absent » sinon', async () => {
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Année de référence'), '2029');
    await user.click(screen.getByRole('checkbox', { name: '2030' }));
    await user.selectOptions(screen.getByLabelText('Famille'), 'tout');
    const items = screen.getByRole('table', { name: 'Comparaison détaillée des éléments' });

    expect(rowOf(items, /^Bonus/)).toHaveTextContent('% non calculable : base nulle');
    expect(rowOf(items, /^Salaire/)).toHaveTextContent('+10,0 %');
    expect(rowOf(items, /^Salaire/)).toHaveTextContent(`+${eur(20000)}`);
    const nouveau = rowOf(items, /^Nouvel abonnement/);
    expect(nouveau).toHaveTextContent('absent');
    expect(nouveau).toHaveTextContent('élément absent d\'une des deux années');
  });

  it('part dans les revenus et son évolution (en points)', async () => {
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Année de référence'), '2029');
    await user.click(screen.getByRole('checkbox', { name: '2030' }));
    await user.selectOptions(screen.getByLabelText('Famille'), 'depenses_fixes');
    const loyer = rowOf(screen.getByRole('table', { name: 'Comparaison détaillée des éléments' }), /^Loyer/);
    // 2029 : 70 000 / 200 000 de revenus = 35,0 % ; 2030 : 75 000 / 270 000 = 27,8 % (et non 100 % / 98,7 % de la famille)
    expect(loyer).toHaveTextContent('part des revenus : 35,0 %');
    expect(loyer).toHaveTextContent(/part des revenus : 27,8 % \(−7,2 pt vs réf\.\)/);
    expect(loyer).not.toHaveTextContent('100,0 %');
    expect(screen.getByText(/La « part des revenus » est le total annuel de l'élément divisé par le total des revenus/)).toBeInTheDocument();
  });

  it('part des revenus : aussi pour un revenu (part du salaire dans l\'ensemble des revenus)', async () => {
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Famille'), 'revenus');
    expect(rowOf(screen.getByRole('table', { name: 'Comparaison détaillée des éléments' }), /^Salaire/)).toHaveTextContent('part des revenus : 81,5 %'); // 220 000 / 270 000
  });

  it('base « pointé » : seuls les montants pointés comptent', async () => {
    const user = await open();
    expect(rowOf(indicators(), 'Dépenses fixes')).toHaveTextContent(eur(76000));
    await user.selectOptions(screen.getByLabelText('Base de calcul'), 'checked');
    expect(rowOf(indicators(), 'Dépenses fixes')).toHaveTextContent(eur(75000)); // le nouvel abonnement n'est pas pointé
    expect(rowOf(indicators(), 'Revenus')).toHaveTextContent(eur(0));
    expect(screen.getByText(/montants pointés uniquement/)).toBeInTheDocument();
  });

  it('le filtre par famille restreint les comparaisons ; défaut = dépenses de consommation', async () => {
    const user = await open();
    const items = () => screen.getByRole('table', { name: 'Comparaison détaillée des éléments' });
    expect(screen.getByLabelText('Famille')).toHaveValue('depenses');
    expect(within(items()).queryByRole('rowheader', { name: /^Salaire/ })).toBeNull();
    expect(within(items()).getByRole('rowheader', { name: /^Loyer/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Famille'), 'revenus');
    expect(within(items()).getByRole('rowheader', { name: /^Salaire/ })).toBeInTheDocument();
    expect(within(items()).queryByRole('rowheader', { name: /^Loyer/ })).toBeNull();
  });

  it('catégories transversales : « Sans catégorie » et « Logement » sans double compte', async () => {
    await open();
    const cats = screen.getByRole('table', { name: 'Comparaison par catégorie' });
    expect(rowOf(cats, 'Logement')).toHaveTextContent(eur(75000));
    expect(rowOf(cats, 'Sans catégorie')).toHaveTextContent(eur(1000));
  });

  it('les graphiques attendus sont présents avec un nom accessible et leurs données en tableau', async () => {
    await open();
    for (const name of [
      /Barres comparant revenus, dépenses de consommation et épargne/,
      /Barres empilées : composition/,
      /Courbes mensuelles de .* par année/,
      /Courbes de l'épargne cumulée/,
      /Barres comparant les totaux par catégorie/,
      /Barres comparant les totaux par élément/,
    ]) {
      expect(screen.getAllByRole('img', { name }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Données du graphique').length).toBeGreaterThanOrEqual(7);
  });

  it('une seule année : indicateurs affichés sans comparaison', async () => {
    let d = m.createYear(m.createEmptyData(), 2030);
    d = withItem(d, 'Salaire', 'revenus', { 1: 100000 });
    await open(d);
    expect(screen.getByText('Créez une autre année pour comparer.')).toBeInTheDocument();
    expect(rowOf(indicators(), 'Revenus')).toHaveTextContent(eur(100000));
  });

  it('consultation en lecture seule : aucune donnée n\'est modifiée', async () => {
    const data = twoYears();
    const user = await open(data);
    const before = JSON.stringify(useBudgetStore.getState().data);
    await user.selectOptions(screen.getByLabelText('Base de calcul'), 'checked');
    await user.selectOptions(screen.getByLabelText('Famille'), 'tout');
    await user.click(screen.getByRole('checkbox', { name: '2029' }));
    expect(JSON.stringify(useBudgetStore.getState().data)).toBe(before);
    expect(localStorage.getItem('budget:data')).toBeNull(); // rien n'a même été écrit
  });
});
