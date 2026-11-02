import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { itemYearTotals } from '../domain/calculations';
import { formatAmount } from '../domain/money';
import * as m from '../domain/mutations';
import { resolveSelectedYear } from '../domain/structure';
import { FAMILY_IDS } from '../domain/types';
import type { BudgetData, BudgetItem, FamilyId } from '../domain/types';
import { useBudgetStore } from '../store/budgetStore';

type Run = (mutator: (d: BudgetData) => BudgetData) => boolean;
type Tab = 'elements' | 'categories' | 'familles';

const KIND_LABEL = { income: 'Entrées d\'argent', consumption: 'Dépenses de consommation', savings: 'Épargne (hors consommation)' } as const;

/** Champ texte validé à Entrée / perte de focus, annulé par Échap. */
function EditableText({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const escaped = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="inline-edit"
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (escaped.current) {
          escaped.current = false;
          setDraft(value);
        } else if (draft.trim() !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          escaped.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function Gestion() {
  const data = useBudgetStore((s) => s.data);
  const apply = useBudgetStore((s) => s.apply);
  const [tab, setTab] = useState<Tab>('elements');
  const [notice, setNotice] = useState<string | null>(null);

  const run: Run = (mutator) => {
    const err = apply(mutator);
    setNotice(err);
    return err === null;
  };

  return (
    <section className="gestion" aria-labelledby="gestion-title">
      <h1 id="gestion-title">Gestion de la structure budgétaire</h1>
      <div role="tablist" aria-label="Sections de gestion" className="tabs">
        {(
          [
            ['elements', 'Éléments'],
            ['categories', 'Catégories'],
            ['familles', 'Familles'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p role="alert" className="notice">
          {notice}
        </p>
      )}
      {tab === 'elements' && <ItemsTab data={data} run={run} />}
      {tab === 'categories' && <CategoriesTab data={data} run={run} />}
      {tab === 'familles' && <FamiliesTab data={data} run={run} />}
    </section>
  );
}

// ---------------------------------------------------------------- Éléments

function ItemsTab({ data, run }: { data: BudgetData; run: Run }) {
  const years = Object.values(data.years).map((y) => y.year).sort((a, b) => b - a);
  const selected = resolveSelectedYear(data);
  const [label, setLabel] = useState('');
  const [family, setFamily] = useState<FamilyId>('depenses_fixes');
  const [category, setCategory] = useState('');
  const [year, setYear] = useState<number | null>(selected);
  const [showArchived, setShowArchived] = useState(true);
  const activeCats = Object.values(data.categories).filter((c) => !c.archived).sort((a, b) => a.order - b.order);

  if (years.length === 0) return <p>Créez d'abord une année pour pouvoir ajouter des éléments.</p>;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (run((d) => m.addItem(d, { label, familyId: family, categoryLabel: category, year: year ?? years[0]! }))) {
      setLabel('');
      setCategory('');
    }
  }

  return (
    <>
      <form className="mgmt-form" onSubmit={submit} aria-label="Nouvel élément">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé du nouvel élément" aria-label="Libellé du nouvel élément" required />
        <select value={family} onChange={(e) => setFamily(e.target.value as FamilyId)} aria-label="Famille du nouvel élément">
          {FAMILY_IDS.map((f) => (
            <option key={f} value={f}>
              {data.families[f].label}
            </option>
          ))}
        </select>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Catégorie (facultatif)" aria-label="Catégorie du nouvel élément" list="mgmt-cats" />
        <datalist id="mgmt-cats">
          {activeCats.map((c) => (
            <option key={c.id} value={c.label} />
          ))}
        </datalist>
        <select value={year ?? ''} onChange={(e) => setYear(Number(e.target.value))} aria-label="Année d'ajout">
          {years.map((y) => (
            <option key={y} value={y}>
              Ajouter en {y}
            </option>
          ))}
        </select>
        <button type="submit" className="btn primary">
          Créer l'élément
        </button>
      </form>

      <label className="inline-check">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Afficher les éléments archivés
      </label>

      {FAMILY_IDS.map((fid) => {
        const items = Object.values(data.items)
          .filter((i) => i.familyId === fid && (showArchived || !i.archived))
          .sort((a, b) => a.order - b.order);
        return (
          <div key={fid} className="mgmt-block">
            <h2>{data.families[fid].label}</h2>
            {items.length === 0 ? (
              <p className="muted">Aucun élément.</p>
            ) : (
              <table className="mgmt-table">
                <thead>
                  <tr>
                    <th scope="col">Ordre</th>
                    <th scope="col">Libellé</th>
                    <th scope="col">Famille</th>
                    <th scope="col">Catégorie</th>
                    <th scope="col">Historique</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <ItemRow key={item.id} data={data} item={item} run={run} first={idx === 0} last={idx === items.length - 1} years={years} defaultYear={selected} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </>
  );
}

function ItemRow(props: {
  data: BudgetData;
  item: BudgetItem;
  run: Run;
  first: boolean;
  last: boolean;
  years: number[];
  defaultYear: number | null;
}) {
  const { data, item, run, first, last, years, defaultYear } = props;
  const [dup, setDup] = useState(false);
  const [dupLabel, setDupLabel] = useState(`${item.label} (copie)`);
  const [dupYear, setDupYear] = useState(defaultYear ?? years[0]!);
  const [dupAmounts, setDupAmounts] = useState(false);
  const history = itemYearTotals(data, item.id);
  const cats = Object.values(data.categories)
    .filter((c) => !c.archived || c.id === item.categoryId)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <tr className={item.archived ? 'archived' : ''}>
        <td className="order">
          <button type="button" className="icon-btn" disabled={first} aria-label={`Monter ${item.label}`} onClick={() => run((d) => m.moveItem(d, item.id, -1))}>
            ↑
          </button>
          <button type="button" className="icon-btn" disabled={last} aria-label={`Descendre ${item.label}`} onClick={() => run((d) => m.moveItem(d, item.id, 1))}>
            ↓
          </button>
        </td>
        <td>
          <EditableText value={item.label} label={`Libellé de ${item.label}`} onCommit={(v) => run((d) => m.updateItem(d, item.id, { label: v }))} />
          {item.archived && <span className="tag">archivé</span>}
          {item.nature === 'recurrente_temporaire' && <span className="tag">temporaire</span>}
        </td>
        <td>
          <select
            value={item.familyId}
            aria-label={`Famille de ${item.label}`}
            onChange={(e) => {
              const target = e.target.value as FamilyId;
              if (window.confirm(`Reclasser « ${item.label} » en « ${data.families[target].label} » ?\nL'historique de toutes les années sera reclassé aussi.`)) {
                run((d) => m.updateItem(d, item.id, { familyId: target }));
              }
            }}
          >
            {FAMILY_IDS.map((f) => (
              <option key={f} value={f}>
                {data.families[f].label}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select value={item.categoryId ?? ''} aria-label={`Catégorie de ${item.label}`} onChange={(e) => run((d) => m.updateItem(d, item.id, { categoryId: e.target.value || null }))}>
            <option value="">Sans catégorie</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.archived ? ' (archivée)' : ''}
              </option>
            ))}
          </select>
        </td>
        <td>
          <details>
            <summary>{history.filter((h) => h.present).length} année(s)</summary>
            <ul className="history">
              {history.map((h) => (
                <li key={h.year}>
                  <strong>{h.year}</strong> :{' '}
                  {h.present ? (h.filled ? `${formatAmount(h.total)} € (${h.filled} mois)` : 'présent, sans montant') : 'absent'}{' '}
                  {h.present ? (
                    <button type="button" className="link-btn" aria-label={`Retirer ${item.label} de ${h.year}`} onClick={() => run((d) => m.removeItemFromYear(d, h.year, item.id))}>
                      retirer
                    </button>
                  ) : (
                    <button type="button" className="link-btn" aria-label={`Ajouter ${item.label} à ${h.year}`} onClick={() => run((d) => m.addExistingItemToYear(d, h.year, item.id))}>
                      ajouter
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </td>
        <td className="actions">
          <button type="button" className="btn" onClick={() => run((d) => m.updateItem(d, item.id, { archived: !item.archived }))}>
            {item.archived ? 'Désarchiver' : 'Archiver'}
          </button>
          <button type="button" className="btn" aria-expanded={dup} onClick={() => setDup((v) => !v)}>
            Dupliquer
          </button>
          <button
            type="button"
            className="btn danger-outline"
            aria-label={`Supprimer ${item.label}`}
            onClick={() => {
              if (window.confirm(`Supprimer définitivement « ${item.label} » ?`)) run((d) => m.deleteItem(d, item.id));
            }}
          >
            Supprimer
          </button>
        </td>
      </tr>
      {dup && (
        <tr className="dup-row">
          <td colSpan={6}>
            <form
              className="mgmt-form"
              aria-label={`Dupliquer ${item.label}`}
              onSubmit={(e) => {
                e.preventDefault();
                if (run((d) => m.duplicateItem(d, item.id, { year: dupYear, label: dupLabel, copyAmounts: dupAmounts }))) setDup(false);
              }}
            >
              <input value={dupLabel} onChange={(e) => setDupLabel(e.target.value)} aria-label="Libellé de la copie" required />
              <select value={dupYear} onChange={(e) => setDupYear(Number(e.target.value))} aria-label="Année de la copie">
                {years.map((y) => (
                  <option key={y} value={y}>
                    Ajouter en {y}
                  </option>
                ))}
              </select>
              <label className="inline-check">
                <input type="checkbox" checked={dupAmounts} onChange={(e) => setDupAmounts(e.target.checked)} /> Copier les montants de cette année
              </label>
              <button type="submit" className="btn primary">
                Créer la copie
              </button>
              <span className="hint">La copie est un nouvel élément : son historique est indépendant (le pointage n'est pas copié).</span>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Catégories

function CategoriesTab({ data, run }: { data: BudgetData; run: Run }) {
  const [label, setLabel] = useState('');
  const cats = Object.values(data.categories).sort((a, b) => a.order - b.order);

  return (
    <>
      <p className="muted">Les catégories sont transversales : elles regroupent des éléments de plusieurs familles.</p>
      <form
        className="mgmt-form"
        aria-label="Nouvelle catégorie"
        onSubmit={(e) => {
          e.preventDefault();
          if (run((d) => m.addCategory(d, label))) setLabel('');
        }}
      >
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nouvelle catégorie" aria-label="Libellé de la nouvelle catégorie" required />
        <button type="submit" className="btn primary">
          Ajouter la catégorie
        </button>
      </form>
      {cats.length === 0 ? (
        <p className="muted">Aucune catégorie.</p>
      ) : (
        <table className="mgmt-table">
          <thead>
            <tr>
              <th scope="col">Ordre</th>
              <th scope="col">Libellé</th>
              <th scope="col">Éléments</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c, idx) => {
              const n = m.countItemsInCategory(data, c.id);
              return (
                <tr key={c.id} className={c.archived ? 'archived' : ''}>
                  <td className="order">
                    <button type="button" className="icon-btn" disabled={idx === 0} aria-label={`Monter la catégorie ${c.label}`} onClick={() => run((d) => m.moveCategory(d, c.id, -1))}>
                      ↑
                    </button>
                    <button type="button" className="icon-btn" disabled={idx === cats.length - 1} aria-label={`Descendre la catégorie ${c.label}`} onClick={() => run((d) => m.moveCategory(d, c.id, 1))}>
                      ↓
                    </button>
                  </td>
                  <td>
                    <EditableText value={c.label} label={`Libellé de la catégorie ${c.label}`} onCommit={(v) => run((d) => m.renameCategory(d, c.id, v))} />
                    {c.archived && <span className="tag">archivée</span>}
                  </td>
                  <td>{n}</td>
                  <td className="actions">
                    <button type="button" className="btn" onClick={() => run((d) => m.setCategoryArchived(d, c.id, !c.archived))}>
                      {c.archived ? 'Désarchiver' : 'Archiver'}
                    </button>
                    {n > 0 && <Reassign data={data} fromId={c.id} run={run} />}
                    <button
                      type="button"
                      className="btn danger-outline"
                      aria-label={`Supprimer la catégorie ${c.label}`}
                      onClick={() => {
                        if (window.confirm(`Supprimer la catégorie « ${c.label} » ?`)) run((d) => m.deleteCategory(d, c.id));
                      }}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function Reassign({ data, fromId, run }: { data: BudgetData; fromId: string; run: Run }) {
  const [to, setTo] = useState('');
  const others = Object.values(data.categories).filter((c) => c.id !== fromId && !c.archived);
  const name = data.categories[fromId]!.label;
  return (
    <span className="reassign">
      <select value={to} onChange={(e) => setTo(e.target.value)} aria-label={`Destination des éléments de ${name}`}>
        <option value="">Sans catégorie</option>
        {others.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <button type="button" className="btn" aria-label={`Réaffecter les éléments de ${name}`} onClick={() => run((d) => m.reassignCategory(d, fromId, to || null))}>
        Réaffecter
      </button>
    </span>
  );
}

// ---------------------------------------------------------------- Familles

function FamiliesTab({ data, run }: { data: BudgetData; run: Run }) {
  return (
    <>
      <p className="muted">
        Les quatre familles sont fixes : seul leur libellé est modifiable. Leur rôle dans les calculs ne change pas (l'épargne n'est jamais
        comptée comme dépense de consommation).
      </p>
      <table className="mgmt-table">
        <thead>
          <tr>
            <th scope="col">Libellé</th>
            <th scope="col">Rôle dans les calculs</th>
          </tr>
        </thead>
        <tbody>
          {FAMILY_IDS.map((f) => (
            <tr key={f}>
              <td>
                <EditableText value={data.families[f].label} label={`Libellé de la famille ${data.families[f].label}`} onCommit={(v) => run((d) => m.setFamilyLabel(d, f, v))} />
              </td>
              <td>{KIND_LABEL[data.families[f].kind]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
