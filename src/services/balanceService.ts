import type { Empenho, Contrato, ContratoEmpenho, ReconciliationReport } from '../types';

/**
 * Normaliza o número do empenho para comparação canônica.
 * Ex: "2026NE000142" -> "2026NE142", "00142" -> "142", "2026NE000700" -> "2026NE700"
 */
export function normalizeEmpenhoNumero(numero?: string): string {
  if (!numero) return '';
  const trimmed = numero.trim().toUpperCase();
  const neMatch = trimmed.match(/^(\d{4})NE0*(\d+)$/);
  if (neMatch) {
    return `${neMatch[1]}NE${neMatch[2]}`;
  }
  const digitsOnly = trimmed.match(/^0*(\d+)$/);
  if (digitsOnly) {
    return digitsOnly[1];
  }
  return trimmed;
}

/**
 * Gera uma chave única determinística para o empenho.
 */
export function getEmpenhoCanonicalKey(empenho: Partial<Empenho>): string {
  const normNum = normalizeEmpenhoNumero(empenho.numero);
  const ano = empenho.ano || '';
  const uasg = (empenho.uasg || '').trim();
  const itemId = (empenho.itemId || '').trim();
  return `${normNum}-${ano}-${uasg}-${itemId}`;
}

/**
 * 1. Calcula o total empenhado absoluto a partir de uma lista de empenhos.
 * Invariante: TotalEmpenhado = ∑ Empenho.quantidade
 * 
 * Regra:
 * O mesmo empenho não é duplicado se estiver presente na lista uma única vez.
 */
export function calculateTotalEmpenhado(empenhos: Empenho[]): number {
  if (!empenhos || empenhos.length === 0) return 0;
  return empenhos.reduce((acc, curr) => acc + (Number(curr.quantidade) || 0), 0);
}

/**
 * 2. Discrimina os totais empenhados por tipo de origem (Oficial API vs Manual).
 */
export function calculateTotalEmpenhadoPorOrigem(empenhos: Empenho[]): {
  api: number;
  manual: number;
  sincronizado: number;
  total: number;
} {
  let api = 0;
  let manual = 0;
  let sincronizado = 0;

  (empenhos || []).forEach(emp => {
    const qtd = Number(emp.quantidade) || 0;
    if (emp.origem === 'MANUAL') {
      manual += qtd;
    } else if (emp.origem === 'SINCRONIZADO') {
      sincronizado += qtd;
    } else {
      api += qtd;
    }
  });

  return {
    api,
    manual,
    sincronizado,
    total: api + manual + sincronizado
  };
}

/**
 * 3. Fórmula Oficial do Saldo Remanescente da Ata / Item:
 * Saldo = QuantidadeRegistrada - ∑ Empenhos
 * 
 * Regra Obrigatória:
 * NUNCA subtrair Contratos.
 * NUNCA subtrair Alocações Internas.
 * Saldo negativo NÃO é convertido silenciosamente para zero.
 */
export function calculateSaldo(quantidadeRegistrada: number, empenhos: Empenho[]): number {
  const qtdRegistrada = Number(quantidadeRegistrada) || 0;
  const totalEmpenhado = calculateTotalEmpenhado(empenhos);
  return qtdRegistrada - totalEmpenhado;
}

/**
 * 4. Validação e cálculo seguro de saldo considerando a existência de Contratos e Vínculos.
 * Garante que:
 * - Contratos NÃO alteram diretamente o saldo.
 * - Vínculo de Contrato a Empenho NÃO duplica empenho.
 * - Mesmo empenho vinculado a múltiplos contratos NÃO duplica o consumo.
 */
export function calculateSaldoWithContratos(
  quantidadeRegistrada: number,
  empenhos: Empenho[],
  _contratos?: Contrato[],
  _vinculos?: ContratoEmpenho[]
): {
  saldo: number;
  totalEmpenhado: number;
  quantidadeRegistrada: number;
  isConsistent: boolean;
} {
  const qtdRegistrada = Number(quantidadeRegistrada) || 0;
  
  // O consumo é computado ESTRITAMENTE a partir da lista única de empenhos
  const totalEmpenhado = calculateTotalEmpenhado(empenhos);
  const saldo = qtdRegistrada - totalEmpenhado;

  return {
    saldo,
    totalEmpenhado,
    quantidadeRegistrada: qtdRegistrada,
    isConsistent: saldo >= 0
  };
}

/**
 * 5. Validação de Regras de Negócio de Contrato:
 * - Contrato sem empenho = INVÁLIDO (rejeitado).
 * - Contrato com 1 ou mais empenhos = VÁLIDO.
 */
export function validateContrato(
  contrato: Partial<Contrato>,
  empenhoIds: string[]
): { valid: boolean; error?: string } {
  if (!contrato.numero || !contrato.numero.trim()) {
    return { valid: false, error: 'O número do contrato é obrigatório.' };
  }
  if (!empenhoIds || empenhoIds.length === 0) {
    return {
      valid: false,
      error: 'Contrato inválido: todo contrato deve possuir pelo menos uma Nota de Empenho vinculada.'
    };
  }
  return { valid: true };
}

/**
 * 6. Calcula o balanço de uma Unidade Gestora específica.
 */
export function calculateSaldoPorUnidade(
  quantidadeRegistradaUnidade: number,
  empenhosUnidade: Empenho[]
): {
  totalRegistrado: number;
  totalEmpenhado: number;
  saldo: number;
  percentualConsumido: number;
} {
  const totalRegistrado = Number(quantidadeRegistradaUnidade) || 0;
  const totalEmpenhado = calculateTotalEmpenhado(empenhosUnidade);
  const saldo = totalRegistrado - totalEmpenhado;
  const percentualConsumido = totalRegistrado > 0 ? (totalEmpenhado / totalRegistrado) * 100 : 0;

  return {
    totalRegistrado,
    totalEmpenhado,
    saldo,
    percentualConsumido
  };
}

/**
 * 7. Calcula o saldo departamental de uma Alocação Interna:
 * SaldoAlocacao = CotaAlocada - ∑ EmpenhosVinculadosAoDepartamento
 * (Alocações organizam cotas internas e NÃO reduzem o saldo da ARP)
 */
export function calculateSaldoAlocado(
  cotaAlocada: number,
  empenhosDoDepartamento: Empenho[]
): {
  cotaAlocada: number;
  totalEmpenhado: number;
  saldoDisponivel: number;
  percentualConsumido: number;
} {
  const cota = Number(cotaAlocada) || 0;
  const totalEmpenhado = calculateTotalEmpenhado(empenhosDoDepartamento);
  const saldoDisponivel = cota - totalEmpenhado;
  const percentualConsumido = cota > 0 ? (totalEmpenhado / cota) * 100 : 0;

  return {
    cotaAlocada: cota,
    totalEmpenhado,
    saldoDisponivel,
    percentualConsumido
  };
}

/**
 * 7.1. Calcula o consumo e saldo de múltiplas Alocações Internas a partir da
 * lista canônica e unificada de Empenhos (allEmpenhos).
 * 
 * Regra Obrigatória (Isolamento e Anti-Duplicação):
 * - Cada empenho único é contabilizado EXATAMENTE UMA VEZ por alocação vinculada.
 * - Não soma separadamente empenhos de contratos e empenhos de saldo da ata,
 *   pois o mesmo empenho pode estar presente em ambas as visualizações.
 * - SaldoAlocacao = CotaAlocada - ∑ EmpenhosVinculadosAoDepartamento
 */
export function calculateAllocationsWithEmpenhos<T extends { id: string; allocatedQty: number; empenhadaQty?: number }>(
  allocations: T[],
  allEmpenhos: Empenho[],
  linksMap?: Record<string, string>
): (T & { empenhadaQty: number; saldoQty: number })[] {
  return allocations.map(alloc => {
    // Filtra apenas os empenhos que pertencem a esta alocação na lista consolidada e deduplicada
    const linkedEmpenhos = (allEmpenhos || []).filter(emp => {
      if (emp.unidadeInternaId === alloc.id) return true;
      if (linksMap) {
        if (linksMap[emp.numero] === alloc.id) return true;
        const normNum = normalizeEmpenhoNumero(emp.numero);
        if (normNum && linksMap[normNum] === alloc.id) return true;
        if (emp.id && linksMap[emp.id] === alloc.id) return true;
      }
      return false;
    });

    const empenhadaQty = calculateTotalEmpenhado(linkedEmpenhos);
    const saldoQty = (Number(alloc.allocatedQty) || 0) - empenhadaQty;

    return {
      ...alloc,
      empenhadaQty,
      saldoQty
    };
  });
}

/**
 * 8. Relatório de Reconciliação Contábil e Auditoria do Item:
 * Compara Fonte 1 (API SIASG) com Fonte 2 (Soma dos Empenhos Conhecidos).
 * NÃO altera nem sobrescreve nenhuma das fontes automaticamente.
 * Identifica explicitamente excessos/inconsistências quando Saldo < 0.
 */
export function reconcileBalances(
  quantidadeRegistrada: number,
  empenhos: Empenho[],
  saldoInformadoApi?: number | null
): ReconciliationReport {
  const qtdRegistrada = Number(quantidadeRegistrada) || 0;
  const breakdown = calculateTotalEmpenhadoPorOrigem(empenhos);
  const totalEmpenhado = breakdown.total;
  const saldoCalculado = qtdRegistrada - totalEmpenhado;

  // Cenário de inconsistência / excesso
  if (saldoCalculado < 0) {
    const divergencia = saldoInformadoApi != null ? Number(saldoInformadoApi) - saldoCalculado : 0;
    return {
      quantidadeRegistrada: qtdRegistrada,
      totalEmpenhadoApi: breakdown.api + breakdown.sincronizado,
      totalEmpenhadoManual: breakdown.manual,
      totalEmpenhado,
      saldoCalculado,
      saldoApi: saldoInformadoApi != null ? Number(saldoInformadoApi) : undefined,
      divergencia,
      status: 'DIVERGENTE',
      mensagem: `⚠️ Situação de excesso/inconsistência: Total empenhado (${totalEmpenhado}) excede a quantidade registrada (${qtdRegistrada}). Saldo negativo apurado: ${saldoCalculado} un.`
    };
  }

  if (saldoInformadoApi === undefined || saldoInformadoApi === null || isNaN(saldoInformadoApi)) {
    return {
      quantidadeRegistrada: qtdRegistrada,
      totalEmpenhadoApi: breakdown.api + breakdown.sincronizado,
      totalEmpenhadoManual: breakdown.manual,
      totalEmpenhado,
      saldoCalculado,
      saldoApi: undefined,
      divergencia: 0,
      status: 'NAO_INFORMADO',
      mensagem: 'Saldo apurado a partir dos empenhos conhecidos (sem retorno do saldo da API).'
    };
  }

  const saldoApiNum = Number(saldoInformadoApi);
  const divergencia = saldoApiNum - saldoCalculado;

  if (divergencia === 0) {
    return {
      quantidadeRegistrada: qtdRegistrada,
      totalEmpenhadoApi: breakdown.api + breakdown.sincronizado,
      totalEmpenhadoManual: breakdown.manual,
      totalEmpenhado,
      saldoCalculado,
      saldoApi: saldoApiNum,
      divergencia: 0,
      status: 'CONSISTENTE',
      mensagem: '✓ SALDOS CONSISTENTES'
    };
  }

  return {
    quantidadeRegistrada: qtdRegistrada,
    totalEmpenhadoApi: breakdown.api + breakdown.sincronizado,
    totalEmpenhadoManual: breakdown.manual,
    totalEmpenhado,
    saldoCalculado,
    saldoApi: saldoApiNum,
    divergencia,
    status: 'DIVERGENTE',
    mensagem: `⚠️ Divergência de ${Math.abs(divergencia)} unidades.`
  };
}

/**
 * 9. Algoritmo Inteligente de Sincronização e Fusão (Smart Reconciliation / Upsert):
 * Conecta empenhos vindos da API oficial com empenhos manuais cadastrados pelo usuário.
 * 
 * Regras:
 * - Se um empenho manual for localizado na API (mesmo número normalizado, ano, uasg, item):
 *   1. Promove a origem para 'SINCRONIZADO'
 *   2. Mantém os metadados de alocação departamental preenchidos pelo usuário
 *   3. Não cria registro duplicado (evita dupla contagem)
 *   4. Valida se a quantidade oficial confere com a digitada manualmente; se diferir, marca como DIVERGENTE.
 */
export function matchAndMergeEmpenhos(
  apiEmpenhos: Empenho[],
  manualEmpenhos: Empenho[]
): Empenho[] {
  const mergedMap = new Map<string, Empenho>();

  // 1. Indexa empenhos oficiais da API
  (apiEmpenhos || []).forEach(emp => {
    const key = getEmpenhoCanonicalKey(emp);
    mergedMap.set(key, { ...emp, origem: 'API' });
  });

  // 2. Processa empenhos manuais
  (manualEmpenhos || []).forEach(manual => {
    const key = getEmpenhoCanonicalKey(manual);
    const existingApi = mergedMap.get(key);

    if (existingApi) {
      // Correspondência encontrada! Promove para SINCRONIZADO e preserva alocação interna
      const isQtdMatch = Number(existingApi.quantidade) === Number(manual.quantidade);
      mergedMap.set(key, {
        ...existingApi,
        unidadeInternaId: manual.unidadeInternaId || existingApi.unidadeInternaId,
        observacao: manual.observacao || existingApi.observacao,
        origem: 'SINCRONIZADO',
        status: isQtdMatch ? 'CONFIRMADO' : 'DIVERGENTE',
        atualizadoEm: new Date().toISOString()
      });
    } else {
      // Registro exclusivamente manual (não localizado na API)
      mergedMap.set(key, {
        ...manual,
        origem: 'MANUAL'
      });
    }
  });

  return Array.from(mergedMap.values());
}

/**
 * 10. Calcula as estatísticas e percentuais consolidados para os cards de resumo do item:
 * - Saldo e Consumo p/ Empenho / Remanejamento (suportando percentuais reais de excesso)
 * - Saldo e Consumo para Adesões / Caronas (respeitando o teto do item e evitando duplicação por número de unidades)
 */
export function calculateItemCardMetrics(params: {
  quantidadeHomologada: number;
  totalEmpenhado: number;
  maximoAdesaoItem?: number;
  totalAdesaoConsumida?: number;
  valorUnitario?: number;
  gerenciadoraLimiteAdesao?: number;
}) {
  const {
    quantidadeHomologada,
    totalEmpenhado,
    maximoAdesaoItem = 0,
    totalAdesaoConsumida = 0,
    valorUnitario = 0,
    gerenciadoraLimiteAdesao = 0
  } = params;

  const itemTotalQty = Number(quantidadeHomologada) || 0;
  const officialSaldo = itemTotalQty - totalEmpenhado;
  const empenhoConsumidoPercent = itemTotalQty > 0 ? (totalEmpenhado / itemTotalQty) * 100 : 0;
  const rawEmpenhoPercentRestante = itemTotalQty > 0 ? (officialSaldo / itemTotalQty) * 100 : 0;
  const empenhoPercentClamped = Math.min(100, Math.max(0, rawEmpenhoPercentRestante));

  // Limite global de adesão (carona) por item (jamais multiplicado pelo total de unidades participantes)
  const limiteAdesao = maximoAdesaoItem > 0
    ? maximoAdesaoItem
    : (gerenciadoraLimiteAdesao > 0
        ? gerenciadoraLimiteAdesao
        : (itemTotalQty > 0 ? itemTotalQty * 2 : 0));

  const totalConsumidoAdesao = Number(totalAdesaoConsumida) || 0;
  const saldoAdesoes = Math.max(0, limiteAdesao - totalConsumidoAdesao);
  const adsPercVal = limiteAdesao > 0 ? (saldoAdesoes / limiteAdesao) * 100 : 0;
  const adsConsPercVal = limiteAdesao > 0 ? (totalConsumidoAdesao / limiteAdesao) * 100 : 0;
  const adsPercValClamped = Math.min(100, Math.max(0, adsPercVal));

  const valorFinanceiroDisponivel = officialSaldo * (Number(valorUnitario) || 0);
  const valorFinanceiroConsumido = totalEmpenhado * (Number(valorUnitario) || 0);

  return {
    officialSaldo,
    totalEmpenhado,
    itemTotalQty,
    empenhoConsumidoPercent,
    rawEmpenhoPercentRestante,
    empenhoPercentClamped,
    limiteAdesao,
    totalConsumidoAdesao,
    saldoAdesoes,
    adsPercVal,
    adsConsPercVal,
    adsPercValClamped,
    valorFinanceiroDisponivel,
    valorFinanceiroConsumido
  };
}

/**
 * Converte valores monetários em string (formatos "1.530.000,00", "153000.00", etc.) ou número em número float puro.
 */
export function parseMoneyValue(val: number | string | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).trim();
  if (!cleaned) return 0;
  // Se tem vírgula como decimal (padrão BR): remove pontos de milhar e troca vírgula por ponto
  if (cleaned.includes(',')) {
    const num = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    return isNaN(num) ? 0 : num;
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Obtém o valor monetário efetivo de uma Nota de Empenho, aplicando a regra de mútua exclusividade
 * contábil (Lei 4.320/64):
 * - Empenho do exercício corrente: empenhado > 0 e rpinscrito = 0.
 * - Empenho de exercício anterior inscrito em Restos a Pagar: empenhado = 0 e rpinscrito > 0.
 * 
 * Regra:
 * Se o valor empenhado for > 0, utiliza o valor empenhado.
 * Se o valor empenhado for 0/nulo e houver valor em Restos a Pagar (rpinscrito > 0), utiliza o rpinscrito.
 */
export function getEmpenhoEffectiveValue(
  empenhadoRaw: number | string | undefined | null,
  rpinscritoRaw?: number | string | undefined | null
): number {
  const vEmp = parseMoneyValue(empenhadoRaw);
  if (vEmp > 0) return vEmp;
  const vRp = parseMoneyValue(rpinscritoRaw);
  return vRp > 0 ? vRp : 0;
}

/**
 * Deduz a quantidade física oficial de uma Nota de Empenho vinculada a contrato,
 * respeitando o valor unitário base e a linha do tempo de reajustes contratuais (historico_item).
 */
export function deduceEmpenhoQuantity(
  valorEmpenhadoRaw: number | string | undefined | null,
  valorUnitarioBaseRaw: number | string | undefined | null,
  dataEmissao?: string,
  historicoPrecos?: Array<{ dataTermo: string; valorUnitario: number; quantidade?: number }>
): {
  quantidade: number;
  isExato: boolean;
  isReforco: boolean;
  valorUnitarioAplicado: number;
} {
  const valorEmpenhado = parseMoneyValue(valorEmpenhadoRaw);
  let valorUnitarioAplicado = parseMoneyValue(valorUnitarioBaseRaw);

  // Se houver histórico de termos contratuais com datas e o empenho tiver data_emissao,
  // localiza o valor unitário vigente na data da emissão do empenho.
  if (historicoPrecos && historicoPrecos.length > 0) {
    const validHistory = historicoPrecos
      .filter(h => h.valorUnitario > 0 && h.dataTermo)
      .sort((a, b) => new Date(a.dataTermo).getTime() - new Date(b.dataTermo).getTime());

    if (validHistory.length > 0) {
      if (dataEmissao) {
        const empDate = new Date(dataEmissao).getTime();
        // Encontra o termo mais recente cuja data seja anterior ou igual à data de emissão
        let matched = validHistory[0];
        for (const term of validHistory) {
          if (new Date(term.dataTermo).getTime() <= empDate) {
            matched = term;
          } else {
            break;
          }
        }
        if (matched && matched.valorUnitario > 0) {
          valorUnitarioAplicado = matched.valorUnitario;
        }
      } else {
        // Se não houver data, usa o último termo conhecido
        const last = validHistory[validHistory.length - 1];
        if (last && last.valorUnitario > 0) {
          valorUnitarioAplicado = last.valorUnitario;
        }
      }
    }
  }

  if (valorUnitarioAplicado <= 0 || valorEmpenhado <= 0) {
    return {
      quantidade: 0,
      isExato: false,
      isReforco: false,
      valorUnitarioAplicado: 0
    };
  }

  const rawQty = valorEmpenhado / valorUnitarioAplicado;
  const rounded = Math.round(rawQty);
  const diff = Math.abs(rawQty - rounded);

  // Tolerância para imprecisões de ponto flutuante (ex: 9.999999999 ou 10.000000001)
  if (diff < 0.001) {
    return {
      quantidade: rounded,
      isExato: true,
      isReforco: false,
      valorUnitarioAplicado
    };
  }

  // Divisão não exata: indica empenho complementar de reajuste ou ajuste residual financeiro
  return {
    quantidade: Math.floor(rawQty),
    isExato: false,
    isReforco: true,
    valorUnitarioAplicado
  };
}

