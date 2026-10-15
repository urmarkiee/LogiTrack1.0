# Customer + Courier GPS dashboard upgrade

1. KEEP the existing Supabase project. Run the original schema.sql and auth-upgrade.sql only if they have not been applied.
2. Run `customer-gps-upgrade.sql` in the Supabase SQL Editor. It changes the existing shipments table without deleting records.
3. Set the correct Supabase URL and publishable key in `assets/config.js`. Never put service_role/secret keys in frontend files.
4. Open with VS Code Live Server or deploy via HTTPS.
5. Register a customer account and a courier account using `signup.html` (or Google sign-in). Confirm emails if required.
6. Log in as the EXISTING approved admin. In `admin.html`, create a shipment, set it In Transit, then use the **Assign customer & courier accounts** form with the exact tracking number and registered email addresses.
7. Sign in as the customer: open `customer-dashboard.html`. It shows only assigned shipments and polls for the latest GPS report every 8 seconds.
8. Sign in as the courier: open `courier-dashboard.html` on a GPS-enabled phone over HTTPS, select the assigned active package, press Start GPS sharing and grant location permission. Keep the tab active. Stop sharing when done.

The courier's phone represents a package only if it actually accompanies the package. This is NOT GPS tracking of a package with no GPS hardware. A timestamp identifies whether location information is recent; no location is guaranteed real-time. Browser geolocation requires permission and HTTPS (or localhost); browser background throttling may interrupt reports.

Security: RLS allows customers to read only shipments assigned to their auth.uid; couriers only their assigned shipments. The courier GPS RPC checks assignment and transit status on the database side. An admin-only function assigns account email addresses, rather than letting users claim shipments by themselves. Existing public `track_package` RPC still supports tracking-number lookup. Anyone with a valid tracking number can view limited public details through that function.

There is no self-service courier role creation: an approved admin assigns a signed-in user as courier on a particular shipment. No admin permission is granted to courier/customer accounts. For production use: add location-update retention limits, input/rate limiting, access logs, and decide whether to disable public tracking-by-number.
