import { describe, expect, it } from 'vitest';
import { richTextRuns } from './report.js';

describe('richTextRuns (the report views’ Html.Raw columns)', () => {
  it('keeps line breaks and bold / italic / underline', () => {
    expect(richTextRuns('a<br/>b <b>c</b> <i>d</i><u>e</u>')).toEqual([
      { text: 'a' },
      { br: true },
      { text: 'b ' },
      { text: 'c', bold: true },
      { text: ' ' },
      { text: 'd', italic: true },
      { text: 'e', underline: true },
    ]);
  });

  it('drops every other tag and its attributes, keeping the text', () => {
    expect(
      richTextRuns('<script>alert(1)</script><span onclick="x()">t</span><img src=x onerror=y>'),
    ).toEqual([{ text: 'alert(1)' }, { text: 't' }]);
  });

  it('decodes entities and leaves a bare < alone', () => {
    expect(richTextRuns('1 &lt; 2 &amp; 3 &#2325; a < b')).toEqual([{ text: '1 < 2 & 3 क a < b' }]);
  });

  it('survives unbalanced closing tags', () => {
    expect(richTextRuns('</b>x<b>y')).toEqual([{ text: 'x' }, { text: 'y', bold: true }]);
  });
});
