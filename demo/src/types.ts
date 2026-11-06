export type Theme = 'dark' | 'light';
export type Page = 'platform' | 'worlds' | 'personal' | 'admin' | 'integrations';
export type IntegrationStatus = 'LIVE' | 'SIMULATED' | 'DEGRADED' | 'DISABLED';

export interface Persona { id: string; name: string; email: string; role: string; initials: string }
export interface World { id: string; name: string; code: string; progress: number; state: string; agents: number; runs: number; cost: number; gate?: string; description: string; connectors: string[] }
export interface Integration { id: string; name: string; category: string; mode: string; status: IntegrationStatus; configured: boolean; requirements: string[]; capabilities: string[]; writesBlocked: boolean; latency: number | null; checkedAt: string | null; note: string }
export interface Session { id: string; user: string; world: string; title: string; status: string; messages: number; cost: number; updatedAt: string }
export interface ResultEvent { id: string; worldId: string; title: string; summary: string; type: string; sensitivity: string; createdAt: string; unread: boolean }
export interface AuditItem { id: number; actor: string; action: string; target: string; detail: string; createdAt: string }
export interface EngineStep { id:string; name:string; index:number; risk:'READ'|'WRITE'|'DEPLOY'; requiresApproval:boolean; checkpoint:boolean; status:string; payloadHash:string|null; output:Record<string,unknown>|null; cost:number }
export interface EngineRun { id:string; workflowId:string; workflowVersion:number; worldId:string; status:string; currentStep:number; budgetLimit:number; budgetUsed:number; input:Record<string,unknown>; checkpoint:{stepIndex:number;stepId:string;output:Record<string,unknown>;payloadHash:string;at:string}|null; createdAt:string; updatedAt:string; steps:EngineStep[] }
export interface EngineGate { id:string; runId:string; stepIndex:number; payloadHash:string; status:string; requestedBy:string; decidedBy:string|null; requestedAt:string; decidedAt:string|null }
export interface PlatformSnapshot { workflows:Array<{id:string;version:number;name:string;definitionHash:string;createdAt:string}>; runs:EngineRun[]; gates:EngineGate[]; events:Array<{id:number;runId:string;worldId:string;type:string;detail:Record<string,unknown>;createdAt:string}>; eventCursor:number }
export interface Bootstrap { personas: Persona[]; worlds: World[]; integrations: Integration[]; sessions: Session[]; events: ResultEvent[]; platform:PlatformSnapshot; audit: AuditItem[]; instances: Array<{userId:string;status:string;environment:string;quarantineUntil:string|null;generation:number;updatedAt:string}>; auth: {enabled:boolean;passwordEnabled:boolean;tenantConfigured:boolean;redirectConfigured:boolean;domains:string[]}; secretStats: {total:number;configured:number;exposed:number}; stats: { users: number; gateways: number; activeRuns: number; monthlyCost: number }; database: string }
