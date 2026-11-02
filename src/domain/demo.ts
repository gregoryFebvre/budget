/** Jeu de données ENTIÈREMENT FICTIF (démonstration et tests). Aucun montant réel. */
import { addItem, createEmptyData, createYear, setAmount } from './mutations';
import { MONTHS } from './types';
import type { BudgetData, FamilyId, MonthIndex } from './types';

interface DemoLine {
  label: string;
  family: FamilyId;
  category?: string;
  cents: number;
  months?: MonthIndex[];
  nature?: 'ponctuelle' | 'recurrente_temporaire';
}

const LINES: DemoLine[] = [
  { label: 'Salaire A (démo)', family: 'revenus', cents: 200000 },
  { label: 'Prime (démo)', family: 'revenus', cents: 50000, months: [6] },
  { label: 'Loyer (démo)', family: 'depenses_fixes', category: 'Logement', cents: 70000 },
  { label: 'Électricité (démo)', family: 'depenses_fixes', category: 'Logement', cents: 9000 },
  { label: 'Assurance auto (démo)', family: 'depenses_fixes', category: 'Assurance', cents: 6000 },
  { label: 'Assurance habitation (démo)', family: 'depenses_fixes', category: 'Assurance', cents: 2500 },
  { label: 'Internet (démo)', family: 'depenses_fixes', category: 'Internet', cents: 3000 },
  { label: 'Cantine (démo)', family: 'depenses_fixes', category: 'Enfant', cents: 12000, months: [2, 5, 10] },
  { label: 'Réparation (démo)', family: 'depenses_ponctuelles', category: 'Logement', cents: 25000, months: [3] },
  {
    label: 'Achat canapé (démo)',
    family: 'depenses_ponctuelles',
    cents: 6000,
    months: [4, 5, 6, 7, 8, 9],
    nature: 'recurrente_temporaire',
  },
  { label: 'Livret (démo)', family: 'epargne', cents: 10000 },
];

export function createDemoData(year: number): BudgetData {
  let data = createYear(createEmptyData(), year);
  for (const line of LINES) {
    data = addItem(data, {
      label: line.label,
      familyId: line.family,
      year,
      ...(line.category ? { categoryLabel: line.category } : {}),
      ...(line.nature ? { nature: line.nature } : {}),
    });
    const id = Object.values(data.items).find((i) => i.label === line.label)!.id;
    for (const m of line.months ?? MONTHS) data = setAmount(data, year, id, m, line.cents);
  }
  return { ...data, settings: { ...data.settings, lastOpenedYear: year } };
}
