import { Fragment, memo, useMemo } from 'react';
import { MONTH_NAMES, MONTH_SHORT } from '../domain/constants';
import { aggregateItems, entriesAnnualTotal, pointageProgress, summarizeYear } from '../domain/calculations';
import type { MonthSummary } from '../domain/calculations';
import { formatAmount } from '../domain/money';
import { groupFamilyItems } from '../domain/structure';
import { FAMILY_IDS, MONTHS } from '../domain/types';
import type { BudgetItem, BudgetYear, FamilyId, ItemEntries } from '../domain/types';
import { useBudgetStore } from '../store/budgetStore';
import { AddItemRow } from './AddItemRow';
import { AmountCell } from './AmountCell';

const COLS = 14; // libellé + 12 mois + annuel

const FAMILY_CLASS: Record<FamilyId, string> = {
  revenus: 'fam-revenus',
  depenses_fixes: 'fam-fixes',
  depenses_ponctuelles: 'fam-ponct',
  epargne: 'fam-epargne',
};

type Pick = (s: MonthSummary) => number;

function SummaryRow(props: {
  id: string;
  label: string;
  pick: Pick;
  summaries: ReturnType<typeof summarizeYear>;
  tone?: 'total' | 'solde' | 'reste' | 'sub';
}) {
  const { id, label, pick, summaries, tone = 'total' } = props;
  const cell = (v: number, key: string, testId: string) => (
    <td key={key} className={`num calc${v < 0 ? ' neg' : ''}`} data-testid={testId}>
      {formatAmount(v)}
    </td>
  );
  return (
    <tr className={`summary ${tone}`}>
      <th scope="row">{label}</th>
      {MONTHS.map((m) => cell(pick(summaries.months[m]), String(m), `${id}-${m}`))}
      {cell(pick(summaries.annual), 'annual', `${id}-annual`)}
    </tr>
  );
}

interface ItemRowProps {
  year: number;
  item: BudgetItem;
  entries: ItemEntries | undefined;
  row: number;
  tag: string | null;
  indent: boolean;
}

const ItemRow = memo(function ItemRow({ year, item, entries, row, tag, indent }: ItemRowProps) {
  const annual = useMemo(() => entriesAnnualTotal(entries), [entries]);
  return (
    <tr className="item">
      <th scope="row" className={indent ? 'indent' : ''}>
        {item.label}
        {tag && <span className="tag">{tag}</span>}
        {item.nature === 'recurrente_temporaire' && <span className="tag">temporaire</span>}
        {item.archived && <span className="tag">archivé</span>}
      </th>
      {MONTHS.map((m) => (
        <td key={m} className={`cell-td${entries?.[m]?.checked ? ' checked' : ''}`}>
          <AmountCell year={year} itemId={item.id} itemLabel={item.label} month={m} cell={entries?.[m]} row={row} />
        </td>
      ))}
      <td className="num calc">{formatAmount(annual)}</td>
    </tr>
  );
});

export function YearTable({ year }: { year: BudgetYear }) {
  const data = useBudgetStore((s) => s.data);
  const summaries = useMemo(() => summarizeYear(data, year), [data, year]);
  const now = new Date();
  const currentMonth = now.getFullYear() === year.year ? now.getMonth() + 1 : null;
  const categoryNames = useMemo(
    () => Object.values(data.categories).filter((c) => !c.archived).sort((a, b) => a.order - b.order).map((c) => c.label),
    [data.categories],
  );

  let row = 0;
  const catSubtotal = (items: BudgetItem[]) => {
    const ids = items.map((i) => i.id);
    return MONTHS.map((m) => aggregateItems(year, ids, m).planned);
  };

  const blocks: Record<FamilyId, { totalLabel: string; soldeLabel?: string; solde?: Pick; total: Pick }> = {
    revenus: { totalLabel: 'Total revenus', total: (s) => s.planned.revenus },
    depenses_fixes: {
      totalLabel: 'Total dépenses fixes',
      total: (s) => s.planned.depenses_fixes,
      soldeLabel: 'Solde après dépenses fixes',
      solde: (s) => s.soldeApresFixes,
    },
    depenses_ponctuelles: {
      totalLabel: 'Total dépenses ponctuelles',
      total: (s) => s.planned.depenses_ponctuelles,
      soldeLabel: 'Solde après dépenses ponctuelles',
      solde: (s) => s.soldeApresPonctuelles,
    },
    epargne: {
      totalLabel: 'Total épargne',
      total: (s) => s.planned.epargne,
      soldeLabel: 'Solde après épargne',
      solde: (s) => s.soldeApresEpargne,
    },
  };

  return (
    <div className="table-wrap" tabIndex={-1}>
      <table className="budget" aria-label={`Budget ${year.year}`}>
        <caption className="sr-only">
          Budget annuel {year.year}. Montants en euros. Chaque montant mensuel peut être modifié et pointé (pris en compte par la
          banque).
        </caption>
        <thead>
          <tr>
            <th scope="col" className="corner">
              {year.year} · montants en €
            </th>
            {MONTHS.map((m) => (
              <th key={m} scope="col" className={currentMonth === m ? 'current' : ''} abbr={MONTH_NAMES[m]}>
                {MONTH_SHORT[m]}
              </th>
            ))}
            <th scope="col">Annuel</th>
          </tr>
        </thead>
        <tbody>
          {FAMILY_IDS.map((fid) => {
            const family = data.families[fid];
            const groups = groupFamilyItems(data, year, fid);
            const block = blocks[fid];
            return (
              <Fragment key={fid}>
                <tr className={`family ${FAMILY_CLASS[fid]}`}>
                  <th scope="colgroup" colSpan={COLS}>
                    {family.label}
                  </th>
                </tr>
                {groups.length === 0 && (
                  <tr className="none-row">
                    <td colSpan={COLS}>Aucune ligne dans cette famille pour {year.year}.</td>
                  </tr>
                )}
                {groups.map((g) => {
                  const multi = g.category !== null && g.items.length > 1;
                  const subtotals = g.category && multi ? catSubtotal(g.items) : null;
                  return (
                    <Fragment key={g.category?.id ?? 'none'}>
                      {g.category && subtotals && (
                        <tr className="category">
                          <th scope="row">{g.category.label}</th>
                          {subtotals.map((v, i) => (
                            <td key={i} className="num calc">
                              {formatAmount(v)}
                            </td>
                          ))}
                          <td className="num calc">{formatAmount(subtotals.reduce((a, b) => a + b, 0))}</td>
                        </tr>
                      )}
                      {g.items.map((item) => (
                        <ItemRow
                          key={item.id}
                          year={year.year}
                          item={item}
                          entries={year.entries[item.id]}
                          row={row++}
                          tag={g.category && !multi ? g.category.label : null}
                          indent={multi}
                        />
                      ))}
                    </Fragment>
                  );
                })}
                <AddItemRow year={year.year} familyId={fid} familyLabel={family.label} colSpan={COLS} categories={categoryNames} />
                <SummaryRow id={`total-${fid}`} label={block.totalLabel} pick={block.total} summaries={summaries} tone="total" />
                {block.solde && block.soldeLabel && (
                  <SummaryRow id={`solde-${fid}`} label={block.soldeLabel} pick={block.solde} summaries={summaries} tone="solde" />
                )}
              </Fragment>
            );
          })}

          <tr className="family fam-suivi">
            <th scope="colgroup" colSpan={COLS}>
              Suivi du pointage bancaire
            </th>
          </tr>
          <SummaryRow id="reste" label="Reste à provisionner" pick={(s) => s.resteAProvisionner} summaries={summaries} tone="reste" />
          <SummaryRow id="reste-fixes" label="dont dépenses fixes" pick={(s) => s.remaining.depenses_fixes} summaries={summaries} tone="sub" />
          <SummaryRow id="reste-ponct" label="dont dépenses ponctuelles" pick={(s) => s.remaining.depenses_ponctuelles} summaries={summaries} tone="sub" />
          <SummaryRow id="reste-epargne" label="dont épargne" pick={(s) => s.remaining.epargne} summaries={summaries} tone="sub" />
          <SummaryRow id="revenus-restants" label="Revenus restant à percevoir" pick={(s) => s.revenusRestants} summaries={summaries} tone="total" />
          <SummaryRow id="solde-prev" label="Solde prévisionnel (revenus restants − reste à provisionner)" pick={(s) => s.soldePrevisionnel} summaries={summaries} tone="solde" />
          <tr className="summary sub">
            <th scope="row">Éléments pointés</th>
            {MONTHS.map((m) => {
              const p = pointageProgress(summaries.months[m]);
              return (
                <td key={m} className="num calc" data-testid={`progress-${m}`}>
                  {p.total === 0 ? '–' : `${p.checked} / ${p.total}`}
                </td>
              );
            })}
            <td className="num calc" data-testid="progress-annual">
              {(() => {
                const p = pointageProgress(summaries.annual);
                return p.total === 0 ? '–' : `${p.checked} / ${p.total}`;
              })()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
