import { config } from './config.js';

// backend 내부 API(/internal) 클라이언트
const request = async (method, path, body) => {
  const res = await fetch(`${config.backendInternalUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.internalApiSecret}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(`${method} ${path} 실패 (${res.status}): ${json?.error ?? res.statusText}`);
  }
  return json.data;
};

export const api = {
  syncMembers: (members) => request('PUT', '/members', { members }),
  upsertMember: (member) => request('PUT', `/members/${member.id}`, member),
  removeMember: (discordId) => request('DELETE', `/members/${discordId}`),
};
