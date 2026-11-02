import { useBudgetStore } from '../store/budgetStore';

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function SaveIndicator() {
  const save = useBudgetStore((s) => s.save);
  const lastExportAt = useBudgetStore((s) => s.data.settings.lastExportAt);

  let local: { text: string; cls: string };
  switch (save.kind) {
    case 'saved':
      local = {
        text: `✓ Enregistré dans ce navigateur (${new Date(save.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`,
        cls: 'ok',
      };
      break;
    case 'error':
      local = { text: '⚠ Modifications NON enregistrées', cls: 'bad' };
      break;
    case 'conflict':
      local = { text: '⚠ Autre onglet : rechargez la page', cls: 'bad' };
      break;
    default:
      local = { text: 'Aucune modification en cours', cls: '' };
  }

  const exportText =
    lastExportAt === null
      ? 'Aucune sauvegarde JSON'
      : `Dernière sauvegarde JSON : ${daysSince(lastExportAt) === 0 ? "aujourd'hui" : `il y a ${daysSince(lastExportAt)} j`}`;
  const exportWarn = lastExportAt === null || daysSince(lastExportAt) > 30;

  return (
    <div className="save-indicator" role="status" aria-live="polite">
      <span className={local.cls}>{local.text}</span>
      <span className={exportWarn ? 'warn' : ''}>{exportText}</span>
    </div>
  );
}
