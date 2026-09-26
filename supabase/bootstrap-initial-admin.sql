-- Run once in the Supabase SQL Editor after creating the auth user.
-- The password must be set only in Supabase Authentication and never here.
do $$
declare
  administrator_id uuid;
begin
  select id
  into administrator_id
  from auth.users
  where lower(email) = lower('affanmukri007@gmail.com');

  if administrator_id is null then
    raise exception 'Create and confirm affanmukri007@gmail.com in Authentication > Users first.';
  end if;

  -- Establish one initial administrator. Later role requests remain subject to
  -- explicit approval in the Master Access Portal.
  update public.profiles
  set role = 'executive'::public.app_role
  where role = 'administrator'::public.app_role
    and id <> administrator_id;

  update public.profiles
  set role = 'administrator'::public.app_role,
      is_active = true
  where id = administrator_id;

  if not found then
    raise exception 'The auth profile trigger has not created this user profile.';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, table_name, record_key,
    new_values, source
  ) values (
    administrator_id,
    'bootstrap_initial_administrator',
    'profile',
    administrator_id,
    'profiles',
    administrator_id::text,
    jsonb_build_object('role', 'administrator', 'is_active', true),
    'supabase_sql_editor'
  );
end;
$$;
