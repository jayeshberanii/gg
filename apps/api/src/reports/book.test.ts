import { describe, expect, it } from 'vitest';
import { parishishtDetail } from './book.js';

describe('parishishtDetail (the older Parishisht report’s PrintDetail)', () => {
  it('takes the appendix label off and trims', () => {
    expect(parishishtDetail('परिशिष्ट 1 - गाथा अनुक्रम')).toBe('गाथा अनुक्रम');
    expect(parishishtDetail('परिशिष्ट 2(क-ख-ग) -  सूची ')).toBe('सूची');
    expect(parishishtDetail('परिशिष्ट 10 - शब्दकोश')).toBe('शब्दकोश');
  });

  it('turns quotes into backticks and leaves other text alone', () => {
    expect(parishishtDetail("'introduction'")).toBe('`introduction`');
    expect(parishishtDetail('प्रस्तावना')).toBe('प्रस्तावना');
  });
});
