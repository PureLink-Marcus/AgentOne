import crypto from 'node:crypto';

const allowedScopes=['calendar.read','reminders.read','health.summary','health.background','location.temporary','location.timeline','shortcuts.invoke'];
const defaultScopes=['calendar.read','reminders.read','shortcuts.invoke'];
const pairingTtlMs=10*60_000;
const pairingAttemptWindowMs=15*60_000;
const pairingAttemptLimit=10;

function ownerId(value){const owner=String(value||'').trim().slice(0,80);if(!owner)throw companionError('COMPANION_USER_REQUIRED','Benutzer fehlt.');return owner;}
function hash(value,pepper){const key=String(pepper||'');if(!key)throw companionError('COMPANION_SECRET_NOT_CONFIGURED','Companion-Schlüssel ist nicht konfiguriert.',503);return crypto.createHmac('sha256',key).update(String(value)).digest('hex');}
function clamp(value,min,max){const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(min,number)):0;}
function companionError(code,message,status=400){return Object.assign(new Error(message),{code,status});}
function validDate(value){const date=value instanceof Date?new Date(value):new Date(value||Date.now());if(!Number.isFinite(date.getTime()))throw companionError('COMPANION_TIME_INVALID','Zeitpunkt ist ungültig.');return date;}
function transaction(db,operation){db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}}
function expirePendingPairings(db,userId,now){db.prepare("UPDATE personal_companion_pairings SET status='EXPIRED' WHERE user_id=? AND status='PENDING' AND expires_at<=?").run(userId,now.toISOString());}
function pairingAttemptRow(db,userId){return db.prepare('SELECT window_started_at AS windowStartedAt,failures,blocked_until AS blockedUntil FROM personal_companion_pairing_limits WHERE user_id=?').get(userId);}
function assertPairingAttemptAllowed(db,userId,now){const row=pairingAttemptRow(db,userId);if(!row)return;const blockedUntil=Date.parse(row.blockedUntil||'');if(Number.isFinite(blockedUntil)&&blockedUntil>now.getTime()){const error=companionError('COMPANION_RATE_LIMIT','Zu viele Pairing-Versuche. Bitte später erneut versuchen.',429);error.retryAfterSeconds=Math.max(1,Math.ceil((blockedUntil-now.getTime())/1000));throw error;}const started=Date.parse(row.windowStartedAt);if(!Number.isFinite(started)||now.getTime()-started>=pairingAttemptWindowMs)db.prepare('DELETE FROM personal_companion_pairing_limits WHERE user_id=?').run(userId);}
function recordPairingFailure(db,userId,now){const row=pairingAttemptRow(db,userId),started=Date.parse(row?.windowStartedAt||''),sameWindow=Number.isFinite(started)&&now.getTime()-started<pairingAttemptWindowMs,failures=sameWindow?Number(row.failures||0)+1:1,blockedUntil=failures>=pairingAttemptLimit?new Date(now.getTime()+pairingAttemptWindowMs).toISOString():null;db.prepare(`INSERT INTO personal_companion_pairing_limits(user_id,window_started_at,failures,blocked_until) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET window_started_at=excluded.window_started_at,failures=excluded.failures,blocked_until=excluded.blocked_until`).run(userId,sameWindow?row.windowStartedAt:now.toISOString(),failures,blockedUntil);}
function clearPairingFailures(db,userId){db.prepare('DELETE FROM personal_companion_pairing_limits WHERE user_id=?').run(userId);}

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
    CREATE TABLE IF NOT EXISTS personal_companion_pairing_limits(
      user_id TEXT PRIMARY KEY,window_started_at TEXT NOT NULL,failures INTEGER NOT NULL,
      blocked_until TEXT
    );
    CREATE INDEX IF NOT EXISTS personal_companion_pairings_user_status ON personal_companion_pairings(user_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS personal_companion_events_user_created ON personal_companion_events(user_id,created_at DESC);
  `);
}

export function createCompanionPairing(db,{userId,pepper,scopes=defaultScopes,now=new Date()}){
  const owner=ownerId(userId);
  const created=validDate(now),code=String(crypto.randomInt(100000,1000000)),id=crypto.randomUUID(),expires=new Date(created.getTime()+pairingTtlMs),safeScopes=[...new Set(Array.isArray(scopes)?scopes:[])].filter(scope=>allowedScopes.includes(scope));if(!safeScopes.length)throw companionError('COMPANION_SCOPE_REQUIRED','Mindestens eine Companion-Freigabe ist erforderlich.');
  const codeHash=hash(code,pepper);transaction(db,()=>{expirePendingPairings(db,owner,created);db.prepare("UPDATE personal_companion_pairings SET status='SUPERSEDED' WHERE user_id=? AND status='PENDING'").run(owner);clearPairingFailures(db,owner);db.prepare('INSERT INTO personal_companion_pairings(id,user_id,code_hash,scopes,status,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,owner,codeHash,JSON.stringify(safeScopes),'PENDING',expires.toISOString(),created.toISOString());});
  return {id,code,expiresAt:expires.toISOString(),scopes:safeScopes,shownOnce:true};
}

export function redeemCompanionPairing(db,{userId,code,deviceName,pepper,now=new Date()}){
  const owner=ownerId(userId),normalizedCode=String(code??'').trim(),redeemed=validDate(now);assertPairingAttemptAllowed(db,owner,redeemed);
  if(!/^\d{6}$/.test(normalizedCode)){recordPairingFailure(db,owner,redeemed);throw companionError('PAIRING_CODE_FORMAT_INVALID','Der Pairing-Code muss genau sechs Ziffern enthalten.',400);}
  const codeHash=hash(normalizedCode,pepper),token=`a1d_${crypto.randomBytes(32).toString('base64url')}`,tokenHash=hash(token,pepper),safeDeviceName=String(deviceName||'iPhone').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80)||'iPhone',timestamp=redeemed.toISOString(),outcome=transaction(db,()=>{expirePendingPairings(db,owner,redeemed);const row=db.prepare("SELECT * FROM personal_companion_pairings WHERE user_id=? AND code_hash=? AND status='PENDING' AND expires_at>?").get(owner,codeHash,timestamp);if(!row){recordPairingFailure(db,owner,redeemed);return null;}const result=db.prepare("UPDATE personal_companion_pairings SET device_token_hash=?,device_name=?,status='PAIRED',paired_at=?,last_seen_at=? WHERE id=? AND user_id=? AND status='PENDING' AND expires_at>?").run(tokenHash,safeDeviceName,timestamp,timestamp,row.id,owner,timestamp);if(result.changes!==1){recordPairingFailure(db,owner,redeemed);return null;}clearPairingFailures(db,owner);return {deviceId:row.id,deviceToken:token,scopes:JSON.parse(row.scopes),shownOnce:true};});
  if(!outcome)throw companionError('PAIRING_CODE_INVALID_OR_EXPIRED','Pairing-Code ist ungültig, abgelaufen oder wurde bereits verwendet.',401);return outcome;
}

export function authorizeCompanion(db,{userId,deviceToken,pepper}){const owner=ownerId(userId),token=String(deviceToken||'').trim();if(!/^a1d_[A-Za-z0-9_-]{40,100}$/.test(token))throw companionError('DEVICE_NOT_AUTHORIZED','Gerät ist nicht autorisiert.',401);const row=db.prepare("SELECT * FROM personal_companion_pairings WHERE user_id=? AND device_token_hash=? AND status='PAIRED'").get(owner,hash(token,pepper));if(!row)throw companionError('DEVICE_NOT_AUTHORIZED','Gerät ist nicht autorisiert.',401);return {...row,scopes:JSON.parse(row.scopes)};}

export function sanitizeCompanionEvent(kind,input={},deviceScopes=[]){
  if(kind==='health')return {date:String(input.date||new Date().toISOString().slice(0,10)),steps:Math.round(clamp(input.steps,0,200000)),sleepMinutes:Math.round(clamp(input.sleepMinutes,0,1440)),activeEnergyKcal:Math.round(clamp(input.activeEnergyKcal,0,20000)),workouts:Math.round(clamp(input.workouts,0,50))};
  if(kind==='location'){const timeline=Array.isArray(deviceScopes)&&deviceScopes.includes('location.timeline'),ttlMinutes=timeline?43_200:Math.round(clamp(input.ttlMinutes||15,1,60));return {label:String(input.label||(timeline?'Standort-Zeitachse':'Temporärer Standort')).slice(0,80),latitude:Number(clamp(input.latitude,-90,90).toFixed(5)),longitude:Number(clamp(input.longitude,-180,180).toFixed(5)),accuracyMeters:Math.round(clamp(input.accuracyMeters,0,10000)),capturedAt:validDate(input.capturedAt||new Date()).toISOString(),mode:timeline?'timeline':'temporary',ttlMinutes};}
  if(kind==='calendar'||kind==='reminders')return {count:Math.round(clamp(input.count,0,500)),nextTitle:String(input.nextTitle||'').slice(0,120),nextAt:input.nextAt?new Date(input.nextAt).toISOString():null};
  throw Object.assign(new Error('Nicht unterstützter Companion-Datentyp'),{status:400});
}

export function storeCompanionEvent(db,{userId,deviceId,deviceScopes=[],kind,input}){const owner=ownerId(userId),device=String(deviceId||''),payload=sanitizeCompanionEvent(kind,input,deviceScopes),now=new Date(),expiresAt=kind==='location'?new Date(now.getTime()+payload.ttlMinutes*60_000).toISOString():null,id=crypto.randomUUID(),createdAt=now.toISOString();return transaction(db,()=>{const paired=db.prepare("SELECT 1 AS paired FROM personal_companion_pairings WHERE id=? AND user_id=? AND status='PAIRED'").get(device,owner);if(!paired)throw companionError('DEVICE_NOT_AUTHORIZED','Gerät ist nicht autorisiert.',401);db.prepare('DELETE FROM personal_companion_events WHERE user_id=? AND expires_at IS NOT NULL AND expires_at<=?').run(owner,createdAt);db.prepare('INSERT INTO personal_companion_events(id,user_id,device_id,kind,payload,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,owner,device,kind,JSON.stringify(payload),expiresAt,createdAt);db.prepare("UPDATE personal_companion_pairings SET last_seen_at=? WHERE id=? AND user_id=? AND status='PAIRED'").run(createdAt,device,owner);return {id,kind,payload,expiresAt,createdAt};});}

export function companionStatus(db,userId){const owner=ownerId(userId),date=new Date(),now=date.toISOString();return transaction(db,()=>{db.prepare('DELETE FROM personal_companion_events WHERE user_id=? AND expires_at IS NOT NULL AND expires_at<=?').run(owner,now);expirePendingPairings(db,owner,date);const devices=db.prepare("SELECT id,device_name AS deviceName,scopes,status,paired_at AS pairedAt,last_seen_at AS lastSeenAt FROM personal_companion_pairings WHERE user_id=? AND status='PAIRED' ORDER BY paired_at DESC").all(owner).map(row=>({...row,scopes:JSON.parse(row.scopes)})),pending=db.prepare("SELECT id,scopes,expires_at AS expiresAt,created_at AS createdAt FROM personal_companion_pairings WHERE user_id=? AND status='PENDING' AND expires_at>? ORDER BY created_at DESC LIMIT 1").get(owner,now),events=db.prepare('SELECT kind,payload,expires_at AS expiresAt,created_at AS createdAt FROM personal_companion_events WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(owner).map(row=>({...row,payload:JSON.parse(row.payload)})),backgroundHealth=devices.some(device=>device.scopes.includes('health.background')),backgroundLocation=devices.some(device=>device.scopes.includes('location.timeline'));return {schema:'agentone.companion.status/v2',status:pending?'PAIRING':devices.length?'CONNECTED':'NOT_CONNECTED',pending:pending?{id:pending.id,expiresAt:pending.expiresAt,createdAt:pending.createdAt,scopes:JSON.parse(pending.scopes)}:null,devices,events,privacy:{rawHealthStored:false,locationTtlMaxMinutes:60,locationTimelineRetentionDays:30,backgroundHealth,backgroundLocation},secretsExposed:false};});}

export function companionDeviceStatus(db,{userId,deviceToken,pepper}){const row=authorizeCompanion(db,{userId,deviceToken,pepper}),scopeKinds={'health.summary':'health','health.background':'health','location.temporary':'location','location.timeline':'location','calendar.read':'calendar','reminders.read':'reminders'},ingest=[...new Set(row.scopes.map(scope=>scopeKinds[scope]).filter(Boolean))];return {schema:'agentone.companion.device-status/v2',status:'CONNECTED',device:{id:row.id,name:row.device_name,scopes:row.scopes,pairedAt:row.paired_at,lastSeenAt:row.last_seen_at},capabilities:{ingest},privacy:{rawHealthStored:false,locationTtlMaxMinutes:60,locationTimelineRetentionDays:30,backgroundHealth:row.scopes.includes('health.background'),backgroundLocation:row.scopes.includes('location.timeline')},secretsExposed:false};}

export function revokeCompanion(db,{userId,deviceId}){const owner=ownerId(userId),target=String(deviceId||'').trim();if(!target)throw companionError('COMPANION_DEVICE_REQUIRED','Gerät fehlt.');return transaction(db,()=>{const existing=db.prepare('SELECT status FROM personal_companion_pairings WHERE id=? AND user_id=?').get(target,owner);if(existing?.status==='REVOKED')return {revoked:true,alreadyRevoked:true,deviceId:target,eventsDeleted:0};if(existing?.status!=='PAIRED')return {revoked:false,alreadyRevoked:false,deviceId:target,eventsDeleted:0};const result=db.prepare("UPDATE personal_companion_pairings SET status='REVOKED',device_token_hash=NULL WHERE id=? AND user_id=? AND status='PAIRED'").run(target,owner),events=result.changes===1?db.prepare('DELETE FROM personal_companion_events WHERE device_id=? AND user_id=?').run(target,owner):{changes:0};return {revoked:result.changes===1,alreadyRevoked:false,deviceId:target,eventsDeleted:events.changes};});}

