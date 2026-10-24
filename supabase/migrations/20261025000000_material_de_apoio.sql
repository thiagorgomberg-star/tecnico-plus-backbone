-- Material de apoio: arquivos que o supervisor anexa na O.S. para o técnico consultar em campo
-- (fotos, prints, PDF, KMZ/KML, planilhas). Ficam como anexo do tipo "documento".

alter table os_anexos
  add column nome_arquivo text,
  add column descricao text;

update storage.buckets
   set file_size_limit = 25 * 1024 * 1024,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
         'application/vnd.google-earth.kmz', 'application/vnd.google-earth.kml+xml',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/zip', 'application/octet-stream', 'text/plain'
       ]
 where id = 'os-anexos';

-- O supervisor pode retirar material de apoio que anexou errado.
create policy os_anexos_supervisor_remove on os_anexos for delete to authenticated
  using (eh_supervisor() and tipo = 'documento');

create policy os_anexos_storage_supervisor_remove on storage.objects for delete to authenticated
  using (bucket_id = 'os-anexos' and public.eh_supervisor() and (storage.foldername(name))[2] = 'apoio');
