(() => { 'use strict';
const cfg=window.APP_CONFIG, message=document.getElementById('message');
function show(s,bad=false){message.textContent=s;message.className='message '+(bad?'error':'ok');}
if(!cfg?.url || !cfg?.key || cfg.url.includes('YOUR-PROJECT') || !window.supabase){show('Set your Supabase Project URL and publishable key in assets/config.js first.',true);return;}
const db=window.supabase.createClient(cfg.url,cfg.key);
const forgot=document.getElementById('forgot-form');
if(forgot){forgot.addEventListener('submit',async e=>{e.preventDefault();const b=document.getElementById('submit-button');b.disabled=true;try{const redirectTo=new URL('reset-password.html',location.href).href;const {error}=await db.auth.resetPasswordForEmail(document.getElementById('email').value.trim(),{redirectTo});if(error)throw error;show('If this email is registered, check your inbox for a recovery link.');}catch(e){show(e.message,true);}finally{b.disabled=false;}});}
const reset=document.getElementById('reset-form');
if(reset){reset.hidden=true;
const query=new URLSearchParams(location.search);
async function verify(){
  const tokenHash=query.get('token_hash');
  if(tokenHash && query.get('type')==='recovery'){
    const {error}=await db.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
    if(error){show('Recovery link invalid or expired: '+error.message,true);return;}
    history.replaceState({},'',location.pathname);
  }
  const {data:{session},error}=await db.auth.getSession();
  if(error || !session){show('Open the password recovery link from your email. If it has expired, request another link.',true);return;}
  reset.hidden=false;show('Recovery session ready. Choose a strong new password.');
}
verify();
reset.addEventListener('submit',async e=>{e.preventDefault();const pass=document.getElementById('new-password').value;if(pass!==document.getElementById('confirm-password').value){show('Passwords do not match.',true);return;}if(pass.length<12){show('Use at least 12 characters.',true);return;}const b=document.getElementById('submit-button');b.disabled=true;try{const {error}=await db.auth.updateUser({password:pass});if(error)throw error;await db.auth.signOut();reset.hidden=true;show('Password updated. Return to login and sign in.');}catch(e){show(e.message,true);b.disabled=false;}});
}
})();