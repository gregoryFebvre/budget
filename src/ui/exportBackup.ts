import { buildBackup } from '../backup/backupFile';
import { useBudgetStore } from '../store/budgetStore';
import { downloadTextFile } from './download';

/** Télécharge l'INTÉGRALITÉ des données (toutes les années) et mémorise la date d'export. */
export function exportBackup(): string {
  const { data, markExported } = useBudgetStore.getState();
  const backup = buildBackup(data, new Date());
  downloadTextFile(backup.filename, backup.content);
  markExported(backup.exportedAt);
  return backup.filename;
}
