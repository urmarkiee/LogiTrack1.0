-- Run AFTER schema.sql, auth-upgrade.sql, customer-gps-upgrade.sql.
CREATE TABLE IF NOT EXISTS public.courier_users (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.courier_requests (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz
);
ALTER TABLE public.courier_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS courier_users_read_own ON public.courier_users;
CREATE POLICY courier_users_read_own ON public.courier_users FOR SELECT TO authenticated USING (user_id=(select auth.uid()));
DROP POLICY IF EXISTS courier_requests_read_own ON public.courier_requests;
CREATE POLICY courier_requests_read_own ON public.courier_requests FOR SELECT TO authenticated USING (user_id=(select auth.uid()));

CREATE OR REPLACE FUNCTION public.request_courier_access()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid := (select auth.uid());
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF EXISTS (SELECT 1 FROM public.courier_users WHERE user_id=uid) THEN RAISE EXCEPTION 'Already approved as courier'; END IF;
 INSERT INTO public.courier_requests(user_id,status,requested_at,reviewed_at)
 VALUES(uid,'pending',now(),null)
 ON CONFLICT(user_id) DO UPDATE SET status='pending',requested_at=now(),reviewed_at=null
 WHERE public.courier_requests.status='rejected';
END; $$;
REVOKE ALL ON FUNCTION public.request_courier_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_courier_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_courier_requests()
RETURNS TABLE(user_id uuid, full_name text, email text, requested_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
 RETURN QUERY
 SELECT r.user_id, coalesce(p.full_name,'')::text,u.email::text,r.requested_at
 FROM public.courier_requests r JOIN auth.users u ON u.id=r.user_id
 LEFT JOIN public.account_profiles p ON p.user_id=r.user_id
 WHERE r.status='pending' ORDER BY r.requested_at ASC;
END; $$;
REVOKE ALL ON FUNCTION public.list_courier_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_courier_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_courier_request(p_user_id uuid,p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
 UPDATE public.courier_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, reviewed_at=now()
 WHERE user_id=p_user_id AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'No pending courier request'; END IF;
 IF p_approve THEN
   INSERT INTO public.courier_users(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.review_courier_request(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_courier_request(uuid,boolean) TO authenticated;

-- Enforce approval for GPS reporting as well as assignment.
CREATE OR REPLACE FUNCTION public.report_courier_gps(
 p_shipment_id uuid, p_latitude double precision, p_longitude double precision
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := (select auth.uid());
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.courier_users WHERE user_id=uid) THEN RAISE EXCEPTION 'Courier approval required'; END IF;
 IF p_latitude IS NULL OR p_longitude IS NULL OR
    NOT (p_latitude BETWEEN -90 AND 90 AND p_longitude BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Coordinates outside valid range'; END IF;
 UPDATE public.shipments SET latitude=p_latitude,longitude=p_longitude,gps_reported_at=now()
 WHERE id=p_shipment_id AND courier_user_id=uid
 AND status IN ('In Transit','Out for Delivery');
 IF NOT FOUND THEN RAISE EXCEPTION 'Not assigned to active shipment'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.report_courier_gps(uuid,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_courier_gps(uuid,double precision,double precision) TO authenticated;

-- Existing account assignment RPC must not assign someone who isn't approved as courier.
CREATE OR REPLACE FUNCTION public.assign_shipment_accounts(
 p_tracking_number text,p_customer_email text,p_courier_email text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE customer_id uuid; courier_id uuid;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin approval required'; END IF;
 IF length(trim(coalesce(p_tracking_number,'')))=0 THEN RAISE EXCEPTION 'Tracking number required'; END IF;
 IF nullif(trim(coalesce(p_customer_email,'')),'') IS NOT NULL THEN
  SELECT id INTO customer_id FROM auth.users WHERE lower(email)=lower(trim(p_customer_email));
  IF customer_id IS NULL THEN RAISE EXCEPTION 'Customer account not found'; END IF;
 END IF;
 IF nullif(trim(coalesce(p_courier_email,'')),'') IS NOT NULL THEN
  SELECT u.id INTO courier_id FROM auth.users u JOIN public.courier_users c ON c.user_id=u.id WHERE lower(u.email)=lower(trim(p_courier_email));
  IF courier_id IS NULL THEN RAISE EXCEPTION 'Courier not found or not approved'; END IF;
 END IF;
 UPDATE public.shipments SET customer_user_id=customer_id,courier_user_id=courier_id
 WHERE tracking_number=upper(trim(p_tracking_number));
 IF NOT FOUND THEN RAISE EXCEPTION 'Tracking number not found'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assign_shipment_accounts(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_shipment_accounts(text,text,text) TO authenticated;
