import { useState } from 'react';
import type { FormEvent } from 'react';
import type { FamilyId } from '../domain/types';
import { useBudgetStore } from '../store/budgetStore';

interface Props {
  year: number;
  familyId: FamilyId;
  familyLabel: string;
  colSpan: number;
  categories: string[];
}

export function AddItemRow({ year, familyId, familyLabel, colSpan, categories }: Props) {
  const addItem = useBudgetStore((s) => s.addItem);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [nature, setNature] = useState<'ponctuelle' | 'recurrente_temporaire'>('ponctuelle');
  const listId = `cats-${familyId}`;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    addItem({ year, familyId, label, categoryLabel: category, nature });
    setLabel('');
    setCategory('');
    setOpen(false);
  }

  return (
    <tr className="add-row">
      <td colSpan={colSpan}>
        {open ? (
          <form className="add-form" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Libellé de la ligne"
              aria-label={`Libellé de la nouvelle ligne (${familyLabel})`}
              autoFocus
              required
            />
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Catégorie (facultatif)"
              aria-label="Catégorie (facultatif)"
              list={listId}
            />
            <datalist id={listId}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {familyId === 'depenses_ponctuelles' && (
              <select value={nature} onChange={(e) => setNature(e.target.value as typeof nature)} aria-label="Nature">
                <option value="ponctuelle">Ponctuelle</option>
                <option value="recurrente_temporaire">Récurrente temporaire</option>
              </select>
            )}
            <button type="submit" className="btn primary">
              Ajouter
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Annuler
            </button>
          </form>
        ) : (
          <button type="button" className="link-btn" onClick={() => setOpen(true)}>
            + Ajouter une ligne ({familyLabel.toLowerCase()})
          </button>
        )}
      </td>
    </tr>
  );
}
