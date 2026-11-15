-- PERUSAT CREW · Operación El Niño · endurecimiento de seguridad (rol 02)
--
-- Se aplica DESPUÉS de 0001_perusat_core.sql. No modifica 0001: así la revisión es un diff claro.
-- ESTADO: ver supabase/README.md (se indica ahí qué se ejecutó de verdad y dónde).
--
-- Qué corrige (hallazgos de la auditoría del rol 02):
--  1. Permisos de tabla: 0001 solo revocaba escritura; ahora anon/authenticated parten de cero
--     y authenticated recibe únicamente SELECT (RLS decide qué filas).
--  2. Funciones SECURITY DEFINER con search_path vacío (todo va calificado con esquema).
--  3. commit_mission_event: comprueba la membresía ANTES de la idempotencia (un ajeno no se
--     entera de eventos) y rechaza un actionId reutilizado con otro contenido (conflict_payload).
--  4. Orden estricto de eventos (columna seq) para calcular el puntaje desde el historial.
--  5. join_room: código de sala más largo en el espacio de búsqueda y límite de intentos fallidos.
--  6. create_room_with_state: valida que el snapshot sea el inicial de ESA sala y limita salas
--     por usuario; el código de sala sale de un generador criptográfico.
--  7. Informe: se guarda el puntaje calculado en el servidor (mission_reports.score).
--  8. Realtime: solo mission_state (el cliente no necesita leer eventos).

-- ─────────────────────────────── Columnas nuevas ───────────────────────────────

alter table public.mission_rooms  add column if not exists created_by uuid;
alter table public.mission_events add column if not exists seq bigint generated always as identity;
alter table public.mission_reports add column if not exists score jsonb;

create index if not exists mission_events_room_seq_idx on public.mission_events (room_id, seq);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mission_reports_report_id_len') then
    alter table public.mission_reports
      add constraint mission_reports_report_id_len check (char_length(report_id) between 1 and 100);
  end if;
end;
$$;

-- Intentos fallidos de unirse por código (solo lo toca join_room; nadie lo lee desde el cliente).
create table if not exists public.join_attempts (
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists join_attempts_user_idx on public.join_attempts (user_id, attempted_at desc);
alter table public.join_attempts enable row level security;

-- ───────────────────────────── Permisos de tabla ─────────────────────────────

revoke all on
  public.mission_rooms, public.room_members, public.mission_state,
  public.mission_events, public.observations, public.mission_reports, public.join_attempts
  from anon, authenticated;

grant select on
  public.mission_rooms, public.room_members, public.mission_state,
  public.mission_events, public.observations, public.mission_reports
  to authenticated;

-- ───────────────────────────── Funciones ─────────────────────────────

create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members where room_id = p_room and user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

-- Crear sala: SOLO la Edge Function (clave de servicio). El snapshot inicial lo genera el servidor.
create or replace function public.create_room_with_state(
  p_room_id uuid, p_owner uuid, p_owner_role text, p_scenario text, p_snapshot jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 símbolos, sin 0/O/1/I/L
  v_code  text;
  v_bytes bytea;
  v_try   integer := 0;
  i       integer;
begin
  if p_owner is null then raise exception 'owner_required'; end if;
  if p_owner_role not in ('ground', 'satellite') then raise exception 'invalid_role'; end if;
  if p_scenario not in ('A1', 'A2') then raise exception 'invalid_scenario'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then raise exception 'invalid_snapshot'; end if;

  -- El snapshot debe ser exactamente el inicial de esta sala y de este escenario.
  if (p_snapshot->>'roomId')     is distinct from p_room_id::text
     or (p_snapshot->>'missionId')  is distinct from 'flood-piura-01'
     or (p_snapshot->>'scenarioId') is distinct from p_scenario
     or (p_snapshot->>'phase')      is distinct from 'briefing'
     or (p_snapshot->>'status')     is distinct from 'ready'
     or (p_snapshot->>'revision')   is distinct from '0' then
    raise exception 'snapshot_inconsistent';
  end if;

  -- Límite por usuario para que una sesión anónima no pueda inundar la base de salas.
  if (select count(*) from public.mission_rooms
       where created_by = p_owner and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
    end loop;
    begin
      insert into public.mission_rooms (id, join_code, scenario_id, created_by)
      values (p_room_id, v_code, p_scenario, p_owner);
      exit;
    exception when unique_violation then
      if exists (select 1 from public.mission_rooms where id = p_room_id) then
        raise exception 'room_exists';
      end if;
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
-- Estados: joined | already_member | room_full | room_not_found | rate_limited | retry
create or replace function public.join_room(p_join_code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_room uuid;
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.join_attempts where user_id = v_uid and attempted_at < now() - interval '1 hour';
  if (select count(*) from public.join_attempts
       where user_id = v_uid and attempted_at > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select id into v_room from public.mission_rooms
   where join_code = upper(trim(coalesce(p_join_code, '')));
  if not found then
    insert into public.join_attempts (user_id) values (v_uid);
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

-- Confirmar un evento: SOLO la Edge Function, después de ejecutar applyAction().
-- Estados: accepted | denied | duplicate | conflict_payload | stale | not_member | no_room | rate_limited
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
  p_report             jsonb default null  -- {reportId, finding, evidence, score}; solo con SUBMIT_REPORT
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_revision integer;
  v_prev     public.mission_events%rowtype;
  v_new      integer;
begin
  if p_result not in ('accepted', 'denied') then raise exception 'invalid_result'; end if;
  if p_event_id is null or char_length(p_event_id) not between 1 and 100 then
    raise exception 'invalid_event_id';
  end if;

  -- 1) Bloqueo por sala: serializa los eventos de los dos jugadores.
  select revision into v_revision from public.mission_state where room_id = p_room_id for update;
  if not found then
    return jsonb_build_object('status', 'no_room');
  end if;

  -- 2) El actor debe ser miembro con ese rol (antes de mirar el historial).
  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = p_actor_id and role = p_actor_role
  ) then
    return jsonb_build_object('status', 'not_member');
  end if;

  -- 3) Idempotencia: mismo eventId y mismo contenido devuelve el resultado anterior sin tocar nada;
  --    mismo eventId con otro contenido se rechaza.
  select * into v_prev from public.mission_events where room_id = p_room_id and event_id = p_event_id;
  if found then
    if v_prev.actor_id = p_actor_id and v_prev.action = p_action then
      return jsonb_build_object('status', 'duplicate', 'result', v_prev.result,
                                'reason', v_prev.reason, 'revision', v_prev.revision);
    end if;
    return jsonb_build_object('status', 'conflict_payload');
  end if;

  -- 4) Control de revisión (evita sobrescrituras entre clientes).
  if p_expected_revision <> v_revision then
    return jsonb_build_object('status', 'stale', 'revision', v_revision);
  end if;

  if p_report is not null and p_action->>'type' is distinct from 'SUBMIT_REPORT' then
    raise exception 'report_only_on_submit';
  end if;

  if p_result = 'accepted' then
    if p_new_snapshot is null or jsonb_typeof(p_new_snapshot) <> 'object' then
      raise exception 'accepted_requires_snapshot';
    end if;
    if p_action->>'type' = 'SUBMIT_REPORT' and p_report is null then
      raise exception 'report_required';
    end if;
    v_new := v_revision + 1;
    if (p_new_snapshot->>'revision')::integer <> v_new then
      raise exception 'snapshot_revision_mismatch';
    end if;
    if (p_new_snapshot->>'roomId') is distinct from p_room_id::text then
      raise exception 'snapshot_room_mismatch';
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
      delete from public.mission_reports where room_id = p_room_id;
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
      insert into public.mission_reports (report_id, room_id, finding, evidence, score)
      values (p_report->>'reportId', p_room_id, p_report->>'finding',
              coalesce(p_report->'evidence', '[]'::jsonb), p_report->'score')
      on conflict (room_id, report_id) do update
        set finding = excluded.finding, evidence = excluded.evidence, score = excluded.score;
    end if;

    return jsonb_build_object('status', 'accepted', 'revision', v_new);
  end if;

  -- Denegada: se registra (sirve para el puntaje) pero la revisión no cambia.
  -- Tope de denegaciones por sala para que nadie llene la tabla con intentos inválidos.
  if (select count(*) from (
        select 1 from public.mission_events
         where room_id = p_room_id and result = 'denied' limit 1000) d) >= 1000 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.mission_events (event_id, room_id, actor_id, actor_role, action, result, reason, revision)
  values (p_event_id, p_room_id, p_actor_id, p_actor_role, p_action, 'denied', left(p_reason, 60), v_revision);
  return jsonb_build_object('status', 'denied', 'revision', v_revision, 'reason', p_reason);
end;
$$;

-- Permisos de ejecución (se reafirman porque create or replace conserva los anteriores).
revoke all on function public.create_room_with_state(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.commit_mission_event(uuid, text, uuid, text, jsonb, integer, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.join_room(text) from public, anon;
grant execute on function public.create_room_with_state(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.commit_mission_event(uuid, text, uuid, text, jsonb, integer, text, text, jsonb, jsonb)
  to service_role;
grant execute on function public.join_room(text) to authenticated;

-- ───────────────────────────── Realtime ─────────────────────────────
-- Solo mission_state: cada cambio confirmado actualiza esa fila. Los eventos (incluidos los
-- denegados del otro jugador) no hace falta publicarlos al navegador.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mission_events') then
      alter publication supabase_realtime drop table public.mission_events;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mission_state') then
      alter publication supabase_realtime add table public.mission_state;
    end if;
  end if;
end;
$$;
