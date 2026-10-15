-- Run AFTER schema.sql and auth-upgrade.sql, once per project.
-- Links customer and courier accounts to shipments without exposing auth.users.
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS courier_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS gps_reported_at timestamptz;
CREATE INDEX IF NOT EXISTS shipments_customer_lookup ON public.shipments(customer_user_id);
CREATE INDEX IF NOT EXISTS shipments_courier_lookup ON public.shipments(courier_user_id);

-- Authenticated customer can view ONLY their linked shipments. Admin policy remains active.
DROP POLICY IF EXISTS shipments_customer_read_own ON public.shipments;
CREATE POLICY shipments_customer_read_own ON public.shipments FOR SELECT TO authenticated
USING (customer_user_id = (select auth.uid()));
-- Assigned courier can read the shipments they are carrying.
DROP POLICY IF EXISTS shipments_courier_read_own ON public.shipments;
CREATE POLICY shipments_courier_read_own ON public.shipments FOR SELECT TO authenticated
USING (courier_user_id = (select auth.uid()));
-- User roles are always checked in SQL; customer cannot edit coordinates or assignments.

CREATE OR REPLACE FUNCTION public.assign_shipment_accounts(
  p_tracking_number text,
  p_customer_email text,
  p_courier_email text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE customer_id uuid; courier_id uuid;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin approval required'; END IF;
 IF length(trim(coalesce(p_tracking_number,'')))=0 THEN RAISE EXCEPTION 'Tracking number required'; END IF;
 IF nullif(trim(coalesce(p_customer_email,'')),'') IS NOT NULL THEN
   SELECT id INTO customer_id FROM auth.users WHERE lower(email)=lower(trim(p_customer_email));
   IF customer_id IS NULL THEN RAISE EXCEPTION 'Customer account not found'; END IF;
 END IF;
 IF nullif(trim(coalesce(p_courier_email,'')),'') IS NOT NULL THEN
   SELECT id INTO courier_id FROM auth.users WHERE lower(email)=lower(trim(p_courier_email));
   IF courier_id IS NULL THEN RAISE EXCEPTION 'Courier account not found'; END IF;
 END IF;
 UPDATE public.shipments SET customer_user_id=customer_id, courier_user_id=courier_id
 WHERE tracking_number=upper(trim(p_tracking_number));
 IF NOT FOUND THEN RAISE EXCEPTION 'Tracking number not found'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assign_shipment_accounts(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_shipment_accounts(text,text,text) TO authenticated;

-- Must be assigned as courier. Accept only measured GPS and live shipment statuses.
CREATE OR REPLACE FUNCTION public.report_courier_gps(
 p_shipment_id uuid, p_latitude double precision, p_longitude double precision
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_latitude IS NULL OR p_longitude IS NULL OR
    NOT (p_latitude BETWEEN -90 AND 90 AND p_longitude BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Coordinates outside valid range';
 END IF;
 UPDATE public.shipments
 SET latitude=p_latitude, longitude=p_longitude, gps_reported_at=now()
 WHERE id=p_shipment_id AND courier_user_id=(select auth.uid())
 AND status IN ('In Transit','Out for Delivery');
 IF NOT FOUND THEN RAISE EXCEPTION 'Not assigned to active shipment'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.report_courier_gps(uuid,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_courier_gps(uuid,double precision,double precision) TO authenticated;

-- Optional: if a customer wants the history of their own shipment, history remains admin-only
-- and the existing tracking RPC can be used with an exact unpredictable tracking code.
-- Existing package tracking RPC still permits anyone holding the tracking number to look up
-- limited tracking details. Disable that RPC separately if you require login-only tracking.
