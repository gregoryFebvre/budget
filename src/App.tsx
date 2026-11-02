import { Suspense, lazy, useState } from 'react';
import { resolveSelectedYear } from './domain/structure';
import { useBudgetStore } from './store/budgetStore';
import { Banners } from './ui/Banners';
import { Gestion } from './ui/Gestion';

const Statistiques = lazy(() => import('./ui/stats/Statistiques'));
import { ImportDialog } from './ui/ImportDialog';
import { Parametres } from './ui/Parametres';
import type { View } from './ui/views';
import { NewYearDialog } from './ui/NewYearDialog';
import { RecoveryScreen } from './ui/RecoveryScreen';
import { TopBar } from './ui/TopBar';
import { YearTable } from './ui/YearTable';

export function App() {
  const boot = useBudgetStore((s) => s.boot);
  const data = useBudgetStore((s) => s.data);
  const loadDemo = useBudgetStore((s) => s.loadDemo);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState<View>('budget');

  if (boot.kind === 'corrupt' || boot.kind === 'too-new') return <RecoveryScreen boot={boot} />;

  const yearNumber = resolveSelectedYear(data);
  const year = yearNumber !== null ? data.years[String(yearNumber)] : undefined;

  return (
    <>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <TopBar onNewYear={() => setCreating(true)} onImport={() => setImporting(true)} view={view} onView={setView} />
      <Banners />
      <main className="main" id="contenu">
        {view === 'parametres' ? (
          <Parametres />
        ) : view === 'stats' ? (
          <Suspense fallback={<p className="muted">Chargement des statistiques…</p>}>
            <Statistiques />
          </Suspense>
        ) : view === 'gestion' ? (
          <Gestion />
        ) : year ? (
          <YearTable key={year.year} year={year} />
        ) : (
          <section className="empty" aria-labelledby="empty-title">
            <h1 id="empty-title">Bienvenue</h1>
            <p>Aucune année n'est encore enregistrée. Vos données restent dans ce navigateur : rien n'est envoyé sur Internet.</p>
            <div className="empty-actions">
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                Créer une année
              </button>
              <button type="button" className="btn" onClick={() => setImporting(true)}>
                Importer une sauvegarde
              </button>
              <button type="button" className="btn" onClick={() => loadDemo(new Date().getFullYear())}>
                Charger un exemple fictif
              </button>
            </div>
          </section>
        )}
      </main>
      {creating && <NewYearDialog onClose={() => setCreating(false)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </>
  );
}
