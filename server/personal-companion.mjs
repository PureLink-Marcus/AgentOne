import crypto from 'node:crypto';

const allowedScopes=['calendar.read','reminders.read','health.summary','location.temporary','shortcuts.invoke'];
const defaultScopes=['calendar.read','reminders.read','shortcuts.invoke'];
const pairingTtlMs=10*60_000;

function hash(value,pepper){return crypto.createHmac('sha256',pepper).update(String(value)).digest('hex');}
function clamp(value,min,max){const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(min,number)):0;}
function companionError(code,message,status=400){return Object.assign(new Error(message),{code,status});}
function validDate(value){const date=value instanceof Date?new Date(value):new Date(value||Date.now());if(!Number.isFinite(date.getTime()))throw companionError('COMPANION_TIME_INVALID','Zeitpunkt ist ungültig.');return date;}

export function initCompanionStore(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_companion_pairings(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,code_hash TEXT NOT NULL,device_token_hash TEXT,
      device_name TEXT,scopes TEXT NOT NULL,status TEXT NOT NULL,expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,paired_at TEXT,last_seen_at TEXT
    );
    CREATE TABLE IF NOT EXISTS personal_companion_events(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,device_id TEXT NOT NULL,kind TEXT NOT NULL,
      payload TEXT NOT NULL,expires_at TEXT,created_at TEXT NOT NULL
    );
  `);
}

export function createCompanionPairing(db,{userId,pepper,scopes=defaultScopes,now=new Date()}){
  const owner=String(userId||'').trim().slice(0,80);if(!owner)throw companionError('COMPANION_USER_REQUIRED','Benutzer fehlt.');
  const created=validDate(now),code=String(crypto.randomInt(100000,1000000)),id=crypto.randomUUID(),expires=new Date(created.getTime()+pairingTtlMs),safeScopes=[...new Set(Array.isArray(scopes)?scopes:[])].filter(scope=>allowedScopes.includes(scope));if(!safeScopes.length)throw companionError('COMPANION_SCOPE_REQUIRED','Mindestens eine Companion-Freigabe ist erforderlich.');
  db.prepare("UPDATE personal_companion_pairings SET status='SUPERSEDED' WHERE user_id=? AND status='PENDING'").run(owner);
  db.prepare('INSERT INTO personal_companion_pairings(id,user_id,code_hash,scopes,status,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,owner,hash(code,pepper),JSON.stringify(safeScopes),'PENDING',expires.toISOString(),created.toISOString());
  return {id,code,expiresAt:expires.toISOString(),scopes:safeScopes,shownOnce:true};
}

export function redeemCompanionPairing(db,{userId,code,deviceName,pepper,now=new Date()}){
  const owner=String(userId||'').trim().slice(0,80),normalizedCode=String(code??'').trim();if(!/^\d{6}$/.test(normalizedCode))throw companionError('PAIRING_CODE_FORMAT_INVALID','Der Pairing-Code muss genau sechs Ziffern enthalten.',400);
  const redeemed=validDate(now),row=db.prepare("SELECT * FROM personal_companion_pairings WHERE user_id=? AND code_hash=? AND status='PENDING'").get(owner,hash(normalizedCode,pepper));
  if(!row||Date.parse(row.expires_at)<=redeemed.getTime()){if(row)db.prepare("UPDATE personal_companion_pairings SET status='EXPIRED' WHERE id=? AND status='PENDING'").run(row.id);throw companionError('PAIRING_CODE_INVALID_OR_EXPIRED','Pairing-Code ist ungültig oder abgelaufen.',401);}
  const token=`a1d_${crypto.randomBytes(32).toString('base64url')}`,timestamp=redeemed.toISOString(),result=db.prepare("UPDATE personal_companion_pairings SET device_token_hash=?,device_name=?,status='PAIRED',paired_at=?,last_seen_at=? WHERE id=? AND status='PENDING' AND expires_at>?").run(hash(token,pepper),String(deviceName||'iPhone').trim().slice(0,80)||'iPhone',timestamp,timestamp,row.id,timestamp);
  if(result.changes!==1)throw companionError('PAIRING_CODE_ALREADY_USED','Pairing-Code wurde bereits verwendet.',409);
  return {deviceId:row.id,deviceToken:token,scopes:JSON.parse(row.scopes),shownOnce:true};
}

export function authorizeCompanion(db,{userId,deviceToken,pepper}){const token=String(deviceToken||'').trim();if(!/^a1d_[A-Za-z0-9_-]{40,100}$/.test(token))throw companionError('DEVICE_NOT_AUTHORIZED','Gerät ist nicht autorisiert.',401);const row=db.prepare("SELECT * FROM personal_companion_pairings WHERE user_id=? AND device_token_hash=? AND status='PAIRED'").get(String(userId||'').trim().slice(0,80),hash(token,pepper));if(!row)throw companionError('DEVICE_NOT_AUTHORIZED','Gerät ist nicht autorisiert.',401);return {...row,scopes:JSON.parse(row.scopes)};}

export function sanitizeCompanionEvent(kind,input={}){
  if(kind==='health')return {date:String(input.date||new Date().toISOString().slice(0,10)),steps:Math.round(clamp(input.steps,0,200000)),sleepMinutes:Math.round(clamp(input.sleepMinutes,0,1440)),activeEnergyKcal:Math.round(clamp(input.activeEnergyKcal,0,20000)),workouts:Math.round(clamp(input.workouts,0,50))};
  if(kind==='location'){const ttlMinutes=Math.round(clamp(input.ttlMinutes||15,1,60));return {label:String(input.label||'Temporärer Standort').slice(0,80),latitude:Number(clamp(input.latitude,-90,90).toFixed(5)),longitude:Number(clamp(input.longitude,-180,180).toFixed(5)),accuracyMeters:Math.round(clamp(input.accuracyMeters,0,10000)),ttlMinutes};}
  if(kind==='calendar'||kind==='reminders')return {count:Math.round(clamp(input.count,0,500)),nextTitle:String(input.nextTitle||'').slice(0,120),nextAt:input.nextAt?new Date(input.nextAt).toISOString():null};
  throw Object.assign(new Error('Nicht unterstützter Companion-Datentyp'),{status:400});
}

export function storeCompanionEvent(db,{userId,deviceId,kind,input}){const payload=sanitizeCompanionEvent(kind,input),now=new Date(),expiresAt=kind==='location'?new Date(now.getTime()+payload.ttlMinutes*60_000).toISOString():null,id=crypto.randomUUID();db.prepare('INSERT INTO personal_companion_events(id,user_id,device_id,kind,payload,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,userId,deviceId,kind,JSON.stringify(payload),expiresAt,now.toISOString());db.prepare('UPDATE personal_companion_pairings SET last_seen_at=? WHERE id=?').run(now.toISOString(),deviceId);return {id,kind,payload,expiresAt,createdAt:now.toISOString()};}

export function companionStatus(db,userId){const now=new Date().toISOString();db.prepare("DELETE FROM personal_companion_events WHERE expires_at IS NOT NULL AND expires_at<=?").run(now);db.prepare("UPDATE personal_companion_pairings SET status='EXPIRED' WHERE user_id=? AND status='PENDING' AND expires_at<=?").run(userId,now);const devices=db.prepare("SELECT id,device_name AS deviceName,scopes,status,paired_at AS pairedAt,last_seen_at AS lastSeenAt FROM personal_companion_pairings WHERE user_id=? AND status='PAIRED' ORDER BY paired_at DESC").all(userId).map(row=>({...row,scopes:JSON.parse(row.scopes)})),pending=db.prepare("SELECT scopes,expires_at AS expiresAt,created_at AS createdAt FROM personal_companion_pairings WHERE user_id=? AND status='PENDING' AND expires_at>? ORDER BY created_at DESC LIMIT 1").get(userId,now),events=db.prepare('SELECT kind,payload,expires_at AS expiresAt,created_at AS createdAt FROM personal_companion_events WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(userId).map(row=>({...row,payload:JSON.parse(row.payload)}));return {schema:'agentone.companion.status/v1',status:devices.length?'CONNECTED':pending?'PAIRING':'NOT_CONNECTED',pending:pending?{expiresAt:pending.expiresAt,createdAt:pending.createdAt,scopes:JSON.parse(pending.scopes)}:null,devices,events,privacy:{rawHealthStored:false,locationTtlMaxMinutes:60,backgroundTracking:false},secretsExposed:false};}

export function companionDeviceStatus(db,{userId,deviceToken,pepper}){const row=authorizeCompanion(db,{userId,deviceToken,pepper}),scopeKinds={'health.summary':'health','location.temporary':'location','calendar.read':'calendar','reminders.read':'reminders'},ingest=row.scopes.map(scope=>scopeKinds[scope]).filter(Boolean);return {schema:'agentone.companion.device-status/v1',status:'CONNECTED',device:{id:row.id,name:row.device_name,scopes:row.scopes,pairedAt:row.paired_at,lastSeenAt:row.last_seen_at},capabilities:{ingest},privacy:{rawHealthStored:false,locationTtlMaxMinutes:60,backgroundTracking:false},secretsExposed:false};}

export function revokeCompanion(db,{userId,deviceId}){db.exec('BEGIN IMMEDIATE');try{const result=db.prepare("UPDATE personal_companion_pairings SET status='REVOKED',device_token_hash=NULL WHERE id=? AND user_id=?").run(deviceId,userId),events=result.changes===1?db.prepare('DELETE FROM personal_companion_events WHERE device_id=? AND user_id=?').run(deviceId,userId):{changes:0},response={revoked:result.changes===1,deviceId,eventsDeleted:events.changes};db.exec('COMMIT');return response;}catch(error){db.exec('ROLLBACK');throw error;}}

