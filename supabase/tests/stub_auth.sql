-- Simula o mínimo do Supabase (auth.uid, papéis) para testar a migração num Postgres comum.
do $$ begin if not exists (select from pg_roles where rolname=$q$authenticated$q$) then create role authenticated nologin; create role anon nologin; end if; end $$;
create schema auth; create schema extensions;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, extensions, public to authenticated;
