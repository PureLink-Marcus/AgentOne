import fs from 'node:fs';
import path from 'node:path';

const chunks=[];if(!process.argv[2])for await(const chunk of process.stdin)chunks.push(chunk);
const input=JSON.parse(process.argv[2]?Buffer.from(process.argv[2],'base64url').toString('utf8'):Buffer.concat(chunks).toString('utf8'));
for(const name of ['TAILSCALE_HETZNER_AUTH_KEY','TAILSCALE_HOME_AUTH_KEY'])if(!/^tskey-auth-[A-Za-z0-9-]+$/.test(String(input[name]||'')))throw new Error(`${name} ist ungültig`);
const file=path.resolve('master/env/.env.master');let text=fs.readFileSync(file,'utf8');
for(const [name,value] of Object.entries(input)){
  const line=`${name}=${value}`;const pattern=new RegExp(`^${name}=.*$`,'m');
  text=pattern.test(text)?text.replace(pattern,line):`${text.replace(/\s*$/,'')}\n${line}\n`;
}
fs.writeFileSync(file,text,{encoding:'utf8',mode:0o600});
console.log('Tailscale-Keys sicher in master/env/.env.master gespeichert.');
