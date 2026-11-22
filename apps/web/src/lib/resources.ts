import type { ListResourcesResponse, ResourceSummary } from '@tunion/shared';
import { api } from './api';

export async function fetchResources(query: string, signal: AbortSignal) {
  const params = new URLSearchParams(query);
  const result: ResourceSummary[] = [];
  const limit = 100;
  params.set('limit', String(limit));
  for (let offset = 0; ; offset += limit) {
    params.set('offset', String(offset));
    const { resources } = await api<ListResourcesResponse>('/resources?' + params, { signal });
    result.push(...resources);
    if (resources.length < limit) return result;
  }
}

export async function fetchAuthorResources(id: string, signal: AbortSignal) {
  return (await fetchResources('', signal)).filter((resource) => String(resource.authorId) === id);
}
