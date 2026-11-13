import { Fragment, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { MONTH_SHORT } from '../../domain/constants';
import {
  compare, compareCategories, compareItems, compareRates, cumulativeSavings, metricAnnual, metricMonthly, savingsRate, yearStats,
} from '../../domain/stats';
import type { Basis, Evolution, FamilyFilter, MetricId } from '../../domain/stats';
import { resolveSelectedYear } from '../../domain/structure';
import { FAMILY_IDS, MONTHS } from '../../domain/types';
import type { BudgetData, Cents } from '../../domain/types';
import { useBudgetStore } from '../../store/budgetStore';
import { BarsChart, LinesChart } from './charts';
import type { Row } from './charts';
import { FAMILY_COLORS, YEAR_COLORS, euros, evolutionText, percent, pointsText, toEuroUnits } from './format';

const TOP_N = 12;

const filterLabel = (data: BudgetData, f: FamilyFilter): string =>
  f === 'tout' ? 'Toutes les familles' : f === 'sorties' ? 'Dépenses et épargne' : f === 'depenses' ? 'Dépenses de consommation' : data.families[f].label;

const metricLabel = (data: BudgetData, id: MetricId): string =>
  id === 'consommation'
    ? 'Total dépenses de consommation'
    : id === 'soldeAvantEpargne'
      ? 'Solde avant épargne'
      : id === 'soldeApresEpargne'
        ? 'Solde après épargne'
        : data.families[id].label;

const INDICATORS: MetricId[] = ['revenus', 'depenses_fixes', 'depenses_ponctuelles', 'consommation', 'epargne', 'soldeAvantEpargne', 'soldeApresEpargne'];

function ChartCard({ title, hint, table, children }: { title: string; hint?: string; table: { head: string[]; rows: (string | number | null)[][] }; children: ReactNode }) {
  return (
    <section className="chart-card" aria-label={title}>
      <h3>{title}</h3>
      {hint && <p className="hint">{hint}</p>}
      {children}
      <details>
        <summary>Données du graphique</summary>
        <div className="table-scroll">
          <table className="mgmt-table">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function ValueCell({ value, evo, extra }: { value: Cents | null; evo?: Evolution; extra?: string }) {
  return (
    <td className="stat-cell">
      <div className="stat-value">{value === null ? 'absent' : euros(value)}</div>
      {extra && <div className="stat-sub">{extra}</div>}
      {evo && <div className="stat-sub">{evolutionText(evo)}</div>}
    </td>
  );
}

export default function Statistiques() {
  const data = useBudgetStore((s) => s.data);
  const allYears = useMemo(() => Object.values(data.years).map((y) => y.year).sort((a, b) => a - b), [data.years]);
  const current = resolveSelectedYear(data);

  const [basis, setBasis] = useState<Basis>('planned');
  const [ref, setRef] = useState<number | null>(current);
  const [picked, setPicked] = useState<number[]>(() => {
    const prev = current === null ? undefined : [...allYears].reverse().find((y) => y < current);
    return prev === undefined ? [] : [prev];
  });
  const [family, setFamily] = useState<FamilyFilter>('depenses');
  const [category, setCategory] = useState('all');
  const [metric, setMetric] = useState<MetricId>('consommation');
  const [itemId, setItemId] = useState('');

  const refYear = ref !== null && allYears.includes(ref) ? ref : (allYears[allYears.length - 1] ?? null);
  const years = useMemo(() => (refYear === null ? [] : [...new Set([refYear, ...picked.filter((y) => allYears.includes(y))])].sort((a, b) => a - b)), [refYear, picked, allYears]);

  const stats = useMemo(() => years.map((y) => yearStats(data, data.years[String(y)]!, basis)), [data, years, basis]);
  const items = useMemo(
    () => (refYear === null ? [] : compareItems(data, years, refYear, basis, { family, category })),
    [data, years, refYear, basis, family, category],
  );
  const categories = useMemo(() => (refYear === null ? [] : compareCategories(data, years, refYear, basis, family)), [data, years, refYear, basis, family]);

  if (allYears.length === 0 || refYear === null) {
    return (
      <section className="gestion">
        <h1>Statistiques</h1>
        <p>Aucune année enregistrée : créez une année pour afficher des statistiques.</p>
      </section>
    );
  }

  const colorOf = (y: number) => YEAR_COLORS[years.indexOf(y) % YEAR_COLORS.length]!;
  const evoFor = (get: (y: number) => Cents | null, y: number) => (y === refYear ? undefined : compare(get(refYear), get(y)));
  const refStats = stats[years.indexOf(refYear)]!;
  const catOptions = Object.values(data.categories).sort((a, b) => a.order - b.order);
  const selectedItem = items.find((r) => r.itemId === itemId) ?? items[0];
  const basisText = basis === 'planned' ? 'montants prévus' : 'montants pointés uniquement';

  const toggleYear = (y: number) => setPicked((p) => (p.includes(y) ? p.filter((v) => v !== y) : [...p, y]));

  // ---- Données des graphiques (en euros)
  const yearName = (y: number) => (y === refYear ? `${y} (réf.)` : String(y));
  const overview: Row[] = stats.map((s) => ({
    name: yearName(s.year),
    [data.families.revenus.label]: toEuroUnits(s.family.revenus),
    'Dépenses de consommation': toEuroUnits(metricAnnual(s, 'consommation')),
    [data.families.epargne.label]: toEuroUnits(s.family.epargne),
  }));
  const composition: Row[] = stats.map((s) => ({
    name: yearName(s.year),
    [data.families.depenses_fixes.label]: toEuroUnits(s.family.depenses_fixes),
    [data.families.depenses_ponctuelles.label]: toEuroUnits(s.family.depenses_ponctuelles),
    [data.families.epargne.label]: toEuroUnits(s.family.epargne),
  }));
  const monthlyRows: Row[] = MONTHS.map((m, i) => ({ name: MONTH_SHORT[m], ...Object.fromEntries(stats.map((s) => [String(s.year), toEuroUnits(metricMonthly(s, metric)[i] ?? 0)])) }));
  const savingsRows: Row[] = MONTHS.map((m, i) => ({ name: MONTH_SHORT[m], ...Object.fromEntries(stats.map((s) => [String(s.year), toEuroUnits(cumulativeSavings(s)[i] ?? 0)])) }));
  const yearSeries = years.map((y) => ({ key: String(y), color: colorOf(y) }));
  const categoryRows: Row[] = categories.slice(0, TOP_N).map((c) => ({ name: c.label, ...Object.fromEntries(years.map((y) => [String(y), c.totals[y] === null || c.totals[y] === undefined ? null : toEuroUnits(c.totals[y] as number)])) }));
  const itemRows: Row[] = items.slice(0, TOP_N).map((r) => ({ name: r.label, ...Object.fromEntries(years.map((y) => [String(y), r.totals[y] === null || r.totals[y] === undefined ? null : toEuroUnits(r.totals[y] as number)])) }));
  const itemMonthlyRows: Row[] = MONTHS.map((m, i) => ({ name: MONTH_SHORT[m], ...Object.fromEntries(years.map((y) => [String(y), selectedItem?.monthly[y] ? toEuroUnits(selectedItem.monthly[y]![i] ?? 0) : null])) }));

  const tbl = (rows: Row[], keys: string[]) => ({ head: ['', ...keys], rows: rows.map((r) => [String(r.name), ...keys.map((k) => (typeof r[k] === 'number' ? euros(Math.round((r[k] as number) * 100)) : null))]) });

  return (
    <section className="stats" aria-labelledby="stats-title">
      <h1 id="stats-title">Statistiques et comparaisons</h1>

      <div className="stats-controls" role="group" aria-label="Paramètres de comparaison">
        <label>
          Année de référence
          <select value={refYear} onChange={(e) => setRef(Number(e.target.value))}>
            {allYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Années à comparer</legend>
          {allYears.filter((y) => y !== refYear).map((y) => (
            <label key={y} className="inline">
              <input type="checkbox" checked={picked.includes(y)} onChange={() => toggleYear(y)} />
              {y}
            </label>
          ))}
          {allYears.length === 1 && <span className="hint">Créez une autre année pour comparer.</span>}
        </fieldset>
        <label>
          Base de calcul
          <select value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
            <option value="planned">Montants prévus (budget)</option>
            <option value="checked">Montants pointés (réalisé)</option>
          </select>
        </label>
        <label>
          Famille
          <select value={family} onChange={(e) => setFamily(e.target.value as FamilyFilter)}>
            {(['tout', 'sorties', 'depenses', ...FAMILY_IDS] as FamilyFilter[]).map((f) => (
              <option key={f} value={f}>
                {filterLabel(data, f)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Catégorie
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Toutes</option>
            <option value="none">Sans catégorie</option>
            {catOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        Calculs sur les {basisText}. L'année de référence ({refYear}) sert de base : écart = valeur − référence. Le pourcentage n'est pas affiché quand la base est nulle ou
        absente. Les filtres s'appliquent aux comparaisons par catégorie et par élément.
      </p>

      <h2>Indicateurs globaux</h2>
      <div className="table-scroll">
        <table className="mgmt-table stat-table">
          <caption className="sr-only">Indicateurs annuels par année, avec évolution par rapport à l'année de référence</caption>
          <thead>
            <tr>
              <th scope="col">Indicateur</th>
              {years.map((y) => (
                <th key={y} scope="col">
                  {y}
                  {y === refYear ? ' (référence)' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INDICATORS.map((id) => (
              <tr key={id}>
                <th scope="row">{metricLabel(data, id)}</th>
                {stats.map((s) => (
                  <ValueCell key={s.year} value={metricAnnual(s, id)} {...(evoFor((y) => metricAnnual(stats[years.indexOf(y)]!, id), s.year) ? { evo: evoFor((y) => metricAnnual(stats[years.indexOf(y)]!, id), s.year)! } : {})} />
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">Taux d'épargne (épargne / revenus)</th>
              {stats.map((s) => (
                <td key={s.year} className="stat-cell">
                  <div className="stat-value">{percent(savingsRate(s))}</div>
                  {s.year !== refYear && <div className="stat-sub">{pointsText(compareRates(savingsRate(refStats), savingsRate(s)))} vs référence</div>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Graphiques</h2>
      <div className="chart-grid">
        <ChartCard title="Revenus, dépenses et épargne par année" table={tbl(overview, Object.keys(overview[0] ?? {}).slice(1))}>
          <BarsChart data={overview} label="Barres comparant revenus, dépenses de consommation et épargne par année" series={[
            { key: data.families.revenus.label, color: FAMILY_COLORS.revenus },
            { key: 'Dépenses de consommation', color: '#b3261e' },
            { key: data.families.epargne.label, color: FAMILY_COLORS.epargne },
          ]} />
        </ChartCard>

        <ChartCard title="Composition des sorties par famille" hint="Dépenses fixes, ponctuelles et épargne empilées (les revenus ne sont pas inclus)." table={tbl(composition, Object.keys(composition[0] ?? {}).slice(1))}>
          <BarsChart data={composition} label="Barres empilées : composition des sorties par famille et par année" series={[
            { key: data.families.depenses_fixes.label, color: FAMILY_COLORS.depenses_fixes, stackId: 's' },
            { key: data.families.depenses_ponctuelles.label, color: FAMILY_COLORS.depenses_ponctuelles, stackId: 's' },
            { key: data.families.epargne.label, color: FAMILY_COLORS.epargne, stackId: 's' },
          ]} />
        </ChartCard>

        <ChartCard title={`Évolution mensuelle : ${metricLabel(data, metric)}`} table={tbl(monthlyRows, years.map(String))}>
          <label className="chart-select">
            Indicateur
            <select value={metric} onChange={(e) => setMetric(e.target.value as MetricId)}>
              {INDICATORS.map((id) => (
                <option key={id} value={id}>
                  {metricLabel(data, id)}
                </option>
              ))}
            </select>
          </label>
          <LinesChart data={monthlyRows} series={yearSeries} label={`Courbes mensuelles de ${metricLabel(data, metric)} par année`} />
        </ChartCard>

        <ChartCard title="Épargne cumulée au fil des mois" table={tbl(savingsRows, years.map(String))}>
          <LinesChart data={savingsRows} series={yearSeries} label="Courbes de l'épargne cumulée par année" />
        </ChartCard>

        <ChartCard title={`Comparatif par catégorie (${filterLabel(data, family)})`} hint={categories.length > TOP_N ? `Les ${TOP_N} plus importantes de ${refYear} sont affichées ; le détail complet est dans le tableau ci-dessous.` : undefined} table={tbl(categoryRows, years.map(String))}>
          {categoryRows.length ? <BarsChart data={categoryRows} rotate series={yearSeries} label="Barres comparant les totaux par catégorie et par année" /> : <p className="muted">Aucune donnée pour ce filtre.</p>}
        </ChartCard>

        <ChartCard title="Comparatif par élément" hint={items.length > TOP_N ? `Les ${TOP_N} éléments les plus importants de ${refYear} sont affichés ; tous figurent dans le tableau détaillé.` : undefined} table={tbl(itemRows, years.map(String))}>
          {itemRows.length ? <BarsChart data={itemRows} rotate series={yearSeries} label="Barres comparant les totaux par élément et par année" /> : <p className="muted">Aucune donnée pour ce filtre.</p>}
        </ChartCard>

        <ChartCard title={`Évolution mensuelle d'un élément${selectedItem ? ` : ${selectedItem.label}` : ''}`} table={tbl(itemMonthlyRows, years.map(String))}>
          <label className="chart-select">
            Élément
            <select value={selectedItem?.itemId ?? ''} onChange={(e) => setItemId(e.target.value)} disabled={items.length === 0}>
              {items.map((r) => (
                <option key={r.itemId} value={r.itemId}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {selectedItem ? <LinesChart data={itemMonthlyRows} series={yearSeries} label={`Courbes mensuelles de ${selectedItem.label} par année`} /> : <p className="muted">Aucun élément pour ce filtre.</p>}
        </ChartCard>
      </div>

      <h2>Comparaison par catégorie</h2>
      <div className="table-scroll">
        <table className="mgmt-table stat-table" aria-label="Comparaison par catégorie">
          <thead>
            <tr>
              <th scope="col">Catégorie</th>
              {years.map((y) => (
                <th key={y} scope="col">
                  {y}
                  {y === refYear ? ' (réf.)' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={years.length + 1}>Aucune donnée pour ce filtre.</td>
              </tr>
            )}
            {categories.map((c) => (
              <tr key={c.categoryId ?? 'none'}>
                <th scope="row">{c.label}</th>
                {years.map((y) => (
                  <ValueCell key={y} value={c.totals[y] ?? null} {...(c.evolutions[y] ? { evo: c.evolutions[y]! } : {})} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Comparaison détaillée des éléments</h2>
      <p className="hint">La « part des revenus » est le total annuel de l'élément divisé par le total des revenus de la même année (sur la base choisie : prévu ou pointé). Elle n'est pas calculable si les revenus de l'année sont nuls ; son évolution est donnée en points de pourcentage par rapport à la référence.</p>
      <div className="table-scroll">
        <table className="mgmt-table stat-table" aria-label="Comparaison détaillée des éléments">
          <thead>
            <tr>
              <th scope="col">Élément</th>
              {years.map((y) => (
                <th key={y} scope="col">
                  {y}
                  {y === refYear ? ' (réf.)' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={years.length + 1}>Aucun élément pour ce filtre.</td>
              </tr>
            )}
            {items.map((r) => (
              <Fragment key={r.itemId}>
                <tr>
                  <th scope="row">
                    {r.label}
                    <span className="tag">{data.families[r.familyId].label}</span>
                    {r.archived && <span className="tag">archivé</span>}
                  </th>
                  {years.map((y) => {
                    const share = r.shares[y];
                    return <ValueCell key={y} value={r.totals[y] ?? null} extra={share === null || share === undefined ? undefined : `part des revenus : ${percent(share)}${y === refYear ? '' : ` (${pointsText(compareRates(r.shares[refYear] ?? null, share))} vs réf.)`}`} {...(r.evolutions[y] ? { evo: r.evolutions[y]! } : {})} />;
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
