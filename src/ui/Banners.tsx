import { useBudgetStore } from '../store/budgetStore';

export function Banners() {
  const boot = useBudgetStore((s) => s.boot);
  const save = useBudgetStore((s) => s.save);

  return (
    <div className="banners">
      {boot.kind === 'recovered' && (
        <div className="banner warn" role="alert">
          Les données principales étaient illisibles : la copie de sécurité précédente a été restaurée. Une copie brute des
          données illisibles est conservée dans ce navigateur. Vérifiez vos montants.
        </div>
      )}
      {boot.kind === 'memory-only' && (
        <div className="banner bad" role="alert">
          {boot.message} Les données ne seront pas conservées après fermeture de la page.
        </div>
      )}
      {save.kind === 'error' && boot.kind !== 'memory-only' && (
        <div className="banner bad" role="alert">
          {save.message}
        </div>
      )}
      {save.kind === 'conflict' && (
        <div className="banner bad" role="alert">
          {save.message}{' '}
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Recharger la page
          </button>{' '}
          (les modifications faites depuis dans cet onglet ne seront pas conservées)
        </div>
      )}
    </div>
  );
}
