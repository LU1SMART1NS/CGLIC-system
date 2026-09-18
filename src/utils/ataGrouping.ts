import type { ArpRecord, ArpItemRecord, AtaGroupedCard, AdesaoStatusType } from '../types';

/**
 * Calcula a condição de adesão do agrupamento com base nos itens.
 * - 'ACEITA': Todos os itens com adesão informada aceitam adesão (> 0)
 * - 'NAO_ACEITA': Todos os itens com adesão informada não aceitam adesão (== 0)
 * - 'VARIAVEL': Existem itens que aceitam e itens que não aceitam
 * - 'NAO_INFORMADA': Nenhum item possui a informação de adesão informada
 */
export function computeAdesaoStatus(itens: ArpItemRecord[]): AdesaoStatusType {
  if (!itens || itens.length === 0) {
    return 'NAO_INFORMADA';
  }

  const itemsWithAdesao = itens.filter(
    (i) => i.maximoAdesao !== undefined && i.maximoAdesao !== null
  );

  if (itemsWithAdesao.length === 0) {
    return 'NAO_INFORMADA';
  }

  const aceitaCount = itemsWithAdesao.filter((i) => i.maximoAdesao > 0).length;
  const naoAceitaCount = itemsWithAdesao.filter((i) => i.maximoAdesao === 0).length;

  if (aceitaCount > 0 && naoAceitaCount === 0) {
    return 'ACEITA';
  }
  if (naoAceitaCount > 0 && aceitaCount === 0) {
    return 'NAO_ACEITA';
  }
  if (aceitaCount > 0 && naoAceitaCount > 0) {
    return 'VARIAVEL';
  }

  return 'NAO_INFORMADA';
}

/**
 * Formata um valor numérico para o padrão monetário brasileiro (BRL).
 */
export function formatCurrencyBRL(val?: number | null): string {
  if (val === undefined || val === null || isNaN(val)) {
    return 'R$ 0,00';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);
}

/**
 * Formata o número do item com zeros à esquerda (ex: "1" -> "00001").
 */
export function formatItemNumber(numeroItem?: string | number): string {
  if (!numeroItem) return '00001';
  const str = String(numeroItem).trim();
  const num = parseInt(str, 10);
  if (!isNaN(num)) {
    return String(num).padStart(5, '0');
  }
  return str.padStart(5, '0');
}

/**
 * Agrupa Atas e Itens garantindo a regra de negócio contábil:
 * 1 Ata de Registro de Preços (no mesmo ano e UASG) = 1 Fornecedor Único = 1 Card
 * 
 * Preserva a integridade e ordenação das Atas originais.
 * Se uma Ata ainda não possui itens carregados, gera um card com itens vazios.
 */
export function groupArpsAndItems(
  arps: ArpRecord[],
  itemsByAta: Record<string, ArpItemRecord[]>
): AtaGroupedCard[] {
  if (!arps || arps.length === 0) {
    return [];
  }

  const cards: AtaGroupedCard[] = [];

  for (const arp of arps) {
    const ataKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`;
    const rawItems = itemsByAta[ataKey];

    // Se os itens ainda não foram carregados ou a lista está vazia
    if (!rawItems || rawItems.length === 0) {
      cards.push({
        key: `card-${ataKey}`,
        arp,
        fornecedorNome: arp.objeto ? 'Fornecedor Registrado / A carregar' : 'Fornecedor da Ata',
        fornecedorCnpj: '',
        itens: [],
        adesaoStatus: 'NAO_INFORMADA',
        totalItens: arp.quantidadeItens || 0
      });
      continue;
    }

    // Identifica o fornecedor oficial único desta Ata
    // Prioriza o primeiro item com CNPJ/Razão Social válidos
    const itemComFornecedor = rawItems.find(i => i.niFornecedor || (i.nomeRazaoSocialFornecedor && i.nomeRazaoSocialFornecedor !== 'FORNECEDOR NÃO INFORMADO')) || rawItems[0];
    
    const fornecedorNome = (itemComFornecedor?.nomeRazaoSocialFornecedor || 'FORNECEDOR NÃO INFORMADO').trim();
    const fornecedorCnpj = (itemComFornecedor?.niFornecedor || '').trim();

    // Filtra apenas os itens pertencentes a este fornecedor/ata (exclui itens sem CNPJ ou de outros lotes)
    const targetCnpjDigits = fornecedorCnpj.replace(/\D/g, '');
    let ataItens = rawItems;
    if (targetCnpjDigits) {
      const filteredBySupplier = rawItems.filter(i => {
        const itemCnpjDigits = (i.niFornecedor || '').replace(/\D/g, '');
        return itemCnpjDigits === targetCnpjDigits;
      });
      if (filteredBySupplier.length > 0) {
        ataItens = filteredBySupplier;
      }
    }

    const sortedItens = [...ataItens].sort((a, b) => {
      const numA = parseInt(a.numeroItem, 10) || 0;
      const numB = parseInt(b.numeroItem, 10) || 0;
      return numA - numB;
    });

    cards.push({
      key: `card-${ataKey}`,
      arp,
      fornecedorNome,
      fornecedorCnpj,
      itens: sortedItens,
      adesaoStatus: computeAdesaoStatus(sortedItens),
      totalItens: sortedItens.length
    });
  }

  return cards;
}
