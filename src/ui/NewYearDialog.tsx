import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useBudgetStore } from '../store/budgetStore';

export function NewYearDialog({ onClose }: { onClose: () => void }) {
  const yearsRecord = useBudgetStore((s) => s.data.years);
  const years = useMemo(
    () => Object.values(yearsRecord).map((y) => y.year).sort((a, b) => b - a),
    [yearsRecord],
  );
  const createYear = useBudgetStore((s) => s.createYear);
  const latest = years[0];
  const [year, setYear] = useState(String(latest !== undefined ? latest + 1 : new Date().getFullYear()));
  const [from, setFrom] = useState(latest !== undefined ? String(latest) : '');
  const [mode, setMode] = useState<'structure' | 'amounts'>('structure');
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const err = createYear(Number(year), from ? { fromYear: Number(from), copyAmounts: mode === 'amounts' } : {});
    if (err) setError(err);
    else onClose();
  }

  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="ny-title" onSubmit={submit}>
        <h2 id="ny-title">Nouvelle année</h2>
        <label>
          Année civile
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} required autoFocus />
        </label>
        {years.length > 0 && (
          <>
            <label>
              Reprendre la structure de
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Aucune (année vide)</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {from && (
              <fieldset>
                <legend>À copier</legend>
                <label className="inline">
                  <input type="radio" checked={mode === 'structure'} onChange={() => setMode('structure')} />
                  Structure seule (montants vierges)
                </label>
                <label className="inline">
                  <input type="radio" checked={mode === 'amounts'} onChange={() => setMode('amounts')} />
                  Structure et montants
                </label>
                <p className="hint">Le pointage bancaire n'est jamais copié. Les éléments archivés ne sont pas repris.</p>
              </fieldset>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn primary">
            Créer
          </button>
        </div>
      </form>
    </div>
  );
}
