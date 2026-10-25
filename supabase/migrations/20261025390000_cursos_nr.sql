-- Cursos e treinamentos (NRs) de cada técnico/auxiliar, com validade, e informações complementares da ficha.
-- O supervisor cadastra no painel (Equipe > nome); o técnico vê no crachá virtual do app.

alter table usuarios
  add column if not exists tipo_sanguineo text,
  add column if not exists alergias text,
  add column if not exists escolaridade text,
  add column if not exists formacao text,
  add column if not exists pis text;

create table tecnico_cursos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  curso text not null,                 -- ex.: NR-10 Básico, NR-35 Trabalho em altura
  instituicao text,
  carga_horaria integer,
  data_conclusao date,
  validade date,                       -- vazio = sem vencimento
  observacao text,
  criado_em timestamptz not null default now()
);
create index tecnico_cursos_usuario_idx on tecnico_cursos (usuario_id);

alter table tecnico_cursos enable row level security;
create policy tecnico_cursos_proprio on tecnico_cursos for select to authenticated using (usuario_id = auth.uid());
create policy tecnico_cursos_supervisor on tecnico_cursos for all to authenticated
  using (eh_supervisor()) with check (eh_supervisor());

-- Tipo (NR, curso profissionalizante, licença como a LPU de motosserra) e PDF do certificado/licença.
alter table tecnico_cursos add column if not exists tipo text not null default 'nr';
alter table tecnico_cursos drop constraint if exists tecnico_cursos_tipo_check;
alter table tecnico_cursos add constraint tecnico_cursos_tipo_check check (tipo in ('nr', 'profissionalizante', 'licenca'));
alter table tecnico_cursos add column if not exists arquivo text;   -- caminho no bucket documentos-tecnico (<usuario>/<id>.pdf)

insert into storage.buckets (id, name, public) values ('documentos-tecnico', 'documentos-tecnico', false)
on conflict (id) do nothing;
create policy documentos_tecnico_supervisor on storage.objects for all to authenticated
  using (bucket_id = 'documentos-tecnico' and eh_supervisor())
  with check (bucket_id = 'documentos-tecnico' and eh_supervisor());
create policy documentos_tecnico_proprio on storage.objects for select to authenticated
  using (bucket_id = 'documentos-tecnico' and (storage.foldername(name))[1] = auth.uid()::text);
