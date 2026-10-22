# Firebase conversion — testing checklist

Complete these checks **on a test Firebase project** after publishing the Firestore rules.

- [ ] `index.html` loads with your Firebase config (no Supabase dependency).
- [ ] Email signup creates Firebase Auth user and Firestore `users/{uid}` plus `roles/{uid}` = `customer`.
- [ ] Google sign-in authenticates; hosting domain is in Authentication Authorized domains.
- [ ] A newly signed up customer cannot open `dashboard.html` or write shipments in DevTools.
- [ ] An approved Firebase admin can log in, add shipments, and see them live in `dashboard.html`.
- [ ] A customer sees only shipments assigned to their Firebase UID.
- [ ] A customer cannot update status or coordinates, even by calling Firestore directly.
- [ ] A pending courier request appears in `requests.html` for admin review.
- [ ] A customer cannot create or update their own role to `courier` or `admin`.
- [ ] An approved courier sees only assigned shipments and can share GPS for active deliveries.
- [ ] An unapproved courier cannot change status or send GPS coordinates.
- [ ] The customer's map updates when assigned courier publishes coordinates.
- [ ] Public tracking requires an exact `PKG-` code and does not expose customer PII.
- [ ] Deleting or revoking courier role prevents any new courier GPS updates.
- [ ] Password recovery goes through Firebase Auth (old Supabase password will not work).
- [ ] Test Android mobile browser GPS through HTTPS, not HTTP on a different LAN device.

**Known limitations:** This is a static-site client integration and has not been exercised with your Firebase credentials. The shipment document embeds a compact delivery history array (suited to prototypes and moderate history sizes; large production histories should use a subcollection and server-side projection updates). Public tracking uses long random lookup codes. For high-scale tracking or untrusted public traffic, add Firebase App Check, server-side rate limits, audit logging, monitoring and more rigorous automated rules tests.
