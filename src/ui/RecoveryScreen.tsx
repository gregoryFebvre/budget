import { useBudgetStore } from '../store/budgetStore';
import type { BootState } from '../store/budgetStore';
import { downloadTextFile } from './download';

export function RecoveryScreen({ boot }: { boot: Extract<BootState, { kind: 'corrupt' | 'too-new' }> }) {
  const resetToEmpty = useBudgetStore((s) => s.resetToEmpty);
  const tooNew = boot.kind === 'too-new';

  return (
    <main className="recovery" role="alert">
      <h1>{tooNew ? 'Données issues d\'une version plus récente' : 'Données illisibles'}</h1>
      <p>{boot.message}</p>
      <p>
        {tooNew
          ? 'Mettez à jour l\'application avant de continuer. Vos données n\'ont pas été modifiées.'
          : 'Vos données n\'ont pas été supprimées : une copie brute est conservée. Téléchargez-la avant toute autre action.'}
      </p>
      <div className="empty-actions">
        {boot.raw !== null && (
          <button
            type="button"
            className="btn primary"
            onClick={() => downloadTextFile(`budget-donnees-illisibles-${new Date().toISOString().slice(0, 10)}.json`, boot.raw ?? '')}
          >
            Télécharger les données brutes
          </button>
        )}
        {!tooNew && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (window.confirm('Repartir d\'un budget vide ? Les données illisibles resteront conservées sous forme brute dans ce navigateur.')) {
                resetToEmpty();
              }
            }}
          >
            Repartir d'un budget vide
          </button>
        )}
      </div>
    </main>
  );
}
