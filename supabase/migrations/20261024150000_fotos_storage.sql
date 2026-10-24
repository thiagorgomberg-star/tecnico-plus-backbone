-- Fotos e documentos das O.S. no Storage: pasta = id da O.S.
-- O técnico só acessa as pastas das O.S. dele; o supervisor acessa todas.

alter function hora_do_celular(timestamptz) set search_path = public;
alter function minimo_fotos_os() set search_path = public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('os-anexos', 'os-anexos', false, 15 * 1024 * 1024, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create policy os_anexos_storage_ler on storage.objects for select to authenticated
  using (
    bucket_id = 'os-anexos'
    and (public.eh_supervisor() or exists (
      select 1 from public.ordens_servico o
      where o.id::text = (storage.foldername(name))[1] and o.tecnico_id = auth.uid()))
  );

create policy os_anexos_storage_enviar on storage.objects for insert to authenticated
  with check (
    bucket_id = 'os-anexos'
    and (public.eh_supervisor() or exists (
      select 1 from public.ordens_servico o
      where o.id::text = (storage.foldername(name))[1] and o.tecnico_id = auth.uid()))
  );
