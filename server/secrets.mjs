import crypto from 'node:crypto';

const SECRET_NAME=/(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|CLIENT_SECRET|SSH_KEY)/i;
const GROUPS=[
  ['Identity',/GRAPH_|OAUTH|OIDC|MICROSOFT/i],['Infrastructure',/COOLIFY|HETZNER|SSH/i],['Models',/OPENAI|OLLAMA|ANTHROPIC/i],['Commerce',/SHOPWARE/i],['Business Data',/ERP_|POSTGRES|_PG_/i],['Mail',/MAIL|SMTP|IMAP/i],['TechHub',/TECHHUB/i],['Other',/.*/],
];

export function secretInventory(env) {
  return Object.keys(env).filter(name=>SECRET_NAME.test(name)).sort().map(name=>{
    const value=env[name]; const group=GROUPS.find(([,pattern])=>pattern.test(name))?.[0]||'Other';
    return {name,group,configured:typeof value==='string'&&value.trim().length>0,classification:'SECRET',source:'master-env',valueVisible:false,rotation:'unknown'};
  });
}

function keyFromEnv(env) {
  const seed=env.AGENTONE_DEMO_MASTER_KEY||env.GRAPH_CLIENT_SECRET||'agentone-local-demo-ephemeral-key';
  return crypto.createHash('sha256').update(seed).digest();
}

export function encryptDemoSecret(value,env) {
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',keyFromEnv(env),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return {ciphertext:encrypted.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),algorithm:'AES-256-GCM'};
}

export function decryptDemoSecret(record,env) {
  const decipher=crypto.createDecipheriv('aes-256-gcm',keyFromEnv(env),Buffer.from(record.iv,'base64'));
  decipher.setAuthTag(Buffer.from(record.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64')),decipher.final()]).toString('utf8');
}

export function redact(value,secrets) {
  let text=typeof value==='string'?value:JSON.stringify(value);
  for(const secret of secrets)if(typeof secret==='string'&&secret.length>=8)text=text.split(secret).join('[REDACTED]');
  return text;
}
