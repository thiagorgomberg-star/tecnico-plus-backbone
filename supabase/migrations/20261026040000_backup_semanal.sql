-- Backup semanal (GitHub Actions com a chave de serviço): lista das tabelas e dos arquivos novos da semana.
create or replace function backup_tabelas()
returns table (tabela text)
language sql stable security definer set search_path = public
as $$
  select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1;
$$;
revoke all on function backup_tabelas() from public, anon, authenticated;
grant execute on function backup_tabelas() to service_role;

create or replace function backup_arquivos(p_inicio timestamptz, p_fim timestamptz)
returns table (bucket text, caminho text, criado_em timestamptz)
language sql stable security definer set search_path = public, storage
as $$
  select o.bucket_id::text, o.name::text, o.created_at from storage.objects o
   where o.created_at >= p_inicio and o.created_at < p_fim
     and o.name not like '%.emptyFolderPlaceholder'
   order by o.bucket_id, o.name;
$$;
revoke all on function backup_arquivos(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function backup_arquivos(timestamptz, timestamptz) to service_role;
