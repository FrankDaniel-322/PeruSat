-- Entorno mínimo que Supabase ya trae y que las migraciones dan por existente.
-- SOLO para las pruebas locales con PGlite; nunca se ejecuta en un proyecto real.

create schema if not exists auth;

-- auth.uid() de Supabase lee el claim "sub" del JWT de la petición.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase concede por defecto todo a estos roles sobre lo que se cree en public:
-- se reproduce para comprobar que las migraciones lo recortan.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create publication supabase_realtime;
