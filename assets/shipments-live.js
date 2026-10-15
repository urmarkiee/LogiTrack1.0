(() => {'use strict';
const cfg=window.APP_CONFIG,$=id=>document.getElementById(id),status=t=>$('live-message').textContent=t;
if(!cfg?.url||!cfg?.key||cfg.url.includes('YOUR-PROJECT')){status('Add your Supabase Project URL in assets/config.js');return;}
const db=window.supabase.createClient(cfg.url,cfg.key);
const isCourier=location.pathname.endsWith('/courier-dashboard.html');
let shipments=[],map,marker,watchId=null,activeId=null,lastSent=0,inFlight=false,gpsSession=0,gpsStatusPinned=false;
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selector=$(isCourier?'courier-shipments':'customer-shipments');
function draw(s){const info=$('package-summary'),deliverButton=$('mark-delivered');if(deliverButton)deliverButton.disabled=!s||!['In Transit','Out for Delivery'].includes(s.status);if(!s){info.innerHTML='<p>No shipment selected.</p>';$('gps-map').hidden=true;$('gps-age').textContent='';return;}
 info.innerHTML=`<h2>${escapeHTML(s.item_name)}</h2><p><b>Tracking:</b> ${escapeHTML(s.tracking_number)}</p><p><b>Status:</b> ${escapeHTML(s.status)}</p><p><b>Route:</b> ${escapeHTML(s.origin)} → ${escapeHTML(s.destination)}</p><p><b>Last hub:</b> ${escapeHTML(s.location||'Not reported')}</p>`;
 const lat=s.latitude,lon=s.longitude;
 if(s.status==='Delivered'){$('gps-map').hidden=true;$('gps-age').textContent='GPS sharing ended when this shipment was delivered.';return;}
 if(lat==null||lon==null||!Number.isFinite(+lat)||!Number.isFinite(+lon)){$('gps-map').hidden=true;$('gps-age').textContent='No GPS coordinate has been reported yet.';return;}
 $('gps-map').hidden=false;
 if(!map){map=L.map('gps-map').setView([+lat,+lon],14);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);marker=L.marker([+lat,+lon]).addTo(map);}else{marker.setLatLng([+lat,+lon]);map.setView([+lat,+lon],14);}
 setTimeout(()=>map.invalidateSize(),50);
 $('gps-age').textContent='Last GPS report: '+(s.gps_reported_at?new Date(s.gps_reported_at).toLocaleString():'No GPS timestamp (manually entered coordinates)')+'. This is the last reported location, not guaranteed live.';
}
async function refresh(){const old=selector.value;const {data,error}=await db.from('shipments').select('id,tracking_number,item_name,origin,destination,status,location,latitude,longitude,gps_reported_at,updated_at,customer_user_id,courier_user_id').order('updated_at',{ascending:false}).limit(200);
 if(error){status(error.message);return;}shipments=data||[];
 const frag=document.createDocumentFragment();const empty=document.createElement('option');empty.value='';empty.textContent=shipments.length?'Choose a shipment':'No linked shipments';frag.appendChild(empty);
 for(const s of shipments){let opt=document.createElement('option');opt.value=s.id;opt.textContent=`${s.tracking_number} — ${s.item_name}`;frag.appendChild(opt);}selector.replaceChildren(frag);
 selector.value=shipments.some(s=>s.id===old)?old:(shipments[0]?.id||'');
 if(isCourier&&watchId!==null&&selector.value!==activeId)stopGPS();
 draw(shipments.find(s=>s.id===selector.value));
 if(!isCourier){$('count-total').textContent=shipments.length;$('count-active').textContent=shipments.filter(s=>['In Transit','Out for Delivery'].includes(s.status)).length;$('count-done').textContent=shipments.filter(s=>s.status==='Delivered').length;}
 if(!isCourier||!gpsStatusPinned)status(shipments.length?`Showing ${shipments.length} assigned shipment(s). GPS sharing is available for shipments In Transit or Out for Delivery. Refreshes every 8 seconds.`:'No shipments linked to your account. Ask the admin to assign your email to an order.');}
function stopGPS(){gpsSession++;if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;activeId=null;gpsStatusPinned=true;$('start-gps').disabled=false;$('stop-gps').disabled=true;status('GPS sharing stopped.');}
async function init(){const {data:{user},error}=await db.auth.getUser();if(error||!user){location.replace('login.html');return;}
 $('signout').addEventListener('click',async()=>{if(isCourier)stopGPS();await db.auth.signOut();location.replace('login.html');});
 selector.addEventListener('change',()=>{if(isCourier&&watchId!==null)stopGPS();draw(shipments.find(s=>s.id===selector.value));});
 if($('reload'))$('reload').addEventListener('click',refresh);
 if(isCourier){$('stop-gps').addEventListener('click',stopGPS);$('mark-delivered').addEventListener('click',async()=>{
 const selected=shipments.find(s=>s.id===selector.value),button=$('mark-delivered');
 if(!selected||!['In Transit','Out for Delivery'].includes(selected.status))return status('Only active assigned shipments can be marked delivered.');
 if(!confirm('Mark this shipment delivered and remove its saved GPS coordinates?'))return;
 button.disabled=true;
 try{
 const {error}=await db.rpc('deliver_courier_shipment',{p_shipment_id:selected.id});if(error)throw error;
 stopGPS();status('Shipment marked delivered. GPS coordinates cleared.');await refresh();
 }catch(error){status(error.message);button.disabled=false;}
 });$('start-gps').addEventListener('click',()=>{
 if(!selector.value)return status('Select an assigned shipment first.');if(watchId!==null)return;
 const selected=shipments.find(s=>s.id===selector.value);
 if(!selected||!['In Transit','Out for Delivery'].includes(selected.status))return status('GPS sharing is available only when the shipment is In Transit or Out for Delivery.');
 if(!navigator.geolocation)return status('This browser has no geolocation support.');
 activeId=selector.value;const session=++gpsSession,shipmentId=activeId;lastSent=0;gpsStatusPinned=true;$('start-gps').disabled=true;$('stop-gps').disabled=false;status('Waiting for GPS permission…');
 watchId=navigator.geolocation.watchPosition(async p=>{
 if(session!==gpsSession||watchId===null)return;
 if(inFlight||Date.now()-lastSent<4000)return;inFlight=true;lastSent=Date.now();
 const {error}=await db.rpc('report_courier_gps',{p_shipment_id:shipmentId,p_latitude:p.coords.latitude,p_longitude:p.coords.longitude});inFlight=false;
 if(session!==gpsSession)return;
 if(error){status('GPS update failed: '+error.message);stopGPS();return;}status('GPS shared at '+new Date().toLocaleTimeString()+' (accuracy approx. '+Math.round(p.coords.accuracy)+' m).');await refresh();
 },err=>{if(session!==gpsSession)return;stopGPS();status('GPS unavailable: '+err.message);},{enableHighAccuracy:true,maximumAge:2000,timeout:18000});
 });window.addEventListener('pagehide',stopGPS);}
 await refresh();setInterval(refresh,8000);
}
init().catch(e=>status(e.message));
})();