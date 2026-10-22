// LogiTrack Firebase edition (browser ES modules, no Supabase required).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail,
  signOut, confirmPasswordReset, verifyPasswordResetCode
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, query, where,
  onSnapshot, writeBatch, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = v => v ? (v.toDate ? v.toDate() : new Date(v)).toLocaleString() : '—';
const errors = e => (e?.message || 'Something went wrong').replace(/^Firebase: /, '');
const notify = (text, bad=false) => {
  const m = $('message') || $('live-message') || $('courier-message');
  if (m) { m.textContent = text; m.className = `message ${bad ? 'error' : 'ok'}`; }
};
const badge = s => `<span class="badge ${{Pending:'pending','In Transit':'transit','Out for Delivery':'out',Delivered:'delivered'}[s] || 'pending'}">${escapeHTML(s)}</span>`;
const config = window.FIREBASE_CONFIG;
const valid = config && config.apiKey && config.projectId && config.appId && !config.apiKey.includes('PASTE_') && !config.projectId.includes('YOUR_');
if (!valid) {
  const m=$('message') || $('live-message');
  if(m) m.textContent='Firebase configuration missing. Paste your Firebase Web App SDK config into assets/config.js (see README-FIREBASE.md).';
  else document.body.insertAdjacentHTML('afterbegin','<p style="padding:14px;background:#fff3cd;color:#222">Configure assets/config.js with your Firebase Web App config. See README-FIREBASE.md.</p>');
  throw new Error('Firebase Web App config required');
}
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
const google = new GoogleAuthProvider();
const col = (name) => collection(db,name);
const ref = (name,id) => doc(db,name,id);
const normalizeEmail = s => String(s||'').trim().toLowerCase();
const localRole = async user => {
  const s = await getDoc(ref('roles',user.uid));
  return s.exists() ? s.data().role : 'customer';
};
const signedIn = () => new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, u => {unsub();resolve(u);}, e=>{unsub(); console.warn(e); resolve(null);});
});
async function ensureProfile(user, name='') {
  const pr=ref('users',user.uid), rr=ref('roles',user.uid);
  const [p,r]=await Promise.all([getDoc(pr),getDoc(rr)]);
  if(!p.exists()) await setDoc(pr, {email: normalizeEmail(user.email), displayName: name || user.displayName || 'Customer', createdAt:serverTimestamp()});
  if(!r.exists()) await setDoc(rr,{role:'customer'});
}
async function redirectToRole(user) {
  await ensureProfile(user);
  const role=await localRole(user);
  location.href=role==='admin'?'dashboard.html':role==='courier'?'courier-dashboard.html':'customer-dashboard.html';
}
async function guard(role) {
  const user=await signedIn();
  if(!user){location.replace('login.html');return null;}
  const actual=await localRole(user);
  if (role && actual!==role) {location.replace('account.html');return null;}
  if($('user-email'))$('user-email').textContent=user.email||'';
  const logout=$('logout') || $('signout');
  logout?.addEventListener('click',async()=>{await signOut(auth);location.replace('login.html');});
  return user;
}

let activeMap=null, activeMarker=null, mapId=null;
function renderMap(target,latitude,longitude){
  const el=$(target);if(!el)return;
  const lat=Number(latitude),lon=Number(longitude);
  if(latitude==null||longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90 || lat > 90 || lon < -180 || lon > 180){el.hidden=true;return;}
  if(typeof window.L==='undefined'){notify('Map library did not load.',true);return;}
  el.hidden=false;
  if(activeMap && mapId!==target){activeMap.remove();activeMap=null;activeMarker=null;}
  if(!activeMap){activeMap=L.map(target).setView([lat,lon],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(activeMap);activeMarker=L.marker([lat,lon]).addTo(activeMap);mapId=target;}
  else{activeMarker.setLatLng([lat,lon]);activeMap.setView([lat,lon],13);}
  setTimeout(()=>activeMap?.invalidateSize(),100);
}
function safeHistory(h){return Array.isArray(h)?h:[];}
function historyHTML(h){return `<ol class="timeline">${safeHistory(h).slice().reverse().map(e=>`<li><b>${escapeHTML(e.status)}</b> — ${escapeHTML(e.location)}<div class="muted">${escapeHTML(dateText(e.createdAt))} · ${escapeHTML(e.note||'')}</div></li>`).join('') || '<li>No history yet.</li>'}</ol>`;}
function summaryHTML(s){return `<div class="panel"><div class="between"><h2>${escapeHTML(s.trackingNumber)}</h2>${badge(s.status)}</div><h3>${escapeHTML(s.itemName)}</h3><div class="details"><p><b>Origin:</b> ${escapeHTML(s.origin)}</p><p><b>Destination:</b> ${escapeHTML(s.destination)}</p><p><b>Last reported:</b> ${escapeHTML(s.location||'Not available')}</p><p><b>Updated:</b> ${escapeHTML(dateText(s.updatedAt))}</p></div>${s.status==='Delivered'?`<h3>Shipment history</h3>${historyHTML(s.history)}`:''}</div>`;}
function publicProjection(s){return {
  trackingNumber:s.trackingNumber, shipmentId:s.id, itemName:s.itemName,
  origin:s.origin,destination:s.destination,status:s.status,location:s.location,
  latitude:s.latitude ?? null,longitude:s.longitude ?? null,
  updatedAt:s.updatedAt,history:s.history||[]
};}
function freshNumber(){const b=new Uint8Array(9);crypto.getRandomValues(b);return 'PKG-'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();}

// Public tracking: only a single exact, high-entropy tracking number can be read.
function initPublic(){
  const form=$('track-form'),input=$('track-code'),out=$('tracking-result');
  if(!form || !input || !out)return;
  let unsub=()=>{};
  function start(code){
    unsub();code=code.trim().toUpperCase();if(!code)return;
    if(!/^PKG-[0-9A-F]{18}$/.test(code)) {out.hidden=false;out.innerHTML='<div class="panel">Enter a complete tracking number (PKG- plus 18 characters).</div>';return;}
    history.replaceState({},'',`?track=${encodeURIComponent(code)}`);
    unsub=onSnapshot(ref('publicTracking',code),snap=>{
      out.hidden=false;
      if(!snap.exists()){out.innerHTML='<div class="panel"><h3>Tracking number not found</h3><p>Check the number and try again.</p></div>';$('map').hidden=true;return;}
      const s=snap.data();out.innerHTML=summaryHTML(s);
      renderMap('map',s.latitude,s.longitude);
      notify('Latest shipment update received.');
    },e=>notify(errors(e),true));
  }
  form.addEventListener('submit',e=>{e.preventDefault();start(input.value);});
  const initial=new URLSearchParams(location.search).get('track');if(initial){input.value=initial;start(initial);}
  window.addEventListener('pagehide',()=>unsub());
}

function initLogin(){
  const form=$('login-form');if(!form)return;
  form.addEventListener('submit',async e=>{e.preventDefault();const btn=$('login-button');btn.disabled=true;
    try{const {user}=await signInWithEmailAndPassword(auth,normalizeEmail($('email').value),$('password').value);await redirectToRole(user);}
    catch(err){notify(errors(err),true);btn.disabled=false;}
  });
  $('google-login')?.addEventListener('click',async e=>{
    e.currentTarget.disabled=true;
    try{const {user}=await signInWithPopup(auth,google);await redirectToRole(user);}
    catch(err){notify(errors(err),true);e.currentTarget.disabled=false;}
  });
}
async function createRoleRequest(user,role){
  if(role==='customer')return;
  await setDoc(ref('roleRequests',user.uid),{
    userId:user.uid, requestedRole:role,status:'pending',requestedAt:serverTimestamp()
  },{merge:true});
}
function initSignup(){
  $('signup-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('signup-button');btn.disabled=true;
    try{
      const name=$('signup-name').value.trim(),email=normalizeEmail($('signup-email').value),pass=$('signup-password').value;
      if(!name)throw new Error('Enter your full name.');
      if(pass.length<12)throw new Error('Use at least 12 characters.');
      if(pass!==$('signup-confirm').value)throw new Error('Passwords do not match.');
      const {user}=await createUserWithEmailAndPassword(auth,email,pass);
      await ensureProfile(user,name);
      await createRoleRequest(user,$('signup-role').value);
      try{await sendEmailVerification(user);}catch(e){console.warn('Verification email:',e.message);}
      notify('Account created. Verify your email if required, then sign in. Staff access requires approval.');
      $('signup-form').reset();
    }catch(err){notify(errors(err),true);}finally{btn.disabled=false;}
  });
  $('signup-google')?.addEventListener('click',async e=>{
    e.currentTarget.disabled=true;
    try{const {user}=await signInWithPopup(auth,google);await ensureProfile(user);await createRoleRequest(user,$('signup-role').value);await redirectToRole(user);}
    catch(err){notify(errors(err),true);e.currentTarget.disabled=false;}
  });
}

async function initAccount(){
  const user=await guard();if(!user)return;
  await ensureProfile(user);
  const role=await localRole(user);
  const p=await getDoc(ref('users',user.uid));
  if($('account-email'))$('account-email').textContent=user.email||'';
  if($('account-name'))$('account-name').textContent=p.data()?.displayName||user.displayName||'Customer';
  if($('account-role'))$('account-role').textContent=role[0].toUpperCase()+role.slice(1);
  if($('admin-link'))$('admin-link').hidden=role!=='admin';
  if($('courier-link'))$('courier-link').hidden=role!=='courier';
  $('account-logout')?.addEventListener('click',async()=>{await signOut(auth);location.href='index.html';});
  const docRef=ref('roleRequests',user.uid);
  function paint(snapshot){
    const data=snapshot.exists()?snapshot.data():null;
    const pending=data?.status==='pending',approved=role==='admin'||role==='courier';
    if($('request-admin'))$('request-admin').hidden=approved||pending;
    if($('request-courier'))$('request-courier').hidden=approved||pending;
    if($('courier-request-state'))$('courier-request-state').textContent=pending?`${data.requestedRole} request pending`:data?.status==='rejected'?'Previous request rejected':role==='courier'?'Approved courier':'';
    if($('account-role') && pending)$('account-role').textContent=`${data.requestedRole} request pending`;
  }
  onSnapshot(docRef,paint,e=>notify(errors(e),true));
  for(const [id,roleReq] of [['request-admin','admin'],['request-courier','courier']]){
    $(id)?.addEventListener('click',async()=>{
      $(id).disabled=true;
      try{await createRoleRequest(user,roleReq);notify(`${roleReq} request submitted for approval.`);}
      catch(e){notify(errors(e),true);}
      finally{$(id).disabled=false;}
    });
  }
}

// Admin dashboard: real-time Firestore snapshot updates.
async function initDashboard(){
  const user=await guard('admin');if(!user)return;
  let shipments=[];
  function render(){
    const q=($('search')?.value||'').trim().toLowerCase(),f=$('filter')?.value||'';
    const rows=shipments.filter(s=>(!f||s.status===f) && [s.trackingNumber,s.itemName,s.customerName,s.destination].some(v=>String(v??'').toLowerCase().includes(q)));
    $('shipment-body').innerHTML=rows.map(s=>`<tr><td><b>${escapeHTML(s.trackingNumber)}</b></td><td>${escapeHTML(s.itemName)}</td><td>${escapeHTML(s.customerName)}</td><td>${escapeHTML(s.destination)}</td><td>${badge(s.status)}</td><td>${escapeHTML(s.location||'—')}</td><td>${escapeHTML(dateText(s.updatedAt))}</td><td><a href="admin.html?id=${encodeURIComponent(s.id)}">Manage</a></td></tr>`).join('')||'<tr><td colspan="8">No shipments found.</td></tr>';
    $('total').textContent=shipments.length;
    $('pending').textContent=shipments.filter(s=>s.status==='Pending').length;
    $('transit').textContent=shipments.filter(s=>['In Transit','Out for Delivery'].includes(s.status)).length;
    $('delivered').textContent=shipments.filter(s=>s.status==='Delivered').length;
  }
  const unsub=onSnapshot(col('shipments'),snap=>{shipments=snap.docs.map(d=>({id:d.id,...d.data()}));shipments.sort((a,b)=>(b.updatedAt?.toMillis?.()||0)-(a.updatedAt?.toMillis?.()||0));render();},e=>notify(errors(e),true));
  $('search')?.addEventListener('input',render);$('filter')?.addEventListener('change',render);
  $('refresh')?.addEventListener('click',render);
  window.addEventListener('pagehide',unsub);
}

// Admin manages shipment creation, updates, and account assignment.
async function initAdmin(){
  const user=await guard('admin');if(!user)return;
  let shipments=[],selected=null;
  function updateSelection(){
    selected=shipments.find(s=>s.id===$('choose').value)||null;
    $('update-panel').hidden=!selected;
    if(!selected)return;
    $('u-status').value=selected.status;$('u-location').value=selected.location||'';
    $('u-lat').value=selected.latitude??'';$('u-lon').value=selected.longitude??'';
    $('selected-name').textContent=`${selected.trackingNumber} — ${selected.itemName}`;
  }
  const initial=new URLSearchParams(location.search).get('id');
  const unsub=onSnapshot(col('shipments'),snap=>{
    const old=$('choose')?.value||initial;
    shipments=snap.docs.map(d=>({id:d.id,...d.data()}));
    $('choose').innerHTML='<option value="">Select a shipment</option>'+shipments.map(s=>`<option value="${escapeHTML(s.id)}">${escapeHTML(s.trackingNumber)} — ${escapeHTML(s.itemName)}</option>`).join('');
    if(old && shipments.some(s=>s.id===old))$('choose').value=old;
    updateSelection();
  },e=>notify(errors(e),true));
  $('choose').addEventListener('change',updateSelection);
  $('create-form').addEventListener('submit',async e=>{
    e.preventDefault();const tracking=freshNumber(),id=doc(col('shipments')).id,origin=$('c-origin').value.trim();
    const payload={id,trackingNumber:tracking,customerName:$('c-customer').value.trim(),itemName:$('c-item').value.trim(),origin,destination:$('c-dest').value.trim(),status:'Pending',location:origin,latitude:null,longitude:null,customerUid:null,courierUid:null,customerEmail:'',courierEmail:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),history:[{status:'Pending',location:origin,note:'Shipment created',createdAt:new Date().toISOString()}]};
    if(!payload.customerName||!payload.itemName||!origin||!payload.destination){notify('Complete all shipment fields.',true);return;}
    try{
      const batch=writeBatch(db);batch.set(ref('shipments',id),payload);batch.set(ref('publicTracking',tracking),publicProjection(payload));await batch.commit();
      notify('Shipment created: '+tracking);$('create-form').reset();
    }catch(e){notify(errors(e),true);}
  });
  $('update-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!selected)return;
    const lt=$('u-lat').value.trim(),ln=$('u-lon').value.trim();
    if((lt==='') !== (ln==='')){notify('Enter both latitude and longitude, or leave both empty.',true);return;}
    const latitude=lt===''?null:Number(lt),longitude=ln===''?null:Number(ln);
    if((latitude!=null && (!Number.isFinite(latitude)||latitude<-90||latitude>90))||(longitude!=null&&(!Number.isFinite(longitude)||longitude<-180||longitude>180))){notify('Invalid GPS coordinates.',true);return;}
    const status=$('u-status').value,locationText=$('u-location').value.trim();
    const change=status!==selected.status||locationText!==selected.location;
    const history=change?[...(selected.history||[]),{status,location:locationText,note:'Administrator update',createdAt:new Date().toISOString()}]:selected.history||[];
    const update={status,location:locationText,latitude:status==='Delivered'?null:latitude,longitude:status==='Delivered'?null:longitude,updatedAt:serverTimestamp(),history};
    try{const batch=writeBatch(db);batch.update(ref('shipments',selected.id),update);batch.update(ref('publicTracking',selected.trackingNumber),update);await batch.commit();notify('Shipment updated.');}
    catch(e){notify(errors(e),true);}
  });
  $('assign-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const feedback=$('assign-feedback');feedback.textContent='Checking registered accounts…';
    const code=$('assign-code').value.trim().toUpperCase(),ship=shipments.find(s=>s.trackingNumber===code);
    if(!ship){feedback.textContent='Tracking number not found.';return;}
    const customerEmail=normalizeEmail($('assign-customer').value),courierEmail=normalizeEmail($('assign-courier').value);
    try{
      const [customerSnap,courierSnap]=await Promise.all([
        customerEmail ? getDocs(query(col('users'),where('email','==',customerEmail))) : null,
        courierEmail ? getDocs(query(col('users'),where('email','==',courierEmail))) : null
      ]);
      if(customerEmail && customerSnap.empty)throw new Error('Customer email not registered in Firebase.');
      if(courierEmail && courierSnap.empty)throw new Error('Courier email not registered in Firebase.');
      if(customerSnap && customerSnap.size>1)throw new Error('Multiple Firebase accounts use this customer email. Resolve the duplicate accounts first.');
      let courierUid=null;
      if(courierEmail){
        const courierProfiles=await Promise.all(courierSnap.docs.map(async profile=>({
          uid:profile.id,
          role:(await getDoc(ref('roles',profile.id))).data()?.role
        })));
        const approvedCouriers=courierProfiles.filter(profile=>profile.role==='courier');
        if(!approvedCouriers.length)throw new Error('Courier is not approved yet.');
        if(approvedCouriers.length>1)throw new Error('Multiple approved courier accounts use this email. Resolve the duplicate accounts first.');
        courierUid=approvedCouriers[0].uid;
      }
      const customerUid=customerEmail?customerSnap.docs[0].id:null;
      await updateDoc(ref('shipments',ship.id),{customerUid,courierUid,customerEmail,courierEmail,updatedAt:serverTimestamp()});
      feedback.textContent='Shipment account assignments saved.';
    }catch(err){feedback.textContent=errors(err);}
  });
  window.addEventListener('pagehide',unsub);
}

async function initRequests(){
  const user=await guard('admin');if(!user)return;
  async function decide(uid,approve){
    const current=await getDoc(ref('roleRequests',uid));
    if(!current.exists()||current.data().status!=='pending')throw new Error('Request no longer pending.');
    const r=current.data(),batch=writeBatch(db);
    if(approve)batch.set(ref('roles',uid),{role:r.requestedRole});
    batch.update(ref('roleRequests',uid),{status:approve?'approved':'rejected',reviewedAt:serverTimestamp()});
    await batch.commit();
  }
  const unsub=onSnapshot(query(col('roleRequests'),where('status','==','pending')),async snap=>{
    const all=snap.docs.map(d=>({uid:d.id,...d.data()}));
    const profiles=await Promise.all(all.map(async r=>{
      try{const p=await getDoc(ref('users',r.uid));return {...r,email:p.data()?.email||'—',name:p.data()?.displayName||'—'};}
      catch {return {...r,email:'—',name:'—'};}
    }));
    for(const [kind,tableId] of [['admin','requests-body'],['courier','courier-requests-body']]){
      const tbody=$(tableId);if(!tbody)continue;
      tbody.innerHTML=profiles.filter(r=>r.requestedRole===kind).map(r=>`<tr><td>${escapeHTML(r.name)}</td><td>${escapeHTML(r.email)}</td><td>${escapeHTML(dateText(r.requestedAt))}</td><td><button type="button" class="primary-button decision" data-id="${escapeHTML(r.uid)}" data-approve="yes">Approve</button> <button type="button" class="outline-button decision" data-id="${escapeHTML(r.uid)}" data-approve="no">Reject</button></td></tr>`).join('')||'<tr><td colspan="4">No pending requests.</td></tr>';
    }
  },e=>notify(errors(e),true));
  for(const id of ['requests-body','courier-requests-body'])$(id)?.addEventListener('click',async e=>{
    const btn=e.target.closest('button.decision');if(!btn)return;
    const approve=btn.dataset.approve==='yes';if(!confirm(`${approve?'Approve':'Reject'} this access request?`))return;
    btn.disabled=true;try{await decide(btn.dataset.id,approve);notify('Request reviewed.');}catch(e){notify(errors(e),true);btn.disabled=false;}
  });
  $('courier-refresh')?.addEventListener('click',()=>notify('Pending requests update automatically.'));
  window.addEventListener('pagehide',unsub);
}

async function initMyShipments(courier=false){
  const user=await guard();if(!user)return;
  const role=await localRole(user);
  if(courier && role!=='courier'){location.href='account.html';return;}
  const select=$(courier?'courier-shipments':'customer-shipments');
  if(!select)return;
  let shipments=[],gpsWatch=null,gpsShipment=null,gpsSession=0,lastSent=0,busy=false;
  const msg=s=>{if($('live-message'))$('live-message').textContent=s;};
  const stop=()=>{gpsSession++;if(gpsWatch!==null){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;}gpsShipment=null;if($('start-gps'))$('start-gps').disabled=false;if($('stop-gps'))$('stop-gps').disabled=true;};
  function render(){
    const old=select.value;
    select.innerHTML='<option value="">Select a shipment</option>'+shipments.map(s=>`<option value="${escapeHTML(s.id)}">${escapeHTML(s.trackingNumber)} — ${escapeHTML(s.itemName)}</option>`).join('');
    if(old&&shipments.some(s=>s.id===old))select.value=old;
    else if(shipments.length)select.value=shipments[0].id;
    const s=shipments.find(x=>x.id===select.value);
    if($('count-total'))$('count-total').textContent=shipments.length;
    if($('count-active'))$('count-active').textContent=shipments.filter(x=>['In Transit','Out for Delivery'].includes(x.status)).length;
    if($('count-done'))$('count-done').textContent=shipments.filter(x=>x.status==='Delivered').length;
    const sum=$('package-summary');if(sum)sum.innerHTML=s?summaryHTML(s):'<p>No assigned shipments yet. Ask the administrator to assign your account.</p>';
    if($('gps-age'))$('gps-age').textContent=s?.updatedAt?`Last update: ${dateText(s.updatedAt)}`:'No package GPS update yet.';
    renderMap('gps-map',s?.latitude,s?.longitude);
    if(courier){
      if($('start-gps'))$('start-gps').disabled=Boolean(gpsWatch!==null)||!s||!['In Transit','Out for Delivery'].includes(s.status);
      if($('mark-delivered'))$('mark-delivered').disabled=!s||!['In Transit','Out for Delivery'].includes(s.status);
      if(gpsWatch!==null && gpsShipment!==s?.id){stop();msg('Shipment changed, GPS sharing stopped.');}
    }
  }
  const unsub=onSnapshot(query(col('shipments'),where(courier?'courierUid':'customerUid','==',user.uid)),snap=>{
    shipments=snap.docs.map(d=>({id:d.id,...d.data()}));render();
  },e=>msg(errors(e)));
  select.addEventListener('change',render);
  $('reload')?.addEventListener('click',render);
  $('signout')?.addEventListener('click',stop);
  if(courier){
    $('stop-gps')?.addEventListener('click',()=>{stop();msg('GPS sharing stopped.');});
    $('start-gps')?.addEventListener('click',()=>{
      const selected=shipments.find(s=>s.id===select.value);
      if(!selected || !['In Transit','Out for Delivery'].includes(selected.status))return msg('Select an active shipment.');
      if(!navigator.geolocation)return msg('GPS not available in this browser.');
      const session=++gpsSession;gpsShipment=selected.id;lastSent=0;msg('Requesting location permission…');
      $('start-gps').disabled=true;$('stop-gps').disabled=false;
      gpsWatch=navigator.geolocation.watchPosition(async p=>{
        if(session!==gpsSession || busy || Date.now()-lastSent<7000)return;
        busy=true;lastSent=Date.now();
        try{
          const update={latitude:p.coords.latitude,longitude:p.coords.longitude,updatedAt:serverTimestamp()};
          const batch=writeBatch(db);batch.update(ref('shipments',selected.id),update);batch.update(ref('publicTracking',selected.trackingNumber),update);await batch.commit();
          msg(`GPS shared at ${new Date().toLocaleTimeString()} (accuracy ~${Math.round(p.coords.accuracy)} m).`);
        }catch(e){msg('GPS update failed: '+errors(e));stop();}
        finally{busy=false;}
      },e=>{stop();msg('GPS unavailable: '+e.message);},{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
    });
    $('mark-delivered')?.addEventListener('click',async()=>{
      const s=shipments.find(x=>x.id===select.value);if(!s||!['In Transit','Out for Delivery'].includes(s.status))return;
      if(!confirm('Mark this shipment delivered and stop live GPS sharing?'))return;
      stop();const history=[...(s.history||[]),{status:'Delivered',location:s.location||'',note:'Marked delivered by courier',createdAt:new Date().toISOString()}];
      const update={status:'Delivered',latitude:null,longitude:null,history,updatedAt:serverTimestamp()};
      try{const b=writeBatch(db);b.update(ref('shipments',s.id),update);b.update(ref('publicTracking',s.trackingNumber),update);await b.commit();msg('Shipment delivered. GPS sharing stopped.');}
      catch(e){msg(errors(e));}
    });
  }
  window.addEventListener('pagehide',()=>{stop();unsub();});
}

function initRecovery(){
  $('forgot-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('submit-button');btn.disabled=true;
    try{await sendPasswordResetEmail(auth,normalizeEmail($('email').value));notify('If that address has a Firebase account, a reset link will be sent.');}
    catch(err){notify(errors(err),true);}finally{btn.disabled=false;}
  });
  const form=$('reset-form');if(!form)return;
  const code=new URLSearchParams(location.search).get('oobCode');
  if(!code){form.hidden=true;notify('Use the reset link in your Firebase email. By default Firebase displays its hosted password reset page.',true);return;}
  verifyPasswordResetCode(auth,code).then(email=>{form.hidden=false;notify(`Create a new password for ${email}.`);}).catch(e=>{form.hidden=true;notify(errors(e),true);});
  form.addEventListener('submit',async e=>{
    e.preventDefault();const pass=$('new-password').value,confirm=$('confirm-password').value;
    if(pass!==confirm)return notify('Passwords do not match.',true);
    if(pass.length<12)return notify('Use at least 12 characters.',true);
    const btn=$('submit-button');btn.disabled=true;
    try{await confirmPasswordReset(auth,code,pass);form.hidden=true;notify('Password changed. Return to login.');}
    catch(e){notify(errors(e),true);btn.disabled=false;}
  });
}

// Dispatch using existing HTML pages, IDs, and CSS classes.
const page=document.body.dataset.page;
(async()=>{
  try{
    if(page==='customer')initPublic();
    else if(page==='login')initLogin();
    else if(page==='signup')initSignup();
    else if(page==='account')await initAccount();
    else if(page==='dashboard')await initDashboard();
    else if(page==='admin')await initAdmin();
    else if(page==='requests')await initRequests();
    else if($('courier-shipments'))await initMyShipments(true);
    else if($('customer-shipments'))await initMyShipments(false);
    else if($('forgot-form')||$('reset-form'))initRecovery();
  }catch(e){console.error(e);notify(errors(e),true);}
})();
