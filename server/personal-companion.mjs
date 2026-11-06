import crypto from 'node:crypto';

const allowedScopes=['calendar.read','reminders.read','health.summary','location.temporary','shortcuts.invoke'];

function hash(value,pepper){return crypto.createHmac('sha256',pepper).update(String(value)).digest('hex');}
function clamp(value,min,max){const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(min,number)):0;}

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

export function createCompanionPairing(db,{userId,pepper,scopes=allowedScopes}){
  const code=String(crypto.randomInt(100000,1000000)),id=crypto.randomUUID(),now=new Date(),expires=new Date(now.getTime()+10*60_000),safeScopes=[...new Set(scopes)].filter(scope=>allowedScopes.includes(scope));
  db.prepare('INSERT INTO personal_companion_pairings(id,user_id,code_hash,scopes,status,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,userId,hash(code,pepper),JSON.stringify(safeScopes),'PENDING',expires.toISOString(),now.toISOString());
  return {id,code,expiresAt:expires.toISOString(),scopes:safeScopes,shownOnce:true};
}

export function redeemCompanionPairing(db,{userId,code,deviceName,pepper}){
  const row=db.prepare("SELECT * FROM personal_companion_pairings WHERE user_id=? AND code_hash=? AND status='PENDING'").get(userId,hash(code,pepper));
  if(!row||Date.parse(row.expires_at)<=Date.now())throw Object.assign(new Error('Pairing-Code ungültig oder abgelaufen'),{status:401});
  const token=`a1d_${crypto.randomBytes(32).toString('base64url')}`,now=new Date().toISOString();
  db.prepare("UPDATE personal_companion_pairings SET device_token_hash=?,device_name=?,status='PAIRED',paired_at=?,last_seen_at=? WHERE id=?").run(hash(token,pepper),String(deviceName||'iPhone').slice(0,80),now,now,row.id);
  return {deviceId:row.id,deviceToken:token,scopes:JSON.parse(row.scopes),shownOnce:true};
}

export function authorizeCompanion(db,{userId,deviceToken,pepper}){const row=db.prepare("SELECT * FROM personal_companion_pairings WHERE user_id=? AND device_token_hash=? AND status='PAIRED'").get(userId,hash(deviceToken,pepper));if(!row)throw Object.assign(new Error('Gerät nicht autorisiert'),{status:401});return {...row,scopes:JSON.parse(row.scopes)};}

export function sanitizeCompanionEvent(kind,input={}){
  if(kind==='health')return {date:String(input.date||new Date().toISOString().slice(0,10)),steps:Math.round(clamp(input.steps,0,200000)),sleepMinutes:Math.round(clamp(input.sleepMinutes,0,1440)),activeEnergyKcal:Math.round(clamp(input.activeEnergyKcal,0,20000)),workouts:Math.round(clamp(input.workouts,0,50))};
  if(kind==='location'){const ttlMinutes=Math.round(clamp(input.ttlMinutes||15,1,60));return {label:String(input.label||'Temporärer Standort').slice(0,80),latitude:Number(clamp(input.latitude,-90,90).toFixed(5)),longitude:Number(clamp(input.longitude,-180,180).toFixed(5)),accuracyMeters:Math.round(clamp(input.accuracyMeters,0,10000)),ttlMinutes};}
  if(kind==='calendar'||kind==='reminders')return {count:Math.round(clamp(input.count,0,500)),nextTitle:String(input.nextTitle||'').slice(0,120),nextAt:input.nextAt?new Date(input.nextAt).toISOString():null};
  throw Object.assign(new Error('Nicht unterstützter Companion-Datentyp'),{status:400});
}

export function storeCompanionEvent(db,{userId,deviceId,kind,input}){const payload=sanitizeCompanionEvent(kind,input),now=new Date(),expiresAt=kind==='location'?new Date(now.getTime()+payload.ttlMinutes*60_000).toISOString():null,id=crypto.randomUUID();db.prepare('INSERT INTO personal_companion_events(id,user_id,device_id,kind,payload,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,userId,deviceId,kind,JSON.stringify(payload),expiresAt,now.toISOString());db.prepare('UPDATE personal_companion_pairings SET last_seen_at=? WHERE id=?').run(now.toISOString(),deviceId);return {id,kind,payload,expiresAt,createdAt:now.toISOString()};}

export function companionStatus(db,userId){db.prepare("DELETE FROM personal_companion_events WHERE expires_at IS NOT NULL AND expires_at<=?").run(new Date().toISOString());const devices=db.prepare("SELECT id,device_name AS deviceName,scopes,status,paired_at AS pairedAt,last_seen_at AS lastSeenAt FROM personal_companion_pairings WHERE user_id=? AND status='PAIRED' ORDER BY paired_at DESC").all(userId).map(row=>({...row,scopes:JSON.parse(row.scopes)}));const events=db.prepare('SELECT kind,payload,expires_at AS expiresAt,created_at AS createdAt FROM personal_companion_events WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(userId).map(row=>({...row,payload:JSON.parse(row.payload)}));return {devices,events,privacy:{rawHealthStored:false,locationTtlMaxMinutes:60,backgroundTracking:false}};}

export function revokeCompanion(db,{userId,deviceId}){const result=db.prepare("UPDATE personal_companion_pairings SET status='REVOKED',device_token_hash=NULL WHERE id=? AND user_id=?").run(deviceId,userId);return {revoked:result.changes===1,deviceId};}

