-- PERUSAT CREW · Operación El Niño · esquema mínimo (rol 02)
--
-- ESTADO: escrito pero NO ejecutado todavía en un proyecto Supabase real.
-- Antes de la demo hay que probar: RLS (un usuario ajeno no lee ni escribe), reconexión
-- y la función commit_mission_event con dos navegadores (casos de la lista de aceptación).
--
-- Principio: el navegador NUNCA escribe estado. Solo lee (con RLS) y recibe Realtime.
-- Todo cambio pasa por una Edge Function que ejecuta src/missions/flood/rules.ts y luego
-- llama a commit_mission_event con la clave de servicio.
--
-- Convención: columnas en snake_case (Postgres); los tipos TypeScript siguen en camelCase.
--
-- Revisión v2: event_id pasa de uuid a text (el contrato lo define como string) y es único
-- por sala (room_id, event_id); la búsqueda de duplicados filtra por sala; RESET_MISSION
-- también borra los informes de la partida anterior.

-- ─────────────────────────────── Tablas ───────────────────────────────

create table public.mission_rooms (
  id          uuid primary key,
  join_code   text not null unique,
  mission_id  text not null default 'flood-piura-01' check (mission_id = 'flood-piura-01'),
  scenario_id text not null check (scenario_id in ('A1', 'A2')),
  phase       text not null default 'briefing'
              check (phase in ('briefing', 'planning', 'capture', 'downlink', 'review', 'debrief')),
  status      text not null default 'ready' check (status in ('ready', 'running', 'won', 'lost')),
  created_at  timestamptz not null default now()
);

create table public.room_members (
  room_id   uuid not null references public.mission_rooms (id) on delete cascade,
  user_id   uuid not null,
  role      text not null check (role in ('ground', 'satellite')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, role) -- un solo ground y un solo satellite por sala
);

create table public.mission_state (
  room_id    uuid primary key references public.mission_rooms (id) on delete cascade,
  snapshot   jsonb not null,
  revision   integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table public.mission_events (
  event_id   text not null check (char_length(event_id) between 1 and 100), -- idempotencia: un reintento no se aplica dos veces
  room_id    uuid not null references public.mission_rooms (id) on delete cascade,
  actor_id   uuid not null,
  actor_role text not null check (actor_role in ('ground', 'satellite')),
  action     jsonb not null,
  result     text not null check (result in ('accepted', 'denied')),
  reason     text, -- código de denegación (DenialCode)
  revision   integer not null,
  created_at timestamptz not null default now(),
  primary key (room_id, event_id)
);
create index mission_events_room_idx on public.mission_events (room_id, created_at);

create table public.observations (
  room_id         uuid not null references public.mission_rooms (id) on delete cascade,
  observation_id  text not null,
  target_id       text not null,
  quality         text not null check (quality in ('valid', 'cloudy', 'corrupt', 'incomplete')),
  size_mb         numeric not null,
  captured_at     timestamptz not null,
  is_simulated    boolean not null,
  source_provider text not null check (source_provider in ('NASA', 'CONIDA', 'GAME_SIMULATION')),
  source_url      text,
  transmitted     boolean not null default false,
  finding         text check (finding in ('normal', 'possible_flood', 'insufficient')),
  primary key (room_id, observation_id)
);

create table public.mission_reports (
  report_id    text not null,
  room_id      uuid not null references public.mission_rooms (id) on delete cascade,
  finding      text not null check (finding in ('normal', 'possible_flood', 'insufficient')),
  evidence     jsonb not null,
  generated_at timestamptz not null default now(),
  primary key (room_id, report_id)
);

-- ─────────────────────────── Seguridad (RLS) ───────────────────────────

-- Función auxiliar con SECURITY DEFINER para evitar recursión infinita en las políticas.
create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_members where room_id = p_room and user_id = auth.uid()
  );
$$;
grant execute on function public.is_room_member(uuid) to authenticated;

alter table public.mission_rooms   enable row level security;
alter table public.room_members    enable row level security;
alter table public.mission_state   enable row level security;
alter table public.mission_events  enable row level security;
alter table public.observations    enable row level security;
alter table public.mission_reports enable row level security;

-- Solo lectura para los miembros de la sala. No hay políticas de INSERT/UPDATE/DELETE:
-- ningún cliente puede modificar estado, eventos ni observaciones.
create policy rooms_read   on public.mission_rooms   for select to authenticated using (public.is_room_member(id));
create policy members_read on public.room_members    for select to authenticated
  using (user_id = auth.uid() or public.is_room_member(room_id));
create policy state_read   on public.mission_state   for select to authenticated using (public.is_room_member(room_id));
create policy events_read  on public.mission_events  for select to authenticated using (public.is_room_member(room_id));
create policy obs_read     on public.observations    for select to authenticated using (public.is_room_member(room_id));
create policy reports_read on public.mission_reports for select to authenticated using (public.is_room_member(room_id));

revoke insert, update, delete, truncate on
  public.mission_rooms, public.room_members, public.mission_state,
  public.mission_events, public.observations, public.mission_reports
  from anon, authenticated;

-- ───────────────────────────── Funciones ─────────────────────────────

-- Crear sala: la llama SOLO la Edge Function (clave de servicio), que genera el snapshot
-- inicial con createInitialSnapshot() y el uuid de la sala.
create or replace function public.create_room_with_state(
  p_room_id uuid, p_owner uuid, p_owner_role text, p_scenario text, p_snapshot jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_try  integer := 0;
begin
  if p_owner_role not in ('ground', 'satellite') then
    raise exception 'invalid_role';
  end if;
  if (p_snapshot->>'revision')::integer <> 0 then
    raise exception 'snapshot_must_start_at_revision_0';
  end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    begin
      insert into public.mission_rooms (id, join_code, scenario_id) values (p_room_id, v_code, p_scenario);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try >= 5 then raise exception 'join_code_collision'; end if;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, role) values (p_room_id, p_owner, p_owner_role);
  insert into public.mission_state (room_id, snapshot, revision) values (p_room_id, p_snapshot, 0);
  return jsonb_build_object('roomId', p_room_id, 'joinCode', v_code, 'role', p_owner_role);
end;
$$;

-- Unirse por código: la llama el cliente (usuario anónimo autenticado). Asigna el rol libre.
create or replace function public.join_room(p_join_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_room uuid;
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_room from public.mission_rooms where join_code = upper(trim(p_join_code));
  if not found then
    return jsonb_build_object('status', 'room_not_found');
  end if;

  select role into v_role from public.room_members where room_id = v_room and user_id = v_uid;
  if found then
    return jsonb_build_object('status', 'already_member', 'roomId', v_room, 'role', v_role);
  end if;

  select t.r into v_role
  from (values ('ground'), ('satellite')) as t (r)
  where not exists (select 1 from public.room_members m where m.room_id = v_room and m.role = t.r)
  limit 1;
  if v_role is null then
    return jsonb_build_object('status', 'room_full');
  end if;

  insert into public.room_members (room_id, user_id, role) values (v_room, v_uid, v_role);
  return jsonb_build_object('status', 'joined', 'roomId', v_room, 'role', v_role);
exception when unique_violation then
  return jsonb_build_object('status', 'retry'); -- dos personas entraron a la vez
end;
$$;

-- Confirmar un evento: la llama SOLO la Edge Function después de ejecutar applyAction().
-- Es atómica: bloquea la fila de estado, comprueba idempotencia, pertenencia y revisión,
-- y guarda estado + evento + observaciones (+ informe) en una sola transacción.
create or replace function public.commit_mission_event(
  p_room_id            uuid,
  p_event_id           text,
  p_actor_id           uuid,
  p_actor_role         text,
  p_action             jsonb,
  p_expected_revision  integer,
  p_result             text,   -- 'accepted' | 'denied'
  p_reason             text,   -- código de denegación, o null
  p_new_snapshot       jsonb,  -- obligatorio si accepted
  p_report             jsonb default null  -- {reportId, finding, evidence} al enviar informe
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_revision integer;
  v_prev     public.mission_events%rowtype;
  v_new      integer;
begin
  -- 1) Bloqueo por sala: serializa los eventos de los dos jugadores.
  select revision into v_revision from public.mission_state where room_id = p_room_id for update;
  if not found then
    return jsonb_build_object('status', 'no_room');
  end if;

  -- 2) Idempotencia: el mismo eventId devuelve el resultado anterior sin tocar nada.
  select * into v_prev from public.mission_events where room_id = p_room_id and event_id = p_event_id;
  if found then
    return jsonb_build_object('status', 'duplicate', 'result', v_prev.result,
                              'reason', v_prev.reason, 'revision', v_prev.revision);
  end if;

  -- 3) El actor debe ser miembro de la sala con ese rol.
  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = p_actor_id and role = p_actor_role
  ) then
    return jsonb_build_object('status', 'not_member');
  end if;

  -- 4) Control de revisión (evita sobrescrituras entre clientes).
  if p_expected_revision <> v_revision then
    return jsonb_build_object('status', 'stale', 'revision', v_revision);
  end if;

  if p_result = 'accepted' then
    if p_new_snapshot is null then
      raise exception 'accepted_requires_snapshot';
    end if;
    v_new := v_revision + 1;
    if (p_new_snapshot->>'revision')::integer <> v_new then
      raise exception 'snapshot_revision_mismatch';
    end if;

    update public.mission_state
       set snapshot = p_new_snapshot, revision = v_new, updated_at = now()
     where room_id = p_room_id;

    update public.mission_rooms
       set phase = p_new_snapshot->>'phase', status = p_new_snapshot->>'status'
     where id = p_room_id;

    insert into public.mission_events (event_id, room_id, actor_id, actor_role, action, result, reason, revision)
    values (p_event_id, p_room_id, p_actor_id, p_actor_role, p_action, 'accepted', null, v_new);

    if p_action->>'type' = 'RESET_MISSION' then
      delete from public.observations where room_id = p_room_id;
      delete from public.mission_reports where room_id = p_room_id; -- el informe nuevo no choca con uno viejo
    else
      insert into public.observations
        (room_id, observation_id, target_id, quality, size_mb, captured_at,
         is_simulated, source_provider, source_url, transmitted, finding)
      select p_room_id, o->>'observationId', o->>'targetId', o->>'quality', (o->>'sizeMb')::numeric,
             (o->>'capturedAtUtc')::timestamptz, (o->>'isSimulated')::boolean,
             o->>'sourceProvider', o->>'sourceUrl', (o->>'transmitted')::boolean, o->>'finding'
      from jsonb_array_elements(p_new_snapshot->'observations') as o
      on conflict (room_id, observation_id) do update
        set quality = excluded.quality, transmitted = excluded.transmitted, finding = excluded.finding;
    end if;

    if p_report is not null then
      insert into public.mission_reports (report_id, room_id, finding, evidence)
      values (p_report->>'reportId', p_room_id, p_report->>'finding', coalesce(p_report->'evidence', '[]'::jsonb))
      on conflict do nothing;
    end if;

    return jsonb_build_object('status', 'accepted', 'revision', v_new);
  end if;

  -- Denegada: se registra (sirve para el puntaje) pero la revisión no cambia.
  insert into public.mission_events (event_id, room_id, actor_id, actor_role, action, result, reason, revision)
  values (p_event_id, p_room_id, p_actor_id, p_actor_role, p_action, 'denied', p_reason, v_revision);
  return jsonb_build_object('status', 'denied', 'revision', v_revision, 'reason', p_reason);
end;
$$;

-- Permisos de ejecución: crear y confirmar solo con clave de servicio; unirse, el cliente.
revoke all on function public.create_room_with_state(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.commit_mission_event(uuid, text, uuid, text, jsonb, integer, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.join_room(text) from public, anon;
grant execute on function public.create_room_with_state(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.commit_mission_event(uuid, text, uuid, text, jsonb, integer, text, text, jsonb, jsonb)
  to service_role;
grant execute on function public.join_room(text) to authenticated;

-- ───────────────────────────── Realtime ─────────────────────────────
-- Avisa a ambos clientes de cada cambio confirmado (RLS se aplica también aquí).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.mission_state, public.mission_events;
  end if;
end;
$$;
