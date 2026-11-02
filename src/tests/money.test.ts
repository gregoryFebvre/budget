import { formatAmount, formatEuros, parseAmountInput } from '../domain/money';

const cents = (raw: string) => {
  const r = parseAmountInput(raw);
  if (!r.ok) throw new Error(r.error);
  return r.cents;
};

describe('parseAmountInput', () => {
  it.each([
    ['1 234,56', 123456],
    ['12.5', 1250],
    ['45 €', 4500],
    ['0', 0],
    ['=105+188', 29300],
    ['=(10+5)*2', 3000],
    ['10,999', 1100],
  ])('analyse « %s »', (raw, expected) => expect(cents(raw)).toBe(expected));

  it('une saisie vide efface la valeur (null) et se distingue de zéro', () => {
    expect(cents('  ')).toBeNull();
    expect(cents('0')).toBe(0);
  });

  it.each(['abc', '-5', '=10-20', '1/0', '(1+2', '1++', '1e5', '99999999999'])('refuse « %s »', (raw) => {
    expect(parseAmountInput(raw).ok).toBe(false);
  });
});

describe('formatage français', () => {
  it('formate sans erreur flottante', () => {
    expect(formatAmount(123456).replace(/[\u00a0\u202f]/g, ' ')).toBe('1 234,56');
    expect(formatEuros(5).replace(/[\u00a0\u202f]/g, ' ')).toBe('0,05 €');
  });
});
