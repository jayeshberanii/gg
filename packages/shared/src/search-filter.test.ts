import { describe, expect, it } from 'vitest';
import { escapeLike, matchesFilter, NUMERIC_MESSAGE, parseSearch } from './search-filter.js';

const name = { column: 'bhashaname', dataType: 'nvarchar' };
const attr = { column: 'bhasa_attr', dataType: 'nvarchar' };
const id = { column: 'bhashacokm', dataType: 'decimal' };

const rows = [
  { bhashacokm: 1, bhashaname: 'Gujarati', bhasa_attr: 'G' },
  { bhashacokm: 2, bhashaname: 'Hindi', bhasa_attr: 'H' },
  { bhashacokm: 3, bhashaname: 'Prakrit Gujarati', bhasa_attr: null },
  { bhashacokm: 4, bhashaname: 'ગુજરાતી', bhasa_attr: 'G' },
];

function filterRows(text: string, targets = [name, attr], searchIn = true) {
  const r = parseSearch(text, targets, searchIn);
  if (!r.ok) throw new Error(r.message);
  return rows.filter((row) => matchesFilter(row, r.filter)).map((row) => row.bhashacokm);
}

describe('search syntax (clsCommon.SearchWithAndOr)', () => {
  it('matches the start of the text by default, ignoring case', () => {
    expect(filterRows('guj')).toEqual([1]);
  });

  it('"*x" means contains and "x*" means ends with', () => {
    expect(filterRows('*guj')).toEqual([1, 3]);
    expect(filterRows('rati*')).toEqual([1, 3]);
  });

  it('"/" moves to the next column', () => {
    expect(filterRows('/g')).toEqual([1, 4]);
    expect(filterRows('p/g')).toEqual([]);
  });

  it('"+" requires all terms, later terms as contains; "-" accepts any', () => {
    expect(filterRows('prak+guj')).toEqual([3]);
    expect(filterRows('hin-guj')).toEqual([1, 2]);
  });

  it('works on Gujarati text', () => {
    expect(filterRows('ગુજ')).toEqual([4]);
  });

  it('"Not In" negates each term', () => {
    expect(filterRows('guj', [name], false)).toEqual([2, 3, 4]);
  });

  it('needs a number for integer/decimal columns', () => {
    expect(filterRows('3', [id])).toEqual([3]);
    const r = parseSearch('abc', [id]);
    expect(r).toEqual({ ok: false, message: NUMERIC_MESSAGE });
  });

  it('matches exactly under the Equal condition', () => {
    const r = parseSearch('hindi', [name], true, {
      andChar: '+',
      orChar: '-',
      splitChar: '/',
      condition: 'Equal',
    });
    expect(
      r.ok && rows.filter((row) => matchesFilter(row, r.filter)).map((x) => x.bhashacokm),
    ).toEqual([2]);
  });

  it('returns no condition for empty input', () => {
    expect(parseSearch('  /  ', [name, attr])).toEqual({ ok: true, filter: [] });
  });

  it('escapes LIKE metacharacters for SQL', () => {
    expect(escapeLike('50%_[x]')).toBe('50[%][_][[]x[]]');
  });
});
