import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

const file=path.resolve('master/env/.env.master');
if(!fs.existsSync(file))throw new Error('master/env/.env.master fehlt');
const original=fs.readFileSync(file,'utf8'),lines=original.split(/\r?\n/),names=new Set(lines.map(line=>line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1]).filter(Boolean)),add=[];
const vapid=names.has('AGENTONE_VAPID_PUBLIC_KEY')&&names.has('AGENTONE_VAPID_PRIVATE_KEY')?null:webpush.generateVAPIDKeys();
if(!names.has('AGENTONE_VAPID_PUBLIC_KEY'))add.push(`AGENTONE_VAPID_PUBLIC_KEY=${vapid.publicKey}`);
if(!names.has('AGENTONE_VAPID_PRIVATE_KEY'))add.push(`AGENTONE_VAPID_PRIVATE_KEY=${vapid.privateKey}`);
if(!names.has('AGENTONE_VAPID_SUBJECT'))add.push('AGENTONE_VAPID_SUBJECT=mailto:mw@ric2k.de');
if(!names.has('AGENTONE_PUSH_MASTER_KEY'))add.push(`AGENTONE_PUSH_MASTER_KEY=${crypto.randomBytes(48).toString('base64url')}`);
if(add.length){const separator=original.endsWith('\n')?'':'\n';fs.writeFileSync(file,original+separator+'\n# AgentOne Personal PWA Push · Release 107\n'+add.join('\n')+'\n',{encoding:'utf8',mode:0o600});}
const after=fs.readFileSync(file,'utf8'),present=['AGENTONE_VAPID_PUBLIC_KEY','AGENTONE_VAPID_PRIVATE_KEY','AGENTONE_VAPID_SUBJECT','AGENTONE_PUSH_MASTER_KEY'].every(name=>new RegExp(`^${name}=.+$`,'m').test(after));
if(!present)throw new Error('VAPID-Konfiguration ist unvollständig');
process.stdout.write(JSON.stringify({ok:true,created:add.map(line=>line.slice(0,line.indexOf('='))),reused:add.length===0,valuesPrinted:false,file:'master/env/.env.master'})+'\n');
