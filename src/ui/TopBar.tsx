import { resolveSelectedYear } from '../domain/structure';
import { useBudgetStore } from '../store/budgetStore';
import { SaveIndicator } from './SaveIndicator';
import { exportBackup } from './exportBackup';
import type { View } from './views';


interface Props {
  onNewYear: () => void;
  onImport: () => void;
  view: View;
  onView: (v: View) => void;
}

export function TopBar({ onNewYear, onImport, view, onView }: Props) {
  const data = useBudgetStore((s) => s.data);
  const selectYear = useBudgetStore((s) => s.selectYear);
  const selected = resolveSelectedYear(data);
  const years = Object.values(data.years)
    .map((y) => y.year)
    .sort((a, b) => b - a);

  return (
    <header className="topbar">
      <nav aria-label="Navigation principale" className="topbar-nav">
        <span className="brand">Budget</span>
        <label className="year-picker">
          <span>Année</span>
          <select
            value={selected ?? ''}
            disabled={years.length === 0}
            onChange={(e) => selectYear(Number(e.target.value))}
          >
            {years.length === 0 && <option value="">—</option>}
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={onNewYear}>
          Nouvelle année
        </button>
        <span className="sep" aria-hidden="true" />
        <button type="button" className="btn" onClick={() => exportBackup()} title="Télécharger toutes vos données (fichier JSON)">
          Sauvegarder
        </button>
        <button type="button" className="btn" onClick={onImport} title="Restaurer ou fusionner une sauvegarde JSON">
          Importer
        </button>
        <button type="button" className={`btn${view === 'budget' ? ' active' : ''}`} aria-current={view === 'budget' ? 'page' : undefined} onClick={() => onView('budget')}>
          Tableau
        </button>
        <button type="button" className={`btn${view === 'gestion' ? ' active' : ''}`} aria-current={view === 'gestion' ? 'page' : undefined} onClick={() => onView('gestion')}>
          Gestion
        </button>
        <button type="button" className={`btn${view === 'stats' ? ' active' : ''}`} aria-current={view === 'stats' ? 'page' : undefined} onClick={() => onView('stats')}>
          Statistiques
        </button>
        <button type="button" className={`btn${view === 'parametres' ? ' active' : ''}`} aria-current={view === 'parametres' ? 'page' : undefined} onClick={() => onView('parametres')}>
          Paramètres
        </button>
      </nav>
      <SaveIndicator />
    </header>
  );
}
