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
    const result=await runtime.pool.query('SELECT 1 AS ok, COUNT(*)::int AS migrations FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN (\'runtime_health\',\'worlds\',\'result_events\',\'personal_inbox\',\'personal_connectors\')');
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

function publicServiceRow(row){return {id:row.id,label:row.label,endpoint:row.endpoint,username:row.username,status:row.status,capabilities:row.capabilities||[],settings:row.settings||{},lastTest:row.lastTest||{},updatedAt:row.updatedAt,secretConfigured:true};}
export async function listPersonalServices(runtime,userId){if(!runtime.pool)return [];const result=await runtime.pool.query('SELECT service_id AS id,label,endpoint,username,status,capabilities,settings,last_test AS "lastTest",updated_at AS "updatedAt" FROM personal_service_accounts WHERE user_id=$1 ORDER BY service_id',[userId]);return result.rows.map(publicServiceRow);}
export async function savePersonalService(runtime,{userId,service,secret,lastTest,status}){if(!runtime.pool)throw Object.assign(new Error('Persönliche Datenbank ist nicht verfügbar'),{status:503});const result=await runtime.pool.query(`INSERT INTO personal_service_accounts(user_id,service_id,label,endpoint,username,secret_ciphertext,secret_iv,secret_tag,status,capabilities,settings,last_test,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,NOW()) ON CONFLICT(user_id,service_id) DO UPDATE SET label=EXCLUDED.label,endpoint=EXCLUDED.endpoint,username=EXCLUDED.username,secret_ciphertext=EXCLUDED.secret_ciphertext,secret_iv=EXCLUDED.secret_iv,secret_tag=EXCLUDED.secret_tag,status=EXCLUDED.status,capabilities=EXCLUDED.capabilities,settings=EXCLUDED.settings,last_test=EXCLUDED.last_test,updated_at=NOW() RETURNING service_id AS id,label,endpoint,username,status,capabilities,settings,last_test AS "lastTest",updated_at AS "updatedAt"`,[userId,service.id,service.label,service.endpoint,service.username||'',secret.ciphertext,secret.iv,secret.tag,status,JSON.stringify(service.capabilities||[]),JSON.stringify(service.settings||{}),JSON.stringify(lastTest||{})]);return publicServiceRow(result.rows[0]);}
export async function getPersonalService(runtime,userId,serviceId){if(!runtime.pool)return null;const result=await runtime.pool.query('SELECT service_id AS id,label,endpoint,username,status,capabilities,settings,last_test AS "lastTest",updated_at AS "updatedAt",secret_ciphertext AS ciphertext,secret_iv AS iv,secret_tag AS tag FROM personal_service_accounts WHERE user_id=$1 AND service_id=$2',[userId,serviceId]);return result.rows[0]||null;}
export async function updatePersonalServiceTest(runtime,userId,serviceId,lastTest,status){if(!runtime.pool)return;await runtime.pool.query('UPDATE personal_service_accounts SET last_test=$3::jsonb,status=$4,updated_at=NOW() WHERE user_id=$1 AND service_id=$2',[userId,serviceId,JSON.stringify(lastTest),status]);}
