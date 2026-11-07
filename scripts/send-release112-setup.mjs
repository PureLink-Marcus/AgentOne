import path from 'node:path';
import { existsSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { loadEnv } from '../server/state.mjs';

const root=path.resolve('.'),env=loadEnv(root),to=String(env.AGENTONE_INSTRUCTION_RECIPIENT||'mw@ric2k.de').trim(),port=Number(env.TECHHUB_SMTP_PORT||587);
if(to.toLowerCase()!=='mw@ric2k.de')throw new Error('Empfänger ist nicht freigegeben');
const required=['TECHHUB_SMTP_HOST'];for(const name of required)if(!String(env[name]||''))throw new Error(`${name} fehlt`);
const user=env.MAIL_SMTP_USER||env.MAIL_ABSENDER,pass=env.MAIL_SMTP_PASSWORD,from=env.TECHHUB_MAIL_FROM||env.MAIL_ABSENDER;if(!user||!pass||!from)throw new Error('SMTP-Zugang oder Absender fehlt');
const files=[
  ['GUENNI-RELEASE-112-EINRICHTUNG.md',path.join(root,'docs','RELEASE-112-SETUP.md')],
  ['AGENTONE-RELEASE-READINESS.md',path.join(root,'docs','RELEASE-READINESS.md')],
  ['guenni-source-sync-live.png',path.join(root,'output','playwright','guenni-release112-source-sync-live-mobile.png')],
  ['agentone-apple-companion.zip',path.join(root,'output','connector','agentone-apple-companion.zip')],
  ['agentone-siri-shortcuts.zip',path.join(root,'output','connector','agentone-siri-shortcuts.zip')]
];
for(const [,file] of files)if(!existsSync(file))throw new Error(`Anhang fehlt: ${path.basename(file)}`);
const transport=nodemailer.createTransport({host:env.TECHHUB_SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user,pass},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:20_000,socketTimeout:45_000});
const text=`Hallo Marcus,

AgentOne Personal / Günni Release 112 ist live. Vier private Container sind healthy; 385/385 Tests, Produktions-Build, Chrome-/WebKit-Smokes und npm-Audit ohne bekannte Schwachstelle sind bestanden.

Neu beziehungsweise produktiv geprüft:
- Source Sync Center für Post, Google und Kalender-Feed;
- read-only Synchronisierung mit Backoff und letztem gültigen Stand;
- Command Stream, Fokus-Kompass, Pattern Feed und Feedback;
- persistenter Mailbestand und Tagesplanung;
- Apple-Health-/WHOOP-Bereiche mit strikt getrennten Quellen;
- iPhone-Companion-Web-App, PWA-Push und Home Connector;
- 68/68 OpenClaw-Plugins geladen.

Aktuell verbunden: Postfach und Home Connector.
Noch einzurichten: Kalender-Feed oder Google OAuth, iPhone, Apple-Health-Export und optional WHOOP.

Im Anhang liegt eine nummerierte Anleitung. Bitte arbeite sie der Reihe nach ab; der einfachste Kalenderweg ist der private ICS-Link ohne Google-OAuth.

Wichtig: Diese Nachricht enthält absichtlich keine Keys, Passwörter oder Provider-Secrets. Variablennamen und sichere Ablageorte stehen in der Anleitung. Persönliche Login-/API-Keys erzeugst du in Günni unter Private Access und speicherst sie sofort separat im Passwortmanager.

Günni: https://guenni.mwart.solutions

Viele Grüße
AgentOne`;
const result=await transport.sendMail({from,to,subject:'Günni Release 112: Änderungen und Einrichtung Schritt für Schritt',text,attachments:files.map(([filename,file])=>({filename,path:file})),headers:{'X-AgentOne-Delivery':'release-112-setup','X-AgentOne-Secrets':'excluded'}});
console.log(JSON.stringify({sent:true,to,accepted:result.accepted?.includes(to)||false,messageId:result.messageId,attachments:files.length,secretsIncluded:false,masterSecretsIncluded:false},null,2));
