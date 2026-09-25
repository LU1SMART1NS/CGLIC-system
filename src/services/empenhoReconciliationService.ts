/**
 * Módulo Canônico de Reconciliação Determinística de Empenhos (SaldoARP 3.0)
 * Implementa o algoritmo de fusão por campo, matriz de precedência oficial
 * e detecção rigorosa de divergências conforme FASE 7.2-F e FASE 7.2-G.
 *
 * Invariante: Pura computação determinística em memória. Zero persistência, zero chamadas diretas ao banco.
 */

import type {
  NormalizedEmpenho,
  EmpenhoReconciliado,
  ConflitoCampo,
  NormalizedItemLink,
  NormalizedContractLink,
  VinculoPendente,
  EmpenhoFonteOrigem
} from '../types/empenhoSync';

/**
 * Agrupa leituras normalizadas por chave canônica determinística e executa o merge por precedência.
 */
export function reconcileNormalizedEmpenhos(
  records: NormalizedEmpenho[]
): EmpenhoReconciliado[] {
  if (!records || records.length === 0) {
    return [];
  }

  // 1. Agrupamento determinístico por canonical_key
  const groups = new Map<string, NormalizedEmpenho[]>();
  for (const rec of records) {
    if (!rec.canonical_key) continue;
    const group = groups.get(rec.canonical_key) || [];
    group.push(rec);
    groups.set(rec.canonical_key, group);
  }

  const reconciledList: EmpenhoReconciliado[] = [];

  // 2. Reconciliação campo a campo de cada grupo
  for (const [canonicalKey, group] of groups.entries()) {
    const reconciled = reconcileSingleEmpenhoGroup(canonicalKey, group);
    reconciledList.push(reconciled);
  }

  return reconciledList;
}

/**
 * Reconcilia um grupo de leituras da mesma canonical_key
 */
function reconcileSingleEmpenhoGroup(
  canonicalKey: string,
  group: NormalizedEmpenho[]
): EmpenhoReconciliado {
  const conflitos: ConflitoCampo[] = [];
  const fontesConsultadas: EmpenhoFonteOrigem[] = Array.from(
    new Set(group.map(g => g.fonte_origem))
  );

  // Classifica leituras por autoridade de fonte
  const comprasGovRec = group.find(g => g.fonte_origem === 'COMPRASNET');
  const contratosGovRec = group.find(g => g.fonte_origem === 'CONTRATOSNET');
  const pncpRec = group.find(g => g.fonte_origem === 'PNCP');
  const manualRec = group.find(g => g.fonte_origem === 'MANUAL');

  // Determina fonte primária de referência para campos cadastrais
  const primaryCadastral = contratosGovRec || comprasGovRec || pncpRec || manualRec || group[0];

  const uasg = primaryCadastral.uasg;
  const ano = primaryCadastral.ano;
  const numeroNormalizado = primaryCadastral.numero_normalizado;
  const numeroOficial = contratosGovRec?.numero_oficial
    || comprasGovRec?.numero_oficial
    || pncpRec?.numero_oficial
    || primaryCadastral.numero_oficial;

  // --- RECONCILIAÇÃO DE DATA DE EMISSÃO ---
  // Precedência: Contratos.gov > Compras.gov > PNCP > Manual
  let dataEmissao = contratosGovRec?.data_emissao
    || comprasGovRec?.data_emissao
    || pncpRec?.data_emissao
    || manualRec?.data_emissao
    || new Date().toISOString().split('T')[0];

  // Detecção de divergência de datas
  const datasDistintas = Array.from(new Set(group.map(g => g.data_emissao).filter(Boolean))) as string[];
  if (datasDistintas.length > 1) {
    conflitos.push({
      campo: 'data_emissao',
      tipo: 'DATA',
      valor_primario: dataEmissao,
      valor_secundario: datasDistintas.filter(d => d !== dataEmissao).join(', '),
      fonte_primaria: (contratosGovRec?.data_emissao ? 'CONTRATOSNET' : comprasGovRec?.data_emissao ? 'COMPRASNET' : 'PNCP'),
      fonte_secundaria: 'OUTRAS_FONTES',
      resolvido_automaticamente: true,
      descricao: `Divergência de datas de emissão entre fontes oficiais (${datasDistintas.join(' vs ')}). Aplicada data da fonte prioritária.`
    });
  }

  // --- RECONCILIAÇÃO FINANCEIRA ---
  // Precedência: Contratos.gov (SIAFI) > PNCP > Compras.gov > Manual
  let valorEmpenhado = 0;
  if (contratosGovRec?.valor_empenhado !== undefined && contratosGovRec.valor_empenhado > 0) {
    valorEmpenhado = contratosGovRec.valor_empenhado;
  } else if (pncpRec?.valor_empenhado !== undefined && pncpRec.valor_empenhado > 0) {
    valorEmpenhado = pncpRec.valor_empenhado;
  } else if (comprasGovRec?.valor_empenhado !== undefined && comprasGovRec.valor_empenhado > 0) {
    valorEmpenhado = comprasGovRec.valor_empenhado;
  } else if (manualRec?.valor_empenhado !== undefined && manualRec.valor_empenhado > 0) {
    valorEmpenhado = manualRec.valor_empenhado;
  }

  // Detecção de divergência financeira entre fontes oficiais
  const valoresOficiais: { fonte: string; valor: number }[] = [];
  if (contratosGovRec?.valor_empenhado && contratosGovRec.valor_empenhado > 0) {
    valoresOficiais.push({ fonte: 'CONTRATOSNET', valor: contratosGovRec.valor_empenhado });
  }
  if (pncpRec?.valor_empenhado && pncpRec.valor_empenhado > 0) {
    valoresOficiais.push({ fonte: 'PNCP', valor: pncpRec.valor_empenhado });
  }
  if (comprasGovRec?.valor_empenhado && comprasGovRec.valor_empenhado > 0) {
    valoresOficiais.push({ fonte: 'COMPRASNET', valor: comprasGovRec.valor_empenhado });
  }

  if (valoresOficiais.length > 1) {
    const diff = Math.abs(valoresOficiais[0].valor - valoresOficiais[1].valor);
    if (diff > 0.01) {
      conflitos.push({
        campo: 'valor_empenhado',
        tipo: 'VALOR',
        valor_primario: valoresOficiais[0].valor,
        valor_secundario: valoresOficiais[1].valor,
        fonte_primaria: valoresOficiais[0].fonte,
        fonte_secundaria: valoresOficiais[1].fonte,
        resolvido_automaticamente: true,
        descricao: `Divergência financeira de R$ ${diff.toFixed(2)} entre ${valoresOficiais[0].fonte} e ${valoresOficiais[1].fonte}. Prevaleceu ${valoresOficiais[0].fonte}.`
      });
    }
  }

  // Execução financeira (autoridade exclusiva de Contratos.gov / SIAFI)
  const valorLiquidado = contratosGovRec?.valor_liquidado ?? 0;
  const valorPago = contratosGovRec?.valor_pago ?? 0;
  const valorRpinscrito = contratosGovRec?.valor_rpinscrito ?? 0;
  const valorRpALiquidar = contratosGovRec?.valor_rp_a_liquidar;
  const valorRpLiquidado = contratosGovRec?.valor_rp_liquidado;
  const valorRpPago = contratosGovRec?.valor_rp_pago;

  // --- RECONCILIAÇÃO DE CREDOR ---
  // Precedência: Contratos.gov > Compras.gov > Manual
  const credorNome = contratosGovRec?.credor_nome || comprasGovRec?.credor_nome || manualRec?.credor_nome;
  const credorCnpj = contratosGovRec?.credor_cnpj_cpf || comprasGovRec?.credor_cnpj_cpf || manualRec?.credor_cnpj_cpf;

  const cnpjsDistintos = Array.from(
    new Set(group.map(g => g.credor_cnpj_cpf).filter(Boolean))
  ) as string[];

  if (cnpjsDistintos.length > 1) {
    conflitos.push({
      campo: 'credor_cnpj_cpf',
      tipo: 'CREDOR',
      valor_primario: credorCnpj,
      valor_secundario: cnpjsDistintos.filter(c => c !== credorCnpj).join(', '),
      fonte_primaria: (contratosGovRec?.credor_cnpj_cpf ? 'CONTRATOSNET' : 'COMPRASNET'),
      fonte_secundaria: 'OUTRAS_FONTES',
      resolvido_automaticamente: false,
      descricao: `Divergência de identificação do credor/CNPJ (${cnpjsDistintos.join(' vs ')}). Requer validação.`
    });
  }

  // --- RECONCILIAÇÃO DE VÍNCULOS COM ITENS DE ATA (CONSUMO FÍSICO) ---
  const itemLinksMap = new Map<string, NormalizedItemLink>();

  // Processa leituras de itens de Compras.gov (autoridade primária de quantidade física)
  if (comprasGovRec?.item_links) {
    for (const link of comprasGovRec.item_links) {
      itemLinksMap.set(link.item_key, { ...link });
    }
  }

  // Processa leituras de itens de Contratos.gov (minuta)
  if (contratosGovRec?.item_links) {
    for (const link of contratosGovRec.item_links) {
      const existing = itemLinksMap.get(link.item_key);
      if (!existing) {
        itemLinksMap.set(link.item_key, { ...link });
      } else {
        // Se já existe do Compras.gov e difere da minuta
        if (Math.abs(existing.quantidade_consumida - link.quantidade_consumida) > 0.0001) {
          conflitos.push({
            campo: 'quantidade_consumida',
            tipo: 'QUANTIDADE',
            valor_primario: existing.quantidade_consumida,
            valor_secundario: link.quantidade_consumida,
            fonte_primaria: 'COMPRASNET',
            fonte_secundaria: 'CONTRATOSNET_MINUTA',
            resolvido_automaticamente: true,
            descricao: `Divergência quantitativa para o item ${link.item_key}: Compras.gov (${existing.quantidade_consumida}) vs Contratos.gov (${link.quantidade_consumida}). Prevaleceu Compras.gov.`
          });
        }
      }
    }
  }

  // Processa vínculos manuais se ainda não existem oficiais
  if (manualRec?.item_links) {
    for (const link of manualRec.item_links) {
      if (!itemLinksMap.has(link.item_key)) {
        itemLinksMap.set(link.item_key, { ...link });
      }
    }
  }

  // --- RECONCILIAÇÃO DE VÍNCULOS CONTRATUAIS ---
  const contractLinksMap = new Map<string, NormalizedContractLink>();

  if (contratosGovRec?.contract_links) {
    for (const link of contratosGovRec.contract_links) {
      contractLinksMap.set(link.contract_key, { ...link });
    }
  }

  if (pncpRec?.contract_links) {
    for (const link of pncpRec.contract_links) {
      if (!contractLinksMap.has(link.contract_key)) {
        contractLinksMap.set(link.contract_key, { ...link });
      }
    }
  }

  if (manualRec?.contract_links) {
    for (const link of manualRec.contract_links) {
      if (!contractLinksMap.has(link.contract_key)) {
        contractLinksMap.set(link.contract_key, { ...link });
      }
    }
  }

  // --- VÍNCULOS PENDENTES ---
  const vinculosPendentes: VinculoPendente[] = [];
  for (const g of group) {
    if (g.vinculos_pendentes) {
      for (const vp of g.vinculos_pendentes) {
        // Se o vínculo pendente já foi resolvido em outra fonte oficial, não adiciona
        if (vp.tipo === 'ITEM' && itemLinksMap.size > 0) continue;
        if (vp.tipo === 'CONTRATO' && contractLinksMap.size > 0) continue;
        vinculosPendentes.push(vp);
      }
    }
  }

  // Determinação da fonte de origem oficial soberana
  const hasOfficialSource = group.some(g =>
    ['COMPRASNET', 'CONTRATOSNET', 'PNCP', 'SINCRONIZADO'].includes(g.fonte_origem)
  );
  const fonteOrigem: EmpenhoFonteOrigem = hasOfficialSource ? 'SINCRONIZADO' : 'MANUAL';

  // Status de reconciliação
  const hasUnresolvedConflicts = conflitos.some(c => !c.resolvido_automaticamente);
  const statusReconciliacao = hasUnresolvedConflicts
    ? 'DIVERGENTE'
    : (conflitos.length > 0 ? 'CONFIRMADO' : 'CONFIRMADO');

  return {
    canonical_key: canonicalKey,
    uasg,
    ano,
    numero_oficial: numeroOficial,
    numero_normalizado: numeroNormalizado,
    data_emissao: dataEmissao,
    valor_empenhado: valorEmpenhado,
    valor_liquidado: valorLiquidado,
    valor_pago: valorPago,
    valor_rpinscrito: valorRpinscrito,
    valor_rp_a_liquidar: valorRpALiquidar,
    valor_rp_liquidado: valorRpLiquidado,
    valor_rp_pago: valorRpPago,
    credor_nome: credorNome,
    credor_cnpj_cpf: credorCnpj,
    fonte_origem: fonteOrigem,
    identificador_fonte: contratosGovRec?.identificador_fonte || pncpRec?.identificador_fonte,
    status_reconciliacao: statusReconciliacao,
    fontes_consultadas: fontesConsultadas,
    conflitos,
    item_links: Array.from(itemLinksMap.values()),
    contract_links: Array.from(contractLinksMap.values()),
    vinculos_pendentes: vinculosPendentes
  };
}
