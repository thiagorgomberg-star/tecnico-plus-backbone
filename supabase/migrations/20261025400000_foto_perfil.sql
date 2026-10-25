-- Foto de perfil do técnico (crachá virtual). Fica no bucket privado documentos-tecnico em <usuario>/foto.jpg.
-- O próprio técnico pode enviar/trocar a foto dele pelo app; o supervisor pode enviar pelo painel.

alter table usuarios add column if not exists foto text;          -- caminho no bucket
alter table usuarios add column if not exists foto_em timestamptz;  -- muda a cada troca (renova o cache do app)

create policy documentos_tecnico_foto_propria_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-tecnico' and name = auth.uid()::text || '/foto.jpg');
create policy documentos_tecnico_foto_propria_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos-tecnico' and name = auth.uid()::text || '/foto.jpg')
  with check (bucket_id = 'documentos-tecnico' and name = auth.uid()::text || '/foto.jpg');

create or replace function definir_minha_foto() returns timestamptz
language sql security definer set search_path = public as $$
  update usuarios set foto = auth.uid()::text || '/foto.jpg', foto_em = now() where id = auth.uid() returning foto_em;
$$;
revoke all on function definir_minha_foto() from public, anon;
grant execute on function definir_minha_foto() to authenticated;
