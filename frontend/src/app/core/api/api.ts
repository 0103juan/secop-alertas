// Types come from the OpenAPI document Django generates (npm run api:types), so a field renamed in a serializer
// breaks the build here instead of breaking a page at runtime.
import type { components } from './schema';

type Schemas = components['schemas'];

export type Contract = Schemas['Contract'];
export type ContractPage = Schemas['PaginatedContractList'];
export type Subscription = Schemas['Subscription'];
export type SubscriptionPage = Schemas['PaginatedSubscriptionList'];
export type SubscriptionSecret = Schemas['SubscriptionSecret'];
export type Alert = Schemas['Alert'];
export type AlertPage = Schemas['PaginatedAlertList'];
export type SplittingResponse = Schemas['SplittingResponse'];
export type Cluster = Schemas['Cluster'];
export type OutliersResponse = Schemas['OutliersResponse'];
export type Outlier = Schemas['Outlier'];
export type Me = Schemas['Me'];
export type Access = Schemas['Access'];
export type Channel = Schemas['ChannelEnum'];

export const API = '/api/v1';

/** Builds `/api/v1/<path>?<params>`, leaving out empty values so the URL (and the cache key) stays canonical. */
export function apiUrl(path: string, params: Record<string, string | number | null | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  const search = query.toString();
  return `${API}/${path}${search ? `?${search}` : ''}`;
}

/** DRF answers 400 with `{field: [messages]}` or `{detail: message}`; this flattens either into one sentence. */
export function errorMessage(error: unknown): string {
  const body = (error as { error?: unknown })?.error;
  if (body && typeof body === 'object') {
    const messages = Object.values(body as Record<string, unknown>).flat().filter((m) => typeof m === 'string');
    if (messages.length) return messages.join(' ');
  }
  const status = (error as { status?: number })?.status;
  if (status === 0) return 'No hay conexión con el servidor.';
  if (status === 429) return 'Demasiadas solicitudes; espera un momento.';
  return 'Algo salió mal. Intenta de nuevo.';
}
