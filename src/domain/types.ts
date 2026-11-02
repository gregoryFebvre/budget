/**
 * Modèle de données de l'application « Budget » (schéma v1).
 *
 * Principes :
 *  - Les éléments (lignes) et catégories sont GLOBAUX et identifiés par un id stable :
 *    renommer ou reclasser ne casse jamais l'historique.
 *  - Une année ne contient que (a) sa STRUCTURE (liste des éléments présents) et
 *    (b) ses VALEURS (montants + pointage). Rien de calculé n'est stocké.
 *  - Les montants sont des entiers en centimes (aucune erreur d'arrondi flottant).
 */

export const SCHEMA_VERSION = 1;

export const FAMILY_IDS = ['revenus', 'depenses_fixes', 'depenses_ponctuelles', 'epargne'] as const;
export type FamilyId = (typeof FAMILY_IDS)[number];

/** `consumption` = dépenses de consommation ; l'épargne n'en fait jamais partie. */
export type FamilyKind = 'income' | 'consumption' | 'savings';

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type MonthIndex = (typeof MONTHS)[number];

/** Montant en centimes d'euro (entier, ≥ 0). */
export type Cents = number;

export interface Family {
  id: FamilyId;
  label: string;
  kind: FamilyKind;
  order: number;
}

/** Catégorie TRANSVERSALE : peut regrouper des éléments de plusieurs familles. */
export interface Category {
  id: string;
  label: string;
  order: number;
  archived: boolean;
}

export type ItemNature = 'ponctuelle' | 'recurrente_temporaire';

export interface BudgetItem {
  id: string;
  label: string;
  familyId: FamilyId;
  /** null = sans catégorie */
  categoryId: string | null;
  order: number;
  archived: boolean;
  /** Famille « dépenses ponctuelles » uniquement. */
  nature?: ItemNature;
  /** Taux de frais optionnel (ex. 0.01), utilisé uniquement dans les statistiques « net de frais ». */
  feeRate?: number;
  createdAt: string;
}

/**
 * Valeur d'un mois. La cellule n'existe QUE si un montant est renseigné :
 *  - cellule absente  → non renseigné (ignoré dans les calculs, non pointable) ;
 *  - amount = 0       → zéro saisi explicitement.
 * `checked` = pointage bancaire, propre à (élément, année, mois).
 */
export interface MonthCell {
  amount: Cents;
  checked?: boolean;
}

export type ItemEntries = Partial<Record<MonthIndex, MonthCell>>;

export interface BudgetYear {
  year: number;
  /** Structure de l'année : éléments présents (ids stables). */
  itemIds: string[];
  /** Valeurs, indexées par id d'élément. */
  entries: Record<string, ItemEntries>;
  createdAt: string;
  derivedFromYear?: number;
}

export interface BudgetSettings {
  lastOpenedYear: number | null;
  /** Date ISO du dernier export JSON (sauvegarde externe), null si jamais exporté. */
  lastExportAt: string | null;
}

export interface BudgetData {
  schemaVersion: number;
  /** Incrémenté à chaque écriture ; sert à détecter une modification concurrente (autre onglet). */
  revision: number;
  families: Record<FamilyId, Family>;
  categories: Record<string, Category>;
  items: Record<string, BudgetItem>;
  /** Clé = année civile en texte ("2026"). */
  years: Record<string, BudgetYear>;
  settings: BudgetSettings;
}
