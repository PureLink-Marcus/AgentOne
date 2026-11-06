import path from 'node:path';
import nodemailer from 'nodemailer';
import { loadEnv } from '../server/state.mjs';

const root=path.resolve('.'),env=loadEnv(root),to=String(env.AGENTONE_INSTRUCTION_RECIPIENT||'mw@ric2k.de'),port=Number(env.TECHHUB_SMTP_PORT||587);
if(to.toLowerCase()!=='mw@ric2k.de')throw new Error('Empfänger ist nicht freigegeben');
const transport=nodemailer.createTransport({host:env.TECHHUB_SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:env.MAIL_SMTP_USER||env.MAIL_ABSENDER,pass:env.MAIL_SMTP_PASSWORD},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:20_000,socketTimeout:30_000});
const text=`AgentOne Personal · Günni · Release 60\n\nApple Schnellstart ist live: iPhone-Pairing, Health-Zusammenfassungen, temporärer Standort, Kalender/Erinnerungen, Siri-Paket und Apple-Companion-Paket.\n\nGünni → Verbindungen → iPhone und Connector-Sicherheit → Apple Schnellstart.\n\nHome Assistant ist weiterhin LIVE/read-only, bis auf dem Raspberry ./update.sh und ./enable-home-control.sh ausgeführt wurden.\n\nKeine neuen Schlüssel und keine Master-Secrets sind Bestandteil dieser Nachricht.`;
const result=await transport.sendMail({from:env.TECHHUB_MAIL_FROM||env.MAIL_ABSENDER,to,subject:'Günni Release 60: Apple Schnellstart ist live',text,attachments:[{filename:'GUENNI-QUICKSTART.md',path:path.join(root,'docs','GUENNI-QUICKSTART.md')},{filename:'agentone-apple-companion.zip',path:path.join(root,'output','connector','agentone-apple-companion.zip')},{filename:'agentone-siri-shortcuts.zip',path:path.join(root,'output','connector','agentone-siri-shortcuts.zip')},{filename:'guenni-mobile.png',path:path.join(root,'output','demo','guenni-mail-mobile-release-60.png')}],headers:{'X-AgentOne-Delivery':'release-60-apple'}});
console.log(JSON.stringify({sent:true,to,accepted:result.accepted?.includes(to)||false,messageId:result.messageId,attachments:4,masterSecretsIncluded:false},null,2));
