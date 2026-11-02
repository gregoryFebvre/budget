import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { createDemoData } from '../domain/demo';
import { initializeStore, useBudgetStore } from '../store/budgetStore';

async function openGestion() {
  initializeStore(localStorage);
  useBudgetStore.setState({ data: createDemoData(2030) });
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Gestion' }));
  return user;
}
const state = () => useBudgetStore.getState().data;
const find = (label: string) => Object.values(state().items).find((i) => i.label === label)!;

describe('écran Gestion', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renommer un élément conserve son identifiant, ses montants et son pointage', async () => {
    const user = await openGestion();
    const before = find('Loyer (démo)');
    act(() => useBudgetStore.getState().toggleChecked(2030, before.id, 1));
    const input = screen.getByRole('textbox', { name: 'Libellé de Loyer (démo)' });
    await user.clear(input);
    await user.type(input, 'Loyer principal{Enter}');
    const after = state().items[before.id]!;
    expect(after.label).toBe('Loyer principal');
    expect(state().years['2030']!.entries[before.id]![1]).toEqual({ amount: 70000, checked: true });
    expect(Object.values(state().items).filter((i) => i.label.startsWith('Loyer'))).toHaveLength(1);
  });

  it('Échap annule un renommage', async () => {
    const user = await openGestion();
    const input = screen.getByRole('textbox', { name: 'Libellé de Loyer (démo)' });
    await user.type(input, 'XYZ{Escape}');
    expect(find('Loyer (démo)')).toBeDefined();
    expect(input).toHaveValue('Loyer (démo)');
  });

  it('suppression d\'un élément qui a des montants : refusée avec message, rien n\'est perdu', async () => {
    const user = await openGestion();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Supprimer Loyer (démo)' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/archivez-le/);
    expect(find('Loyer (démo)')).toBeDefined();
  });

  it('archivage puis désarchivage', async () => {
    const user = await openGestion();
    const row = screen.getByRole('textbox', { name: 'Libellé de Internet (démo)' }).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Archiver' }));
    expect(find('Internet (démo)').archived).toBe(true);
    await user.click(within(row).getByRole('button', { name: 'Désarchiver' }));
    expect(find('Internet (démo)').archived).toBe(false);
  });

  it('création d\'un élément avec une nouvelle catégorie', async () => {
    const user = await openGestion();
    await user.type(screen.getByRole('textbox', { name: 'Libellé du nouvel élément' }), 'Mutuelle test');
    await user.type(screen.getByRole('combobox', { name: 'Catégorie du nouvel élément' }), 'Santé');
    await user.click(screen.getByRole('button', { name: "Créer l'élément" }));
    const item = find('Mutuelle test');
    expect(state().categories[item.categoryId!]!.label).toBe('Santé');
    expect(state().years['2030']!.itemIds).toContain(item.id);
  });

  it('catégories : suppression bloquée, réaffectation puis suppression', async () => {
    const user = await openGestion();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('tab', { name: 'Catégories' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer la catégorie Internet' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/réaffectez/);
    await user.click(screen.getByRole('button', { name: 'Réaffecter les éléments de Internet' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer la catégorie Internet' }));
    expect(Object.values(state().categories).some((c) => c.label === 'Internet')).toBe(false);
    expect(find('Internet (démo)').categoryId).toBeNull();
  });

  it('familles : renommage du libellé uniquement', async () => {
    const user = await openGestion();
    await user.click(screen.getByRole('tab', { name: 'Familles' }));
    const input = screen.getByRole('textbox', { name: 'Libellé de la famille Épargne' });
    await user.clear(input);
    await user.type(input, 'Placements{Enter}');
    expect(state().families.epargne).toMatchObject({ label: 'Placements', kind: 'savings' });
    await user.click(screen.getByRole('button', { name: 'Tableau' }));
    expect(screen.getByRole('columnheader', { name: 'Placements' })).toBeInTheDocument();
  });

  it('duplication : nouvel élément indépendant', async () => {
    const user = await openGestion();
    const row = screen.getByRole('textbox', { name: 'Libellé de Loyer (démo)' }).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Dupliquer' }));
    await user.click(screen.getByRole('button', { name: 'Créer la copie' }));
    expect(find('Loyer (démo) (copie)').id).not.toBe(find('Loyer (démo)').id);
  });
});
