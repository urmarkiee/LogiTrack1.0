# LogiTrack 1.0 — Firebase Edition

A responsive logistics shipment tracker and dashboard, migrated from Supabase to **Firebase Authentication + Cloud Firestore** while preserving the original HTML/CSS layout.

## Features

- Public package tracking using a long, random tracking code (`PKG-...`)
- Firebase email/password authentication, password recovery, and Google sign-in
- Separate customer dashboard and courier dashboard
- Admin dashboard with live shipment updates, creation/editing, and account assignments
- Admin-approved courier and admin access requests
- Authorized courier GPS sharing via the browser Geolocation API (explicit Start/Stop buttons)
- Live customer maps with **the last position reported from the courier's device**
- Firestore Security Rules: customer/courier isolation, no self-appointed admins

## Setup (required)

1. Create a Firebase project at https://console.firebase.google.com and register a **Web** app. Copy its Firebase Web App configuration (API key, auth domain, project ID, app ID, etc.).
2. Open `assets/config.js` and **replace its placeholders** with your own complete Firebase Web App config. Do not paste a Firebase Admin SDK private key or service account credential.
3. In Firebase Console → **Build → Authentication → Sign-in method**, enable **Email/Password** and **Google** (configure the Google support email).
4. In Firebase Console → **Authentication → Settings → Authorized domains**, add your website hostname (and `localhost` if you're using localhost for testing; new Firebase projects do not necessarily include it automatically).
5. In Firebase Console → **Build → Firestore Database**, create a database in a suitable region. Use the normal/native Firestore database, not the Realtime Database product.
6. In Firestore → **Rules**, replace the rules with the complete contents of `firestore.rules`, then click **Publish**. These rules are required. Do not enable open test rules for the live website.
7. Open this folder in VS Code and use **Live Server** (or host on GitHub Pages/Firebase Hosting). Do not use a `file:///` address; browser ES modules require HTTP(S).
8. **Create first administrator**: sign up with email/password or Google, then open Firebase Console → Authentication → Users to copy that user's Firebase UID. In Firestore → Data → `roles` → document ID = **that UID** → set/edit field `role` (string) to `admin`. This is a trusted **Firebase Console action**, not a frontend user action. Log out and log back in.
9. Log in as admin at `login.html`. Go to `requests.html` for courier/admin approvals, and `admin.html` to register shipments and assign customers/couriers by their registered email.

### Page routes

| Page | Path |
|---|---|
| Public tracking | `index.html` |
| Login | `login.html` |
| Signup | `signup.html` |
| Profile / access requests | `account.html` |
| Admin shipments overview | `dashboard.html` |
| Admin shipments / assignments | `admin.html` |
| Admin request approvals | `requests.html` |
| Customer dashboard | `customer-dashboard.html` |
| Courier dashboard | `courier-dashboard.html` |
| Forgot password | `forgot-password.html` |

**Firestore collections**: `users`, `roles`, `roleRequests`, `shipments`, and `publicTracking`. A long tracking number is treated as a lookup secret; do not publish or guess tracking codes. Public tracking does not expose customer names or registered email addresses.

### Testing courier GPS

1. An existing user requests courier status from `account.html`; an admin approves at `requests.html`.
2. Admin creates a shipment in `admin.html`, updates the status to **In Transit**, then assigns both a registered customer email and approved courier email.
3. Courier logs in on a location-enabled phone over **HTTPS**, opens `courier-dashboard.html`, and clicks **Start GPS sharing** while carrying the package. Browser background limitations apply.
4. Customer logs in and opens `customer-dashboard.html` to see the package's last reported location, which refreshes via Firestore listeners. The map requires internet access for OpenStreetMap tiles.

**GPS caveat:** This is *courier-device location reporting*, not a dedicated tracking sensor embedded in an item. Position may be stale if the courier loses signal, denies permission, leaves the page, or closes the browser.

### Migrating Supabase data (optional)

**The new frontend does not connect to Supabase.** This download does not contain your online Supabase records. Old Supabase email/password accounts and their passwords cannot simply be reused in Firebase. Users must register/sign in through Firebase, then admins must reassign shipments to their new Firebase UIDs.

To import *shipments only* from a Supabase export:

1. Export the `shipments` table as JSON from your **own** Supabase project, keeping any private customer information secure.
2. On your own PC, install Node.js, then run `npm install firebase-admin` within the project directory.
3. Download a Firebase service account credential from Firebase Console → Project settings → Service accounts **only for use locally by an authorized project owner**. Keep it **outside this repository**; never upload it to GitHub or put it in browser code.
4. Set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute file path and run `node tools/import-shipments.mjs path/to/shipments.json`.
5. The importer writes both private shipments and public safe projections; it replaces any legacy weak tracking numbers with high-entropy ones and prints a mapping. It does not import existing individual history events or Auth accounts.

For a complete migration preserving shipment-history timestamps and user relationships, a tailored one-time import script would be needed for your actual exported data. Back up the Supabase project and test on a separate Firebase project first.

### Deployment and security

- Public browser code (HTML, CSS, JavaScript) and Firebase Web App configuration are visible to visitors; a public website cannot keep them secret. The Firebase Web App `apiKey` is a public identifier, not a password or service-account key. Minifying or moving it to another frontend file does not make it secret.
- Restrict the Firebase browser API key in Google Cloud Console → **APIs & Services → Credentials** to HTTP referrers for the site. For this GitHub Pages deployment, allow `https://urmarkiee.github.io/*`; keep localhost entries only while needed for development. This limits where the key can normally be used, but does not hide it or replace backend security.
- In Firebase Console → **Authentication → Settings → Authorized domains**, add `urmarkiee.github.io` so sign-in works on GitHub Pages.
- Never put service-account JSON, private keys, or other server credentials in this repository or browser code. Use a trusted backend such as Cloud Functions or Cloud Run for operations that require secrets.
- Do not grant `admin` or `courier` by choosing a signup option. New users are customers until approved.
- Firestore protection depends on the restrictive `firestore.rules` and Firebase Authentication, not on hiding the Web API key.
- Test all Firestore rules (ideally in Firebase Emulator Suite) before real customer use. Frontend files passed local JavaScript syntax checks; live Firebase integration has not been exercised in your project.
- Firestore usage, Auth email limits, and map tile availability depend on the providers and account plans.
