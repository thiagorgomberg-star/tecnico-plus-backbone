-- Notificação com o app fechado (Firebase Cloud Messaging).
-- O celular registra o token FCM; cada alerta novo chama a função enviar-push, que manda a notificação.
-- Se não houver token ou o envio falhar, o alerta fica pendente e o próprio app avisa quando abrir.

create extension if not exists pg_net with schema extensions;

create table dispositivos_push (
  token text primary key,
  usuario_id uuid not null references usuarios (id) on delete cascade default auth.uid(),
  plataforma text not null default 'android',
  atualizado_em timestamptz not null default now()
);
create index dispositivos_push_usuario_idx on dispositivos_push (usuario_id);

alter table dispositivos_push enable row level security;
create policy dispositivos_proprio on dispositivos_push for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- O mesmo celular pode trocar de usuário (login de outro técnico): o token passa a ser de quem entrou.
create or replace function registrar_dispositivo(p_token text) returns void
language sql security definer set search_path = public
as $$
  insert into dispositivos_push (token, usuario_id, atualizado_em)
  select p_token, auth.uid(), now() where auth.uid() is not null
  on conflict (token) do update set usuario_id = excluded.usuario_id, atualizado_em = now()
$$;

create or replace function interno.disparar_push() returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  begin
    perform net.http_post(
      url := 'https://wnuivnpywflczknxpytx.supabase.co/functions/v1/enviar-push',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null; -- o push nunca pode impedir o alerta de ser gravado
  end;
  return new;
end $$;

create trigger alertas_push after insert on alertas
  for each row execute function interno.disparar_push();
