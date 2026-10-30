/**
 * Alert rules in the browser: the draft a form edits, and the JSON the API stores.
 *
 * The API validates every rule with the same factory the matcher uses (alerts/rules.py), so it has the last word.
 * `problem()` repeats its checks here only to answer while the user types; a rule that passes here and fails there
 * still shows the server's message under the rules.
 */

export type RuleType = 'keyword' | 'department' | 'modality' | 'amount' | 'entity';

export interface ApiRule {
  type: RuleType;
  params: Record<string, unknown>;
}

/** Flat on purpose: one shape for every type keeps the form simple; `type` decides which fields matter. */
export interface RuleDraft {
  type: RuleType;
  text: string; // words, departments, modalities or NITs, separated by commas
  min: string;
  max: string;
}

export const MIN_WORD = 3; // alerts/rules.py MIN_WORD: shorter words have no trigram to search with
export const MAX_RULES = 10; // alerts/rules.py MAX_RULES

export const RULE_TYPES: { value: RuleType; label: string; hint: string }[] = [
  { value: 'keyword', label: 'Palabras en el objeto', hint: 'Cualquiera de estas palabras, sin importar tildes: vías, puente' },
  { value: 'department', label: 'Departamento', hint: 'Uno o varios, separados por comas: Cauca, Huila' },
  { value: 'modality', label: 'Modalidad', hint: 'Por ejemplo: Contratación directa, Mínima cuantía' },
  { value: 'amount', label: 'Valor', hint: 'Mínimo, máximo o ambos, en pesos' },
  { value: 'entity', label: 'Entidad (NIT)', hint: 'NIT sin dígito de verificación: 891580016' },
];

export function blankRule(type: RuleType = 'keyword'): RuleDraft {
  return { type, text: '', min: '', max: '' };
}

function items(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** "$ 500.000.000" and "500000000" are the same amount; empty means "no limit". */
export function pesos(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

export function toApi(draft: RuleDraft): ApiRule {
  switch (draft.type) {
    case 'keyword':
      return { type: 'keyword', params: { words: items(draft.text) } };
    case 'department':
      return { type: 'department', params: { departments: items(draft.text) } };
    case 'modality':
      return { type: 'modality', params: { modalities: items(draft.text) } };
    case 'entity':
      return { type: 'entity', params: { nits: items(draft.text).map((nit) => Number(nit.replace(/[^\d]/g, ''))) } };
    case 'amount': {
      const params: Record<string, number> = {};
      const min = pesos(draft.min);
      const max = pesos(draft.max);
      if (min !== null) params['min_cop'] = min;
      if (max !== null) params['max_cop'] = max;
      return { type: 'amount', params };
    }
  }
}

/** The inverse of toApi, defensive: rules come from the server as untyped JSON. */
export function fromApi(rule: unknown): RuleDraft {
  const { type, params = {} } = (rule ?? {}) as { type?: RuleType; params?: Record<string, unknown> };
  const join = (key: string) => (Array.isArray(params[key]) ? (params[key] as unknown[]).join(', ') : '');
  switch (type) {
    case 'keyword':
      return { ...blankRule('keyword'), text: join('words') };
    case 'department':
      return { ...blankRule('department'), text: join('departments') };
    case 'modality':
      return { ...blankRule('modality'), text: join('modalities') };
    case 'entity':
      return { ...blankRule('entity'), text: join('nits') };
    case 'amount':
      return {
        ...blankRule('amount'),
        min: params['min_cop'] === undefined ? '' : String(params['min_cop']),
        max: params['max_cop'] === undefined ? '' : String(params['max_cop']),
      };
    default:
      return blankRule();
  }
}

/** What is wrong with a draft, in the user's words, or null. */
export function problem(draft: RuleDraft): string | null {
  if (draft.type === 'amount') {
    const min = pesos(draft.min);
    const max = pesos(draft.max);
    if (min === null && max === null) return 'Escribe un valor mínimo, un máximo o ambos.';
    if (min !== null && max !== null && min > max) return 'El mínimo es mayor que el máximo.';
    return null;
  }
  const values = items(draft.text);
  if (values.length === 0) return 'Escribe al menos un valor.';
  if (draft.type === 'keyword' && values.some((word) => word.length < MIN_WORD)) {
    return `Cada palabra necesita al menos ${MIN_WORD} letras.`;
  }
  if (draft.type === 'entity' && values.some((nit) => !/^\d[\d.\s]*$/.test(nit))) {
    return 'Un NIT solo lleva números.';
  }
  return null;
}

/** "Palabras en el objeto: vías, puente" — for lists, where the rules are shown and not edited. */
export function describe(rule: unknown): string {
  const draft = fromApi(rule);
  const label = RULE_TYPES.find((t) => t.value === draft.type)?.label ?? draft.type;
  if (draft.type !== 'amount') return `${label}: ${draft.text}`;
  const min = pesos(draft.min);
  const max = pesos(draft.max);
  const cop = (n: number) => `$ ${n.toLocaleString('es-CO')}`;
  if (min !== null && max !== null) return `${label}: entre ${cop(min)} y ${cop(max)}`;
  return min !== null ? `${label}: desde ${cop(min)}` : `${label}: hasta ${cop(max!)}`;
}
