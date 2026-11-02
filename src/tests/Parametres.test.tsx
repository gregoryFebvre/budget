import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { BACKUP_KEY, STORAGE_KEY } from '../storage/localStorageRepo';
import { initializeStore, useBudgetStore } from '../store/budgetStore';

async function open() {
  initializeStore(localStorage);
  useBudgetStore.getState().loadDemo(2030); // données FICTIVES
  useBudgetStore.getState().setAmount(2030, Object.keys(useBudgetStore.getState().data.items)[0]!, 5, 1234); // 2e écriture → copie de secours
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Paramètres' }));
  return user;
}

describe('écran Paramètres', () => {
  afterEach(() => vi.restoreAllMocks());

  it('affiche le contenu, le stockage et les limites du stockage local', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'Paramètres et maintenance' })).toBeInTheDocument();
    expect(screen.getByText(/Années : 2030/)).toBeInTheDocument();
    expect(screen.getByText(/Éléments : 11/)).toBeInTheDocument();
    expect(screen.getByText(/Dernière sauvegarde JSON : jamais/)).toBeInTheDocument();
    expect(screen.getByText(/Espace utilisé : .* Ko pour les données/)).toBeInTheDocument();
    expect(screen.getByText(/n'est pas chiffré/)).toBeInTheDocument();
    expect(screen.getByText(/seule sauvegarde externe/)).toBeInTheDocument();
    expect(screen.getByText(/Version de l'application :/)).toBeInTheDocument();
  });

  it('l\'effacement exige de taper EFFACER, puis supprime données et copies de sécurité', async () => {
    const user = await open();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /Effacer toutes les données de ce navigateur/ }));
    const go = screen.getByRole('button', { name: 'Effacer définitivement' });
    expect(go).toBeDisabled();
    expect(screen.getByText(/aucune sauvegarde JSON/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Tapez EFFACER pour confirmer'), 'effacer');
    expect(go).toBeDisabled(); // la casse compte
    await user.clear(screen.getByLabelText('Tapez EFFACER pour confirmer'));
    await user.type(screen.getByLabelText('Tapez EFFACER pour confirmer'), 'EFFACER');
    await user.click(go);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
    expect(Object.keys(useBudgetStore.getState().data.years)).toHaveLength(0);
  });

  it('Annuler ne supprime rien', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: /Effacer toutes les données de ce navigateur/ }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(Object.keys(useBudgetStore.getState().data.years)).toEqual(['2030']);
  });

  it('si le navigateur refuse la suppression : message, et les données en mémoire sont conservées', async () => {
    const user = await open();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('refusé');
    });
    await user.click(screen.getByRole('button', { name: /Effacer toutes les données de ce navigateur/ }));
    await user.type(screen.getByLabelText('Tapez EFFACER pour confirmer'), 'EFFACER');
    await user.click(screen.getByRole('button', { name: 'Effacer définitivement' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/n'ont pas été effacées/);
    expect(Object.keys(useBudgetStore.getState().data.years)).toEqual(['2030']);
  });

  it('le bouton de sauvegarde est disponible depuis les paramètres', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = await open();
    await user.click(screen.getByRole('button', { name: /Sauvegarder maintenant/ }));
    expect(click).toHaveBeenCalledOnce();
    expect(useBudgetStore.getState().data.settings.lastExportAt).not.toBeNull();
  });
});

describe('accessibilité de base', () => {
  it('lien d\'évitement vers le contenu principal', () => {
    initializeStore(localStorage);
    render(<App />);
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveAttribute('href', '#contenu');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenu');
  });
});
