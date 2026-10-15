(() => {
  'use strict';
  const cfg = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = s => s ? new Date(s).toLocaleString() : '—';
  const statusClass = s => ({Pending:'pending','In Transit':'transit','Out for Delivery':'out','Delivered':'delivered'}[s] || 'pending');
  const statusBadge = s => `<span class="badge ${statusClass(s)}">${esc(s)}</span>`;
  if (!cfg || !cfg.url || !cfg.key || cfg.url.includes('YOUR-PROJECT') || !window.supabase) {
    document.body.innerHTML = '<main class="shell"><div class="panel"><h2>Configure Supabase first</h2><p>Open <code>assets/config.js</code> and replace YOUR-PROJECT-REF with your Supabase Project URL.</p></div></main>';
    return;
  }
  const db = window.supabase.createClient(cfg.url, cfg.key);
  const notify = (msg, bad = false) => { const el = $('message'); if(el) { el.textContent=msg; el.className='message '+(bad?'error':'ok'); } };
  const getError = e => e?.message || 'Something went wrong';
  const page = document.body.dataset.page;
  let map,marker;
  function showMap(lat,lon) {
    const el=$('map'); if(!el || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || lat===null || lon===null) {if(el) el.hidden=true;return;}
    el.hidden=false;
    if(!map){ map=L.map('map').setView([+lat,+lon],13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);marker=L.marker([+lat,+lon]).addTo(map);}
    else {marker.setLatLng([+lat,+lon]);map.setView([+lat,+lon]);}
    setTimeout(()=>map.invalidateSize(),100);
  }
  async function trackPackage(code, silent=false){
    if(!code)return;
    try {
      const {data,error}=await db.rpc('track_package',{p_tracking_number:code.trim().toUpperCase()});
      if(error)throw error;
      const out=$('tracking-result');out.hidden=false;
      if(!data){out.innerHTML='<div class="panel"><h3>Tracking number not found</h3><p>Check the number and try again.</p></div>'; if($('map'))$('map').hidden=true; return;}
      out.innerHTML=`<div class="panel"><div class="between"><h2>${esc(data.tracking_number)}</h2>${statusBadge(data.status)}</div><h3>${esc(data.item_name)}</h3><div class="details"><p><b>Origin:</b> ${esc(data.origin)}</p><p><b>Destination:</b> ${esc(data.destination)}</p><p><b>Last reported location:</b> ${esc(data.location || 'Not available')}</p><p><b>Last updated:</b> ${esc(date(data.updated_at))}</p></div><h3>Shipment history</h3><ol class="timeline">${(data.history||[]).map(h=>`<li><b>${esc(h.status)}</b> — ${esc(h.location)}<div class="muted">${esc(date(h.created_at))} · ${esc(h.note)}</div></li>`).join('') || '<li>No history yet.</li>'}</ol></div>`;
      const historySection=out.querySelector('ol.timeline');
      if(historySection){const header=historySection.previousElementSibling;const delivered=data.status==='Delivered';historySection.hidden=!delivered;if(header)header.hidden=!delivered;}
      if(['In Transit','Out for Delivery'].includes(data.status)){showMap(data.latitude,data.longitude);}else if($('map')){$('map').hidden=true;}
      if(!silent)notify('Showing the latest reported package information.');
    }catch(e){notify(getError(e),true);}
  }
  async function initCustomer(){
    const p=new URLSearchParams(location.search).get('track');if(p){$('track-code').value=p;trackPackage(p);}
    $('track-form').addEventListener('submit', e=>{e.preventDefault(); const code=$('track-code').value.trim().toUpperCase();history.replaceState({},'',`?track=${encodeURIComponent(code)}`);trackPackage(code);});
    setInterval(()=>{const code=$('track-code').value.trim();if(code && !$('tracking-result').hidden)trackPackage(code,true);},10000);
  }
  async function requireAdmin(){
    const {data:{user},error}=await db.auth.getUser();
    if(error || !user){location.href='login.html';return false;}
    const {data:admin,error:adminErr}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    if(adminErr || !admin){await db.auth.signOut();location.href='login.html?denied=1';return false;}
    if($('user-email'))$('user-email').textContent=user.email;
    if($('logout'))$('logout').addEventListener('click',async()=>{await db.auth.signOut();location.href='login.html';});
    return true;
  }
  async function userLandingPage(user){
    const {data:admin,error}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    return !error && admin ? 'dashboard.html' : 'account.html';
  }
  async function startGoogleSignIn(button){
    button.disabled=true;
    try {
      const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('account.html',location.href).href}});
      if(error)throw error;
    } catch(e) {notify(getError(e),true);button.disabled=false;}
  }
  async function initLogin(){
    try {
      const {data:{user},error}=await db.auth.getUser();
      if(!error && user){location.href=await userLandingPage(user);return;}
    } catch (err) {
      // Ignore transient auth fetch errors and continue to show the login form.
    }
    if(new URLSearchParams(location.search).has('denied'))notify('Account not approved as admin. Ask the project owner to add your user ID in admin_users.',true);
    $('login-form').addEventListener('submit',async e=>{
      e.preventDefault();const button=$('login-button');button.disabled=true;
      try {const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;location.href=await userLandingPage(data.user);}
      catch(err){notify(getError(err),true);button.disabled=false;}
    });
    $('google-login')?.addEventListener('click',e=>startGoogleSignIn(e.currentTarget));
  }
  function initSignup(){
    $('signup-form').addEventListener('submit',async e=>{
      e.preventDefault();
      const button=$('signup-button');button.disabled=true;
      const password=$('signup-password').value;
      if(password!==$('signup-confirm').value){notify('Passwords do not match.',true);button.disabled=false;return;}
      try {
        const {data,error}=await db.auth.signUp({
          email:$('signup-email').value.trim(),
          password,
          options:{data:{full_name:$('signup-name').value.trim(),requested_role:$('signup-role').value},emailRedirectTo:new URL('login.html',location.href).href}
        });
        if(error)throw error;
        if(data.session)location.href='account.html';
        else notify('Account created. Check your email to confirm your address before signing in.');
      } catch(err){notify(getError(err),true);}
      finally{button.disabled=false;}
    });
    $('signup-google')?.addEventListener('click',e=>startGoogleSignIn(e.currentTarget));
  }
  async function initAccount(){
    const {data:{user},error}=await db.auth.getUser();
    if(error || !user){location.href='login.html';return;}
    $('account-email').textContent=user.email||'—';
    const {data:profile,error:profileError}=await db.from('account_profiles').select('full_name,requested_role').eq('user_id',user.id).maybeSingle();
    const {data:admin,error:adminError}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    if(profileError || adminError){notify(getError(profileError||adminError),true);return;}
    $('account-name').textContent=profile?.full_name||user.user_metadata?.full_name||user.email||'Customer';
    const isAdmin=!!admin,hasRequest=profile?.requested_role==='admin';
    $('account-role').textContent=isAdmin?'Administrator':hasRequest?'Administrator request pending':'Customer';
    $('admin-link').hidden=!isAdmin;
    $('request-admin').hidden=isAdmin||hasRequest;
    $('request-admin').addEventListener('click',async e=>{
      const button=e.currentTarget;button.disabled=true;
      try {
        const {error}=await db.rpc('request_admin_access');if(error)throw error;
        $('account-role').textContent='Administrator request pending';button.hidden=true;notify('Your administrator access request was submitted.');
      } catch(err){notify(getError(err),true);button.disabled=false;}
    });
    $('account-logout').addEventListener('click',async()=>{await db.auth.signOut();location.href='login.html';});
  }
  async function initRequests(){
    if(!await requireAdmin())return;
    const body=$('requests-body');
    async function reload(){
      try {
        const {data,error}=await db.rpc('list_admin_requests');if(error)throw error;
        body.innerHTML=(data||[]).map(r=>`<tr><td>${esc(r.full_name||'—')}</td><td>${esc(r.email||'—')}</td><td>${esc(date(r.created_at))}</td><td><button class="outline-button" type="button" data-approve="${esc(r.user_id)}">Approve</button></td></tr>`).join('')||'<tr><td colspan="4">No pending administrator requests.</td></tr>';
      } catch(e){notify(getError(e),true);body.innerHTML='<tr><td colspan="4">Could not load requests.</td></tr>';}
    }
    body.addEventListener('click',async e=>{
      const button=e.target.closest('[data-approve]');if(!button)return;
      button.disabled=true;
      try {
        const {error}=await db.rpc('approve_admin_request',{p_user_id:button.dataset.approve});if(error)throw error;
        notify('Administrator access approved.');await reload();
      } catch(err){notify(getError(err),true);button.disabled=false;}
    });
    await reload();
  }
  async function getShipments(){const {data,error}=await db.from('shipments').select('*').order('updated_at',{ascending:false}).limit(500);if(error)throw error;return data||[];}
  async function initDashboard(){
    if(!await requireAdmin())return;
    let items=[];
    async function reload(){
      try{items=await getShipments();$('total').textContent=items.length;$('pending').textContent=items.filter(s=>s.status==='Pending').length;$('transit').textContent=items.filter(s=>['In Transit','Out for Delivery'].includes(s.status)).length;$('delivered').textContent=items.filter(s=>s.status==='Delivered').length;render();}
      catch(e){notify(getError(e),true);}
    }
    function render(){
      const q=$('search').value.toLowerCase();const filter=$('filter').value;
      const rows=items.filter(s=>(!filter || s.status===filter) && [s.tracking_number,s.item_name,s.customer_name,s.destination].some(x=>String(x??'').toLowerCase().includes(q)));
      $('shipment-body').innerHTML=rows.map(s=>`<tr><td><b>${esc(s.tracking_number)}</b></td><td>${esc(s.item_name)}</td><td>${esc(s.customer_name)}</td><td>${esc(s.destination)}</td><td>${statusBadge(s.status)}</td><td>${esc(s.location || '—')}</td><td>${esc(date(s.updated_at))}</td><td><a href="admin.html?id=${encodeURIComponent(s.id)}">Manage</a></td></tr>`).join('') || '<tr><td colspan="8">No shipments found.</td></tr>';
    }
    $('search').addEventListener('input',render);$('filter').addEventListener('change',render);$('refresh').addEventListener('click',reload);await reload();
  }
  function makeTrackingNumber(){const bits=new Uint8Array(9);crypto.getRandomValues(bits);return 'PKG-'+Array.from(bits,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();}
  async function initAdmin(){
    if(!await requireAdmin())return;
    let selected=null;
    const statuses=['Pending','In Transit','Out for Delivery','Delivered'];
    async function reload(){try{const rows=await getShipments();const previous=$('choose').value;$('choose').innerHTML='<option value="">Select a shipment</option>'+rows.map(s=>`<option value="${esc(s.id)}">${esc(s.tracking_number)} — ${esc(s.item_name)}</option>`).join('');const id=new URLSearchParams(location.search).get('id');const selection=previous||id;if(selection && rows.some(s=>s.id===selection))$('choose').value=selection;change(rows);}catch(e){notify(getError(e),true);}}
    let cached=[];
    function change(rows){cached=rows;selected=rows.find(s=>s.id===$('choose').value)||null; $('update-panel').hidden=!selected;if(!selected)return;$('u-status').value=selected.status;$('u-location').value=selected.location||'';$('u-lat').value=selected.latitude??'';$('u-lon').value=selected.longitude??'';$('selected-name').textContent=`${selected.tracking_number} — ${selected.item_name}`;}
    $('choose').addEventListener('change',()=>change(cached));
    $('create-form').addEventListener('submit',async e=>{e.preventDefault();
      const payload={tracking_number:makeTrackingNumber(),customer_name:$('c-customer').value.trim(),item_name:$('c-item').value.trim(),origin:$('c-origin').value.trim(),destination:$('c-dest').value.trim(),status:'Pending',location:$('c-origin').value.trim()};
      try{const {error}=await db.from('shipments').insert(payload);if(error)throw error;notify('Shipment created: '+payload.tracking_number);$('create-form').reset();await reload();}
      catch(e){notify(getError(e),true);}
    });
    $('update-form').addEventListener('submit',async e=>{e.preventDefault();if(!selected)return;
      const latText=$('u-lat').value.trim(),lonText=$('u-lon').value.trim();
      if((latText==='') !== (lonText===''))return notify('Enter both latitude and longitude, or leave both empty.',true);
      const lat=latText===''?null:Number(latText),lon=lonText===''?null:Number(lonText);
      if((lat!==null && (!Number.isFinite(lat)||lat < -90||lat>90)) || (lon!==null && (!Number.isFinite(lon)||lon< -180||lon>180)))return notify('Invalid GPS coordinates.',true);
      const payload={status:$('u-status').value,location:$('u-location').value.trim(),latitude:lat,longitude:lon};
      try{const {error}=await db.from('shipments').update(payload).eq('id',selected.id);if(error)throw error;notify('Shipment updated successfully.');await reload();}
      catch(e){notify(getError(e),true);}
    });
    await reload();
  }
  if(page==='customer')initCustomer();if(page==='login')initLogin();if(page==='signup')initSignup();if(page==='account')initAccount();if(page==='requests')initRequests();if(page==='dashboard')initDashboard();if(page==='admin')initAdmin();
})();
