import path from 'node:path';
import nodemailer from 'nodemailer';
import { loadEnv } from '../server/state.mjs';

const root=path.resolve('.'),env=loadEnv(root),to=String(env.AGENTONE_INSTRUCTION_RECIPIENT||'mw@ric2k.de'),port=Number(env.TECHHUB_SMTP_PORT||587);
if(to.toLowerCase()!=='mw@ric2k.de')throw new Error('Empfänger ist nicht freigegeben');
const transport=nodemailer.createTransport({host:env.TECHHUB_SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:env.MAIL_SMTP_USER||env.MAIL_ABSENDER,pass:env.MAIL_SMTP_PASSWORD},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:20_000,socketTimeout:30_000});
const text=`AgentOne Personal · Günni · Release 59\n\nSchnellstart für Raspberry/Home Assistant, Gmail ohne OAuth-Client sowie Apple/Siri/iPhone ist angehängt.\n\nWichtig: Google OAuth ist bewusst nicht erforderlich. Gmail wird mit E-Mail-Adresse und Google-App-Passwort verbunden.\n\nDer Connector enthält jetzt ./enable-home-control.sh für Lichtfarben, Weißtemperatur, Spotify, Sonos, Klima, Szenen und Automationen.\n\nEs wurden keine neuen Schlüssel erzeugt und keine Master-Secrets versendet.`;
const result=await transport.sendMail({from:env.TECHHUB_MAIL_FROM||env.MAIL_ABSENDER,to,subject:'Günni Release 59: Schnellstart für Home, Gmail und Apple',text,attachments:[{filename:'GUENNI-QUICKSTART.md',path:path.join(root,'docs','GUENNI-QUICKSTART.md')},{filename:'agentone-home-connector-raspberry.zip',path:path.join(root,'output','connector','agentone-home-connector-raspberry.zip')},{filename:'agentone-siri-shortcuts.zip',path:path.join(root,'output','connector','agentone-siri-shortcuts.zip')}],headers:{'X-AgentOne-Delivery':'release-59-quickstart'}});
console.log(JSON.stringify({sent:true,to,accepted:result.accepted?.includes(to)||false,messageId:result.messageId,attachments:3,masterSecretsIncluded:false},null,2));
