import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { loadEnv } from '../server/state.mjs';

const root=path.resolve('.'),env=loadEnv(root);
const recipient=String(env.AGENTONE_INSTRUCTION_RECIPIENT||'mw@ric2k.de').trim();
const host=String(env.TECHHUB_SMTP_HOST||''),port=Number(env.TECHHUB_SMTP_PORT||587);
const from=String(env.TECHHUB_MAIL_FROM||env.MAIL_ABSENDER||'').trim();
const user=String(env.MAIL_SMTP_USER||env.MAIL_ABSENDER||'').trim(),pass=String(env.MAIL_SMTP_PASSWORD||'');
const siriKey=String(env.AGENTONE_GUENNI_SIRI_API_KEY||'');
if(!/^mw@ric2k\.de$/i.test(recipient))throw new Error('Unerwarteter Empfänger');
if(!host||!from||!user||!pass)throw new Error('SMTP-Konfiguration unvollständig');
if(siriKey.length<32)throw new Error('Günni-Siri-Key fehlt');
const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,auth:{user,pass},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:20_000,greetingTimeout:20_000,socketTimeout:30_000});
const endpoint='https://guenni.mwart.solutions/agentone/siri/v1/execute';
const text=`AgentOne Personal · Günni · Siri-Test\n\nSENSIBEL: Diese Nachricht enthält ausschließlich den aufgabenspezifischen Siri-Testzugang. Keine Datenbank-, Coolify-, OpenAI- oder Benutzerpasswörter.\n\nZiel\nSage „Siri, Licht aus“. Apple Kurzbefehle ruft Günni auf; Günni schaltet über Raspberry und Home Assistant alle freigegebenen light.*-Entitäten aus.\n\nKurzbefehl\n1. Kurzbefehle öffnen und „Licht aus“ anlegen.\n2. Aktion „Inhalte von URL abrufen“.\n3. URL: ${endpoint}\n4. Methode: POST\n5. Header Authorization: Bearer ${siriKey}\n6. Header Content-Type: application/json\n7. JSON: {"intent":"home.lights.off","requestId":"siri-light-off"}\n8. Antwortfeld „speech“ mit „Text sprechen“ ausgeben.\n\nRaspberry\nHOME_ASSISTANT_DOMAINS muss light enthalten.\nHOME_ASSISTANT_CONTROL_ENABLED=true\nOptional HOME_ASSISTANT_ENTITIES auf gewünschte Lampen begrenzen.\nConnector mindestens v3; im Installationsordner ./update.sh ausführen.\n\nSicherheit\nDer Key gilt nur für Günnis feste Siri-Intent-Allowlist. Bitte nicht weiterleiten. Bei Verlust wird er rotiert.\n\nDie vollständige Anleitung und die secret-freie Vorlage sind angehängt.`;
const result=await transport.sendMail({from,to:recipient,subject:'AgentOne Günni: Siri, Kurzbefehle und Home-Assistant-Test',text,attachments:[{filename:'SIRI-GUENNI-SHORTCUTS.md',path:path.join(root,'docs','SIRI-GUENNI-SHORTCUTS.md')},{filename:'agentone-siri-shortcuts.zip',path:path.join(root,'output','connector','agentone-siri-shortcuts.zip')}],headers:{'X-AgentOne-Delivery':'task-specific-test-access'}});
console.log(JSON.stringify({sent:true,to:recipient,accepted:result.accepted?.includes(recipient)||false,messageId:result.messageId,attachments:2,masterSecretsIncluded:false,taskSpecificSiriKeyIncluded:true},null,2));
