-- Run in Supabase SQL Editor. New project recommended.
create extension if not exists pgcrypto;
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_number text not null unique,
  item_name text not null,
  customer_name text not null,
  origin text not null,
  destination text not null,
  status text not null default 'Pending' check (status in ('Pending','In Transit','Out for Delivery','Delivered')),
  location text not null default '',
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coord_pair check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);
create table if not exists public.shipment_history (
 id bigint generated always as identity primary key,
 shipment_id uuid not null references public.shipments(id) on delete cascade,
 status text not null,
 location text not null default '',
 note text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists shipment_history_recent on public.shipment_history(shipment_id,created_at desc);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
create or replace function public.touch_shipment() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists shipments_touch on public.shipments;
create trigger shipments_touch before update on public.shipments for each row execute function public.touch_shipment();
create or replace function public.record_shipment_history() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'INSERT' or (old.status,old.location) is distinct from (new.status,new.location) then
  insert into public.shipment_history(shipment_id,status,location,note) values(new.id,new.status,new.location,case when tg_op='INSERT' then 'Shipment created' else 'Shipment updated' end);
 end if;
 return new;
end; $$;
drop trigger if exists shipments_history on public.shipments;
create trigger shipments_history after insert or update on public.shipments for each row execute function public.record_shipment_history();

alter table public.admin_users enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_history enable row level security;
-- Only approved admins can use the direct table APIs.
drop policy if exists admins_read_self on public.admin_users;
create policy admins_read_self on public.admin_users for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists shipment_admin_read on public.shipments;
create policy shipment_admin_read on public.shipments for select to authenticated using ((select public.is_admin()));
drop policy if exists shipment_admin_insert on public.shipments;
create policy shipment_admin_insert on public.shipments for insert to authenticated with check ((select public.is_admin()));
drop policy if exists shipment_admin_update on public.shipments;
create policy shipment_admin_update on public.shipments for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists history_admin_read on public.shipment_history;
create policy history_admin_read on public.shipment_history for select to authenticated using ((select public.is_admin()));
-- Anyone with an exact tracking number may see limited public shipment data through this function.
-- No customer name is returned. A long random tracking number acts as a lookup secret.
create or replace function public.track_package(p_tracking_number text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.shipments%rowtype;
begin
 if length(coalesce(p_tracking_number,'')) > 80 then return null; end if;
 select * into s from public.shipments where tracking_number = upper(trim(p_tracking_number));
 if not found then return null; end if;
 return jsonb_build_object(
  'tracking_number',s.tracking_number,'item_name',s.item_name,
  'origin',s.origin,'destination',s.destination,'status',s.status,
  'location',s.location,'latitude',s.latitude,'longitude',s.longitude,
  'updated_at',s.updated_at,
  'history',coalesce((select jsonb_agg(jsonb_build_object('status',h.status,'location',h.location,'note',h.note,'created_at',h.created_at) order by h.created_at desc,h.id desc)
    from public.shipment_history h where h.shipment_id=s.id),'[]'::jsonb)
 );
end; $$;
revoke all on function public.track_package(text) from public;
grant execute on function public.track_package(text) to anon,authenticated;
-- Insert your admin's auth UUID after creating their account in Supabase Authentication > Users:
-- insert into public.admin_users(user_id) values ('YOUR-ADMIN-AUTH-USER-UUID');
