import { useMemo, useState } from 'react';
import { summarizeData } from '../backup/backupFile';
import { SCHEMA_VERSION } from '../domain/types';
import { BACKUP_KEY, CORRUPT_KEY, STORAGE_KEY } from '../storage/localStorageRepo';
import { useBudgetStore } from '../store/budgetStore';
import { exportBackup } from './exportBackup';

const CONFIRM_WORD = 'EFFACER';
const kb = (bytes: number) => `${(bytes / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;

function storedSize(): { total: number; data: number } | null {
  try {
    const size = (k: string) => (localStorage.getItem(k) ?? '').length * 2; // UTF-16 : ~2 octets par caractère
    return { data: size(STORAGE_KEY), total: size(STORAGE_KEY) + size(BACKUP_KEY) + size(CORRUPT_KEY) };
  } catch {
    return null;
  }
}

export function Parametres() {
  const data = useBudgetStore((s) => s.data);
  const save = useBudgetStore((s) => s.save);
  const wipeAllData = useBudgetStore((s) => s.wipeAllData);
  const [wiping, setWiping] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => summarizeData(data), [data]);
  const size = storedSize();
  const lastExport = data.settings.lastExportAt;

  return (
    <section className="gestion" aria-labelledby="param-title">
      <h1 id="param-title">Paramètres et maintenance</h1>

      <h2>Contenu de vos données</h2>
      <ul>
        <li>Années : {summary.years.length ? summary.years.join(', ') : 'aucune'}</li>
        <li>
          Éléments : {summary.items}
          {summary.archivedItems ? ` (dont ${summary.archivedItems} archivés)` : ''} · Catégories : {summary.categories}
        </li>
        <li>
          Montants saisis : {summary.cells} (dont {summary.checkedCells} pointés)
        </li>
        <li>
          Format des données : version {data.schemaVersion} (cette application gère la version {SCHEMA_VERSION}) · révision d'enregistrement n° {data.revision}
        </li>
        <li>Version de l'application : {__APP_VERSION__}</li>
      </ul>

      <h2>Stockage dans ce navigateur</h2>
      <ul>
        <li>
          État :{' '}
          {save.kind === 'saved'
            ? 'dernière modification enregistrée'
            : save.kind === 'error' || save.kind === 'conflict'
              ? 'ATTENTION : dernière modification non enregistrée'
              : 'aucune modification depuis l\'ouverture'}
        </li>
        <li>
          Espace utilisé : {size ? `${kb(size.data)} pour les données (${kb(size.total)} avec les copies de sécurité)` : 'stockage indisponible'}. Les navigateurs
          limitent le <code>localStorage</code> à environ 5 Mo.
        </li>
        <li>
          Dernière sauvegarde JSON : {lastExport ? new Date(lastExport).toLocaleString('fr-FR') : 'jamais'}
        </li>
      </ul>
      <p>
        <button type="button" className="btn primary" onClick={() => exportBackup()}>
          Sauvegarder maintenant (fichier JSON)
        </button>
      </p>

      <h2>Confidentialité et limites</h2>
      <ul className="plain">
        <li>Vos données ne quittent jamais ce navigateur : aucun serveur, aucun compte, aucun suivi d'utilisation.</li>
        <li>Elles sont propres à ce navigateur et à ce profil : elles ne sont pas partagées entre appareils ou navigateurs.</li>
        <li>Elles peuvent disparaître si vous effacez les données du navigateur : <strong>le fichier JSON est votre seule sauvegarde externe</strong>.</li>
        <li>Le <code>localStorage</code> n'est pas chiffré : toute personne utilisant le même profil de navigateur peut potentiellement les lire.</li>
        <li>Ne publiez jamais un fichier de sauvegarde dans un dépôt public.</li>
      </ul>

      <h2>Zone sensible</h2>
      {!wiping ? (
        <button type="button" className="btn danger-outline" onClick={() => setWiping(true)}>
          Effacer toutes les données de ce navigateur…
        </button>
      ) : (
        <form
          className="wipe-box"
          aria-label="Effacer toutes les données"
          onSubmit={(e) => {
            e.preventDefault();
            const err = wipeAllData();
            setError(err);
            if (!err) {
              setWiping(false);
              setTyped('');
            }
          }}
        >
          <p className="warn-text">
            Cette action supprime définitivement toutes les années, tous les éléments et les copies de sécurité locales de ce navigateur.
            {lastExport ? '' : ' Vous n\'avez encore fait aucune sauvegarde JSON : téléchargez-en une d\'abord.'}
          </p>
          <label>
            Tapez {CONFIRM_WORD} pour confirmer
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label={`Tapez ${CONFIRM_WORD} pour confirmer`} />
          </label>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => { setWiping(false); setTyped(''); }}>
              Annuler
            </button>
            <button type="submit" className="btn danger" disabled={typed !== CONFIRM_WORD}>
              Effacer définitivement
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
