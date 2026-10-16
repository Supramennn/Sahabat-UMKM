-- Paket dan masa uji coba workspace (PRD 6.10, 16).
-- Harga katalog tetap nilai usulan PRD sampai disahkan setelah uji pengguna.

create table workspace_subscriptions (
  workspace_id bigint primary key references workspaces (id) on delete cascade,
  plan_code text not null default 'gratis',
  status text not null default 'aktif',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  trial_used_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint workspace_subscriptions_plan check (plan_code in ('gratis', 'usaha', 'bisnis')),
  constraint workspace_subscriptions_status check (status in ('aktif', 'uji_coba')),
  constraint workspace_subscriptions_trial_dates check (
    (status = 'uji_coba' and plan_code <> 'gratis' and trial_started_at is not null
      and trial_ends_at is not null)
    or (status = 'aktif' and trial_started_at is null and trial_ends_at is null)
  )
);

insert into workspace_subscriptions (workspace_id)
select id from workspaces
on conflict (workspace_id) do nothing;

create trigger workspace_subscriptions_set_updated_at
  before update on workspace_subscriptions
  for each row execute function set_updated_at();

create function create_workspace_subscription() returns trigger as $$
begin
  insert into workspace_subscriptions (workspace_id) values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$ language plpgsql;

create trigger workspaces_create_subscription
  after insert on workspaces
  for each row execute function create_workspace_subscription();
