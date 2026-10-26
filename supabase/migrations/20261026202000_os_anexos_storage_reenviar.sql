-- Reenvio da mesma foto (upload com upsert) quando a tentativa anterior subiu o arquivo mas caiu antes de gravar a linha.
create policy os_anexos_storage_reenviar on storage.objects for update to authenticated
  using (bucket_id = 'os-anexos' and owner = auth.uid())
  with check (bucket_id = 'os-anexos' and owner = auth.uid());
