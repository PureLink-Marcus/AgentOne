const allowedModels=new Set(['gpt-6-luna','gpt-6.1-terra','gpt-6.1-sol']);

export function responseText(payload){
  return (payload?.output||[]).flatMap(item=>item?.content||[]).filter(part=>part?.type==='output_text').map(part=>part.text).join('\n').trim();
}

export async function personalReply({prompt,apiKey,primaryModel='gpt-6-luna',fallbackModel='gpt-6.1-sol',fetchImpl=fetch}){
  if(!apiKey)return {text:'Ich habe deine Anfrage aufgenommen und verteile sie im Demomodus an die passenden Welt-AgentOne.',model:'simulator',mode:'SIMULATED'};
  const models=[primaryModel,fallbackModel].filter((model,index,list)=>allowedModels.has(model)&&list.indexOf(model)===index);
  if(!models.length)throw Object.assign(new Error('Kein erlaubtes Personal-Modell konfiguriert'),{status:503});
  let lastError='Modellanfrage fehlgeschlagen';
  for(const model of models){
    try{
      const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,store:false,reasoning:{effort:'low'},max_output_tokens:500,instructions:'Du bist AgentOne Personal, der persönliche PureLink-Assistent. Antworte auf Deutsch, klar und knapp. Erfinde keine Unternehmensdaten. Unterscheide bekannte Fakten, Annahmen und notwendige Freigaben. Produktionsänderungen dürfen nur vorgeschlagen, nie eigenständig bestätigt werden.',input:prompt}),signal:AbortSignal.timeout(45_000)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok){lastError=`${model}: HTTP ${response.status}`;continue;}
      const text=responseText(payload);if(!text){lastError=`${model}: leere Antwort`;continue;}
      return {text,model,mode:'LIVE'};
    }catch(error){lastError=`${model}: ${String(error?.name||'Fehler')}`;}
  }
  throw Object.assign(new Error(lastError),{status:502});
}
