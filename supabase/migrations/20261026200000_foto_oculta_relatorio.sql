-- Supervisor pode esconder uma foto do relatório (a foto continua guardada na O.S.).
alter table os_anexos add column oculta_relatorio boolean not null default false;

create policy os_anexos_supervisor_oculta on os_anexos for update to authenticated
  using (eh_supervisor()) with check (eh_supervisor());
grant update (oculta_relatorio) on os_anexos to authenticated;
