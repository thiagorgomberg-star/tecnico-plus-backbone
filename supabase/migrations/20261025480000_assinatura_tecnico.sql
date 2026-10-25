-- Assinatura do técnico: cadastrada uma vez (documentos-tecnico/<usuario>/assinatura.jpg) e reaproveitada em cada O.S.
-- A leitura do próprio arquivo já é coberta por documentos_tecnico_proprio.
create policy documentos_tecnico_assinatura_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-tecnico' and name = auth.uid()::text || '/assinatura.jpg');
create policy documentos_tecnico_assinatura_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos-tecnico' and name = auth.uid()::text || '/assinatura.jpg')
  with check (bucket_id = 'documentos-tecnico' and name = auth.uid()::text || '/assinatura.jpg');
