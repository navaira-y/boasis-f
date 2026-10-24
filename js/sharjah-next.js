/* The Sharjah Next page · boasis.ae/sharjah-next
 *
 * This is the script from the event team's design file (spark-email's sibling, sharjah-next.html), with
 * its inline block lifted into this file because the site is served with script-src 'self'. Its palette,
 * its dictionary, its validation, its Enter-to-next keys and its copy are theirs, unchanged.
 *
 * What the button does is settled for now, and it is small: the four fields are posted to
 *
 *   POST /api/sharjah-lead        { first+last as full_name, email, phone, country_code, consent, source, _t }
 *
 * on this same host. That door writes one JSON file per person, mirrors it into Supabase as kind
 * 'sharjah_next' for the CSV, and answers with a reference (SN-XXXXXX) and the Brain's address.
 * Nothing is mailed unless someone turns that on, and no row is ever updated from here. The page then puts the reference in the link, and Mira in the
 * card where the form was, and stays where it is: no jump, nothing in the browser, no session to
 * resume. The pass, get-lead and the write-back from the Brain stay un wired until the backend is
 * explained; the files for them are already in demo/supabase and nothing here depends on them.
 *
 * Two things were added to the design after the first read through, both of them borrowed rather
 * than invented: the email and the number are checked by the same rules the site's own forms use
 * (below, and again in spark-core.js at the door, so the page and the server cannot disagree), and
 * the country code is the site's own picker from js/countries.js rather than the eighteen-option
 * list the file came with, so it searches and holds sixty.
 */
/* Mira's real address: the Brain, the same one /try-mira opens. It is framed by this page after the
   form, and only an http(s) address or a path on this host is accepted for it, below, because the
   door's answer is what ends up in a src attribute. */
const MIRA_URL = 'https://brain.boasis.ae';
/* the switch the shared preview needed, on: the form records the lead and Mira appears */
const SEND = true;
/* which offer the row is stamped with, so the two stands can be counted apart in one table */
const SOURCE = 'sharjah-next-2026';

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
  eFirst:'Please enter your first name.', eLast:'Please enter your last name.', eEmail:'Please enter a valid email.', ePhone:'Please enter a valid number.', eConsent:'Please tick the box to continue.',
  eBusy:'Too many tries just now. Wait a moment and press again.',
  eFail:'We could not send that. Press again, or ask us at the desk.'
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
/* the dial code comes from the site's own picker (js/countries.js): the closed control says the
   short form and the code, the open panel says the full name and a search box, and the hidden
   input beside the button is what the form posts. One file for all five forms on boasis.ae that
   ask for a number, so the list of countries is never a second truth to keep in step. */
const ccEl=form.querySelector('[data-cc]');
const picker=ccEl&&window.BoasisCountryPicker?window.BoasisCountryPicker.init(ccEl):null;
const code=()=>{const i=form.querySelector('input[name="country_code"]');return i&&i.value?i.value:'+971'};

/* the same rules as js/contact.js on the site's forms and lib/validate.js at the door, so what
   this page lets through is exactly what the server keeps. A number is seven to fifteen digits
   after the code, and the box holds digits only, because the code has its own control. */
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits=v=>String(v==null?'':v).replace(/\D/g,'');
function validEmail(v){
  const e=String(v==null?'':v).trim().toLowerCase();
  return !!e&&e.length<=254&&EMAIL_RE.test(e)&&!/\.{2,}/.test(e);
}
function validPhone(v){const d=digits(v);return d.length>=7&&d.length<=15}
function setErr(k,ek){const e=form.querySelector('[data-err="'+k+'"]'); if(!e) return; e.dataset.ek=ek||''; e.textContent=ek?t(ek):''}
function valid(){
  let ok=true; ['first_name','last_name','email','phone','consent'].forEach(k=>setErr(k,''));
  if(!F['first_name'].value.trim()){setErr('first_name','eFirst'); ok=false}
  if(!F['last_name'].value.trim()){setErr('last_name','eLast'); ok=false}
  if(!validEmail(F['email'].value)){setErr('email','eEmail'); ok=false}
  if(!validPhone(F['phone'].value)){setErr('phone','ePhone'); ok=false}
  if(!F['consent'].checked){setErr('consent','eConsent'); ok=false}
  if(!ok){const first=form.querySelector('.err:not(:empty)'); if(first&&first.parentElement&&first.parentElement.scrollIntoView) first.parentElement.scrollIntoView({behavior:'smooth',block:'center'})}
  return ok;
}
/* a field that is wrong about itself is told so as it is written, and goes quiet the moment it is
   right; an empty one stays quiet until the send, when "required" is the honest thing to say */
F['email'].addEventListener('input',()=>{
  const e=F['email'].value.trim();
  setErr('email', e&&!validEmail(e)?'eEmail':'');
});
F['phone'].addEventListener('input',()=>{
  const raw=F['phone'].value, d=digits(raw);
  if(d!==raw) F['phone'].value=d;   /* the code lives in the picker: nothing else belongs in the box */
  setErr('phone', d&&!validPhone(d)?'ePhone':'');
});
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
  data.country_code=code();
  data.phone=digits(data.phone);
  data.email=String(data.email||'').trim().toLowerCase();
  data._t=Math.max(1,Date.now()-opened);   /* how long the form was open, for the door to judge */
  let j=null;
  try{
    if(SEND){
      const r=await fetch(form.dataset.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      j=await r.json().catch(()=>null);
    }
  }catch(err){}
  /* the door answers with the reference the three mails show; without it nothing was written, so the
     button comes back and the person is told, rather than being sent to Mira with no record */
  const ref=(j&&j.ok!==false)?cleanRef(j.ref):'';
  /* the door judges the same fields, and says which one it refused; the note goes under that field
     rather than joining the button, and a refusal we cannot name still says something */
  const REFUSE={email:['email','eEmail'],phone:['phone','ePhone'],full_name:['first_name','eLast'],consent:['consent','eConsent']};
  if(SEND&&!ref){
    if(btn) btn.disabled=false;
    const bad=REFUSE[j&&j.error];
    if(bad) setErr(bad[0],bad[1]);
    say(j&&j.error==='limited'?T[L()].eBusy:T[L()].eFail);
    return;
  }
  const url=safeBase(j&&j.brain_url)||safeBase(MIRA_URL);
  document.getElementById('miraLink').href=url||'#';
  document.getElementById('formView').style.display='none';
  document.getElementById('doneView').classList.add('on');
  const card=document.getElementById('start'); if(card&&card.scrollIntoView) card.scrollIntoView({behavior:'smooth',block:'start'});
  /* and Mira opens in the card itself. No jump: the reference, the receipt and this conversation are
     meant to be on one screen, on the phone they are holding at the stand. */
  openFrame(url, ref);
});

/* ── what a submission leaves behind ────────────────────────────────────────────
   The reference the mails and this page show is made by the door, in the shape the design drew. Until
   the backend is settled it is the only identifier, so nothing here stores a pass, reads a record
   back, or keeps anything in the browser: a second submission is a second person's row, and that is
   what the stand wants while the rest is undecided. */
function cleanRef(v){return String(v||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)}
/* only an http(s) address, or a path on this very host, is ever framed or linked, whatever the door
   answered: a line of code in a src attribute is still a line of code, and the rehearsal answers with
   a relative address on purpose so that it never reaches the live Brain */
function safeBase(v){
  const s=String(v||'').trim();
  if(!/^https?:\/\/[^\s"'<>]+$/.test(s)&&!/^\/[^\s"'<>]*$/.test(s)) return '';
  return s.length>1?s.replace(/\/+$/,''):s;
}
/* Mira appears where the form was. The address is written only now, so a person who reads the offer
   and walks away never asks the Brain for anything. */
function openFrame(url, ref){
  const f=document.getElementById('miraFrame'); if(!f) return;
  const base=safeBase(url)||safeBase(f.dataset.src)||safeBase(MIRA_URL);
  if(!base) return;
  /* the reference rides along, so Mira can greet the person by it, and it is checked to look like one
     before it goes anywhere, because it came from a form field one hop away */
  f.src=base+(base.indexOf('?')<0?'?':'&')+'src=sharjah-next'
    +(/^[A-Za-z0-9-]{3,24}$/.test(String(ref||''))?'&ref='+encodeURIComponent(ref):'');
}

/* the design has no slot for a message that is not about a field, so one is made rather than adding
   markup to the page: same class the other errors use, so it looks like it belongs */
function say(msg){
  let n=form.querySelector('[data-note]');
  if(!n&&msg){n=document.createElement('p');n.className='err';n.dataset.note='1';
    form.insertBefore(n,form.querySelector('.cta'))}
  if(n) n.textContent=msg||'';
}

const opened=Date.now();
root.lang='en'; paint();
