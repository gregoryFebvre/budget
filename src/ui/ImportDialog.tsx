import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { isEmptyData, parseBackup, planReplace, summarizeData } from '../backup/backupFile';
import type { DataSummary } from '../backup/backupFile';
import { mergeData } from '../backup/merge';
import type { MergePreference, MergeReport } from '../backup/merge';
import type { BudgetData } from '../domain/types';
import { useBudgetStore } from '../store/budgetStore';
import { exportBackup } from './exportBackup';

type Mode = 'replace' | 'merge';

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    r.readAsText(file);
  });
}

const yearsText = (s: DataSummary) => (s.years.length ? s.years.join(', ') : 'aucune');

function SummaryList({ title, s }: { title: string; s: DataSummary }) {
  return (
    <div className="summary-box">
      <h3>{title}</h3>
      <ul>
        <li>Années : {yearsText(s)}</li>
        <li>
          Éléments : {s.items}
          {s.archivedItems ? ` (dont ${s.archivedItems} archivés)` : ''}
        </li>
        <li>Catégories : {s.categories}</li>
        <li>
          Montants saisis : {s.cells} (dont {s.checkedCells} pointés)
        </li>
      </ul>
    </div>
  );
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const local = useBudgetStore((s) => s.data);
  const importData = useBudgetStore((s) => s.importData);
  const [fileName, setFileName] = useState('');
  const [incoming, setIncoming] = useState<{ data: BudgetData; exportedAt: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('merge');
  const [prefer, setPrefer] = useState<MergePreference>('local');
  const [backupFirst, setBackupFirst] = useState(true);
  const [understood, setUnderstood] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const localHasData = !isEmptyData(local);
  const localSummary = useMemo(() => summarizeData(local), [local]);
  const incomingSummary = useMemo(() => (incoming ? summarizeData(incoming.data) : null), [incoming]);

  const mergePreview = useMemo<{ report: MergeReport } | { error: string } | null>(() => {
    if (!incoming || mode !== 'merge') return null;
    try {
      return { report: mergeData(local, incoming.data, 'local').report };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Fusion impossible.' };
    }
  }, [incoming, mode, local]);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setIncoming(null);
    setError(null);
    setUnderstood(false);
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = parseBackup(await readFile(file));
      if (!parsed.ok) setError(parsed.message);
      else {
        setIncoming({ data: parsed.data, exportedAt: parsed.exportedAt });
        if (!localHasData) setMode('replace');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lecture du fichier impossible.');
    }
  }

  function confirm() {
    if (!incoming) return;
    setError(null);
    if (mode === 'replace') {
      if (backupFirst && localHasData) exportBackup();
      const err = importData((current) => planReplace(current, incoming.data));
      if (err) return setError(err);
      return setDone('Remplacement terminé : vos données ont été remplacées par le contenu du fichier.');
    }
    let report: MergeReport | null = null;
    const err = importData((current) => {
      const merged = mergeData(current, incoming.data, prefer);
      report = merged.report;
      return merged.data;
    });
    if (err) return setError(err);
    const r = report as MergeReport | null;
    setDone(
      r
        ? `Fusion terminée : ${r.addedYears.length} année(s), ${r.addedItems} élément(s) et ${r.addedCells} montant(s) ajoutés ; ${r.conflicts.length} conflit(s) résolu(s) en faveur de ${prefer === 'local' ? 'vos valeurs' : 'du fichier'}.`
        : 'Fusion terminée.',
    );
  }

  const report = mergePreview && 'report' in mergePreview ? mergePreview.report : null;
  const canConfirm = incoming !== null && (mode === 'merge' ? report !== null : understood || !localHasData);

  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="imp-title">
        <h2 id="imp-title">Importer une sauvegarde</h2>

        {done ? (
          <>
            <p role="status" className="ok-text">
              {done}
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn primary" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        ) : (
          <>
            <label>
              Fichier de sauvegarde JSON
              <input type="file" accept="application/json,.json" onChange={onPick} />
            </label>
            <p className="hint">Rien n'est modifié tant que vous n'avez pas confirmé. Le fichier est lu localement, il n'est envoyé nulle part.</p>

            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}

            {incoming && incomingSummary && (
              <>
                <p>
                  <strong>{fileName}</strong>
                  {incoming.exportedAt ? ` — exporté le ${new Date(incoming.exportedAt).toLocaleString('fr-FR')}` : ''}
                </p>
                <div className="summary-grid">
                  <SummaryList title="Contenu du fichier" s={incomingSummary} />
                  <SummaryList title="Vos données actuelles" s={localSummary} />
                </div>

                <fieldset>
                  <legend>Mode d'import</legend>
                  <label className="inline">
                    <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                    Fusion : ajoute ce qui manque, sans rien supprimer
                  </label>
                  <label className="inline">
                    <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                    Remplacement complet : vos données actuelles sont remplacées par le fichier
                  </label>
                </fieldset>

                {mode === 'replace' && (
                  <>
                    {localHasData && (
                      <>
                        <p className="warn-text">
                          Vos données actuelles seront remplacées.
                          {localSummary.years.some((y) => !incomingSummary.years.includes(y)) &&
                            ` Années présentes ici mais absentes du fichier (donc perdues) : ${localSummary.years.filter((y) => !incomingSummary.years.includes(y)).join(', ')}.`}
                        </p>
                        <label className="inline">
                          <input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} />
                          Télécharger d'abord une sauvegarde de mes données actuelles (recommandé)
                        </label>
                        <label className="inline">
                          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                          Je comprends que mes données actuelles seront remplacées
                        </label>
                      </>
                    )}
                  </>
                )}

                {mode === 'merge' && mergePreview && 'error' in mergePreview && (
                  <p role="alert" className="form-error">
                    {mergePreview.error}
                  </p>
                )}

                {mode === 'merge' && report && (
                  <div className="merge-report">
                    <ul>
                      <li>
                        Ajoutés : {report.addedYears.length} année(s){report.addedYears.length ? ` (${report.addedYears.join(', ')})` : ''}, {report.addedItems} élément(s), {report.addedCategories}{' '}
                        catégorie(s), {report.addedCells} montant(s)
                      </li>
                      <li>Identiques (ignorés) : {report.identicalCells} montant(s)</li>
                      {report.remappedCategories > 0 && <li>Catégories rapprochées par libellé : {report.remappedCategories}</li>}
                      <li>
                        <strong>Conflits : {report.conflicts.length}</strong>
                      </li>
                    </ul>
                    {report.conflicts.length > 0 && (
                      <>
                        <fieldset>
                          <legend>En cas de conflit, conserver…</legend>
                          <label className="inline">
                            <input type="radio" name="prefer" checked={prefer === 'local'} onChange={() => setPrefer('local')} />
                            Mes valeurs actuelles (par défaut)
                          </label>
                          <label className="inline">
                            <input type="radio" name="prefer" checked={prefer === 'imported'} onChange={() => setPrefer('imported')} />
                            Les valeurs du fichier
                          </label>
                        </fieldset>
                        <div className="conflict-list" tabIndex={0} aria-label="Liste des conflits">
                          <table className="mgmt-table">
                            <thead>
                              <tr>
                                <th scope="col">Élément</th>
                                <th scope="col">Mes données</th>
                                <th scope="col">Fichier</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.conflicts.slice(0, 100).map((c, i) => (
                                <tr key={i}>
                                  <td>
                                    {c.subject}
                                    {c.where ? ` — ${c.where}` : ''} <span className="tag">{c.kind}</span>
                                  </td>
                                  <td className={prefer === 'local' ? 'kept' : ''}>{c.local}</td>
                                  <td className={prefer === 'imported' ? 'kept' : ''}>{c.imported}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {report.conflicts.length > 100 && <p className="hint">… et {report.conflicts.length - 100} autre(s) conflit(s), traités de la même façon.</p>}
                        </div>
                        <p className="hint">Les valeurs en vert seront conservées. La fusion n'efface jamais rien : les suppressions faites d'un seul côté ne sont pas propagées.</p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="dialog-actions">
              <button type="button" className="btn" onClick={onClose}>
                Annuler
              </button>
              <button type="button" className={`btn ${mode === 'replace' ? 'danger' : 'primary'}`} disabled={!canConfirm} onClick={confirm}>
                {mode === 'replace' ? 'Remplacer mes données' : 'Fusionner'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
