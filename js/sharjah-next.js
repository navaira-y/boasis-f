/* Mira's real address: the Brain, the same one /try-mira opens. Only an http(s) page is accepted,
   below, because this string ends up in a link a person taps and in location.href. */
const MIRA_URL = 'https://brain.boasis.ae';
/* the switch the shared preview needed, on: the form sends and the person is taken to Mira */
const SEND = true;
/* which entrance this is, and where a pass is minted. `page` is the one extra field the door needs to
   put the row in public.sharjah_next_leads rather than the AI Everything table. */
const SOURCE = 'sharjah-next-2026';
const PAGE = 'sharjah-next';

const T={
 en:{
  hello:"Hi. I'm Mira. A few details, and we start.",
  first:'First name', last:'Last name', email:'Email', mobile:'Mobile number',
  consent:'I agree that SPARK and Boasis may contact me about my project.',
  cta:'Start with Mira',
  doneH:'Mira is ready for you', doneP:"If she didn't open automatically, tap below.", open:'Talk to Mira',
  offEy:'Sharjah Next offer · 28 & 29 Oct', offH:'Your SPARK company, at the event price',
  y1:'year 1', y2:'from, year 1',
  b1:'1 activity', b2:'1 shareholder', b3:'Free lease',
  p1:'Up to 3 activities', p2:'Up to 3 shareholders', p3:'Visa options',
  secL:'For these 6 sectors', s1:'Sustainability', s2:'Advanced Manufacturing', s3:'Mobility & Logistics', s4:'Healthcare', s5:'AI & Digital Transformation', s6:'Creative',
  howEy:'How it works',
  st1:'Tell Mira what you do', st1s:'In your own words, typed or spoken.',
  st2:'Choose your activities', st2s:'Mira suggests them. Your package shows on top.',
  st3:'Get your reference number', st3s:'On screen, and by email.',
  st4:'Finish in Zone 2, Block B', st4s:'Show your reference, apply and pay. Follow the green signs.',
  today:'<b>Open on 28 and 29 October only.</b> Complete your payment in Zone 2 before you leave.',
  sig:'Powered by',
  eFirst:'Please enter your first name.', eLast:'Please enter your last name.', eEmail:'Please enter a valid email.', ePhone:'Please enter a valid number.', eConsent:'Please tick the box to continue.'
 }
};
const root=document.documentElement;
function L(){return root.lang==='en'?'en':'fr'}
function t(k){return T[L()][k]||T.en[k]||''}
function paint(){
  document.querySelectorAll('[data-k]').forEach(el=>{el.innerHTML=t(el.dataset.k)});
  document.querySelectorAll('[data-err]').forEach(el=>{if(el.dataset.ek) el.textContent=t(el.dataset.ek)});
}

const form=document.getElementById('snForm'), F=form.elements;
function setErr(k,ek){const e=form.querySelector('[data-err="'+k+'"]'); if(!e) return; e.dataset.ek=ek||''; e.textContent=ek?t(ek):''}
function valid(){
  let ok=true; ['first_name','last_name','email','phone','consent'].forEach(k=>setErr(k,''));
  if(!F['first_name'].value.trim()){setErr('first_name','eFirst'); ok=false}
  if(!F['last_name'].value.trim()){setErr('last_name','eLast'); ok=false}
  if(!/^\S+@\S+\.\S+$/.test(F['email'].value.trim())){setErr('email','eEmail'); ok=false}
  if(F['phone'].value.replace(/\D/g,'').length<6){setErr('phone','ePhone'); ok=false}
  if(!F['consent'].checked){setErr('consent','eConsent'); ok=false}
  if(!ok){const first=form.querySelector('.err:not(:empty)'); if(first&&first.parentElement&&first.parentElement.scrollIntoView) first.parentElement.scrollIntoView({behavior:'smooth',block:'center'})}
  return ok;
}
/* Sur téléphone, "Suivant" sur le clavier passe au champ d'après au lieu d'envoyer */
['first_name','last_name','email'].forEach((k,i,a)=>F[k].addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault(); (i<a.length-1?F[a[i+1]]:F['phone']).focus()}
}));
form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(F['hp'].value) return;
  if(!valid()) return;
  document.activeElement && document.activeElement.blur();
  const btn=form.querySelector('.cta'); if(btn) btn.disabled=true; say('');
  const data=Object.fromEntries(new FormData(form)); delete data.hp; data.source=SOURCE;
  /* the two fields the design drew, joined into the one name every door on this site reads, so the
     record has the same shape as the other entrance's */
  data.full_name=(data.first_name.trim()+' '+data.last_name.trim()).replace(/\s+/g,' ').trim();
  data.page=PAGE;
  data._t=Math.max(1,Date.now()-opened);   /* how long the form was open, for the door to judge */
  let j=null;
  try{
    if(SEND){
      const r=await fetch(form.dataset.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      j=await r.json().catch(()=>null);
    }
  }catch(err){}
  const pass=(j&&j.ok!==false)?clean(j.pass):'';
  if(SEND&&!pass){if(btn) btn.disabled=false; say(j&&j.error==='limited'?T[L()].eBusy:T[L()].eFail); return;}
  if(pass){remember(pass); thanks(pass);}
  const url=brainUrl(pass);
  document.getElementById('miraLink').href=url;
  document.getElementById('formView').style.display='none';
  document.getElementById('doneView').classList.add('on');
  const card=document.getElementById('start'); if(card&&card.scrollIntoView) card.scrollIntoView({behavior:'smooth',block:'start'});
  /* en local, on reste sur l'écran de confirmation pour relire */
  if(SEND) setTimeout(()=>{location.href=url},900);
});

/* ── the pass, and the few lines that carry a person to Mira and back ─────────
     The pass is the whole credential: it is what the Brain needs to know whose journey this is and what
     get-lead needs to hand the record back, so it goes in the address and nowhere else. One row per
     person: the door reuses it, so a second scan hands back the same pass and the same visit. */
const LS='boasis.sharjah-next.v1', DAY=24*60*60*1000, PASS_RE=/^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
function clean(v){return String(v||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,64)}
function safeBase(v){const s=String(v||'').trim();return /^https?:\/\/[^\s"'<>]+$/.test(s)?s.replace(/\/+$/,''):''}
function brainUrl(pass){const base=safeBase(MIRA_URL);return base&&pass?base+(base.indexOf('?')<0?'?':'&')+'pass='+encodeURIComponent(pass):'#'}
function remember(pass){try{localStorage.setItem(LS,JSON.stringify({pass:pass,at:Date.now()}))}catch(e){}}
function forget(){try{localStorage.removeItem(LS)}catch(e){}}
function kept(){
  let s=null; try{s=JSON.parse(localStorage.getItem(LS)||'null')}catch(e){return ''}
  if(!s||!PASS_RE.test(String(s.pass||''))||Date.now()-Number(s.at||0)>DAY){forget();return ''}
  return s.pass;
}
/* one receipt per person, and the door marks the pass, so this is fired and forgotten; keepalive
   because the page is about to leave for Mira */
function thanks(pass){
  if(!pass||!/^https?:/.test(location.protocol)) return;
  try{fetch('/api/spark-thanks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass:pass}),keepalive:true}).catch(function(){})}catch(e){}
}
/* the design has no slot for a message that is not about a field, so one is made rather than adding
   markup to the page: same class the other errors use, so it looks like it belongs */
function say(msg){
  let n=form.querySelector('[data-note]');
  if(!n&&msg){n=document.createElement('p');n.className='err';n.dataset.note='1';
    form.insertBefore(n,form.querySelector('.cta'))}
  if(n) n.textContent=msg||'';
}
/* came back, or re-scanned the same QR: the pass is still theirs, so Mira opens instead of the form */
(function returning(){
  const pass=kept(); if(!pass) return;
  document.getElementById('miraLink').href=brainUrl(pass);
  document.getElementById('formView').style.display='none';
  document.getElementById('doneView').classList.add('on');
  const door=(form.dataset.endpoint||'').replace(/create-pass[^/]*$/,'get-lead');
  if(!SEND||!/^https?:/.test(door)) return;
  fetch(door+'?pass='+encodeURIComponent(pass)).then(r=>r.json().catch(()=>null)).then(j=>{
    if(!j||j.ok!==false) return;
    forget();
    document.getElementById('doneView').classList.remove('on');
    document.getElementById('formView').style.display='';
    say(T[L()].eGone);
  }).catch(function(){});   /* no answer is not a reason to lose their place */
})();

const opened=Date.now();
root.lang='en'; paint();
