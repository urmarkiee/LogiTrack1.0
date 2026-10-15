(() => {
  'use strict';
  const cfg=window.APP_CONFIG;
  if (!cfg?.url || !cfg?.key || !window.supabase) return;
  const db=window.supabase.createClient(cfg.url,cfg.key);
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const msg=(id,text)=>{if($(id)) $(id).textContent=text;};
  async function account(){
    const button=$('request-courier');if(!button)return;
    const {data:{user}}=await db.auth.getUser();if(!user)return;
    const [{data:approval,error:e1},{data:request,error:e2}]=await Promise.all([
      db.from('courier_users').select('user_id').eq('user_id',user.id).maybeSingle(),
      db.from('courier_requests').select('status').eq('user_id',user.id).maybeSingle()
    ]);
    if(e1||e2){msg('courier-request-state',(e1||e2).message);return;}
    if(approval){msg('courier-request-state','Approved courier');return;}
    if(request?.status==='pending'){msg('courier-request-state','Courier request pending');return;}
    if(request?.status==='rejected')msg('courier-request-state','Request declined. You may request review again.');
    button.hidden=false;
    button.addEventListener('click',async()=>{
      button.disabled=true;
      const {error}=await db.rpc('request_courier_access');
      if(error){msg('courier-request-state',error.message);button.disabled=false;return;}
      button.hidden=true;msg('courier-request-state','Courier request pending');
    });
  }
  async function requests(){
    const body=$('courier-requests-body');if(!body)return;
    const {data:{user}}=await db.auth.getUser();if(!user){location.replace('login.html');return;}
    const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    if(!admin){msg('courier-message','Only administrators may review requests.');return;}
    async function reload(){
      const {data,error}=await db.rpc('list_courier_requests');
      if(error){msg('courier-message',error.message);return;}
      body.innerHTML=(data||[]).map(r=>`<tr><td>${esc(r.full_name||'—')}</td><td>${esc(r.email)}</td><td>${esc(new Date(r.requested_at).toLocaleString())}</td><td><button class="primary-button courier-decision" data-id="${esc(r.user_id)}" data-approve="true">Approve</button> <button class="outline-button courier-decision" data-id="${esc(r.user_id)}" data-approve="false">Reject</button></td></tr>`).join('')||'<tr><td colspan="4">No pending courier requests.</td></tr>';
    }
    body.addEventListener('click',async event=>{
      const button=event.target.closest('.courier-decision');if(!button)return;
      const approve=button.dataset.approve==='true';
      if(!confirm(`${approve?'Approve':'Reject'} this courier request?`))return;
      button.disabled=true;
      const {error}=await db.rpc('review_courier_request',{p_user_id:button.dataset.id,p_approve:approve});
      if(error){msg('courier-message',error.message);button.disabled=false;return;}
      msg('courier-message',`Request ${approve?'approved':'rejected'}.`);await reload();
    });
    $('courier-refresh')?.addEventListener('click',reload);
    await reload();
  }
  if(document.body.dataset.page==='account')account().catch(e=>msg('courier-request-state',e.message));
  if(document.body.dataset.page==='requests')requests().catch(e=>msg('courier-message',e.message));
})();
