import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { buildBackup } from '../backup/backupFile';
import { createDemoData } from '../domain/demo';
import * as m from '../domain/mutations';
import { initializeStore, useBudgetStore } from '../store/budgetStore';
import { idOf } from './fixtures';

const state = () => useBudgetStore.getState().data;
const fileOf = (text: string) => new File([text], 'sauvegarde.json', { type: 'application/json' });

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(blob);
  });
}

async function setup(local = createDemoData(2030)) {
  initializeStore(localStorage);
  useBudgetStore.setState({ data: local });
  const user = userEvent.setup();
  render(<App />);
  return user;
}

describe('sauvegarde (export)', () => {
  it('télécharge toutes les données et mémorise la date d\'export', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:test'));
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = await setup();
    expect(state().settings.lastExportAt).toBeNull();
    expect(screen.getByText('Aucune sauvegarde JSON')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sauvegarder' }));

    expect(click).toHaveBeenCalledOnce();
    const file = JSON.parse(await blobText(blobs[0]!));
    expect(file.app).toBe('budget');
    expect(Object.keys(file.data.years)).toEqual(['2030']);
    expect(state().settings.lastExportAt).toBe(file.exportedAt);
    expect(screen.getByText(/Dernière sauvegarde JSON : aujourd'hui/)).toBeInTheDocument();
    click.mockRestore();
  });
});

describe('import (interface)', () => {
  it('fichier invalide : message clair, aucune donnée modifiée, bouton de confirmation inactif', async () => {
    const user = await setup();
    const before = JSON.stringify(state());
    await user.click(screen.getByRole('button', { name: 'Importer' }));
    await user.upload(screen.getByLabelText('Fichier de sauvegarde JSON'), fileOf('{ceci n est pas du json'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/pas un JSON/);
    expect(screen.getByRole('button', { name: 'Fusionner' })).toBeDisabled();
    expect(JSON.stringify(state())).toBe(before);
  });

  it('remplacement complet : exige une confirmation explicite puis remplace', async () => {
    const user = await setup();
    const incoming = createDemoData(2031);
    await user.click(screen.getByRole('button', { name: 'Importer' }));
    await user.upload(screen.getByLabelText('Fichier de sauvegarde JSON'), fileOf(buildBackup(incoming).content));
    await screen.findByText('Contenu du fichier');
    await user.click(screen.getByRole('radio', { name: /Remplacement complet/ }));
    const go = screen.getByRole('button', { name: 'Remplacer mes données' });
    expect(go).toBeDisabled();
    expect(screen.getByText(/absentes du fichier \(donc perdues\) : 2030/)).toBeInTheDocument();

    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await user.click(screen.getByRole('checkbox', { name: /Je comprends/ }));
    await user.click(go);

    expect(click).toHaveBeenCalledOnce(); // sauvegarde préalable des données actuelles
    expect(Object.keys(state().years)).toEqual(['2031']);
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(/Remplacement terminé/);
    click.mockRestore();
  });

  it('fusion : conflits listés, valeurs locales conservées par défaut', async () => {
    const local = createDemoData(2030);
    const incoming = m.setAmount(structuredClone(local), 2030, idOf(local, 'Loyer (démo)'), 1, 12345);
    const user = await setup(local);
    await user.click(screen.getByRole('button', { name: 'Importer' }));
    await user.upload(screen.getByLabelText('Fichier de sauvegarde JSON'), fileOf(buildBackup(incoming).content));
    expect(await screen.findByText('Conflits : 1')).toBeInTheDocument();
    const list = screen.getByLabelText('Liste des conflits');
    expect(within(list).getByText(/Loyer \(démo\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fusionner' }));
    expect(state().years['2030']!.entries[idOf(local, 'Loyer (démo)')]![1]!.amount).toBe(70000);
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(/1 conflit\(s\) résolu\(s\) en faveur de vos valeurs/);
  });

  it('fusion avec préférence « fichier »', async () => {
    const local = createDemoData(2030);
    const incoming = m.setAmount(structuredClone(local), 2030, idOf(local, 'Loyer (démo)'), 1, 12345);
    const user = await setup(local);
    await user.click(screen.getByRole('button', { name: 'Importer' }));
    await user.upload(screen.getByLabelText('Fichier de sauvegarde JSON'), fileOf(buildBackup(incoming).content));
    await screen.findByText('Conflits : 1');
    await user.click(screen.getByRole('radio', { name: /Les valeurs du fichier/ }));
    await user.click(screen.getByRole('button', { name: 'Fusionner' }));
    await waitFor(() => expect(state().years['2030']!.entries[idOf(local, 'Loyer (démo)')]![1]!.amount).toBe(12345));
  });

  it('depuis un navigateur vide : propose directement le remplacement sans case à cocher', async () => {
    initializeStore(localStorage);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Importer une sauvegarde' }));
    await user.upload(screen.getByLabelText('Fichier de sauvegarde JSON'), fileOf(buildBackup(createDemoData(2030)).content));
    await screen.findByText('Contenu du fichier');
    await act(async () => {});
    await user.click(screen.getByRole('button', { name: 'Remplacer mes données' }));
    expect(Object.keys(state().years)).toEqual(['2030']);
  });
});
