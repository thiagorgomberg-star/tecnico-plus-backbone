-- Curvas OTDR do trecho (bucket "curvas" e rota_curvas) são enviadas só pelo supervisor; o técnico apenas vê e analisa.
alter policy rota_curvas_inserir on rota_curvas with check (enviado_por = auth.uid() and eh_supervisor());
alter policy curvas_storage_enviar on storage.objects with check (bucket_id = 'curvas' and public.eh_supervisor());
