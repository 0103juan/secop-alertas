const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const copCompact = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const day = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });

/** "$ 154.036.141", or "$ 154 M" when compact. Unknown values say so instead of showing $ 0. */
export function formatCop(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return 'Sin valor';
  return (compact ? copCompact : cop).format(value);
}

export function formatDay(value: string | null | undefined): string {
  return value ? day.format(new Date(value)) : 'Sin fecha';
}

/** Whole days between two ISO dates, for "en 12 días". */
export function daysBetween(first: string, last: string): number {
  return Math.round((new Date(last).getTime() - new Date(first).getTime()) / 86_400_000);
}
