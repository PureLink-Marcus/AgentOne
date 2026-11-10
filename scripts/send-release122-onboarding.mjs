import path from 'node:path';
import {existsSync} from 'node:fs';
import nodemailer from 'nodemailer';
import {loadEnv} from '../server/state.mjs';

const root=path.resolve('.'),env=loadEnv(root),to=String(env.AGENTONE_INSTRUCTION_RECIPIENT||'mw@ric2k.de').trim(),port=Number(env.TECHHUB_SMTP_PORT||587);
if(to.toLowerCase()!=='mw@ric2k.de')throw new Error('Empfänger ist nicht freigegeben');
if(!String(env.TECHHUB_SMTP_HOST||''))throw new Error('TECHHUB_SMTP_HOST fehlt');
const user=env.MAIL_SMTP_USER||env.MAIL_ABSENDER,pass=env.MAIL_SMTP_PASSWORD,from=env.TECHHUB_MAIL_FROM||env.MAIL_ABSENDER;if(!user||!pass||!from)throw new Error('SMTP-Zugang oder Absender fehlt');
const files=[
  ['GUENNI-RELEASE-122-EINRICHTUNG.md',path.join(root,'docs','RELEASE-122-SETUP.md')],
  ['AGENTONE-IPHONE-SIDELOAD.md',path.join(root,'docs','IPHONE-SIDELOAD.md')],
  ['AGENTONE-OPENCLAW-PLUGINS.md',path.join(root,'docs','OPENCLAW-PLUGIN-ONBOARDING.md')],
  ['agentone-apple-companion.zip',path.join(root,'output','connector','agentone-apple-companion.zip')],
  ['AgentOne-Companion-unsigned.ipa.sha256',path.join(root,'output','connector','AgentOne-Companion-unsigned.ipa.sha256')]
];
for(const [,file] of files)if(!existsSync(file))throw new Error(`Anhang fehlt: ${path.basename(file)}`);
const transport=nodemailer.createTransport({host:env.TECHHUB_SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user,pass},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:20_000,socketTimeout:45_000});
const text=`Hallo Marcus,

AgentOne Personal Release 122 ist für Günni und Fressi ausgerollt.

Neu:
- AgentOne Companion IPA direkt in Günni unter Private Access → Apple Live-Sync;
- Installationsanleitung und SHA-256-Prüfsumme direkt in der App;
- OpenClaw Plugin Center unter Integrationen;
- Plugin-Katalog, installierte Plugins und Plugin-Details mobil erreichbar;
- geführter Ablauf: suchen, installieren, Rechte prüfen, Konto verbinden, aktivieren;
- vollständige OpenClaw-Plugin-Anleitung als Download.

Günni: https://guenni.mwart.solutions
IPA in der App: https://guenni.mwart.solutions/agentone/downloads/agentone-companion.ipa
iPhone-Anleitung: https://guenni.mwart.solutions/agentone/downloads/iphone-sideload.md
Plugin-Anleitung: https://guenni.mwart.solutions/agentone/downloads/openclaw-plugin-onboarding.md

OpenClaw-Plugins:
1. In Günni Integrationen → OpenClaw Plugin Center öffnen.
2. Plugin-Katalog öffnen und ein offizielles oder ClawHub-Paket wählen.
3. Quelle, Version und angeforderte Fähigkeiten prüfen.
4. Installieren, erforderliches Konto verbinden und aktivieren.
5. In Installiert verwalten den Zustand LOADED prüfen.

Fremde npm- oder Git-Quellen führen Code im Gateway aus. Sie werden deshalb nicht automatisch bestätigt. Capability-Freigaben immer lesen und nur bewusst akzeptieren.

Die IPA selbst ist wegen möglicher Mailfilter nicht angehängt; sie liegt direkt in der App. Quellpaket, Prüfsumme und alle Anleitungen sind beigefügt.

Wichtig: Diese Nachricht enthält keine Passwörter, Tokens, Login-Keys oder Provider-Secrets.

Viele Grüße
AgentOne`;
const result=await transport.sendMail({from,to,subject:'Günni Release 122: iPhone-App und OpenClaw-Plugin-Center',text,attachments:files.map(([filename,file])=>({filename,path:file})),headers:{'X-AgentOne-Delivery':'release-122-onboarding','X-AgentOne-Secrets':'excluded'}});
console.log(JSON.stringify({sent:true,to,accepted:result.accepted?.includes(to)||false,messageId:result.messageId,attachments:files.length,secretsIncluded:false},null,2));

