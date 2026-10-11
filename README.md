# LogiTrack Modern — Supabase edition

Polished responsive pages: `index.html` (customer tracking), `login.html` (admin sign-in), `dashboard.html` (analytics), `admin.html` (shipment operations), `forgot-password.html` and `reset-password.html` (recovery).

## Setup
1. Open `assets/config.js` and replace the placeholder URL with your actual Supabase Project URL. The project publishable key belongs to that same project. Do not use service_role or secret keys in browser files.
2. Use the existing `schema.sql` **only if you have not already installed the same schema**. If your Supabase tables already work, do not run a second schema or delete any tables.
3. Create an admin in Supabase Authentication > Users and add their UUID to `public.admin_users` with the SQL editor: `INSERT INTO public.admin_users(user_id) VALUES ('YOUR-AUTH-USER-UUID') ON CONFLICT (user_id) DO NOTHING;`.
4. Open the folder in VS Code and launch `login.html` through Live Server, or deploy the files to static hosting (Netlify/Vercel). Avoid file:// URLs.
5. For recovery emails, add the exact `reset-password.html` URL in Authentication > URL Configuration > Redirect URLs. Open `forgot-password.html` in your browser to initiate recovery.

All existing app element IDs and Supabase calls are preserved. The visual redesign does not change authentication credentials. Admin functions require a real authorized Supabase user. Tracking displays the last coordinates reported by staff; it is not independent item GPS.

## Security
The schema uses row-level security and a public tracking function which intentionally excludes customer names. For deployment, use unpredictable tracking numbers, do not publish secrets, and consider rate limiting the tracking API.
