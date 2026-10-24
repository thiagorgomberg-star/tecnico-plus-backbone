-- Número do ticket de acionamento que originou a O.S. (vem do cliente/parceiro).
alter table ordens_servico add column ticket_acionamento text;
create index ordens_servico_ticket_idx on ordens_servico (ticket_acionamento);
