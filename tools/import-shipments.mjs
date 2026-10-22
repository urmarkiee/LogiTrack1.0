/**
 * Optional one-time import of a Supabase Table Editor JSON export of `shipments`.
 * Run locally. Uses Firebase Admin credentials from GOOGLE_APPLICATION_CREDENTIALS.
 * NEVER place service account JSON in the public website or on GitHub.
 *
 * npm install firebase-admin
 * set GOOGLE_APPLICATION_CREDENTIALS=C:\\safe\\path\\service-account.json  (Windows CMD)
 * node tools/import-shipments.mjs path/to/supabase-shipments.json
 */
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const filename=process.argv[2];
if(!filename){console.error('Usage: node tools/import-shipments.mjs <supabase-export.json>');process.exit(1);}
if(!process.env.GOOGLE_APPLICATION_CREDENTIALS){console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the private service account JSON path (outside this repo).');process.exit(1);}
initializeApp({credential:applicationDefault()});
const db=getFirestore();
const input=JSON.parse(await readFile(filename,'utf8'));
const shipments=Array.isArray(input)?input:(Array.isArray(input.data)?input.data:null);
if(!shipments){throw new Error('Expected an array of shipment records from Supabase Table Editor JSON export.');}
for(const s of shipments){
  // Never expose predictable legacy tracking numbers in public lookup documents.
  const oldCode=s.tracking_number ?? s.trackingNumber ?? '';
  const code=/^PKG-[0-9A-F]{18}$/.test(oldCode)?oldCode:'PKG-'+randomBytes(9).toString('hex').toUpperCase();
  const id=String(s.id||randomUUID());
  const existing=await db.collection('shipments').doc(id).get();
  if(existing.exists){console.log('Skipped already imported shipment:',id);continue;}
  const status=['Pending','In Transit','Out for Delivery','Delivered'].includes(s.status)?s.status:'Pending';
  const latitude=s.latitude==null?null:Number(s.latitude),longitude=s.longitude==null?null:Number(s.longitude);
  const loc=String(s.location||'');
  const updated=FieldValue.serverTimestamp();
  const history=[{status,location:loc,note:'Imported from Supabase export; previous event history was not included',createdAt:new Date().toISOString()}];
  const entry={id,trackingNumber:code,itemName:String(s.item_name??s.itemName??'Item'),customerName:String(s.customer_name??s.customerName??'Customer'),
    origin:String(s.origin??''),destination:String(s.destination??''),status,location:loc,
    latitude:Number.isFinite(latitude)?latitude:null,longitude:Number.isFinite(longitude)?longitude:null,
    customerUid:null,courierUid:null,customerEmail:'',courierEmail:'',createdAt:updated,updatedAt:updated,history};
  const publicEntry={trackingNumber:code,shipmentId:id,itemName:entry.itemName,origin:entry.origin,destination:entry.destination,status:entry.status,
    location:entry.location,latitude:entry.latitude,longitude:entry.longitude,updatedAt:updated,history};
  const batch=db.batch();batch.set(db.collection('shipments').doc(id),entry);batch.set(db.collection('publicTracking').doc(code),publicEntry);await batch.commit();
  console.log(`${oldCode||'(no legacy number)'} -> ${code} | ${id}`);
}
console.log('Done. Create Firebase Auth accounts and reassign customers/couriers in the admin page.');
