import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { formatAmount } from '../domain/money';
import { STORAGE_KEY } from '../storage/localStorageRepo';
import { initializeStore, useBudgetStore } from '../store/budgetStore';
import { Y, specExample } from './fixtures';

const cellText = (testId: string) => screen.getByTestId(testId).textContent;

function setup() {
  initializeStore(localStorage);
  useBudgetStore.setState({ data: specExample() });
  return userEvent.setup();
}

describe('tableau annuel', () => {
  it('affiche le reste à provisionner de l\'exemple (340 €) et les totaux calculés', () => {
    setup();
    render(<App />);
    expect(cellText('reste-1')).toBe(formatAmount(34000));
    expect(cellText('total-depenses_fixes-1')).toBe(formatAmount(130000));
    expect(cellText('progress-1')).toBe('3 / 6'); // 6 cellules renseignées dont 3 pointées
    expect(cellText('reste-2')).toBe(formatAmount(0));
  });

  it('pointer une ligne met à jour le reste immédiatement, sans toucher au montant', async () => {
    const user = setup();
    render(<App />);
    const box = screen.getByRole('checkbox', { name: 'Pointer Électricité, janvier' });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(box).toBeChecked();
    expect(cellText('reste-1')).toBe(formatAmount(25000));
    expect(cellText('total-depenses_fixes-1')).toBe(formatAmount(130000));
    await user.click(box);
    expect(cellText('reste-1')).toBe(formatAmount(34000));
  });

  it('modifier un montant : Entrée valide, totaux recalculés, valeur enregistrée dans le localStorage', async () => {
    const user = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Courses, janvier/ }));
    const input = screen.getByRole('textbox', { name: 'Montant Courses, janvier' });
    await user.clear(input);
    await user.type(input, '280,50{Enter}');
    expect(cellText('reste-1')).toBe(formatAmount(34000 + 3050));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const courses = Object.values<{ id: string; label: string }>(stored.items).find((i) => i.label === 'Courses')!;
    expect(stored.years[String(Y)].entries[courses.id]['1'].amount).toBe(28050);
  });

  it('modifier le montant d\'une ligne pointée conserve son pointage', async () => {
    const user = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Crédit immobilier, janvier/ }));
    const input = screen.getByRole('textbox', { name: 'Montant Crédit immobilier, janvier' });
    await user.clear(input);
    await user.type(input, '850{Enter}');
    expect(screen.getByRole('checkbox', { name: 'Pointer Crédit immobilier, janvier' })).toBeChecked();
    expect(cellText('reste-1')).toBe(formatAmount(34000));
    expect(cellText('total-depenses_fixes-1')).toBe(formatAmount(135000));
  });

  it('Échap annule la modification', async () => {
    const user = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Courses, janvier/ }));
    await user.type(screen.getByRole('textbox', { name: /Courses/ }), '999{Escape}');
    expect(cellText('reste-1')).toBe(formatAmount(34000));
    expect(screen.getByRole('button', { name: /^Courses, janvier : 250,00/ })).toBeInTheDocument();
  });

  it('une saisie invalide est signalée et rien n\'est enregistré', async () => {
    const user = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Courses, janvier/ }));
    const input = screen.getByRole('textbox', { name: /Courses/ });
    await user.clear(input);
    await user.type(input, 'abc{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent(/Saisie non reconnue/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(cellText('reste-1')).toBe(formatAmount(34000));
  });

  it('navigation clavier : les flèches déplacent le focus sans passer en édition', async () => {
    const user = setup();
    render(<App />);
    screen.getByRole('button', { name: /^Courses, janvier/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /^Courses, février/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: /^Électricité, février/ })).toHaveFocus();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('une cellule non renseignée ne peut pas être pointée', () => {
    setup();
    render(<App />);
    expect(screen.getByRole('checkbox', { name: 'Pointer Courses, février' })).toBeDisabled();
  });

  it('ajout d\'une ligne avec catégorie transversale', async () => {
    const user = setup();
    render(<App />);
    const addBtn = screen.getByRole('button', { name: /Ajouter une ligne \(épargne\)/i });
    await user.click(addBtn);
    await user.type(screen.getByLabelText(/Libellé de la nouvelle ligne/), 'Livret test');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByRole('rowheader', { name: /Livret test/ })).toBeInTheDocument();
  });

  it('changement d\'année : le pointage reste propre à chaque année', async () => {
    const user = setup();
    useBudgetStore.getState().createYear(Y + 1, { fromYear: Y, copyAmounts: true });
    render(<App />);
    expect(cellText('reste-1')).toBe(formatAmount(130000)); // nouvelle année : aucun pointage copié
    await user.selectOptions(screen.getByRole('combobox', { name: 'Année' }), String(Y));
    expect(cellText('reste-1')).toBe(formatAmount(34000));
  });
});

describe('écran vide', () => {
  it('propose de créer une année ou de charger un exemple fictif', () => {
    initializeStore(localStorage);
    render(<App />);
    const welcome = screen.getByRole('region', { name: 'Bienvenue' });
    expect(within(welcome).getByRole('button', { name: 'Charger un exemple fictif' })).toBeInTheDocument();
  });
});

describe('position du pointage', () => {
  it('la case de pointage est à DROITE du montant (et le montant reste le premier élément focalisable)', () => {
    setup();
    render(<App />);
    const amount = screen.getByRole('button', { name: /^Courses, janvier/ });
    const box = screen.getByRole('checkbox', { name: 'Pointer Courses, janvier' });
    expect(amount.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(amount.parentElement).toBe(box.parentElement);
    expect(box.parentElement!.lastElementChild).toBe(box);
  });
});
