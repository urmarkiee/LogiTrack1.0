# LogiTrack account registration and Google OAuth

## Upgrade an existing Supabase project
1. Keep your existing `schema.sql` tables/data. In **SQL Editor**, run `auth-upgrade.sql` ONCE. This is an additive migration, not a reset.
2. In `assets/config.js`, replace `YOUR-PROJECT-REF` with your Supabase Project URL. Use only your publishable key, never a service-role/secret key.
3. Under **Authentication → Providers → Google**, enable Google. Configure OAuth Client ID/Secret obtained from Google Cloud Console. Google Cloud OAuth's *authorized redirect URI* is your Supabase callback: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` (or the callback address shown in Supabase). Your app's **Site URL/Redirect URLs** in Supabase should include your website URL and `https://YOUR-DOMAIN/login.html`, plus local Live Server exact URL for development.
4. Host with HTTPS (e.g., GitHub Pages/Netlify). Google login may not work from `file:///` pages.
5. Open `signup.html` to create a customer or request admin access. Existing approved admins can sign in at `login.html` and review requests at `requests.html`. A fresh system needs its initial trusted admin added via Supabase SQL Editor after creating a user: `insert into public.admin_users(user_id) values ('YOUR-AUTH-USER-UUID') on conflict do nothing;`
6. Google users sign in as customers initially; they can request admin approval at `account.html`. Admins can approve those requests at `requests.html`.

## Important security notes
- Registering with `requested_role='admin'` **does not grant admin rights**. SQL RLS limits shipment write access to rows of `admin_users`. The `approve_admin_request` function independently checks caller is already an admin.
- The public `track_package` function still returns data to people with a valid tracking number; use random unpredictable tracking numbers and do not put private details in the returned fields.
- Customer accounts can track by tracking number, but are not automatically linked to package ownership.
- The app does not automatically track devices: coordinate updates are manually reported.
- Test registration, email confirmation, sign-in and OAuth redirects on your deployed domain.
