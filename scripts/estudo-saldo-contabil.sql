-- Estudo do saldo contábil (14/10/2026): empenhos das UGs da CGLIC com o pago calculado pelas faturas.
-- Saída para scripts/estudo-saldo-contabil.mjs. Só leitura.
-- A parte de cada empenho na fatura vem de fatura_empenhos.valor; quando a soma das partes passa do valor da
-- fatura (a fonte às vezes manda o valor do empenho inteiro), as partes são reduzidas na proporção.
with partes as (
  select fe.id_fatura, fe.id_empenho_gov, fe.valor,
         sum(fe.valor) over (partition by fe.id_fatura) as soma_partes
    from fatura_empenhos fe
), pago_faturas as (
  select p.id_empenho_gov,
         sum(p.valor * least(1, v.valor_liquido / nullif(p.soma_partes, 0))) filter (where v.paga) as pago_confirmado,
         sum(p.valor * least(1, v.valor_liquido / nullif(p.soma_partes, 0))) filter (where v.pagamento_a_conferir) as a_conferir,
         sum(p.valor * least(1, v.valor_liquido / nullif(p.soma_partes, 0))) filter (where not v.cancelada) as faturado,
         sum(p.valor) filter (where v.paga) as pago_sem_ajuste
    from partes p join v_contrato_faturas v using (id_fatura)
   group by 1
)
select json_agg(t) from (
  select e.uasg_emitente ug, upper(split_part(e.numero_oficial, ' ', 1)) ne, e.ano_exercicio ano, e.valor_empenhado,
         e.valor_pago pago_fonte_contratos, e.valor_rpinscrito,
         coalesce(p.pago_confirmado, 0) pago_confirmado, coalesce(p.a_conferir, 0) a_conferir, coalesce(p.faturado, 0) faturado,
         coalesce(p.pago_sem_ajuste, 0) pago_sem_ajuste,
         (select count(*) from contrato_empenhos ce where ce.empenho_id = e.id) contratos
    from empenhos e left join pago_faturas p on p.id_empenho_gov = e.identificador_fonte
   where e.uasg_emitente in ('200330', '200331')
) t;
