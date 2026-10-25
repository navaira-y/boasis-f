/* The Sharjah Next page · boasis.ae/sharjah-next
 *
 * This is the script from the event team's design file (spark-email's sibling, sharjah-next.html), with
 * its inline block lifted into this file because the site is served with script-src 'self'. Its palette,
 * its dictionary, its validation, its Enter-to-next keys and its copy are theirs, unchanged.
 *
 * What the button does is settled for now, and it is small: the four fields are posted to
 *
 *   POST /api/sharjah-lead        { first+last as full_name, email, phone, country_code, consent, source, emailv, _t }
 *
 * on this same host. That door writes one JSON file per person, mirrors it into Supabase as kind
 * 'sharjah_next' for the CSV, and answers with a reference (SN-XXXXXX) and the Brain's address.
 * Nothing is mailed unless someone turns that on, and no row is ever updated from here. With
 * `SPARK_SN_PASS=on` the same answer also carries a pass, minted by the door from `create-pass` with
 * `page: 'sharjah-next'`, and the page puts that in Mira's address so the visit is written on the
 * person's own row, the way `/try-mira` does; the stand's rows are what `docs/SHEET.md` flattens into
 * boss's Google sheet. With no pass Mira opens on the reference alone, which is the same page
 * as before, so a project that is asleep costs a write back and never a lead.
 *
 * The page stays where it is: no jump, nothing in the browser, no session to resume. At a stand the
 * device is often not the visitor's own, so a pass kept in a browser is a pass the next stranger gets;
 * the way back to a row here is the address, which `create-pass` already looks up for a second scan.
 *
 * Two things were added to the design after the first read through, both of them borrowed rather
 * than invented: the email and the number are checked by the same rules the site's own forms use
 * (below, and again in spark-core.js at the door, so the page and the server cannot disagree), and
 * the country code is the site's own picker from js/countries.js rather than the eighteen-option
 * list the file came with, so it searches and holds the whole list. The number is then judged
 * against that pick, by the length table that lives beside the same list: a nine digit number is a
 * full number in Sharjah and one short in India, and the field says so while they type. The door
 * keeps the loose seven to fifteen on purpose, so a lead is never refused over a length table.
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
  doneH:'Mira is ready for you', doneP:"If Mira didn't open automatically, tap below.", open:'Talk to Mira',
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
  vSend:'Verify my email', vAgain:'Send another code', vBusy:'One moment',
  vCode:'Six digit code', vCheck:'Check', vSent:'Code on its way to your inbox', vOk:'Verified', vSoon:'Next code in',
  eCode:'That is not the code. Read it once more and press Check.',
  eTries:'Three tries is enough for now. Ask for a new code in a minute.',
  eSend:'The code did not go out. Press again, or ask us at the desk.',
  eVerify:'Please verify your email first.',
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
   this page lets through is exactly what the server keeps. The box holds digits only, because the
   code has its own control, and a number is judged against that control: nine digits for +971, ten
   for +91, the range written once in js/countries.js beside the list itself. So a half-typed number
   reads as invalid until it reaches the length of the country they picked, and goes quiet on the
   digit that finishes it. */
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits=v=>String(v==null?'':v).replace(/\D/g,'');
function validEmail(v){
  const e=String(v==null?'':v).trim().toLowerCase();
  return !!e&&e.length<=254&&EMAIL_RE.test(e)&&!/\.{2,}/.test(e);
}
/* the picker's file carries the ranges; without it (an old copy in a tablet's cache) the loose
   seven to fifteen is still the rule, so a missing file is never a closed form */
const CP=window.BoasisCountryPicker||null;
function validPhone(v){const d=digits(v);return d.length>=7&&d.length<=15}
function phoneState(v){
  const d=digits(v);
  if(!d) return {empty:true, ok:false};
  if(!CP||typeof CP.ok!=='function') return {empty:false, ok:validPhone(d)};
  return {empty:false, ok:CP.ok(code(), d).valid};
}
function setErr(k,ek){const e=form.querySelector('[data-err="'+k+'"]'); if(!e) return; e.dataset.ek=ek||''; e.textContent=ek?t(ek):''}
function valid(){
  let ok=true; ['first_name','last_name','email','phone','consent'].forEach(k=>setErr(k,''));
  if(!F['first_name'].value.trim()){setErr('first_name','eFirst'); ok=false}
  if(!F['last_name'].value.trim()){setErr('last_name','eLast'); ok=false}
  if(!validEmail(F['email'].value)){setErr('email','eEmail'); ok=false}
  if(!phoneState(F['phone'].value).ok){setErr('phone','ePhone'); ok=false}
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
  const st=phoneState(d);
  setErr('phone', st.empty||st.ok?'':'ePhone');
});
/* and the other way round: switching the code rejudges the number that is already typed, so a full
   Indian number says so the moment the picker moves to the UAE, instead of waiting for a keystroke */
function rejudgePhone(){
  const st=phoneState(F['phone'].value);
  setErr('phone', st.empty||st.ok?'':'ePhone');
}
if(ccEl) ccEl.addEventListener('codechange', rejudgePhone);
/* Sur téléphone, "Suivant" sur le clavier passe au champ d'après au lieu d'envoyer */
['first_name','last_name','email'].forEach((k,i,a)=>F[k].addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault(); (i<a.length-1?F[a[i+1]]:F['phone']).focus()}
}));
/* ── the mailbox check ─────────────────────────────────────────────────────────────
   Last event a number of people typed an address they cannot open, so the code the early access form
   already sends is sent here too. Nothing is invented for it: the same two doors on this host
   (POST /api/verify-email/send, POST /api/verify-email/verify), the same six digits, the same signed
   proof that rides back onto the lead as `emailv` and is spent once when the record is written. The
   code itself is never kept here, only that proof, and it is good for five minutes.
   The page does not decide who may submit, the door does. That way one value on the server,
   VERIFY_REQUIRE_FOR_MANAGE, takes the check away from both forms in a morning when the mail is
   stuck, without a new copy of this file. What the page adds is the invitation: a button under the
   email, and the code box that appears only once a code is on its way. */
const vBox=form.querySelector('[data-vcode]'), vBtn=form.querySelector('[data-sendcode]');
const cBtn=form.querySelector('[data-verifycode]'), vStat=form.querySelector('[data-vstat]');
const codeIn=document.getElementById('vcode');
/* an old copy of the page in a tablet's cache has no such field, so the proof is read from a field
   that simply holds nothing rather than from a missing one: every other check in here is already
   written to survive an element that is not there */
const vToken=F['emailv']||{value:''};
let vBusy=false, vTimer=null, vFor='';
function vSay(msg,ok){ if(vStat){ vStat.textContent=msg||''; vStat.classList.toggle('ok',!!ok) } }
function openBox(){ if(vBox) vBox.hidden=false; if(codeIn) codeIn.focus() }
function vStop(){ if(vTimer){ clearInterval(vTimer); vTimer=null } }
/* the minute the door makes anyone wait between codes, counted where it can be seen, so nobody
   presses a button that is only going to say no */
function vLock(secs){
  if(!vBtn) return;
  vStop();
  let left=Math.max(0,Math.round(secs||0));
  const label=()=>{
    vBtn.disabled=left>0;
    vBtn.textContent=left>0?(t('vSoon')+' '+left+'s'):(vToken.value?t('vAgain'):t('vSend'));
  };
  label();
  if(left>0) vTimer=setInterval(()=>{ left-=1; label(); if(left<=0) vStop() },1000);
}
async function vPost(url,body){
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,j:await r.json().catch(()=>null)};
  }catch(e){ return {status:0,j:null} }
}
function why(j){ return (j&&j.errors&&j.errors[0])||'' }
async function requestCode(){
  if(!vBtn||vBusy) return;
  vBtn.hidden=false;
  const e=F['email'].value.trim();
  if(!validEmail(e)){ setErr('email','eEmail'); F['email'].focus(); return }
  setErr('email',''); setErr('code','');
  vBusy=true; vBtn.disabled=true; vBtn.textContent=t('vBusy');
  const r=await vPost('/api/verify-email/send',{email:e,hp:F['hp'].value,_t:opened});
  vBusy=false;
  if(r.status!==200||!r.j||!r.j.ok){
    vBtn.textContent=t('vSend');
    /* too soon is not a failure to read out loud, the button is already counting the wait; any
       other no is, because it means nothing arrived and the person should know it here */
    vSay(why(r.j)==='too-soon'?'':t('eSend'));
    vLock((r.j&&r.j.retryIn)||6); return;
  }
  vToken.value=''; vFor=''; if(codeIn) codeIn.value='';
  openBox(); vSay(t('vSent')); vLock(60);
  /* a box that mails nobody hands its code back, so a rehearsal can still be walked all the way
     through; wherever the mail is real the page says nothing about the code at all */
  if(r.j.devCode&&codeIn) codeIn.value=r.j.devCode;
}
async function checkCode(){
  if(vBusy||!codeIn) return;
  const c=digits(codeIn.value);
  if(c.length!==6){ setErr('code','eCode'); return }
  setErr('code','');
  vBusy=true; if(cBtn){ cBtn.disabled=true; cBtn.textContent=t('vBusy') }
  const r=await vPost('/api/verify-email/verify',{email:F['email'].value.trim(),code:c});
  vBusy=false; if(cBtn){ cBtn.disabled=false; cBtn.textContent=t('vCheck') }
  if(r.status===200&&r.j&&r.j.ok&&r.j.token){
    vToken.value=r.j.token; vFor=F['email'].value.trim().toLowerCase();
    if(vBox) vBox.hidden=true; codeIn.value=''; vStop();
    vSay(t('vOk')+' \u00b7 '+vFor,true);
    /* and the button goes away rather than sitting there offering a second code: nothing is
       missing, and the one thing that can still go wrong, the proof going stale while somebody
       is talked at, brings it back by itself at the submit that needs it */
    if(vBtn){ vBtn.hidden=true; vBtn.disabled=false }
    return;
  }
  vToken.value=''; vFor=''; vSay('');
  /* the address can be emptied or edited between the two clicks, and then the door is right and the
     code box is not, so the note goes where the mistake is */
  if(why(r.j)==='email'){ setErr('code',''); setErr('email','eEmail'); F['email'].focus(); return }
  setErr('code',why(r.j)==='attempts'?'eTries':'eCode');
  if(codeIn) codeIn.select();
}
if(vBtn) vBtn.addEventListener('click',requestCode);
if(cBtn) cBtn.addEventListener('click',checkCode);
if(codeIn){
  codeIn.addEventListener('input',()=>{
    const c=digits(codeIn.value); if(c!==codeIn.value) codeIn.value=c;
    setErr('code','');
    if(c.length===6) checkCode();
  });
  codeIn.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); checkCode() } });
}
/* a code is a proof about one address: move a digit in the email and it stops being true, so the
   proof is dropped here rather than carried to the door to be refused */
F['email'].addEventListener('change',()=>{
  if(!vFor) return;
  if(F['email'].value.trim().toLowerCase()!==vFor){
    /* and the wait is dropped with it, because a different address is a different mailbox and the
       door is only ever strict about the one that just asked */
    vFor=''; vToken.value=''; vSay(''); vStop();
    if(vBtn){ vBtn.hidden=false; vBtn.disabled=false; vBtn.textContent=t('vSend') }
    if(codeIn) codeIn.value='';
    setErr('code',''); openBox();
  }
});

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
  const REFUSE={email:['email','eEmail'],phone:['phone','ePhone'],full_name:['first_name','eLast'],consent:['consent','eConsent'],emailv:['email','eVerify']};
  if(SEND&&!ref){
    if(btn) btn.disabled=false;
    const bad=REFUSE[j&&j.error];
    if(bad) setErr(bad[0],bad[1]);
    if(j&&j.error==='emailv'){
      /* most of the time this means one thing only: five minutes went by between the code and the
         button. The proof is gone, so the ask comes back where it was, and one press settles it */
      vToken.value=''; vFor=''; vSay(''); vStop();
      if(vBtn){ vBtn.hidden=false; vBtn.disabled=false; vBtn.textContent=t('vSend') }
      openBox();
    }
    if(!bad) say(j&&j.error==='limited'?T[L()].eBusy:T[L()].eFail);
    return;
  }
  const url=safeBase(j&&j.brain_url)||safeBase(MIRA_URL);
  const pass=cleanPass(j&&j.pass);
  document.getElementById('miraLink').href=brainHref(url, ref, pass)||'#';
  document.getElementById('formView').style.display='none';
  document.getElementById('doneView').classList.add('on');
  const card=document.getElementById('start'); if(card&&card.scrollIntoView) card.scrollIntoView({behavior:'smooth',block:'start'});
  /* and Mira opens in the card itself. No jump: the reference, the receipt and this conversation are
     meant to be on one screen, on the phone they are holding at the stand. */
  openFrame(url, ref, pass);
});

/* ── what a submission leaves behind ────────────────────────────────────────────
   The reference the mails and this page show is made by the door, in the shape the design drew. Until
   the backend is settled it is the only identifier, so nothing here stores a pass, reads a record
   back, or keeps anything in the browser: a second submission is a second person's row, and that is
   what the stand wants while the rest is undecided. */
function cleanRef(v){return String(v||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)}
/* the pass, in the shape the doors here accept it and nothing else: it is a row key that lets Mira
   write this visit down, and a character out of place is not a key but a way to point at someone */
function cleanPass(v){const s=String(v||'');return /^PASS[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(s)?s:''}
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
/* the address Mira is opened at, in one place because the frame and the link under it must never
   disagree. With a pass the visit is written on that person's row, which is the whole point of the
   pass; without one the reference still goes along, so Mira can greet them by it and the stand can
   quote it, exactly as this page did before passes existed here. */
function brainHref(url, ref, pass){
  const base=safeBase(url)||safeBase(document.getElementById('miraFrame')&&document.getElementById('miraFrame').dataset.src)||safeBase(MIRA_URL);
  if(!base) return '';
  const q='src=sharjah-next'
    +(pass?'&pass='+encodeURIComponent(pass)+'&embed=1':'')
    +(/^[A-Za-z0-9-]{3,24}$/.test(String(ref||''))?'&ref='+encodeURIComponent(ref):'');
  return base+(base.indexOf('?')<0?'?':'&')+q;
}
function openFrame(url, ref, pass){
  const f=document.getElementById('miraFrame'); if(!f) return;
  const src=brainHref(url, ref, pass);
  if(!src) return;
  if(f.getAttribute('src')!==src) f.setAttribute('src', src);
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
