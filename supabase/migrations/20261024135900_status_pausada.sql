-- Status de O.S. pausada pela refeição (separado porque um valor novo de enum
-- só pode ser usado depois que a transação que o criou termina).
alter type status_os add value if not exists 'pausada' after 'em_execucao';
