import path from 'node:path';
import nodemailer from 'nodemailer';
import { loadEnv } from '../server/state.mjs';

const root=path.resolve('.'),env=loadEnv(root),to=String(env.AGENTONE_INSTRUCTION_RECIPIENT||'mw@ric2k.de');
const port=Number(env.TECHHUB_SMTP_PORT||587);
if(to.toLowerCase()!=='mw@ric2k.de')throw new Error('Empfänger ist nicht freigegeben');
const transport=nodemailer.createTransport({host:env.TECHHUB_SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:env.MAIL_SMTP_USER||env.MAIL_ABSENDER,pass:env.MAIL_SMTP_PASSWORD},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:20_000,socketTimeout:30_000});
const text=`AgentOne Personal · Günni · Release 58

Günni startet jetzt im Modus VOLLGAS. Memory, nützliche Connector-Freigaben, Tagesbriefing, Voice und freigegebene Home-Assistant-Komfortaktionen sind für den Test vorbereitet. Licht, Medien, Spotify, Sonos, Klima, Szenen und Automationen reagieren ohne zusätzlichen Browserdialog.

Unter Günni und Design → Günni Betriebsmodus kann SAFE manuell eingeschaltet werden. Dann fragt Günni Komfortaktionen wieder einzeln ab.

Schlösser, Alarm, Sirenen, irreversible Verwaltung, Secret-Export und vorhandene Connector-Allowlisten bleiben in beiden Modi geschützt.

Es wurden keine neuen Zugangsschlüssel erzeugt. Bestehende Testzugänge bleiben unverändert; Master-, Datenbank-, Coolify-, OpenAI- und Benutzerpasswörter sind nicht Bestandteil dieser Nachricht.`;
const result=await transport.sendMail({from:env.TECHHUB_MAIL_FROM||env.MAIL_ABSENDER,to,subject:'AgentOne Günni Release 58: VOLLGAS, Memory und SAFE-Schalter',text,attachments:[{filename:'GUENNI-FULL-POWER.md',path:path.join(root,'docs','GUENNI-FULL-POWER.md')},{filename:'guenni-full-power-settings.png',path:path.join(root,'output','demo','guenni-color-settings-release-58.png')}],headers:{'X-AgentOne-Delivery':'release-58-instructions'}});
console.log(JSON.stringify({sent:true,to,accepted:result.accepted?.includes(to)||false,messageId:result.messageId,attachments:2,newKeysIncluded:false,masterSecretsIncluded:false},null,2));
