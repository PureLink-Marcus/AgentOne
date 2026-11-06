import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const root=path.resolve('.'),master=path.join(root,'master','env','.env.master');
const env=loadEnv(root),tailscaleKey=env.TAILSCALE_HOME_AUTH_KEY;
if(!/^tskey-auth-[A-Za-z0-9-]+$/.test(String(tailscaleKey||'')))throw new Error('TAILSCALE_HOME_AUTH_KEY fehlt');
const connectorToken=env.AGENTONE_GUENNI_HOME_CONNECTOR_TOKEN||env.HOME_CONNECTOR_TOKEN;
if(!connectorToken)throw new Error('Vorhandener Pi-Token fehlt: AGENTONE_GUENNI_HOME_CONNECTOR_TOKEN setzen. Es wird absichtlich kein Ersatz-Token erzeugt.');
const values={AGENTONE_GUENNI_HOME_CONNECTOR_URL:'http://agentone-home-connector.tailbece5a.ts.net:8787',AGENTONE_GUENNI_HOME_CONNECTOR_TOKEN:connectorToken};
let text=fs.readFileSync(master,'utf8');
for(const [name,value] of Object.entries(values)){const line=`${name}=${value}`,pattern=new RegExp(`^${name}=.*$`,'m');text=pattern.test(text)?text.replace(pattern,line):`${text.replace(/\s*$/,'')}\n${line}\n`;}
fs.writeFileSync(master,text,{encoding:'utf8',mode:0o600});
const target=path.join(root,'output','connector','agentone-home-connector.private.env');
fs.writeFileSync(target,`TAILSCALE_AUTH_KEY=${tailscaleKey}\nCONNECTOR_TOKEN=${connectorToken}\nHOME_ASSISTANT_URL=http://homeassistant.local:8123\nHOME_ASSISTANT_TOKEN=\nHOME_ASSISTANT_DOMAINS=sensor,binary_sensor,weather,calendar,todo,media_player,light,climate\n`,{encoding:'utf8',mode:0o600});
console.log('Private Pi-ENV und Günni-Connector-Konfiguration ohne Secret-Ausgabe vorbereitet.');
