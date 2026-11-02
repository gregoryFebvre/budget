import { memo, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MONTH_NAMES } from '../domain/constants';
import { formatAmount, parseAmountInput, toEditableString } from '../domain/money';
import type { MonthCell, MonthIndex } from '../domain/types';
import { useBudgetStore } from '../store/budgetStore';

export function focusCell(row: number, col: number): boolean {
  const el = document.querySelector<HTMLElement>(`[data-grid="${row}-${col}"]`);
  el?.focus();
  return el !== null;
}

interface Props {
  year: number;
  itemId: string;
  itemLabel: string;
  month: MonthIndex;
  cell: MonthCell | undefined;
  row: number;
}

/**
 * Cellule mensuelle : montant éditable + case de pointage bancaire.
 * Navigation : flèches = déplacement sans modification ; clic / Entrée / F2 = édition ;
 * Entrée = valider (et descendre) ; Échap = annuler ; perte de focus = valider.
 */
function AmountCellImpl({ year, itemId, itemLabel, month, cell, row }: Props) {
  const setAmount = useBudgetStore((s) => s.setAmount);
  const toggleChecked = useBudgetStore((s) => s.toggleChecked);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(true);
  const after = useRef<'self' | 'down' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const monthName = MONTH_NAMES[month];
  const col = month - 1;

  useEffect(() => {
    if (editing) inputRef.current?.select();
    else if (after.current) {
      const target = after.current;
      after.current = null;
      if (target === 'down' && focusCell(row + 1, col)) return;
      buttonRef.current?.focus();
    }
  }, [editing, row, col]);

  function start() {
    finished.current = false;
    setDraft(cell ? toEditableString(cell.amount) : '');
    setError(null);
    setEditing(true);
  }

  function commit(): boolean {
    const parsed = parseAmountInput(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }
    finished.current = true;
    if (parsed.cents !== (cell?.amount ?? null)) setAmount(year, itemId, month, parsed.cents);
    setError(null);
    setEditing(false);
    return true;
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (commit()) after.current = 'down';
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finished.current = true;
      after.current = 'self';
      setError(null);
      setEditing(false);
    }
  }

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[e.key];
    if (move) {
      if (focusCell(row + move[0], col + move[1])) e.preventDefault();
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      start();
    }
  }

  const label = cell
    ? `${itemLabel}, ${monthName} : ${formatAmount(cell.amount)} euros`
    : `${itemLabel}, ${monthName} : non renseigné`;

  return (
    <div className={`cell${cell?.checked ? ' is-checked' : ''}`}>
      {editing ? (
        <span className="edit-wrap">
          <input
            ref={inputRef}
            className={`amount-input${error ? ' invalid' : ''}`}
            value={draft}
            inputMode="decimal"
            aria-label={`Montant ${itemLabel}, ${monthName}`}
            aria-invalid={error !== null}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={onInputKey}
            onBlur={() => {
              if (!finished.current) commit();
            }}
          />
          {error && (
            <span role="alert" className="cell-error">
              {error}
            </span>
          )}
        </span>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className="amount"
          data-grid={`${row}-${col}`}
          aria-label={label}
          onClick={start}
          onKeyDown={onButtonKey}
        >
          {cell ? formatAmount(cell.amount) : <span className="none">·</span>}
        </button>
      )}
      <input
        type="checkbox"
        className="tick"
        checked={Boolean(cell?.checked)}
        disabled={!cell}
        onChange={() => toggleChecked(year, itemId, month)}
        aria-label={`Pointer ${itemLabel}, ${monthName}`}
        title={cell ? (cell.checked ? 'Pointé par la banque : cliquer pour dépointer' : 'Cliquer pour pointer (pris en compte par la banque)') : 'Saisissez d\'abord un montant'}
      />
    </div>
  );
}

export const AmountCell = memo(AmountCellImpl);
