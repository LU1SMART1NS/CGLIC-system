-- "Empenhado acima do contratado" sem recalcular por item.
--
-- Medição em 16/10/2026 (usuário logado, banco calmo): v_contrato_itens_empenhado_acima levava ~1,2–1,4 s para
-- devolver 38 linhas; em produção há execuções de 12 s em média e 33 s no pior caso, e no Início a consulta estourava
-- o tempo limite de 8 s do usuário logado ("Empenhado acima do contratado: não carregou").
--
-- Causa: a junção por duas colunas (contract_key + numero_item) faz o banco estimar 1 linha em "contratado" (são ~813)
-- e, daí para baixo, escolher laços: refazia o agrupamento das notas para cada item e cruzava "pior" e "soma" com
-- "contratado" item a item (813 × 813); o bloco "inicio" era refeito para cada nota (~1.570 vezes).
--
-- Agora, com a mesma regra e o mesmo resultado (definição anterior: migration 138):
--   - "com_periodo" já cruza com "contratado" e passa a carregar descrição, quantidade, valor e "pelo_valor" até o fim,
--     então "pior" e o resultado final não cruzam com "contratado" de novo;
--   - o início da vigência é lido direto de contratos_oficiais (pelo índice de contract_key), sem o bloco "inicio";
--   - "soma", "pior" e "ultima" são calculados uma vez (MATERIALIZED), como na migration 144.
-- Colunas, tipos e ordem não mudam.

CREATE OR REPLACE VIEW public.v_contrato_itens_empenhado_acima
WITH (security_invoker = true)
AS
WITH parcelas AS (
  SELECT
    d.contract_key,
    p.numero_item,
    COALESCE(p.quantidade_informada, p.quantidade_nota) AS quantidade,
    p.valor,
    p.quantidade_informada IS NOT NULL AS informada,
    d.origem,
    d.distribuido_em,
    ce.empenho_id
    FROM public.contrato_empenho_itens p
    JOIN public.contrato_empenho_distribuicoes d ON d.contrato_empenho_id = p.contrato_empenho_id
    JOIN public.contrato_empenhos ce ON ce.id = p.contrato_empenho_id
   WHERE COALESCE(p.quantidade_informada, p.quantidade_nota) IS NOT NULL
),
itens AS (
  SELECT DISTINCT contract_key, numero_item FROM parcelas
),
-- Contratado e tipo só dos itens que têm nota com quantidade real.
contratado AS (
  SELECT ic.contract_key, ic.numero_item, min(ic.descricao) AS descricao, sum(ic.quantidade) AS quantidade,
         sum(ic.valor_total) AS valor,
         bool_and(ic.tipo ILIKE 'servi%') AS servico,
         -- Quantidade quebrada (valor com desconto ÷ preço da ata): compara pelo valor.
         abs(sum(ic.quantidade) - round(sum(ic.quantidade))) > 0.0001 AND sum(ic.valor_total) > 0 AS pelo_valor
    FROM public.itens_contrato ic
    JOIN itens s ON s.contract_key = ic.contract_key AND s.numero_item = ic.numero_item
   GROUP BY ic.contract_key, ic.numero_item
),
com_periodo AS (
  SELECT p.*,
         c.servico AND v.inicio IS NOT NULL AND e.data_emissao IS NOT NULL AS por_periodo,
         CASE WHEN c.servico AND v.inicio IS NOT NULL AND e.data_emissao IS NOT NULL
              THEN GREATEST(0, date_part('year', age(e.data_emissao, v.inicio)))::INTEGER
              ELSE 0 END AS periodo,
         v.inicio,
         c.contract_key AS c_contract_key,
         c.descricao AS c_descricao,
         c.quantidade AS c_quantidade,
         c.valor AS c_valor,
         c.pelo_valor AS c_pelo_valor
    FROM parcelas p
    JOIN contratado c ON c.contract_key = p.contract_key AND c.numero_item = p.numero_item
    -- Início da vigência do contrato (só quando a data vem no formato AAAA-MM-DD).
    LEFT JOIN LATERAL (
      SELECT left(co.registro->>'dataVigenciaInicio', 10)::DATE AS inicio
        FROM public.contratos_oficiais co
       WHERE co.contract_key = p.contract_key
         AND co.registro->>'dataVigenciaInicio' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    ) v ON true
    LEFT JOIN public.empenhos e ON e.id = p.empenho_id
),
soma AS MATERIALIZED (
  SELECT contract_key, numero_item, periodo, bool_or(por_periodo) AS por_periodo, min(inicio) AS inicio,
         sum(quantidade) AS quantidade_real, sum(valor) AS valor_real, count(*) AS notas,
         c_contract_key, c_descricao, c_quantidade, c_valor, c_pelo_valor
    FROM com_periodo
   -- As colunas c_* são do contratado (uma só por contrato × item): estão no GROUP BY só para seguir até o fim.
   GROUP BY contract_key, numero_item, periodo, c_contract_key, c_descricao, c_quantidade, c_valor, c_pelo_valor
),
-- O período de maior excesso representa o item (pelo valor quando a quantidade é quebrada).
pior AS MATERIALIZED (
  SELECT DISTINCT ON (s.contract_key, s.numero_item) s.*
    FROM soma s
   ORDER BY s.contract_key, s.numero_item,
            CASE WHEN s.c_pelo_valor THEN s.valor_real ELSE s.quantidade_real END DESC, s.periodo DESC
),
ultima AS MATERIALIZED (
  SELECT DISTINCT ON (contract_key, numero_item, periodo)
         contract_key, numero_item, periodo, empenho_id, origem, informada, distribuido_em
    FROM com_periodo
   ORDER BY contract_key, numero_item, periodo, distribuido_em DESC NULLS LAST
)
SELECT
  s.c_contract_key AS contract_key,
  s.numero_item,
  s.c_descricao AS descricao,
  s.c_quantidade AS quantidade_contratada,
  s.quantidade_real AS quantidade_empenhada,
  s.quantidade_real - s.c_quantidade AS quantidade_acima,
  s.notas,
  e.numero_oficial AS ultima_nota,
  -- Quem pôs a quantidade da última nota: GESTOR (informada) ou a origem do vínculo (SIAFI, VALOR, AUTO, USUARIO).
  CASE WHEN u.informada THEN 'GESTOR' ELSE u.origem END AS ultima_origem,
  u.distribuido_em AS ultima_em,
  COALESCE(s.por_periodo, FALSE) AS por_periodo,
  CASE WHEN s.por_periodo THEN (s.inicio + make_interval(years => s.periodo))::DATE END AS periodo_inicio,
  CASE WHEN s.por_periodo THEN (s.inicio + make_interval(years => s.periodo + 1) - INTERVAL '1 day')::DATE END AS periodo_fim,
  s.c_pelo_valor AS pelo_valor,
  s.c_valor AS valor_contratado,
  s.valor_real AS valor_empenhado,
  s.valor_real - s.c_valor AS valor_acima
FROM pior s
LEFT JOIN ultima u ON u.contract_key = s.contract_key AND u.numero_item = s.numero_item AND u.periodo = s.periodo
LEFT JOIN public.empenhos e ON e.id = u.empenho_id
WHERE s.c_quantidade > 0
  AND CASE WHEN s.c_pelo_valor THEN s.valor_real > s.c_valor + 0.01
           ELSE s.quantidade_real > s.c_quantidade + 0.0001 END;
