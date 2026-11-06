function headerText(headers,name){
  if(!headers)return '';
  const value=headers instanceof Map?headers.get(name):headers[name]??headers[name.toLowerCase()];
  if(Array.isArray(value))return value.map(String).join(' ');
  if(value&&typeof value==='object')return JSON.stringify(value);
  return String(value||'');
}

export function classifyMail({sender='',subject='',headers=null}={}){
  const from=String(sender).toLowerCase(),title=String(subject).toLowerCase(),signals=[];
  const spam=`${headerText(headers,'x-spam-flag')} ${headerText(headers,'x-spam-status')} ${headerText(headers,'x-bogosity')}`.toLowerCase();
  const listId=headerText(headers,'list-id'),unsubscribe=headerText(headers,'list-unsubscribe'),precedence=headerText(headers,'precedence').toLowerCase(),autoSubmitted=headerText(headers,'auto-submitted').toLowerCase(),auth=headerText(headers,'authentication-results').toLowerCase();
  if(/(?:^|\s)(?:yes|spam|true)(?:\s|$)/.test(spam)||/^\s*\[spam\]/i.test(subject)){signals.push('provider-spam-header');return {category:'spam',confidence:.98,signals};}
  if(/(?:casino|crypto giveaway|lottery|gewinnspiel|adult|viagra)/.test(`${from} ${title}`)){signals.push('spam-pattern');return {category:'spam',confidence:.88,signals};}
  if(/(?:rechnung|invoice|bestellung|order|versand|tracking|zahlung|payment|kontoauszug|ticket|buchungsbestätigung|receipt)/.test(title)){signals.push('transaction-subject');return {category:'transactions',confidence:.88,signals};}
  if(listId||unsubscribe||/bulk|list|junk/.test(precedence)||autoSubmitted&&autoSubmitted!=='no'||/^(?:no-?reply|newsletter|marketing)@/.test(from)||/(?:newsletter|abbestellen|angebote|sale|digest|weekly|daily update)/.test(title)){if(listId)signals.push('list-id');if(unsubscribe)signals.push('list-unsubscribe');if(precedence)signals.push('precedence');if(autoSubmitted&&autoSubmitted!=='no')signals.push('auto-submitted');return {category:'newsletters',confidence:(listId||unsubscribe)?0.94:0.82,signals};}
  if(/dmarc=pass/.test(auth))signals.push('dmarc-pass');
  if(/dkim=pass/.test(auth))signals.push('dkim-pass');
  signals.push('person-default');return {category:'people',confidence:signals.length>1?.8:.68,signals};
}

export function emptyMailGroups(){return {people:[],newsletters:[],transactions:[],spam:[]};}
