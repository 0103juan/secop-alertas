// The values the filters offer. Modalities are SECOP's own labels; the API compares them without case or accents.
export const MODALITIES = [
  'Contratación directa',
  'Contratación régimen especial',
  'Mínima cuantía',
  'Selección abreviada de menor cuantía',
  'Licitación pública',
  'Concurso de méritos abierto',
];

export const MIN_VALUES = [
  { label: 'Cualquier valor', value: '' },
  { label: 'Desde $ 10 millones', value: '10000000' },
  { label: 'Desde $ 100 millones', value: '100000000' },
  { label: 'Desde $ 1.000 millones', value: '1000000000' },
];
