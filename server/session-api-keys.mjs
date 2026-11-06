import crypto from 'node:crypto';

const safe=(left,right)=>{const a=Buffer.from(String(left)),b=Buffer.from(String(right));return a.length===b.length&&crypto.timingSafeEqual(a,b)};

export function createSessionCredential(){
  const loginKey=`a1l_${crypto.randomBytes(12).toString('base64url')}`;
  const apiKey=`a1k_${crypto.randomBytes(32).toString('base64url')}`;
  const salt=crypto.randomBytes(16).toString('hex');
  const apiKeyHash=crypto.scryptSync(apiKey,salt,32).toString('hex');
  return {loginKey,apiKey,salt,apiKeyHash};
}

export function verifySessionCredential(record,loginKey,apiKey){
  if(!record||record.revokedAt||!safe(record.loginKey,loginKey))return false;
  const candidate=crypto.scryptSync(String(apiKey),record.salt,32).toString('hex');
  return safe(candidate,record.apiKeyHash);
}
