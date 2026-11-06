import fs from 'node:fs';
import path from 'node:path';

const inventory=JSON.parse(fs.readFileSync(path.resolve('output/demo/openclaw-plugin-inventory.json'),'utf8'));
const clean=source=>(source?.plugins||[]).map(item=>({id:item.id,name:item.name,status:item.status,description:item.description,tools:item.tools,channels:item.channels,providers:item.providers}));
const catalogs=Object.fromEntries(Object.entries(inventory.instances||{}).map(([id,item])=>[id,clean(item)]));
const fallback=catalogs['agentone-personal']||catalogs.fressi||catalogs.guenni||[];
fs.writeFileSync(path.resolve('server/openclaw-plugin-catalog.generated.mjs'),`// Generated from the live OpenClaw 2026.10.8 registries.\nexport const openClawPluginCatalog=${JSON.stringify(fallback,null,2)};\nexport const openClawPluginCatalogByInstance=${JSON.stringify(catalogs,null,2)};\n`);
console.log(`OpenClaw-Kataloge für ${Object.keys(catalogs).length} Instanzen mit je ${fallback.length} Plugins erzeugt.`);
