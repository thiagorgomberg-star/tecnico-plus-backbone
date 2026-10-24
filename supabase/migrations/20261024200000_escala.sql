-- Escala (calendário) de cada técnico: jornada, folga programada, plantão, sobreaviso, férias e atestado.
-- Em dia de folga programada, férias ou atestado o técnico não consegue iniciar expediente.

create type tipo_escala as enum (
  'jornada', 'folga_programada', 'plantao', 'sobreaviso', 'ferias', 'atestado', 'outro'
);

create table escala (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references usuarios (id) on delete cascade,
  data date not null,
  tipo tipo_escala not null,
  inicio time,
  fim time,
  observacao text,
  criado_por uuid references usuarios (id) default auth.uid(),
  criado_em timestamptz not null default now(),
  unique (tecnico_id, data, tipo)
);

create index escala_data_idx on escala (data, tecnico_id);

alter table escala enable row level security;

create policy escala_ler on escala for select to authenticated
  using (tecnico_id = auth.uid() or eh_supervisor());
create policy escala_supervisor on escala for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

create function expediente_bloqueia_folga() returns trigger
language plpgsql set search_path = public
as $$
declare
  motivo tipo_escala;
begin
  select tipo into motivo
    from escala
   where tecnico_id = new.tecnico_id
     and data = (new.inicio at time zone 'America/Sao_Paulo')::date
     and tipo in ('folga_programada', 'ferias', 'atestado')
   limit 1;
  if motivo is not null then
    raise exception 'Expediente bloqueado: % neste dia', replace(motivo::text, '_', ' ')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger expedientes_bloqueia_folga_trg
  before insert on expedientes
  for each row execute function expediente_bloqueia_folga();

alter publication supabase_realtime add table escala;
