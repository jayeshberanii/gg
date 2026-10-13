import { describe, expect, it } from 'vitest';
import { sampradaySummary } from './transSummary';

describe('sampradaySummary (frmAuthorMaster Txt_KeyDown, SampradayTran)', () => {
  it('puts the Remark in brackets after the name (desktop v3.4.3.1)', () => {
    expect(
      sampradaySummary([
        { SampradayName: ' Tapagachchha ', Remark: ' main ' },
        { SampradayName: 'Kharatar', Remark: '' },
        { SampradayName: 'Anchal', Remark: null },
      ]),
    ).toBe('Tapagachchha(main),Kharatar,Anchal');
    expect(sampradaySummary([])).toBe('');
  });
});
