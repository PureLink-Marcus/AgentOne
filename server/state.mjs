import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { adapterCatalog } from './adapters.mjs';
import { createSessionCredential } from './session-api-keys.mjs';

const personas = [
  { id:'marcus', name:'Marcus Wartenberg', email:'marcus@purelink.de', role:'Platform Admin', initials:'MW' },
  { id:'lea', name:'Lea Hoffmann', email:'lea@purelink.com', role:'Content Lead', initials:'LH' },
  { id:'tom', name:'Tom Berger', email:'tom@purelink.de', role:'Operations', initials:'TB' },
];

const worlds = [
  { id:'product', name:'Produkttexte', code:'PRODUCT_COPY', progress:68, state:'ACTIVE', agents:4, runs:12, cost:8.42, description:'Recherche, Content, Audit und Freigabe für Shop-Inhalte.', connectors:['ERP GraphQL','Shopware Staging','OpenAI'] },
  { id:'images', name:'Bild-Audit', code:'IMAGE_AUDIT', progress:76, state:'ACTIVE', agents:3, runs:7, cost:4.18, description:'Visuelle Prüfung, Metadaten und Qualitätsklassifikation.', connectors:['TechHub','Shopware Test','Ollama'] },
  { id:'publish', name:'Publish', code:'PUBLISH', progress:52, state:'GATE', agents:3, runs:4, cost:2.74, gate:'Gate #084', description:'Merge, Snapshot, menschliche Freigabe und kontrollierter Push.', connectors:['Shopware Production','Coolify','Mail'] },
  { id:'sync', name:'Kategorie-Sync', code:'CATEGORY_SYNC', progress:22, state:'SCHEDULED', agents:2, runs:2, cost:1.06, description:'Geplanter Abgleich von ERP- und Shop-Kategorien.', connectors:['ERP PostgreSQL','Shopware Staging','Coolify MCP'] },
];

const sessions = [
  { id:'S-1842', user:'Marcus Wartenberg', world:'Produkttexte', title:'Herbstkollektion aktualisieren', status:'RUNNING', messages:24, cost:3.81, updatedAt:'vor 2 Min.' },
  { id:'S-1838', user:'Lea Hoffmann', world:'Bild-Audit', title:'Fehlende Freisteller prüfen', status:'WAITING', messages:17, cost:1.42, updatedAt:'vor 11 Min.' },
  { id:'S-1829', user:'Tom Berger', world:'Publish', title:'Staging Release 26.10', status:'GATE', messages:31, cost:4.18, updatedAt:'vor 26 Min.' },
];

const events = [
  { id:'EV-204', worldId:'product', title:'Quellenpaket bereit', summary:'Research hat 18 belastbare Quellen an Content übergeben.', type:'HANDOFF', sensitivity:'INTERNAL', createdAt:'10:31', unread:true },
  { id:'EV-203', worldId:'images', title:'Bild-Audit abgeschlossen', summary:'76 Bilder geprüft, 4 benötigen eine manuelle Entscheidung.', type:'REPORT', sensitivity:'INTERNAL', createdAt:'10:24', unread:true },
  { id:'EV-202', worldId:'publish', title:'Freigabe erforderlich', summary:'Snapshot ist konfliktfrei. Gate #084 wartet auf eine Entscheidung.', type:'APPROVAL', sensitivity:'CONFIDENTIAL', createdAt:'10:18', unread:false },
  { id:'EV-201', worldId:'sync', title:'Nächster Lauf geplant', summary:'Kategorie-Sync startet heute um 14:00 im Read-only-Modus.', type:'SCHEDULE', sensitivity:'INTERNAL', createdAt:'09:52', unread:false },
];

export function loadEnv(root) {
  const result = { ...process.env };
  for (const file of [path.join(root,'master','env','.env.master'), path.join(root,'.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || result[match[1]] !== undefined) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value=value.slice(1,-1);
      result[match[1]]=value;
    }
  }
  return result;
}

export function createState(root, env) {
  const output = env.AGENTONE_DATA_DIR ? path.resolve(env.AGENTONE_DATA_DIR) : path.join(root,'output','demo');
  fs.mkdirSync(output,{recursive:true});
  const databasePath = path.join(output,'agentone-demo.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS integration_state (id TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'auto', status TEXT NOT NULL DEFAULT 'SIMULATED', latency INTEGER, checked_at TEXT);
    CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS provisioning (persona_id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS session_api_keys (login_key TEXT PRIMARY KEY, session_id TEXT NOT NULL, label TEXT NOT NULL, api_key_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT);
    CREATE TABLE IF NOT EXISTS auth_pending (state TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS secret_vault (name TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, tag TEXT NOT NULL, algorithm TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS personal_instances (user_id TEXT PRIMARY KEY, status TEXT NOT NULL, environment TEXT NOT NULL, quarantine_until TEXT, generation INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS event_bus (event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, world_id TEXT NOT NULL, workflow_id TEXT NOT NULL, run_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, sensitivity TEXT NOT NULL, trace_id TEXT NOT NULL, created_at TEXT NOT NULL, processed_at TEXT);
  `);
  const now=new Date().toISOString();
  for(const persona of personas){
    db.prepare(`INSERT INTO personal_instances(user_id,status,environment,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO NOTHING`).run(persona.id,persona.id==='tom'?'DEGRADED':'ACTIVE','agentone-personal-dev',now);
  }
  for(const event of events){
    db.prepare(`INSERT INTO event_bus(event_id,user_id,world_id,workflow_id,run_id,type,title,summary,sensitivity,trace_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING`).run(event.id,'marcus',event.worldId,`WF-${event.worldId.toUpperCase()}`,`RUN-${event.id.slice(3)}`,event.type,event.title,event.summary,event.sensitivity,`TRACE-${event.id.slice(3)}`,now);
  }

  const persisted = new Map(db.prepare('SELECT id,mode,status,latency,checked_at FROM integration_state').all().map(row => [row.id,{...row,checkedAt:row.checked_at}]));
  const catalog = () => adapterCatalog(env, persisted);
  const audit = (actor,action,target,detail) => {
    const createdAt = new Date().toISOString();
    const result=db.prepare('INSERT INTO audit_log(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(actor,action,target,detail,createdAt);
    return { id:Number(result.lastInsertRowid), actor, action, target, detail, createdAt };
  };
  const listAudit = () => db.prepare('SELECT id,actor,action,target,detail,created_at as createdAt FROM audit_log ORDER BY id DESC LIMIT 40').all();
  const setIntegration = (id, patch) => {
    const previous=persisted.get(id)||{mode:'auto',status:'SIMULATED',latency:null,checkedAt:null};
    const next={...previous,...patch};
    persisted.set(id,next);
    db.prepare(`INSERT INTO integration_state(id,mode,status,latency,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET mode=excluded.mode,status=excluded.status,latency=excluded.latency,checked_at=excluded.checked_at`).run(id,next.mode,next.status,next.latency,next.checkedAt);
    return catalog().find(item=>item.id===id);
  };
  const listInstances=()=>db.prepare('SELECT user_id as userId,status,environment,quarantine_until as quarantineUntil,generation,updated_at as updatedAt FROM personal_instances ORDER BY user_id').all();
  const setInstance=(userId,status,{quarantineUntil=null,incrementGeneration=false}={})=>{
    const existing=db.prepare('SELECT generation FROM personal_instances WHERE user_id=?').get(userId);
    if(!existing)throw Object.assign(new Error('Instanz nicht gefunden'),{status:404});
    const generation=Number(existing.generation)+(incrementGeneration?1:0);
    db.prepare('UPDATE personal_instances SET status=?,quarantine_until=?,generation=?,updated_at=? WHERE user_id=?').run(status,quarantineUntil,generation,new Date().toISOString(),userId);
    return db.prepare('SELECT user_id as userId,status,environment,quarantine_until as quarantineUntil,generation,updated_at as updatedAt FROM personal_instances WHERE user_id=?').get(userId);
  };
  const listEvents=(userId='marcus')=>db.prepare('SELECT event_id as eventId,user_id as userId,world_id as worldId,workflow_id as workflowId,run_id as runId,type,title,summary,sensitivity,trace_id as traceId,created_at as createdAt,processed_at as processedAt FROM event_bus WHERE user_id=? ORDER BY created_at DESC').all(userId);
  const createSessionKey=(sessionId,label='API-Zugang')=>{const credential=createSessionCredential(),createdAt=new Date().toISOString();db.prepare('INSERT INTO session_api_keys(login_key,session_id,label,api_key_hash,salt,created_at) VALUES(?,?,?,?,?,?)').run(credential.loginKey,sessionId,String(label).slice(0,60),credential.apiKeyHash,credential.salt,createdAt);return {loginKey:credential.loginKey,apiKey:credential.apiKey,label:String(label).slice(0,60),createdAt,shownOnce:true};};
  const listSessionKeys=sessionId=>db.prepare('SELECT login_key as loginKey,label,created_at as createdAt,last_used_at as lastUsedAt,revoked_at as revokedAt FROM session_api_keys WHERE session_id=? ORDER BY created_at DESC').all(sessionId);
  const revokeSessionKey=(sessionId,loginKey)=>{const revokedAt=new Date().toISOString();const result=db.prepare('UPDATE session_api_keys SET revoked_at=? WHERE session_id=? AND login_key=? AND revoked_at IS NULL').run(revokedAt,sessionId,loginKey);return {revoked:Number(result.changes)>0,revokedAt};};
  return { db, databasePath, personas, worlds, sessions, events, catalog, audit, listAudit, setIntegration, listInstances, setInstance, listEvents, createSessionKey, listSessionKeys, revokeSessionKey };
}
