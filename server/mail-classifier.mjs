function headerText(headers,name){
  if(!headers)return '';
  if(Array.isArray(headers)){
    const values=headers.filter(item=>String(item?.name||'').toLowerCase()===name.toLowerCase()).map(item=>item?.value);
    return values.filter(Boolean).map(String).join(' ');
  }
  const value=headers instanceof Map?(headers.get(name)??headers.get(name.toLowerCase())):headers[name]??headers[name.toLowerCase()];
  if(Array.isArray(value))return value.map(String).join(' ');
  if(value&&typeof value==='object')return JSON.stringify(value);
  return String(value||'');
}

export function classifyMail({sender='',subject='',headers=null}={}){
  const from=String(sender).toLowerCase(),title=String(subject).toLowerCase(),signals=[];
  const spam=`${headerText(headers,'x-spam-flag')} ${headerText(headers,'x-spam-status')} ${headerText(headers,'x-bogosity')}`.toLowerCase();
  const listId=headerText(headers,'list-id'),unsubscribe=headerText(headers,'list-unsubscribe'),precedence=headerText(headers,'precedence').toLowerCase(),autoSubmitted=headerText(headers,'auto-submitted').toLowerCase(),auth=headerText(headers,'authentication-results').toLowerCase();
  if(/(?:^|\s)(?:yes|spam|true)(?:\s|$)/.test(spam)||/^\s*\[spam\]/i.test(subject)){signals.push('provider-spam-header');return {category:'spam',confidence:.98,signals};}
  const authenticationFailed=/(?:spf|dkim|dmarc)=fail/.test(auth),suspicious=/(?:casino|crypto giveaway|lottery|gewinnspiel|adult|viagra|wallet verification|seed phrase)/.test(`${from} ${title}`);
  if(suspicious||(authenticationFailed&&/(?:urgent|sofort|konto gesperrt|verify|bestätigen)/.test(title))){if(suspicious)signals.push('spam-pattern');if(authenticationFailed)signals.push('authentication-failed');return {category:'spam',confidence:suspicious&&authenticationFailed?.96:.88,signals,needsReview:true};}
  if(/(?:rechnung|invoice|bestellung|order|versand|tracking|zahlung|payment|kontoauszug|ticket|buchungsbestätigung|receipt|quittung|lieferung|reservation)/.test(title)){signals.push('transaction-subject');return {category:'transactions',confidence:.88,signals};}
  if(listId||unsubscribe||/bulk|list|junk/.test(precedence)||autoSubmitted&&autoSubmitted!=='no'||/^(?:no-?reply|newsletter|marketing)@/.test(from)||/(?:newsletter|abbestellen|angebote|sale|digest|weekly|daily update)/.test(title)){if(listId)signals.push('list-id');if(unsubscribe)signals.push('list-unsubscribe');if(precedence)signals.push('precedence');if(autoSubmitted&&autoSubmitted!=='no')signals.push('auto-submitted');return {category:'newsletters',confidence:(listId||unsubscribe)?0.94:0.82,signals};}
  if(/dmarc=pass/.test(auth))signals.push('dmarc-pass');
  if(/dkim=pass/.test(auth))signals.push('dkim-pass');
  if(/spf=pass/.test(auth))signals.push('spf-pass');
  const authenticated=signals.some(signal=>/-pass$/.test(signal));
  signals.push(authenticated?'person-authenticated':'person-unverified');
  return {category:'people',confidence:authenticated?.86:.58,signals,needsReview:!authenticated};
}

export function emptyMailGroups(){return {people:[],newsletters:[],transactions:[],spam:[]};}
