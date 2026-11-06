import type { Bootstrap } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),
  login: (input: {personaId?:string;username?:string;password?:string}) => request<{ ok: boolean; user: string; persona:Bootstrap['personas'][number];steps: string[] }>('/api/login', { method: 'POST', body: JSON.stringify(input) }),
  integrationMode: (id: string, mode: string) => request<{ integration: Bootstrap['integrations'][number] }>(`/api/integrations/${id}/mode`, { method: 'POST', body: JSON.stringify({ mode }) }),
  integrationHealth: (id: string) => request<{ integration: Bootstrap['integrations'][number]; sample: Record<string, unknown> }>(`/api/integrations/${id}/health`, { method: 'POST', body: '{}' }),
  adminAction: (instanceId: string, action: string) => request<{ ok: boolean; status: string; audit: Bootstrap['audit'][number] }>('/api/admin/action', { method: 'POST', body: JSON.stringify({ instanceId, action }) }),
  auditSession: (sessionId: string) => request<{ audit: Bootstrap['audit'][number] }>('/api/admin/session-access', { method: 'POST', body: JSON.stringify({ sessionId }) }),
  secrets: () => request<{ secrets:Array<{name:string;group:string;configured:boolean;classification:string;source:string;valueVisible:boolean;rotation:string}>;policy:{valuesExposed:boolean;browserAccess:boolean;productionWrites:boolean} }>('/api/admin/secrets'),
  personalChat: (prompt:string) => request<{text:string;model:string;mode:'LIVE'|'SIMULATED'}>('/api/personal/chat',{method:'POST',body:JSON.stringify({prompt})}),
  platformSnapshot: () => request<Bootstrap['platform']>('/api/platform/snapshot'),
  runAction: (runId:string,action:'start'|'pause'|'advance',input:Record<string,unknown>={}) => request<{run:Bootstrap['platform']['runs'][number]}>(`/api/platform/runs/${runId}/${action}`,{method:'POST',body:JSON.stringify(input)}),
  gateDecision: (gateId:string,decision:'APPROVED'|'REJECTED') => request<{gate:Bootstrap['platform']['gates'][number];run:Bootstrap['platform']['runs'][number]}>(`/api/platform/gates/${gateId}/decision`,{method:'POST',body:JSON.stringify({decision})}),
};
