-- Escopo cumprido só para contratos de compra (categoria "Compras" do Contratos.gov.br).
--
-- Medição de 17/11/2026: dos 70 contratos sugeridos, 2 eram de Informática (TIC) e a sugestão estava errada:
-- uma subscrição toda paga que vence em 4 dias (precisa do aviso de prorrogação) e uma licença com suporte
-- até 2027, paga adiantado. Em serviço e TIC, "pago" não quer dizer "escopo cumprido": o valor global pode ser
-- de um período que se renova ou a obrigação de suporte segue até o fim da vigência.
-- O campo "prorrogavel" da fonte não separa os casos (51 das 68 compras vêm como "Sim"); a categoria separa.
--
-- Só muda a regra da sugestão (cumpre_regra). As colunas da view e as RPCs da migration 314 ficam iguais;
-- confirmar_execucao_contrato já exige estado SUGERIDO, então contrato fora de Compras deixa de poder ser
-- confirmado. Decisão já gravada continua aparecendo (WHERE ... OR a.decisao IS NOT NULL).

CREATE OR REPLACE VIEW public.v_contrato_execucao
WITH (security_invoker = true) AS
WITH contratos AS (
  SELECT c.contract_key,
         NULLIF(c.registro->>'valorGlobal', '')::NUMERIC AS valor_global,
         c.data_vigencia_fim,
         c.registro->'raw'->>'categoria' AS categoria
    FROM public.contratos_oficiais c
   WHERE c.data_vigencia_fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
), faturas AS (
  SELECT f.contract_key,
         COALESCE(SUM(f.valor) FILTER (WHERE f.situacao IN ('Pago', 'Siafi Apropriado')), 0) AS faturado,
         COUNT(*) FILTER (WHERE f.situacao IN ('Pendente', 'Aguardando SIAFI', 'Aproriação em Andamento', 'Apropriação em Andamento', 'Siafi Erro')) AS faturas_abertas,
         COUNT(*) AS faturas
    FROM public.contrato_faturas f
   WHERE NOT COALESCE(f.cancelada, false)
     AND f.situacao IS DISTINCT FROM 'Siafi Cancelado'
   GROUP BY f.contract_key
), notas AS (
  SELECT ce.contract_key, COALESCE(SUM(e.valor_empenhado), 0) AS empenhado, COUNT(*) AS notas
    FROM public.contrato_empenhos ce
    JOIN public.empenhos e ON e.id = ce.empenho_id
   GROUP BY ce.contract_key
), fiscalizacao AS (
  SELECT fe.contract_key,
         bool_or(NOT (fe.etapa IN ('SAL', 'FINALIZADO') OR fe.encerrada_em IS NOT NULL)) AS em_curso
    FROM public.fisc_entregas fe
   WHERE fe.responsavel = 'SFC' AND fe.contract_key IS NOT NULL
   GROUP BY fe.contract_key
), fatos AS (
  SELECT c.contract_key,
         c.valor_global,
         c.categoria,
         COALESCE(f.faturado, 0) AS faturado,
         COALESCE(f.faturas_abertas, 0)::INT AS faturas_abertas,
         GREATEST(COALESCE(n.empenhado, 0) - COALESCE(f.faturado, 0), 0) AS saldo_empenho,
         CASE WHEN fi.contract_key IS NULL THEN 'SEM' WHEN fi.em_curso THEN 'EM_CURSO' ELSE 'FINALIZADA' END AS fiscalizacao,
         COALESCE(c.valor_global, 0)::TEXT || '|' || COALESCE(f.faturas, 0)::TEXT || '|' || COALESCE(n.notas, 0)::TEXT AS marca_dos_fatos
    FROM contratos c
    LEFT JOIN faturas f ON f.contract_key = c.contract_key
    LEFT JOIN notas n ON n.contract_key = c.contract_key
    LEFT JOIN fiscalizacao fi ON fi.contract_key = c.contract_key
), avaliado AS (
  SELECT ft.*,
         (ft.valor_global > 0
           AND ft.faturado >= ft.valor_global * 0.99
           AND ft.faturado <= ft.valor_global * 1.01
           AND ft.faturas_abertas = 0
           AND ft.fiscalizacao <> 'EM_CURSO'
           AND ft.categoria = 'Compras') AS cumpre_regra,
         d.decisao,
         (d.contract_key IS NOT NULL AND d.marca_dos_fatos = ft.marca_dos_fatos) AS decisao_vale,
         d.documento_sei, d.data_recebimento, d.observacao, d.decidido_por_nome, d.decidido_em
    FROM fatos ft
    LEFT JOIN public.contrato_execucao_decisoes d ON d.contract_key = ft.contract_key
)
SELECT a.contract_key,
       a.valor_global,
       a.faturado,
       a.faturas_abertas,
       a.saldo_empenho,
       a.fiscalizacao,
       CASE
         WHEN a.decisao_vale AND a.decisao = 'EXECUTADO' THEN 'EXECUTADO'
         WHEN a.decisao_vale AND a.decisao = 'NAO_TERMINOU' THEN NULL
         WHEN a.cumpre_regra THEN 'SUGERIDO'
       END AS estado,
       -- Decisão gravada que deixou de valer porque chegou fato novo (fatura, nota ou aditivo).
       (a.decisao IS NOT NULL AND NOT a.decisao_vale) AS decisao_superada,
       a.marca_dos_fatos,
       a.documento_sei,
       a.data_recebimento,
       a.decidido_por_nome,
       a.decidido_em
  FROM avaliado a
 WHERE a.cumpre_regra OR a.decisao IS NOT NULL;

REVOKE ALL ON public.v_contrato_execucao FROM PUBLIC, anon;
GRANT SELECT ON public.v_contrato_execucao TO authenticated, service_role;
