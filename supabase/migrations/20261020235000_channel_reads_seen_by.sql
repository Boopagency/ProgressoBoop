-- "Visto por" nas conversas: a equipe vê até onde cada pessoa leu os canais
-- que ela acompanha (clientes, os internos de que participa e as diretas).
-- Só leitura: cada um continua gravando só a própria (política "cada um cuida
-- da própria leitura"). A conta do cliente não ganha nada aqui. Aditivo: o
-- código que já está na main continua funcionando.

create policy "equipe vê quem leu os próprios canais" on public.channel_reads
  for select to authenticated
  using ((select private.is_team_member()) and channel_id in (select private.team_channel_ids()));
