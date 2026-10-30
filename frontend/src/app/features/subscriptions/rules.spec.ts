import { describe as group, expect, it } from 'vitest';

import { blankRule, describe, fromApi, pesos, problem, RuleDraft, toApi } from './rules';

group('rules', () => {
  it('maps every type to the JSON the API validates', () => {
    expect(toApi({ ...blankRule('keyword'), text: 'vías, puente ,, ' })).toEqual({
      type: 'keyword',
      params: { words: ['vías', 'puente'] },
    });
    expect(toApi({ ...blankRule('entity'), text: '891.580.016' })).toEqual({ type: 'entity', params: { nits: [891580016] } });
    expect(toApi({ ...blankRule('amount'), min: '$ 500.000.000', max: '' })).toEqual({
      type: 'amount',
      params: { min_cop: 500000000 },
    });
  });

  it('round-trips through the API shape', () => {
    const drafts: RuleDraft[] = [
      { ...blankRule('department'), text: 'Cauca, Huila' },
      { ...blankRule('modality'), text: 'Mínima cuantía' },
      { ...blankRule('amount'), min: '10', max: '20' },
    ];
    for (const draft of drafts) expect(fromApi(toApi(draft))).toEqual(draft);
  });

  it('reads unknown or malformed JSON as an empty rule instead of throwing', () => {
    expect(fromApi(null)).toEqual(blankRule());
    expect(fromApi({ type: 'keyword', params: { words: 'not a list' } })).toEqual(blankRule('keyword'));
  });

  it('says what is wrong in the words the server would use', () => {
    expect(problem({ ...blankRule('keyword'), text: 'ab' })).toContain('al menos 3');
    expect(problem({ ...blankRule('amount'), min: '20', max: '10' })).toContain('mayor');
    expect(problem({ ...blankRule('amount') })).toContain('mínimo');
    expect(problem({ ...blankRule('entity'), text: 'abc' })).toContain('números');
    expect(problem({ ...blankRule('keyword'), text: 'vías' })).toBeNull();
  });

  it('describes a rule for lists', () => {
    expect(describe({ type: 'amount', params: { min_cop: 1000 } })).toBe('Valor: desde $ 1.000');
    expect(describe({ type: 'keyword', params: { words: ['vías'] } })).toBe('Palabras en el objeto: vías');
  });

  it('reads pesos with any separators', () => {
    expect(pesos('$ 1.234.567')).toBe(1234567);
    expect(pesos('')).toBeNull();
  });
});
