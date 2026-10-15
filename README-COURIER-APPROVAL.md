COURIER APPROVAL UPGRADE
1. Back up your project. This ZIP includes the existing LogiTrack project with an added courier approval feature.
2. In Supabase SQL Editor run courier-approval-upgrade.sql AFTER your existing schema.sql, auth-upgrade.sql, customer-gps-upgrade.sql. The updated courier migration can be rerun safely; it clears saved GPS coordinates from shipments already marked Delivered.
3. Confirm an existing admin is registered in public.admin_users.
4. Customers can sign in, open account.html, and click Request courier access.
5. Admins open requests.html, which now has an Admin requests section AND a Courier access requests section. Approve or Reject.
6. Once approved, a courier can be assigned to a shipment in admin.html and report GPS using courier-dashboard.html over HTTPS.
7. NOTE: Not actual GPS from the parcel. The courier must carry the device with the shipment and actively enable location sharing.
8. For production, verify your project URL/key and review all security policies before publishing.
