-- Foto que o técnico tira ao abrir uma ocorrência entra também no material de apoio da O.S.
-- (uma linha "documento" apontando para o mesmo arquivo; remover do apoio não apaga a foto original,
-- porque o Storage só deixa apagar arquivos da pasta apoio/).
create or replace function os_anexo_ocorrencia_para_apoio() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_numero integer;
  v_n integer;
begin
  select numero into v_numero from ordens_servico
   where id = new.os_id and informado_por is not null and informado_por = new.enviado_por;
  if v_numero is null then return new; end if;
  select count(*) + 1 into v_n from os_anexos
   where os_id = new.os_id and tipo = 'documento' and descricao = 'Foto de quem abriu a ocorrência';
  insert into os_anexos (os_id, tipo, caminho_arquivo, nome_arquivo, descricao, enviado_por)
  values (new.os_id, 'documento', new.caminho_arquivo, format('Foto da ocorrência %s-%s.jpg', v_numero, v_n),
          'Foto de quem abriu a ocorrência', new.enviado_por);
  return new;
end $$;

create trigger os_anexos_ocorrencia_apoio after insert on os_anexos
  for each row when (new.tipo = 'foto_antes') execute function os_anexo_ocorrencia_para_apoio();

-- Fotos das ocorrências já abertas
insert into os_anexos (os_id, tipo, caminho_arquivo, nome_arquivo, descricao, enviado_por)
select a.os_id, 'documento', a.caminho_arquivo,
       format('Foto da ocorrência %s-%s.jpg', o.numero, row_number() over (partition by a.os_id order by a.criado_em)),
       'Foto de quem abriu a ocorrência', a.enviado_por
  from os_anexos a
  join ordens_servico o on o.id = a.os_id and o.informado_por = a.enviado_por
 where a.tipo = 'foto_antes'
   and not exists (select 1 from os_anexos d where d.os_id = a.os_id and d.tipo = 'documento' and d.caminho_arquivo = a.caminho_arquivo);
