-- Run AFTER your existing schema.sql. Compatible with existing shipment records.
-- All authenticated users start with customer privileges. Role requests are not grants.
CREATE TABLE IF NOT EXISTS public.account_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  requested_role text NOT NULL DEFAULT 'customer' CHECK (requested_role IN ('customer','admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_select_own ON public.account_profiles;
CREATE POLICY account_select_own ON public.account_profiles FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
-- Profiles are inserted by a trusted trigger, not directly by browser users.
CREATE OR REPLACE FUNCTION public.create_account_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.account_profiles(user_id,full_name,requested_role)
  VALUES (new.id, left(coalesce(new.raw_user_meta_data->>'full_name',''),100),
    CASE WHEN new.raw_user_meta_data->>'requested_role'='admin' THEN 'admin' ELSE 'customer' END)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS account_profile_from_auth ON auth.users;
CREATE TRIGGER account_profile_from_auth AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_account_profile();
-- Existing Auth users are preserved.
INSERT INTO public.account_profiles(user_id,full_name,requested_role)
SELECT id, left(coalesce(raw_user_meta_data->>'full_name',''),100), 'customer'
FROM auth.users ON CONFLICT(user_id) DO NOTHING;

-- A logged-in user can request admin approval, but cannot approve themselves.
CREATE OR REPLACE FUNCTION public.request_admin_access()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.account_profiles SET requested_role='admin'
  WHERE user_id=(select auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.request_admin_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_admin_access() TO authenticated;

-- Only approved administrators can list applications.
CREATE OR REPLACE FUNCTION public.list_admin_requests()
RETURNS TABLE(user_id uuid,full_name text,email text,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY
  SELECT p.user_id,p.full_name,u.email::text,p.created_at
  FROM public.account_profiles p JOIN auth.users u ON u.id=p.user_id
  LEFT JOIN public.admin_users a ON a.user_id=p.user_id
  WHERE p.requested_role='admin' AND a.user_id IS NULL
  ORDER BY p.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_admin_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_requests() TO authenticated;

-- Approval is checked inside the database and cannot be forged from the frontend.
CREATE OR REPLACE FUNCTION public.approve_admin_request(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.account_profiles WHERE user_id=p_user_id AND requested_role='admin')
  THEN RAISE EXCEPTION 'No matching admin request'; END IF;
  INSERT INTO public.admin_users(user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_admin_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_admin_request(uuid) TO authenticated;
