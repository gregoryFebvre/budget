import type { Family, FamilyId, MonthIndex } from './types';

export const DEFAULT_FAMILIES: Record<FamilyId, Family> = {
  revenus: { id: 'revenus', label: 'Revenus', kind: 'income', order: 1 },
  depenses_fixes: { id: 'depenses_fixes', label: 'Dépenses fixes', kind: 'consumption', order: 2 },
  depenses_ponctuelles: {
    id: 'depenses_ponctuelles',
    label: 'Dépenses ponctuelles',
    kind: 'consumption',
    order: 3,
  },
  epargne: { id: 'epargne', label: 'Épargne', kind: 'savings', order: 4 },
};

export const MONTH_NAMES: Record<MonthIndex, string> = {
  1: 'janvier',
  2: 'février',
  3: 'mars',
  4: 'avril',
  5: 'mai',
  6: 'juin',
  7: 'juillet',
  8: 'août',
  9: 'septembre',
  10: 'octobre',
  11: 'novembre',
  12: 'décembre',
};

export const MONTH_SHORT: Record<MonthIndex, string> = {
  1: 'Janv.',
  2: 'Févr.',
  3: 'Mars',
  4: 'Avr.',
  5: 'Mai',
  6: 'Juin',
  7: 'Juil.',
  8: 'Août',
  9: 'Sept.',
  10: 'Oct.',
  11: 'Nov.',
  12: 'Déc.',
};

export const MIN_YEAR = 1990;
export const MAX_YEAR = 2200;
