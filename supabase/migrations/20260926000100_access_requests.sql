-- Supabase-only account provisioning and administrator-reviewed role requests.
-- User metadata may request a role, but it never grants that role directly.

begin;

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  requested_role public.app_role not null,
  reason text,
  status text not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_requests_requester_id_fkey foreign key (requester_id) references public.profiles(id) on delete cascade,
  constraint access_requests_reviewed_by_fkey foreign key (reviewed_by) references public.profiles(id) on delete set null,
  constraint access_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint access_requests_reason_length check (reason is null or char_length(reason) <= 1000),
  constraint access_requests_review_consistency check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  )
);

create unique index access_requests_one_pending_per_user_idx
  on public.access_requests (requester_id)
  where status = 'pending';
create index access_requests_status_created_idx
  on public.access_requests (status, created_at);

create trigger set_access_requests_updated_at
  before update on public.access_requests
  for each row execute function public.set_updated_at();

alter table public.access_requests enable row level security;
revoke all on table public.access_requests from anon, authenticated;
grant select on table public.access_requests to authenticated;

create policy access_requests_own_or_admin_read
  on public.access_requests for select to authenticated
  using (requester_id = (select auth.uid()) or public.is_admin());

create or replace function public.create_access_request(
  p_requested_role public.app_role,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
  requester public.profiles%rowtype;
begin
  select * into requester
  from public.profiles
  where id = (select auth.uid()) and is_active;

  if not found then
    raise exception 'An active authenticated profile is required.' using errcode = '42501';
  end if;

  if requester.role = p_requested_role then
    raise exception 'The requested role is already assigned.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.access_requests
    where requester_id = requester.id and status = 'pending'
  ) then
    raise exception 'A role request is already pending.' using errcode = '23505';
  end if;

  insert into public.access_requests (requester_id, requested_role, reason)
  values (requester.id, p_requested_role, nullif(btrim(p_reason), ''))
  returning id into request_id;

  insert into public.notifications (recipient_id, notification_type, title, body, payload)
  select profile.id,
         'access_request',
         'Role access request',
         requester.email || ' requested ' || replace(p_requested_role::text, '_', ' ') || ' access.',
         jsonb_build_object('access_request_id', request_id, 'requester_id', requester.id, 'requested_role', p_requested_role)
  from public.profiles profile
  where profile.role = 'administrator'::public.app_role
    and profile.is_active
    and profile.id <> requester.id;

  return request_id;
end;
$$;

create or replace function public.admin_review_access_request(
  p_request_id uuid,
  p_approve boolean,
  p_assigned_role public.app_role default null,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_request public.access_requests%rowtype;
  final_role public.app_role;
  prior_role public.app_role;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  select * into access_request
  from public.access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found.' using errcode = 'P0002';
  end if;
  if access_request.status <> 'pending' then
    raise exception 'This access request has already been reviewed.' using errcode = '22023';
  end if;

  select role into prior_role from public.profiles where id = access_request.requester_id for update;
  if prior_role is null then
    raise exception 'Requester profile not found.' using errcode = 'P0002';
  end if;

  final_role := coalesce(p_assigned_role, access_request.requested_role);
  if p_approve then
    update public.profiles
    set role = final_role, is_active = true
    where id = access_request.requester_id;
  end if;

  update public.access_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      review_notes = nullif(btrim(p_review_notes), '')
  where id = p_request_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, table_name, record_key, old_values, new_values, source
  ) values (
    (select auth.uid()),
    case when p_approve then 'approve_access_request' else 'reject_access_request' end,
    'access_request',
    p_request_id,
    'access_requests',
    p_request_id::text,
    jsonb_build_object('status', 'pending', 'profile_role', prior_role),
    jsonb_build_object(
      'status', case when p_approve then 'approved' else 'rejected' end,
      'profile_role', case when p_approve then final_role else prior_role end
    ),
    'admin_portal'
  );

  insert into public.notifications (recipient_id, notification_type, title, body, payload)
  values (
    access_request.requester_id,
    'access_request_reviewed',
    case when p_approve then 'Access request approved' else 'Access request declined' end,
    case when p_approve
      then 'Your DRISHTI role is now ' || replace(final_role::text, '_', ' ') || '.'
      else 'Your requested DRISHTI role was not approved. Contact the Administrator for details.'
    end,
    jsonb_build_object('access_request_id', p_request_id, 'approved', p_approve, 'assigned_role', case when p_approve then final_role else prior_role end)
  );
end;
$$;

-- Extend new-user provisioning. The profile always starts as Executive;
-- requested_role creates a pending request only and cannot self-elevate.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role_text text := lower(coalesce(new.raw_user_meta_data ->> 'requested_role', 'executive'));
  requested_role public.app_role;
  request_reason text := nullif(btrim(new.raw_user_meta_data ->> 'access_request_reason'), '');
  request_id uuid;
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@pending.local'),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    'executive'::public.app_role
  )
  on conflict (id) do nothing;

  if requested_role_text in ('administrator', 'monitoring_officer', 'analyst') then
    requested_role := requested_role_text::public.app_role;
    insert into public.access_requests (requester_id, requested_role, reason)
    values (new.id, requested_role, request_reason)
    on conflict (requester_id) where status = 'pending' do nothing
    returning id into request_id;

    if request_id is not null then
      insert into public.notifications (recipient_id, notification_type, title, body, payload)
      select profile.id,
             'access_request',
             'New role access request',
             coalesce(new.email, new.id::text) || ' requested ' || replace(requested_role::text, '_', ' ') || ' access.',
             jsonb_build_object('access_request_id', request_id, 'requester_id', new.id, 'requested_role', requested_role)
      from public.profiles profile
      where profile.role = 'administrator'::public.app_role
        and profile.is_active
        and profile.id <> new.id;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.create_access_request(public.app_role, text) from public;
revoke all on function public.admin_review_access_request(uuid, boolean, public.app_role, text) from public;
grant execute on function public.create_access_request(public.app_role, text) to authenticated;
grant execute on function public.admin_review_access_request(uuid, boolean, public.app_role, text) to authenticated;

comment on table public.access_requests is
  'User-requested role changes. Requested roles are never authoritative until an Administrator approves them.';

notify pgrst, 'reload schema';

commit;
