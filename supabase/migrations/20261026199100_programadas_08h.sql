-- Thiago: o alarme da O.S. programada só pode tocar a partir das 08h.
create or replace function interno.despachar_programadas() returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- 08h de Brasília em diante: envia as O.S. programadas para hoje (ou atrasadas) que já têm técnico.
  if extract(hour from now() at time zone 'America/Sao_Paulo') < 8 then return; end if;
  perform set_config('app.assumir_backlog', 'sim', true);
  update ordens_servico set status = 'enviada'
   where status = 'rascunho' and tecnico_id is not null
     and programada_inicio is not null and programada_inicio < interno.fim_de_hoje();
  perform set_config('app.assumir_backlog', '', true);
end $$;
