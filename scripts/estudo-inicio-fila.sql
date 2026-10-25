-- Estudo de 16/10/2026: custo próprio, no banco, das leituras que o Início faz (docs/estudos/inicio-fila-do-banco.md).
-- Só leitura. Roda como um usuário logado e termina em RAISE EXCEPTION: nada fica gravado.
-- Uso: troque <UID> pelo user_id de um coordenador (perfil admin em user_roles) e rode
--   supabase db query --linked -f scripts/estudo-inicio-fila.sql
-- Cada consulta imita o PostgREST (json_agg do resultado):
--   ms_real    = relógio, com a montagem do JSON da resposta;
--   ms_explain = tempo de execução do EXPLAIN ANALYZE;
--   kB         = tamanho da resposta.
-- Rodar fora do horário dos jobs do cron (ver docs/migrations.md) e uma vez só: o banco é pequeno (Nano).
DO $$
DECLARE
  colunas_faturas CONSTANT text := 'id_fatura, contract_key, numero, tipo, emissao, vencimento, valor_liquido, data_liquidacao, situacao, cancelada, np, referencia, ordens_bancarias, ob_emissao, paga, np_contratos, empenhos, empenhos_sem_vinculo, empenhos_sem_vinculo_numeros, pagamento_a_conferir, obs_a_conferir';
  qs jsonb;
  k text; q text; t0 timestamptz; ms numeric; bytes bigint; plan json; res jsonb := '{}';
BEGIN
  qs := jsonb_build_object(
    -- contratos (fetchContratosOficiaisDoBanco): o registro inteiro, em páginas de mil
    'contratos_200331_pag1', $q$SELECT registro FROM contratos_oficiais WHERE uasg = '200331' ORDER BY contract_key LIMIT 1000 OFFSET 0$q$,
    'contratos_200331_pag2', $q$SELECT registro FROM contratos_oficiais WHERE uasg = '200331' ORDER BY contract_key LIMIT 1000 OFFSET 1000$q$,
    'contratos_200330', $q$SELECT registro FROM contratos_oficiais WHERE uasg = '200330' ORDER BY contract_key LIMIT 1000$q$,
    'contratos_200331_so_chave', $q$SELECT contract_key FROM contratos_oficiais WHERE uasg = '200331' ORDER BY contract_key$q$,
    -- empenhos (fetchEmpenhosResumoFromDb): select * sem ordem, em páginas de mil
    'empenhos_pag1', $q$SELECT * FROM v_empenhos_resumo LIMIT 1000 OFFSET 0$q$,
    'empenhos_pag2', $q$SELECT * FROM v_empenhos_resumo LIMIT 1000 OFFSET 1000$q$,
    'empenhos_pag3', $q$SELECT * FROM v_empenhos_resumo LIMIT 1000 OFFSET 2000$q$,
    'empenhos_tudo_1x', $q$SELECT * FROM v_empenhos_resumo$q$,
    'empenhos_so_somas', $q$SELECT empenho_id, canonical_key, numero_oficial, ano_exercicio, uasg_emitente, valor_empenhado, valor_liquidado, valor_pago, valor_rpinscrito, credor_nome FROM v_empenhos_resumo$q$,
    'vinculos_empenho', $q$SELECT empenho_id, contract_key, valor_vinculado FROM contrato_empenhos LIMIT 1000$q$,
    -- faturas (fetchFaturasCarteira, avisos de pagamento)
    'faturas_pag1', format('SELECT %s FROM v_contrato_faturas ORDER BY id_fatura LIMIT 1000 OFFSET 0', colunas_faturas),
    'faturas_pag8', format('SELECT %s FROM v_contrato_faturas ORDER BY id_fatura LIMIT 1000 OFFSET 7000', colunas_faturas),
    'faturas_tudo_1x', format('SELECT %s FROM v_contrato_faturas ORDER BY id_fatura', colunas_faturas),
    'faturas_so_aviso', $q$SELECT contract_key, emissao, referencia, cancelada FROM v_contrato_faturas ORDER BY id_fatura$q$,
    'conferencia_tesouro', $q$SELECT id_fatura, situacao_tesouro FROM v_fatura_conferencia_tesouro ORDER BY id_fatura$q$,
    -- atas
    'atas_com_itens', $q$SELECT a.*, COALESCE((SELECT json_agg(i) FROM itens_ata i WHERE i.ata_id = a.id), '[]') AS itens_ata FROM atas_registro_preco a WHERE uasg_carteira = '200331' ORDER BY id LIMIT 1000$q$,
    'atas_sem_itens', $q$SELECT * FROM atas_registro_preco WHERE uasg_carteira = '200331' ORDER BY id LIMIT 1000$q$,
    -- leves, para comparar
    'gestores_200331', $q$SELECT * FROM contract_managers WHERE uasg = '200331' ORDER BY contract_key LIMIT 1000$q$,
    'alocacoes', $q$SELECT item_key FROM arp_allocations ORDER BY id LIMIT 1000$q$
  );
  PERFORM set_config('request.jwt.claims', '{"sub":"<UID>","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR k, q IN SELECT key, value FROM jsonb_each_text(qs) LOOP
    t0 := clock_timestamp();
    EXECUTE 'SELECT octet_length(coalesce(json_agg(t)::text, ''[]'')) FROM (' || q || ') t' INTO bytes;
    ms := round(extract(epoch FROM clock_timestamp() - t0) * 1000);
    EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT coalesce(json_agg(t), ''[]'') FROM (' || q || ') t' INTO plan;
    res := res || jsonb_build_object(k, jsonb_build_object(
      'ms_real', ms,
      'ms_explain', round((plan -> 0 ->> 'Execution Time')::numeric),
      'kB', bytes / 1024
    ));
  END LOOP;
  RAISE EXCEPTION 'ENSAIO %', res;
END $$;
