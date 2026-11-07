import pg from 'pg';

export async function initPostgres(env){
  const service=env.AGENTONE_SERVICE_NAME||'agentone';
  if(!env.DATABASE_URL)return {configured:false,status:'DISABLED',service,pool:null,detail:'DATABASE_URL nicht gesetzt'};
  const pool=new pg.Pool({connectionString:env.DATABASE_URL,max:4,connectionTimeoutMillis:8_000,idleTimeoutMillis:30_000,ssl:env.DATABASE_SSL==='require'?{rejectUnauthorized:true}:false});
  try{
    await pool.query(`
      CREATE TABLE IF NOT EXISTS runtime_health (
        service_name TEXT PRIMARY KEY,
        release_name TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS worlds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_service TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS result_events (
        event_id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS personal_inbox (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id,event_id)
      );
      CREATE TABLE IF NOT EXISTS personal_connectors (
        user_id TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('OFF','PREPARED','CONNECTED','DEGRADED')),
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(user_id,connector_id)
      );
      CREATE TABLE IF NOT EXISTS personal_mail_accounts (
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        label TEXT NOT NULL,
        email TEXT NOT NULL,
        username TEXT NOT NULL,
        imap_host TEXT NOT NULL,
        imap_port INTEGER NOT NULL,
        imap_secure BOOLEAN NOT NULL DEFAULT TRUE,
        smtp_host TEXT NOT NULL,
        smtp_port INTEGER NOT NULL,
        smtp_secure BOOLEAN NOT NULL DEFAULT TRUE,
        secret_ciphertext TEXT NOT NULL,
        secret_iv TEXT NOT NULL,
        secret_tag TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CONNECTED',
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_test JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(user_id,account_id)
      );
      CREATE TABLE IF NOT EXISTS personal_mail_messages (
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        provider_id TEXT,
        uid BIGINT,
        uid_validity TEXT,
        thread_key TEXT NOT NULL,
        sender TEXT NOT NULL,
        subject TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        labels JSONB NOT NULL DEFAULT '[]'::jsonb,
        category TEXT NOT NULL CHECK (category IN ('people','newsletters','transactions','spam')),
        confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        classification_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
        needs_review BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(user_id,account_id,idempotency_key),
        FOREIGN KEY(user_id,account_id) REFERENCES personal_mail_accounts(user_id,account_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS personal_mail_messages_recent ON personal_mail_messages(user_id,account_id,received_at DESC,idempotency_key DESC);
      CREATE INDEX IF NOT EXISTS personal_mail_messages_category ON personal_mail_messages(user_id,account_id,category,received_at DESC);
      CREATE INDEX IF NOT EXISTS personal_mail_messages_thread ON personal_mail_messages(user_id,account_id,thread_key,received_at DESC);
      CREATE TABLE IF NOT EXISTS personal_mail_sync_state (
        user_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        uid_validity TEXT,
        last_uid BIGINT,
        status TEXT NOT NULL DEFAULT 'NOT_SYNCED' CHECK (status IN ('NOT_SYNCED','SYNCING','LIVE','DEGRADED')),
        last_mode TEXT,
        last_seen_count INTEGER NOT NULL DEFAULT 0,
        last_new_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        last_success_at TIMESTAMPTZ,
        last_attempt_at TIMESTAMPTZ,
        next_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(user_id,account_id),
        FOREIGN KEY(user_id,account_id) REFERENCES personal_mail_accounts(user_id,account_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS personal_mail_sync_due ON personal_mail_sync_state(next_sync_at,status);
      CREATE TABLE IF NOT EXISTS personal_service_accounts (
        user_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        label TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        username TEXT NOT NULL DEFAULT '',
        secret_ciphertext TEXT NOT NULL,
        secret_iv TEXT NOT NULL,
        secret_tag TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'READY',
        capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_test JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(user_id,service_id)
      );
    `);
    await pool.query(`INSERT INTO runtime_health(service_name,release_name,started_at,last_seen_at) VALUES($1,$2,NOW(),NOW()) ON CONFLICT(service_name) DO UPDATE SET release_name=EXCLUDED.release_name,started_at=EXCLUDED.started_at,last_seen_at=EXCLUDED.last_seen_at`,[service,env.AGENTONE_RELEASE||'local']);
    await pool.query(`INSERT INTO worlds(id,name,owner_service) VALUES('product','Produkttexte',$1) ON CONFLICT(id) DO UPDATE SET owner_service=EXCLUDED.owner_service`,[service]);
    const result=await pool.query('SELECT current_database() AS database, current_user AS role, version() AS version');
    return {configured:true,status:'LIVE',service,pool,detail:{database:result.rows[0].database,role:result.rows[0].role,engine:String(result.rows[0].version).split(' ').slice(0,2).join(' ')}};
  }catch(error){
    await pool.end().catch(()=>{});
    return {configured:true,status:'DEGRADED',service,pool:null,detail:String(error.message||error).slice(0,180)};
  }
}

export async function postgresHealth(runtime){
  if(!runtime.pool)return {status:runtime.status,detail:runtime.detail};
  const started=Date.now();
  try{
    const result=await runtime.pool.query('SELECT 1 AS ok, COUNT(*)::int AS migrations FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN (\'runtime_health\',\'worlds\',\'result_events\',\'personal_inbox\',\'personal_connectors\',\'personal_mail_messages\',\'personal_mail_sync_state\')');
    await runtime.pool.query('UPDATE runtime_health SET last_seen_at=NOW() WHERE service_name=$1',[runtime.service]);
    return {status:'LIVE',latencyMs:Date.now()-started,migrations:result.rows[0].migrations};
  }catch(error){return {status:'DEGRADED',detail:String(error.message||error).slice(0,160)};}
}

export async function listPersonalConnectors(runtime,userId){
  if(!runtime.pool)return [];
  const result=await runtime.pool.query('SELECT connector_id AS id,status,permissions,updated_at AS "updatedAt" FROM personal_connectors WHERE user_id=$1 ORDER BY connector_id',[userId]);
  return result.rows.map(row=>({...row,permissions:Array.isArray(row.permissions)?row.permissions:[]}));
}

export async function savePersonalConnector(runtime,{userId,id,status,permissions}){
  if(!runtime.pool)throw Object.assign(new Error('Persönliche Datenbank ist nicht verfügbar'),{status:503});
  const result=await runtime.pool.query(`INSERT INTO personal_connectors(user_id,connector_id,status,permissions,updated_at) VALUES($1,$2,$3,$4::jsonb,NOW()) ON CONFLICT(user_id,connector_id) DO UPDATE SET status=EXCLUDED.status,permissions=EXCLUDED.permissions,updated_at=NOW() RETURNING connector_id AS id,status,permissions,updated_at AS "updatedAt"`,[userId,id,status,JSON.stringify(permissions)]);
  return result.rows[0];
}

function publicMailRow(row){
  return {id:row.id,provider:row.provider,label:row.label,email:row.email,username:row.username,imap:{host:row.imapHost,port:row.imapPort,secure:row.imapSecure},smtp:{host:row.smtpHost,port:row.smtpPort,secure:row.smtpSecure},status:row.status,settings:row.settings||{},lastTest:row.lastTest||{},updatedAt:row.updatedAt,passwordConfigured:true};
}

export async function listPersonalMailAccounts(runtime,userId){
  if(!runtime.pool)return [];
  const result=await runtime.pool.query('SELECT account_id AS id,provider,label,email,username,imap_host AS "imapHost",imap_port AS "imapPort",imap_secure AS "imapSecure",smtp_host AS "smtpHost",smtp_port AS "smtpPort",smtp_secure AS "smtpSecure",status,settings,last_test AS "lastTest",updated_at AS "updatedAt" FROM personal_mail_accounts WHERE user_id=$1 ORDER BY label',[userId]);
  return result.rows.map(publicMailRow);
}

export async function savePersonalMailAccount(runtime,{userId,account,secret,lastTest}){
  if(!runtime.pool)throw Object.assign(new Error('Persönliche Datenbank ist nicht verfügbar'),{status:503});
  const result=await runtime.pool.query(`INSERT INTO personal_mail_accounts(user_id,account_id,provider,label,email,username,imap_host,imap_port,imap_secure,smtp_host,smtp_port,smtp_secure,secret_ciphertext,secret_iv,secret_tag,status,settings,last_test,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'CONNECTED',$16::jsonb,$17::jsonb,NOW()) ON CONFLICT(user_id,account_id) DO UPDATE SET provider=EXCLUDED.provider,label=EXCLUDED.label,email=EXCLUDED.email,username=EXCLUDED.username,imap_host=EXCLUDED.imap_host,imap_port=EXCLUDED.imap_port,imap_secure=EXCLUDED.imap_secure,smtp_host=EXCLUDED.smtp_host,smtp_port=EXCLUDED.smtp_port,smtp_secure=EXCLUDED.smtp_secure,secret_ciphertext=EXCLUDED.secret_ciphertext,secret_iv=EXCLUDED.secret_iv,secret_tag=EXCLUDED.secret_tag,status='CONNECTED',settings=EXCLUDED.settings,last_test=EXCLUDED.last_test,updated_at=NOW() RETURNING account_id AS id,provider,label,email,username,imap_host AS "imapHost",imap_port AS "imapPort",imap_secure AS "imapSecure",smtp_host AS "smtpHost",smtp_port AS "smtpPort",smtp_secure AS "smtpSecure",status,settings,last_test AS "lastTest",updated_at AS "updatedAt"`,[userId,account.id,account.provider,account.label,account.email,account.username,account.imap.host,account.imap.port,account.imap.secure,account.smtp.host,account.smtp.port,account.smtp.secure,secret.ciphertext,secret.iv,secret.tag,JSON.stringify(account.settings||{}),JSON.stringify(lastTest||{})]);
  return publicMailRow(result.rows[0]);
}

export async function getPersonalMailAccount(runtime,userId,accountId){
  if(!runtime.pool)return null;
  const result=await runtime.pool.query('SELECT account_id AS id,provider,label,email,username,imap_host AS "imapHost",imap_port AS "imapPort",imap_secure AS "imapSecure",smtp_host AS "smtpHost",smtp_port AS "smtpPort",smtp_secure AS "smtpSecure",status,settings,last_test AS "lastTest",updated_at AS "updatedAt",secret_ciphertext AS ciphertext,secret_iv AS iv,secret_tag AS tag FROM personal_mail_accounts WHERE user_id=$1 AND account_id=$2',[userId,accountId]);
  return result.rows[0]||null;
}

export async function updatePersonalMailTest(runtime,userId,accountId,lastTest,status='CONNECTED'){
  if(!runtime.pool)return;
  await runtime.pool.query('UPDATE personal_mail_accounts SET last_test=$3::jsonb,status=$4,updated_at=NOW() WHERE user_id=$1 AND account_id=$2',[userId,accountId,JSON.stringify(lastTest),status]);
}

export async function updatePersonalMailSettings(runtime,userId,accountId,settings){
  if(!runtime.pool)throw Object.assign(new Error('Persönliche Datenbank ist nicht verfügbar'),{status:503});
  const result=await runtime.pool.query('UPDATE personal_mail_accounts SET settings=$3::jsonb,updated_at=NOW() WHERE user_id=$1 AND account_id=$2 RETURNING account_id AS id,provider,label,email,username,imap_host AS "imapHost",imap_port AS "imapPort",imap_secure AS "imapSecure",smtp_host AS "smtpHost",smtp_port AS "smtpPort",smtp_secure AS "smtpSecure",status,settings,last_test AS "lastTest",updated_at AS "updatedAt"',[userId,accountId,JSON.stringify(settings||{})]);
  return result.rows[0]?publicMailRow(result.rows[0]):null;
}

const personalMailCategories=new Set(['people','newsletters','transactions','spam']);
const personalMailStatuses=new Set(['NOT_SYNCED','SYNCING','LIVE','DEGRADED']);
const PERSONAL_MAIL_MAX_PER_ACCOUNT=2500;
const PERSONAL_MAIL_RETENTION_DAYS=180;

function requiredMailId(value,field){const result=String(value||'').trim();if(!result||result.length>180)throw Object.assign(new Error(`Ungültiges ${field}`),{status:400});return result;}
function mailText(value,max){return String(value??'').trim().slice(0,max);}
function mailStringList(values,maxItems=40,maxLength=120){return [...new Set((Array.isArray(values)?values:[]).map(value=>mailText(value,maxLength)).filter(Boolean))].slice(0,maxItems);}
function mailDate(value,field){const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))throw Object.assign(new Error(`Ungültiges ${field}`),{status:400});return date;}
function mailSyncState(row){if(!row)return null;return {accountId:row.accountId,uidValidity:row.uidValidity||null,lastUid:row.lastUid==null?null:Number(row.lastUid),status:personalMailStatuses.has(row.status)?row.status:'NOT_SYNCED',mode:row.lastMode||null,total:Number(row.lastSeenCount||0),newCount:Number(row.lastNewCount||0),failureCount:Number(row.failureCount||0),lastErrorCode:row.lastErrorCode||null,lastSuccessAt:row.lastSuccessAt||null,lastAttemptAt:row.lastAttemptAt||null,nextSyncAt:row.nextSyncAt||null,updatedAt:row.updatedAt||null};}

export function normalizePersonalMailMessage(message={}){
  const idempotencyKey=mailText(message.idempotencyKey,64).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(idempotencyKey))throw Object.assign(new Error('Ungültiger Mail-Idempotenzschlüssel'),{status:400});
  const category=mailText(message.category,30).toLowerCase();if(!personalMailCategories.has(category))throw Object.assign(new Error('Ungültige Mail-Kategorie'),{status:400});
  const uid=message.uid==null||message.uid===''?null:Number(message.uid);if(uid!==null&&(!Number.isSafeInteger(uid)||uid<1))throw Object.assign(new Error('Ungültige IMAP-UID'),{status:400});
  const confidence=Math.max(0,Math.min(1,Number(message.confidence)||0));
  return {idempotencyKey,providerId:mailText(message.providerId,240)||null,uid,uidValidity:mailText(message.uidValidity,120)||null,threadKey:requiredMailId(message.threadKey,'Thread-Schlüssel').slice(0,500),sender:mailText(message.sender,320),subject:mailText(message.subject,500)||'(ohne Betreff)',receivedAt:mailDate(message.receivedAt,'Empfangszeit').toISOString(),labels:mailStringList(message.labels),category,confidence,classificationSignals:mailStringList(message.classificationSignals,40,100),needsReview:Boolean(message.needsReview)};
}

export function personalMailBackoffMinutes(failureCount){const value=Math.max(1,Math.min(6,Number(failureCount)||1));return Math.min(360,15*(2**(value-1)));}

async function withMailTransaction(runtime,callback){if(!runtime.pool)throw Object.assign(new Error('Persönliche Datenbank ist nicht verfügbar'),{status:503});const client=typeof runtime.pool.connect==='function'?await runtime.pool.connect():runtime.pool;try{await client.query('BEGIN');const value=await callback(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release?.();}}

export async function persistPersonalMailSync(runtime,{userId,accountId,messages=[],cursor={},mode='incremental',replace=mode==='full',syncedAt=new Date(),intervalMinutes=15,maxMessages=PERSONAL_MAIL_MAX_PER_ACCOUNT,retentionDays=PERSONAL_MAIL_RETENTION_DAYS}={}){
  const safeUser=requiredMailId(userId,'Benutzer'),safeAccount=requiredMailId(accountId,'Konto'),safeMode=mode==='full'?'full':'incremental',at=mailDate(syncedAt,'Synchronisationszeit'),nextSyncAt=new Date(at.getTime()+Math.max(1,Math.min(1440,Number(intervalMinutes)||15))*60_000),cutoff=new Date(at.getTime()-Math.max(1,Math.min(3650,Number(retentionDays)||PERSONAL_MAIL_RETENTION_DAYS))*86_400_000),limit=Math.max(1,Math.min(10_000,Number(maxMessages)||PERSONAL_MAIL_MAX_PER_ACCOUNT)),uidValidity=mailText(cursor.uidValidity,120)||null,lastUid=cursor.lastUid==null?null:Number(cursor.lastUid);
  if(lastUid!==null&&(!Number.isSafeInteger(lastUid)||lastUid<1))throw Object.assign(new Error('Ungültiger Mail-Cursor'),{status:400});
  const normalized=messages.map(message=>normalizePersonalMailMessage({...message,uidValidity:message.uidValidity||uidValidity}));
  return withMailTransaction(runtime,async client=>{
    if(replace)await client.query('DELETE FROM personal_mail_messages WHERE user_id=$1 AND account_id=$2',[safeUser,safeAccount]);
    let existing=new Set();if(!replace&&normalized.length){const result=await client.query('SELECT idempotency_key FROM personal_mail_messages WHERE user_id=$1 AND account_id=$2 AND idempotency_key=ANY($3::text[])',[safeUser,safeAccount,normalized.map(item=>item.idempotencyKey)]);existing=new Set(result.rows.map(row=>row.idempotency_key||row.idempotencyKey));}
    for(const item of normalized)await client.query(`INSERT INTO personal_mail_messages(user_id,account_id,idempotency_key,provider_id,uid,uid_validity,thread_key,sender,subject,received_at,labels,category,confidence,classification_signals,needs_review,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14::jsonb,$15,NOW(),NOW()) ON CONFLICT(user_id,account_id,idempotency_key) DO UPDATE SET provider_id=EXCLUDED.provider_id,uid=EXCLUDED.uid,uid_validity=EXCLUDED.uid_validity,thread_key=EXCLUDED.thread_key,sender=EXCLUDED.sender,subject=EXCLUDED.subject,received_at=EXCLUDED.received_at,labels=EXCLUDED.labels,category=EXCLUDED.category,confidence=EXCLUDED.confidence,classification_signals=EXCLUDED.classification_signals,needs_review=EXCLUDED.needs_review,updated_at=NOW()`,[safeUser,safeAccount,item.idempotencyKey,item.providerId,item.uid,item.uidValidity,item.threadKey,item.sender,item.subject,item.receivedAt,JSON.stringify(item.labels),item.category,item.confidence,JSON.stringify(item.classificationSignals),item.needsReview]);
    await client.query('DELETE FROM personal_mail_messages WHERE user_id=$1 AND account_id=$2 AND received_at<$3',[safeUser,safeAccount,cutoff.toISOString()]);
    await client.query('DELETE FROM personal_mail_messages WHERE ctid IN (SELECT ctid FROM personal_mail_messages WHERE user_id=$1 AND account_id=$2 ORDER BY received_at DESC,idempotency_key DESC OFFSET $3)',[safeUser,safeAccount,limit]);
    const countResult=await client.query('SELECT COUNT(*)::int AS total FROM personal_mail_messages WHERE user_id=$1 AND account_id=$2',[safeUser,safeAccount]),total=Number(countResult.rows[0]?.total||0),newCount=replace?normalized.length:normalized.filter(item=>!existing.has(item.idempotencyKey)).length;
    const stateResult=await client.query(`INSERT INTO personal_mail_sync_state(user_id,account_id,uid_validity,last_uid,status,last_mode,last_seen_count,last_new_count,failure_count,last_error_code,last_success_at,last_attempt_at,next_sync_at,updated_at) VALUES($1,$2,$3,$4,'LIVE',$5,$6,$7,0,NULL,$8,$8,$9,NOW()) ON CONFLICT(user_id,account_id) DO UPDATE SET uid_validity=EXCLUDED.uid_validity,last_uid=EXCLUDED.last_uid,status='LIVE',last_mode=EXCLUDED.last_mode,last_seen_count=EXCLUDED.last_seen_count,last_new_count=EXCLUDED.last_new_count,failure_count=0,last_error_code=NULL,last_success_at=EXCLUDED.last_success_at,last_attempt_at=EXCLUDED.last_attempt_at,next_sync_at=EXCLUDED.next_sync_at,updated_at=NOW() RETURNING account_id AS "accountId",uid_validity AS "uidValidity",last_uid AS "lastUid",status,last_mode AS "lastMode",last_seen_count AS "lastSeenCount",last_new_count AS "lastNewCount",failure_count AS "failureCount",last_error_code AS "lastErrorCode",last_success_at AS "lastSuccessAt",last_attempt_at AS "lastAttemptAt",next_sync_at AS "nextSyncAt",updated_at AS "updatedAt"`,[safeUser,safeAccount,uidValidity,lastUid,safeMode,total,newCount,at.toISOString(),nextSyncAt.toISOString()]);
    return {stored:total,newCount,updated:normalized.length-newCount,removedByPolicy:Math.max(0,normalized.length-total),state:mailSyncState(stateResult.rows[0]),secretsExposed:false,contentStored:false};
  });
}

export const recordPersonalMailSyncSuccess=persistPersonalMailSync;

export async function getPersonalMailSyncState(runtime,userId,accountId){if(!runtime.pool)return null;const result=await runtime.pool.query('SELECT account_id AS "accountId",uid_validity AS "uidValidity",last_uid AS "lastUid",status,last_mode AS "lastMode",last_seen_count AS "lastSeenCount",last_new_count AS "lastNewCount",failure_count AS "failureCount",last_error_code AS "lastErrorCode",last_success_at AS "lastSuccessAt",last_attempt_at AS "lastAttemptAt",next_sync_at AS "nextSyncAt",updated_at AS "updatedAt" FROM personal_mail_sync_state WHERE user_id=$1 AND account_id=$2',[requiredMailId(userId,'Benutzer'),requiredMailId(accountId,'Konto')]);return mailSyncState(result.rows[0]);}

export async function recordPersonalMailSyncFailure(runtime,{userId,accountId,code='MAIL_SYNC_FAILED',retryable=true,failedAt=new Date()}={}){const safeUser=requiredMailId(userId,'Benutzer'),safeAccount=requiredMailId(accountId,'Konto'),safeCode=mailText(code,80).replace(/[^A-Z0-9_.-]/gi,'_').toUpperCase()||'MAIL_SYNC_FAILED',at=mailDate(failedAt,'Fehlerzeit');return withMailTransaction(runtime,async client=>{const locked=await client.query('SELECT failure_count AS "failureCount" FROM personal_mail_sync_state WHERE user_id=$1 AND account_id=$2 FOR UPDATE',[safeUser,safeAccount]),failureCount=Number(locked.rows[0]?.failureCount||0)+1,delayMinutes=retryable?personalMailBackoffMinutes(failureCount):1440,nextSyncAt=new Date(at.getTime()+delayMinutes*60_000),result=await client.query(`INSERT INTO personal_mail_sync_state(user_id,account_id,status,failure_count,last_error_code,last_attempt_at,next_sync_at,updated_at) VALUES($1,$2,'DEGRADED',$3,$4,$5,$6,NOW()) ON CONFLICT(user_id,account_id) DO UPDATE SET status='DEGRADED',failure_count=$3,last_error_code=$4,last_attempt_at=$5,next_sync_at=$6,updated_at=NOW() RETURNING account_id AS "accountId",uid_validity AS "uidValidity",last_uid AS "lastUid",status,last_mode AS "lastMode",last_seen_count AS "lastSeenCount",last_new_count AS "lastNewCount",failure_count AS "failureCount",last_error_code AS "lastErrorCode",last_success_at AS "lastSuccessAt",last_attempt_at AS "lastAttemptAt",next_sync_at AS "nextSyncAt",updated_at AS "updatedAt"`,[safeUser,safeAccount,failureCount,safeCode,at.toISOString(),nextSyncAt.toISOString()]);return {...mailSyncState(result.rows[0]),retryable,backoffMinutes:delayMinutes};});}

function publicStoredMail(row){const labels=Array.isArray(row.labels)?row.labels:[],signals=Array.isArray(row.classificationSignals)?row.classificationSignals:[];return {id:row.idempotencyKey,idempotencyKey:row.idempotencyKey,accountId:row.accountId,providerId:row.providerId||null,uid:row.uid==null?null:Number(row.uid),uidValidity:row.uidValidity||null,threadKey:row.threadKey,sender:row.sender,subject:row.subject,receivedAt:row.receivedAt,labels,unread:!labels.some(value=>String(value).toLowerCase()==='\\seen'),category:row.category,confidence:Number(row.confidence||0),classificationSignals:signals,needsReview:Boolean(row.needsReview)};}

export async function listPersonalMailMessages(runtime,{userId,accountId='',category='',query='',threadKey='',limit=50}={}){const empty={messages:[],summary:{total:0,threads:0,people:0,newsletters:0,transactions:0,spam:0,categories:{people:0,newsletters:0,transactions:0,spam:0},needsReview:0,unread:0},secretsExposed:false,contentExposed:false};if(!runtime.pool)return empty;const safeUser=requiredMailId(userId,'Benutzer'),clauses=['user_id=$1'],params=[safeUser];if(accountId){params.push(requiredMailId(accountId,'Konto'));clauses.push(`account_id=$${params.length}`);}if(category){const safeCategory=mailText(category,30).toLowerCase();if(!personalMailCategories.has(safeCategory))throw Object.assign(new Error('Ungültiger Mail-Filter'),{status:400});params.push(safeCategory);clauses.push(`category=$${params.length}`);}if(threadKey){params.push(mailText(threadKey,500));clauses.push(`thread_key=$${params.length}`);}const search=mailText(query,120);if(search){params.push(`%${search.replace(/[\\%_]/g,value=>'\\'+value)}%`);clauses.push(`(sender ILIKE $${params.length} ESCAPE '\\' OR subject ILIKE $${params.length} ESCAPE '\\')`);}const boundedLimit=Math.max(1,Math.min(200,Number(limit)||50));params.push(boundedLimit);const rows=await runtime.pool.query(`SELECT account_id AS "accountId",idempotency_key AS "idempotencyKey",provider_id AS "providerId",uid,uid_validity AS "uidValidity",thread_key AS "threadKey",sender,subject,received_at AS "receivedAt",labels,category,confidence,classification_signals AS "classificationSignals",needs_review AS "needsReview" FROM personal_mail_messages WHERE ${clauses.join(' AND ')} ORDER BY received_at DESC,idempotency_key DESC LIMIT $${params.length}`,params),summaryParams=[safeUser],summaryClauses=['user_id=$1'];if(accountId){summaryParams.push(requiredMailId(accountId,'Konto'));summaryClauses.push(`account_id=$${summaryParams.length}`);}const summaryResult=await runtime.pool.query(`SELECT COUNT(*)::int AS total,COUNT(DISTINCT thread_key)::int AS threads,COUNT(*) FILTER (WHERE category='people')::int AS people,COUNT(*) FILTER (WHERE category='newsletters')::int AS newsletters,COUNT(*) FILTER (WHERE category='transactions')::int AS transactions,COUNT(*) FILTER (WHERE category='spam')::int AS spam,COUNT(*) FILTER (WHERE needs_review)::int AS "needsReview",COUNT(*) FILTER (WHERE NOT(labels ? '\\Seen'))::int AS unread FROM personal_mail_messages WHERE ${summaryClauses.join(' AND ')}`,summaryParams),raw=summaryResult.rows[0]||{},categories={people:Number(raw.people||0),newsletters:Number(raw.newsletters||0),transactions:Number(raw.transactions||0),spam:Number(raw.spam||0)};return {messages:rows.rows.map(publicStoredMail),summary:{total:Number(raw.total||0),threads:Number(raw.threads||0),...categories,categories,needsReview:Number(raw.needsReview||0),unread:Number(raw.unread||0)},secretsExposed:false,contentExposed:false};}

export async function listDuePersonalMailSyncs(runtime,{asOf=new Date(),limit=25}={}){if(!runtime.pool)return [];const result=await runtime.pool.query(`SELECT a.user_id AS "userId",a.account_id AS "accountId" FROM personal_mail_accounts a LEFT JOIN personal_mail_sync_state s ON s.user_id=a.user_id AND s.account_id=a.account_id WHERE s.next_sync_at IS NULL OR s.next_sync_at<=$1 ORDER BY COALESCE(s.next_sync_at,'1970-01-01'::timestamptz),a.user_id,a.account_id LIMIT $2`,[mailDate(asOf,'Fälligkeitszeit').toISOString(),Math.max(1,Math.min(100,Number(limit)||25))]);return result.rows;}

export async function applyPersonalMailRetention(runtime,{userId,accountId,asOf=new Date(),maxMessages=PERSONAL_MAIL_MAX_PER_ACCOUNT,retentionDays=PERSONAL_MAIL_RETENTION_DAYS}={}){return withMailTransaction(runtime,async client=>{const safeUser=requiredMailId(userId,'Benutzer'),safeAccount=requiredMailId(accountId,'Konto'),at=mailDate(asOf,'Aufbewahrungszeit'),cutoff=new Date(at.getTime()-Math.max(1,Math.min(3650,Number(retentionDays)||PERSONAL_MAIL_RETENTION_DAYS))*86_400_000),limit=Math.max(1,Math.min(10_000,Number(maxMessages)||PERSONAL_MAIL_MAX_PER_ACCOUNT)),age=await client.query('DELETE FROM personal_mail_messages WHERE user_id=$1 AND account_id=$2 AND received_at<$3',[safeUser,safeAccount,cutoff.toISOString()]),overflow=await client.query('DELETE FROM personal_mail_messages WHERE ctid IN (SELECT ctid FROM personal_mail_messages WHERE user_id=$1 AND account_id=$2 ORDER BY received_at DESC,idempotency_key DESC OFFSET $3)',[safeUser,safeAccount,limit]);return {removed:Number(age.rowCount||0)+Number(overflow.rowCount||0),cutoff:cutoff.toISOString(),maxMessages:limit};});}

export async function deletePersonalMailAccountData(runtime,{userId,accountId}={}){return withMailTransaction(runtime,async client=>{const safeUser=requiredMailId(userId,'Benutzer'),safeAccount=requiredMailId(accountId,'Konto'),messages=await client.query('DELETE FROM personal_mail_messages WHERE user_id=$1 AND account_id=$2',[safeUser,safeAccount]),state=await client.query('DELETE FROM personal_mail_sync_state WHERE user_id=$1 AND account_id=$2',[safeUser,safeAccount]);return {accountId:safeAccount,messages:Number(messages.rowCount||0),stateRemoved:Boolean(state.rowCount),deleted:true};});}

function publicServiceRow(row){return {id:row.id,label:row.label,endpoint:row.endpoint,username:row.username,status:row.status,capabilities:row.capabilities||[],settings:row.settings||{},lastTest:row.lastTest||{},updatedAt:row.updatedAt,secretConfigured:true};}
export async function listPersonalServices(runtime,userId){if(!runtime.pool)return [];const result=await runtime.pool.query('SELECT service_id AS id,label,endpoint,username,status,capabilities,settings,last_test AS "lastTest",updated_at AS "updatedAt" FROM personal_service_accounts WHERE user_id=$1 ORDER BY service_id',[userId]);return result.rows.map(publicServiceRow);}
export async function savePersonalService(runtime,{userId,service,secret,lastTest,status}){if(!runtime.pool)throw Object.assign(new Error('Persönliche Datenbank ist nicht verfügbar'),{status:503});const result=await runtime.pool.query(`INSERT INTO personal_service_accounts(user_id,service_id,label,endpoint,username,secret_ciphertext,secret_iv,secret_tag,status,capabilities,settings,last_test,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,NOW()) ON CONFLICT(user_id,service_id) DO UPDATE SET label=EXCLUDED.label,endpoint=EXCLUDED.endpoint,username=EXCLUDED.username,secret_ciphertext=EXCLUDED.secret_ciphertext,secret_iv=EXCLUDED.secret_iv,secret_tag=EXCLUDED.secret_tag,status=EXCLUDED.status,capabilities=EXCLUDED.capabilities,settings=EXCLUDED.settings,last_test=EXCLUDED.last_test,updated_at=NOW() RETURNING service_id AS id,label,endpoint,username,status,capabilities,settings,last_test AS "lastTest",updated_at AS "updatedAt"`,[userId,service.id,service.label,service.endpoint,service.username||'',secret.ciphertext,secret.iv,secret.tag,status,JSON.stringify(service.capabilities||[]),JSON.stringify(service.settings||{}),JSON.stringify(lastTest||{})]);return publicServiceRow(result.rows[0]);}
export async function getPersonalService(runtime,userId,serviceId){if(!runtime.pool)return null;const result=await runtime.pool.query('SELECT service_id AS id,label,endpoint,username,status,capabilities,settings,last_test AS "lastTest",updated_at AS "updatedAt",secret_ciphertext AS ciphertext,secret_iv AS iv,secret_tag AS tag FROM personal_service_accounts WHERE user_id=$1 AND service_id=$2',[userId,serviceId]);return result.rows[0]||null;}
export async function updatePersonalServiceTest(runtime,userId,serviceId,lastTest,status){if(!runtime.pool)return;await runtime.pool.query('UPDATE personal_service_accounts SET last_test=$3::jsonb,status=$4,updated_at=NOW() WHERE user_id=$1 AND service_id=$2',[userId,serviceId,JSON.stringify(lastTest),status]);}
