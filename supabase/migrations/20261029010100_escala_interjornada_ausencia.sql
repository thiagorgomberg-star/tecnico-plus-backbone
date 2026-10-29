do $$
declare f text;
begin
  foreach f in array array['apuracao_horas(date,date)', 'expediente_bloqueia_folga()'] loop
    execute replace(pg_get_functiondef(f::regprocedure), '''folga_programada'', ''ferias'', ''atestado''', '''folga_programada'', ''folga_interjornada'', ''ferias'', ''atestado''');
  end loop;
end $$;
