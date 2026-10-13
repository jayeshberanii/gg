/**
 * The desktop's search syntax, clsCommon.SearchWithAndOr (CommonLibrary.dll), parsed once and
 * used two ways: evaluated in the browser to filter loaded rows (the desktop's DataView
 * RowFilter), and compiled to parameterised SQL on the server (its database searches).
 *
 * Text is split by SplitChar ('/') into segments; segment i applies to column i. Inside a
 * segment, AndChar ('+') joins terms with AND (every term after the first becomes "contains"),
 * or OrChar ('-') joins them with OR. For text columns, with the Like condition:
 *   abc   starts with abc        *abc  contains abc        abc*  ends with abc
 * With the Equal condition, a term must match exactly. Integer/decimal columns need a number.
 */
export type SearchSyntax = {
  andChar: string;
  orChar: string;
  splitChar: string;
  /** "Like" (default) or "Equal" (Utility › Set Search Condition). */
  condition: 'Like' | 'Equal';
};

export const DEFAULT_SEARCH_SYNTAX: SearchSyntax = {
  andChar: '+',
  orChar: '-',
  splitChar: '/',
  condition: 'Like',
};

export type SearchTarget = { column: string; dataType: string };

/** One comparison. `like` patterns carry wildcards only at the ends, as the desktop builds them. */
export type Term =
  | {
      kind: 'like';
      column: string;
      text: string;
      anyBefore: boolean;
      anyAfter: boolean;
      negate: boolean;
    }
  | { kind: 'equals'; column: string; text: string; negate: boolean }
  | { kind: 'number'; column: string; value: number; negate: boolean };

/** Terms inside a group are joined by `join`; groups are ANDed together. */
export type TermGroup = { join: 'and' | 'or'; terms: Term[] };
export type SearchFilter = TermGroup[];

export type ParseResult = { ok: true; filter: SearchFilter } | { ok: false; message: string };

const NUMERIC_TYPES = new Set(['integer', 'int', 'int32', 'decimal']);
export const NUMERIC_MESSAGE = 'Please Enter Numeric Value to Search';

/** VB IsNumeric: optional sign, digits with an optional decimal point, surrounding spaces. */
function isNumeric(s: string): boolean {
  return /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(s);
}

function makeTerm(
  part: string,
  target: SearchTarget,
  negate: boolean,
  syntax: SearchSyntax,
): Term | string {
  if (NUMERIC_TYPES.has(target.dataType.trim().toLowerCase())) {
    if (!isNumeric(part)) return NUMERIC_MESSAGE;
    return { kind: 'number', column: target.column, value: Number(part), negate };
  }
  if (syntax.condition.toUpperCase() === 'EQUAL') {
    return { kind: 'equals', column: target.column, text: part, negate };
  }
  const trimmed = part.trim();
  if (trimmed.endsWith('*')) {
    // "abc*" -> LIKE '%abc' (the desktop drops the last character of the untrimmed term)
    const text = part.slice(0, -1).replace(/^\*+/, '');
    return { kind: 'like', column: target.column, text, anyBefore: true, anyAfter: false, negate };
  }
  if (trimmed.startsWith('*')) {
    return {
      kind: 'like',
      column: target.column,
      text: part.slice(1),
      anyBefore: true,
      anyAfter: true,
      negate,
    };
  }
  return {
    kind: 'like',
    column: target.column,
    text: part,
    anyBefore: false,
    anyAfter: true,
    negate,
  };
}

/**
 * Parses what the user typed. `targets` are the columns in segment order; `searchIn` false is
 * the "Not In" search. An empty filter means "no condition".
 */
export function parseSearch(
  input: string,
  targets: SearchTarget[],
  searchIn = true,
  syntax: SearchSyntax = DEFAULT_SEARCH_SYNTAX,
): ParseResult {
  const filter: SearchFilter = [];
  const segments = input.split(syntax.splitChar);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const target = targets[i];
    if (segment.trim() === '' || !target) continue;
    const joinChar = segment.includes(syntax.andChar)
      ? syntax.andChar
      : segment.includes(syntax.orChar)
        ? syntax.orChar
        : '';
    const negate = !searchIn;
    if (joinChar === '') {
      const term = makeTerm(segment, target, negate, syntax);
      if (typeof term === 'string') return { ok: false, message: term };
      filter.push({ join: 'and', terms: [term] });
      continue;
    }
    const isAnd = joinChar === syntax.andChar;
    const terms: Term[] = [];
    const parts = segment.split(joinChar);
    for (let j = 0; j < parts.length; j++) {
      const raw = parts[j]!;
      if (raw === '') continue;
      const part = j > 0 && isAnd && !raw.includes('*') ? `*${raw}` : raw;
      const term = makeTerm(part, target, negate, syntax);
      if (typeof term === 'string') return { ok: false, message: term };
      terms.push(term);
    }
    if (terms.length > 0) filter.push({ join: isAnd ? 'and' : 'or', terms });
  }
  return { ok: true, filter };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

function matchTerm(row: Record<string, unknown>, term: Term): boolean {
  const cell = row[term.column];
  let hit: boolean;
  if (term.kind === 'number') {
    hit = cell !== null && cell !== undefined && cell !== '' && Number(cell) === term.value;
  } else {
    // DataView comparisons are case-insensitive; a NULL cell matches nothing.
    if (cell === null || cell === undefined) return false;
    const a = cellText(cell).toLowerCase();
    const b = term.text.toLowerCase();
    if (term.kind === 'equals') hit = a.trim() === b.trim();
    else if (term.anyBefore && term.anyAfter) hit = a.includes(b);
    else if (term.anyBefore) hit = a.endsWith(b);
    else hit = a.startsWith(b);
  }
  return term.negate ? !hit : hit;
}

/** The DataView RowFilter: does this row pass? */
export function matchesFilter(row: Record<string, unknown>, filter: SearchFilter): boolean {
  return filter.every((g) =>
    g.join === 'and'
      ? g.terms.every((t) => matchTerm(row, t))
      : g.terms.some((t) => matchTerm(row, t)),
  );
}

/** Escapes LIKE metacharacters so user text matches literally in SQL Server. */
export function escapeLike(text: string): string {
  return text.replace(/[[\]%_]/g, (c) => `[${c}]`);
}
