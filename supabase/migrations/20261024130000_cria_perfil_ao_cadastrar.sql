-- Todo login novo (criado no painel do Supabase ou pelo supervisor) ganha um perfil de técnico.
-- O supervisor promove o papel depois, se precisar.
create function public.cria_perfil_usuario() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into usuarios (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.cria_perfil_usuario() from public, anon, authenticated;

create trigger cria_perfil_usuario_trg
  after insert on auth.users
  for each row execute function public.cria_perfil_usuario();
