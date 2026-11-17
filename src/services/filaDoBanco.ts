/**
 * Fila única das leituras do site ao banco (Supabase).
 *
 * Medição de 17/11/2026: ao abrir a Carteira de Contratos o site fazia ~55 consultas, ~12 delas no mesmo segundo. Com o
 * banco ocupado, cada uma demorava mais e a que passava dos 8 s do papel authenticated era cancelada (57014), mesmo as
 * que sozinhas levam 0,1 s. Aqui toda LEITURA passa por uma fila com no máximo LEITURAS_SIMULTANEAS de cada vez, e a
 * que volta com tempo esgotado é repetida uma vez.
 *
 * Fora da fila (saem na hora): gravações, login (auth), arquivos (storage), funções do servidor (functions) e as
 * funções do banco que podem gravar. Gravação nunca é repetida.
 */

/** Quantas leituras vão ao banco ao mesmo tempo. */
export const LEITURAS_SIMULTANEAS = 6;

/** Pausa antes de repetir a leitura que esgotou o tempo. */
export const PAUSA_ANTES_DE_REPETIR_MS = 300;

/**
 * Funções do banco que só leem: as STABLE/IMMUTABLE do schema public que o usuário logado pode chamar (o banco não
 * deixa uma função STABLE gravar). Lista tirada do banco em 17/11/2026 (97 nomes). Função nova que não está aqui
 * sai fora da fila, como uma gravação: o lado seguro. Para atualizar:
 *   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 *    WHERE n.nspname = 'public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND p.prokind = 'f'
 *    GROUP BY proname HAVING bool_and(provolatile IN ('s', 'i')) ORDER BY 1;
 */
export const FUNCOES_DE_LEITURA: ReadonlySet<string> = new Set([
  'adesoes_do_item',
  'alocacao_extra_do_item',
  'area_do_programa',
  'ata_key_from_item_key',
  'ata_uasg_from_item_key',
  'atas_prazo_a_confirmar',
  'build_payment_cycle_key',
  'chave_gestao_ata',
  'chave_nome_beneficiario',
  'cnpj_valido',
  'contrato_raw_resumido',
  'contrato_registro_tela',
  'credor_e_fornecedor_da_ata',
  'domingo_de_pascoa',
  'eh_service_role',
  'emendas_a_contratar',
  'emendas_ata_da_linha',
  'emendas_corte_indicacao_dias',
  'emendas_corte_reajuste_dias',
  'emendas_descricao_curta',
  'emendas_itens_da_linha',
  'emendas_motivos_devolucao_ccga',
  'emendas_numero_e_ano',
  'emendas_precos_previstos',
  'emendas_reajuste_dos_itens',
  'emendas_reservado_do_item',
  'emendas_tramite_contrato_dias',
  'emendas_validade_minuta_dias_uteis',
  'empenhado_confiavel_do_tesouro',
  'empenhado_do_tesouro',
  'execucao_entregas_do_contrato',
  'exigir_alcance_da_nota',
  'exigir_alcance_do_aviso',
  'exigir_alcance_do_gestor',
  'exigir_decisao_execucao',
  'feriados_calculados',
  'fisc_chave_do_nome',
  'fisc_contratos_para_distribuicao',
  'fisc_dia_util',
  'fisc_dias_do_item',
  'fisc_entregas_das_emendas',
  'fisc_entregas_do_pedido',
  'fisc_entregas_lista',
  'fisc_entregas_para_pagamento',
  'fisc_envio_pagamento_dias',
  'fisc_itens_da_ata_do_contrato',
  'fisc_mesma_uf',
  'fisc_movimentos_da_entrega',
  'fisc_normalizar',
  'fisc_ordem_da_etapa',
  'fisc_previsao_de_entregas',
  'fisc_prevista_pela_regra',
  'fisc_programas_lista',
  'fisc_proximas_etapas',
  'fisc_recebimento_normalizado',
  'fisc_regra_de_recebimento',
  'fisc_regra_de_substituicao',
  'fisc_regra_do_contrato',
  'fisc_rotulo_do_item',
  'fisc_substituicao_normalizada',
  'gestor_alcanca_ata',
  'gestor_alcanca_contrato',
  'item_sem_divisao_na_ata',
  'itens_checklist_pagamento',
  'limites_adesao_do_item',
  'nome_para_comparar',
  'normalizar_numero_sei',
  'normalize_contract_key',
  'nota_casa_com_emenda',
  'nota_descreve_emenda',
  'nota_siafi_no_contrato',
  'numero_empenho_normalizado',
  'ob_cita_fatura',
  'prever_vinculos_automaticos',
  'programa_das_emendas',
  'programas_para_alocacao',
  'quantidade_senasp_da_adesao',
  'raiz_documento',
  'reajuste_ciclos_ata',
  'reajuste_itens_ata',
  'reajuste_reservas_de_emenda',
  'reajuste_variacao_12_meses',
  'registrado_por_uasg',
  'senasp_das_unidades',
  'situacao_da_unidade_no_item',
  'tarefas_do_pregao_ata',
  'uasgs_para_cadastrar',
  'unidade_das_emendas',
  'unidades_internas_em_uso',
  'usuario_ativo',
  'valor_da_ata',
  'versao_adesoes',
  'versao_ata_assinada',
  'versao_divisao',
  'versao_edicao',
  'versao_nota_itens',
  'versao_quantitativos_item',
]);

/**
 * Fila com no máximo `maximo` tarefas rodando de cada vez; as outras esperam a vez na ordem em que chegaram. Uma tarefa
 * que falha libera a vaga do mesmo jeito.
 */
export function criarFila(maximo: number) {
  let rodando = 0;
  const esperando: Array<() => void> = [];
  const liberar = () => {
    rodando -= 1;
    const proxima = esperando.shift();
    if (proxima) proxima();
  };
  return function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const rodar = () => {
        rodando += 1;
        let p: Promise<T>;
        try {
          p = tarefa();
        } catch (err) {
          p = Promise.reject(err);
        }
        p.then(resolve, reject).finally(liberar);
      };
      if (rodando < maximo) rodar();
      else esperando.push(rodar);
    });
  };
}

const urlDe = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** A requisição é uma leitura do banco? (GET/HEAD da API REST, ou chamada a uma função que só lê.) */
export function ehLeitura(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url = urlDe(input);
  const caminho = url.match(/\/rest\/v1\/([^?#]*)/)?.[1];
  if (caminho == null) return false;
  const metodo = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  if (metodo === 'GET' || metodo === 'HEAD') return true;
  const funcao = caminho.match(/^rpc\/([a-z0-9_]+)$/)?.[1];
  return metodo === 'POST' && funcao != null && FUNCOES_DE_LEITURA.has(funcao);
}

/** A resposta é o banco cancelando a consulta por tempo esgotado (57014)? */
export async function ehTempoEsgotado(resposta: Response): Promise<boolean> {
  if (resposta.status < 500) return false;
  try {
    const corpo = await resposta.clone().json();
    return corpo?.code === '57014' || /statement timeout/i.test(String(corpo?.message ?? ''));
  } catch {
    return false;
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `fetch` do cliente do banco: leituras entram na fila e são repetidas uma vez no tempo esgotado; o resto sai direto.
 * `base` e `pausaMs` existem para os testes.
 */
export function criarFetchComFila(base: typeof fetch = (...a) => fetch(...a), maximo = LEITURAS_SIMULTANEAS, pausaMs = PAUSA_ANTES_DE_REPETIR_MS): typeof fetch {
  const naFila = criarFila(maximo);
  return (input, init) => {
    if (!ehLeitura(input, init)) return base(input, init);
    return naFila(async () => {
      const primeira = await base(input, init);
      if (init?.signal?.aborted || !(await ehTempoEsgotado(primeira))) return primeira;
      console.warn('Leitura do banco esgotou o tempo; lendo de novo.', urlDe(input).replace(/\?.*$/, ''));
      if (pausaMs > 0) await esperar(pausaMs);
      return base(input, init);
    });
  };
}
