import { contractMatchesCompra } from '../../modals/linkContractSuggestions';
import type { PrazoFaixa } from '../../carteira/carteiraPrazo';
import type { ContractDashboardRecord } from '../../../types';
import { isVigente } from './distribuicaoEquipe';
import { classificarAta, type Complexidade } from './complexidade';

/**
 * Pendências de distribuição da Central, pelo caminho da CGLIC: o coordenador atribui ATAS (o servidor recebe
 * a ata e os contratos vinculados a ela); o servidor vincula os contratos (Ata 360 / item), e o contrato herda o
 * gestor da ata no banco (migration 69). Contratos que não vêm de ata recebem gestor direto.
 *
 * "Provável" = mesma compra E mesmo fornecedor da ata (mesmos critérios do modal "Vincular Contrato").
 */

export interface FilaContrato {
  contractKey: string;
  numero: string;
  fornecedorNome?: string;
  fornecedorCnpj?: string;
  idCompra?: string;
  objeto?: string;
  faixa: PrazoFaixa;
  dias: number | null;
  gestorNome?: string;
  contract: ContractDashboardRecord;
}

export interface FilaAta {
  numeroAta: string;
  uasg: string;
  idCompra?: string;
  numeroCompra?: string;
  anoCompra?: string;
  /** CNPJs (só dígitos) dos fornecedores dos itens da ata. */
  cnpjs: string[];
  gestorNome?: string;
  objeto?: string;
  fornecedorNome?: string;
  faixa: PrazoFaixa;
  dias: number | null;
  itens: number;
}

export type MotivoSugestao = 'COMPRA_E_FORNECEDOR' | 'COMPRA' | 'FORNECEDOR';

export interface AtaSugerida {
  numeroAta: string;
  uasg: string;
  motivo: MotivoSugestao;
  gestorNome?: string;
}

/** UNICA: uma ata com mesma compra e fornecedor; VARIAS: mais de uma; PARCIAL: só compra ou só fornecedor; NENHUMA: sem pista. */
export type SituacaoFila = 'UNICA' | 'VARIAS' | 'PARCIAL' | 'NENHUMA';

export interface ItemFila extends FilaContrato {
  situacao: SituacaoFila;
  sugestoes: AtaSugerida[];
}

export interface AtaSemGestor {
  numeroAta: string;
  uasg: string;
  objeto?: string;
  fornecedorNome?: string;
  faixa: PrazoFaixa;
  dias: number | null;
  complexidade: Complexidade;
  /** Contratos vigentes já vinculados (vão junto ao atribuir a ata). */
  vinculados: string[];
  /** Contratos vigentes prováveis desta ata, ainda não vinculados (o servidor vincula). */
  provaveis: string[];
}

export interface ContratoAVincular {
  contractKey: string;
  numero: string;
  numeroAta: string;
}

export interface PendenciasDistribuicao {
  atasSemGestor: AtaSemGestor[];
  /** Sem vínculo, sem gestor e sem pista forte: o coordenador decide (atribui direto ou marca "não pertence a ata"). */
  precisamDecisao: ItemFila[];
  /** Sem vínculo e sem gestor, mas com ata provável: o gestor vem com o vínculo. */
  aguardamVinculo: ItemFila[];
  /** Marcados pelo coordenador como "não pertence a ata" (vigentes). */
  naoPertencem: ItemFila[];
  /** Por gestor da ata: contratos prováveis das atas dele ainda não vinculados. */
  aVincularPorGestor: Map<string, ContratoAVincular[]>;
  totalAVincular: number;
}

const MAX_SUGESTOES = 5;
const ORDEM_MOTIVO: Record<MotivoSugestao, number> = { COMPRA_E_FORNECEDOR: 0, COMPRA: 1, FORNECEDOR: 2 };
const digits = (v?: string | null) => (v || '').replace(/\D/g, '');
const diasOrd = (d: number | null) => (d === null ? Number.POSITIVE_INFINITY : d);

export function sugerirAtas(contrato: Pick<FilaContrato, 'idCompra' | 'fornecedorCnpj'>, atas: FilaAta[]): { situacao: SituacaoFila; sugestoes: AtaSugerida[] } {
  const cnpj = digits(contrato.fornecedorCnpj);
  const sugestoes: AtaSugerida[] = [];
  for (const ata of atas) {
    const mesmaCompra = contractMatchesCompra(
      { idCompra: contrato.idCompra },
      { idCompra: ata.idCompra, uasg: ata.uasg, numeroCompra: ata.numeroCompra, anoCompra: ata.anoCompra }
    );
    const mesmoFornecedor = Boolean(cnpj) && ata.cnpjs.includes(cnpj);
    if (!mesmaCompra && !mesmoFornecedor) continue;
    sugestoes.push({
      numeroAta: ata.numeroAta,
      uasg: ata.uasg,
      motivo: mesmaCompra && mesmoFornecedor ? 'COMPRA_E_FORNECEDOR' : mesmaCompra ? 'COMPRA' : 'FORNECEDOR',
      gestorNome: ata.gestorNome
    });
  }
  sugestoes.sort((a, b) => ORDEM_MOTIVO[a.motivo] - ORDEM_MOTIVO[b.motivo] || a.numeroAta.localeCompare(b.numeroAta));
  const fortes = sugestoes.filter((s) => s.motivo === 'COMPRA_E_FORNECEDOR').length;
  const situacao: SituacaoFila = fortes === 1 ? 'UNICA' : fortes > 1 ? 'VARIAS' : sugestoes.length > 0 ? 'PARCIAL' : 'NENHUMA';
  return { situacao, sugestoes: sugestoes.slice(0, MAX_SUGESTOES) };
}

export function buildPendenciasDistribuicao(input: {
  contratos: FilaContrato[];
  /** Todas as atas carregadas (inclusive encerradas: o contrato costuma durar mais que a ata). */
  atas: FilaAta[];
  /** contract_key → número da ata a que está vinculado (arp_item_contract_links). */
  ataDoContrato: Map<string, string>;
  /** contract_key marcados "não pertence a ata". */
  naoPertencemAAta: Set<string>;
}): PendenciasDistribuicao {
  const vinculadosPorAta = new Map<string, string[]>();
  const provaveisPorAta = new Map<string, string[]>();
  const aVincularPorGestor = new Map<string, ContratoAVincular[]>();
  const precisamDecisao: ItemFila[] = [];
  const aguardamVinculo: ItemFila[] = [];
  const naoPertencem: ItemFila[] = [];
  let totalAVincular = 0;

  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  for (const contrato of input.contratos) {
    if (!isVigente(contrato.faixa)) continue;
    const ataVinculada = input.ataDoContrato.get(contrato.contractKey);
    if (ataVinculada) {
      push(vinculadosPorAta, ataVinculada, contrato.numero);
      continue;
    }
    const item: ItemFila = { ...contrato, ...sugerirAtas(contrato, input.atas) };
    if (input.naoPertencemAAta.has(contrato.contractKey)) {
      naoPertencem.push(item);
      continue;
    }
    const fortes = item.sugestoes.filter((s) => s.motivo === 'COMPRA_E_FORNECEDOR');
    for (const ata of fortes) {
      push(provaveisPorAta, ata.numeroAta, contrato.numero);
      if (ata.gestorNome) {
        push(aVincularPorGestor, ata.gestorNome, { contractKey: contrato.contractKey, numero: contrato.numero, numeroAta: ata.numeroAta });
        totalAVincular++;
      }
    }
    if (contrato.gestorNome) continue;
    (fortes.length > 0 ? aguardamVinculo : precisamDecisao).push(item);
  }

  const atasSemGestor: AtaSemGestor[] = [];
  for (const ata of input.atas) {
    if (ata.gestorNome) continue;
    const vinculados = vinculadosPorAta.get(ata.numeroAta) || [];
    const provaveis = provaveisPorAta.get(ata.numeroAta) || [];
    // Encerrada sem contrato vigente não tem o que distribuir.
    if (!isVigente(ata.faixa) && vinculados.length === 0 && provaveis.length === 0) continue;
    atasSemGestor.push({
      numeroAta: ata.numeroAta,
      uasg: ata.uasg,
      objeto: ata.objeto,
      fornecedorNome: ata.fornecedorNome,
      faixa: ata.faixa,
      dias: ata.dias,
      complexidade: classificarAta(ata.itens, ata.cnpjs.length),
      vinculados,
      provaveis
    });
  }
  // Primeiro as atas que já têm contratos (vinculados ou prováveis); depois o menor prazo.
  atasSemGestor.sort(
    (a, b) =>
      b.vinculados.length + b.provaveis.length - (a.vinculados.length + a.provaveis.length) ||
      diasOrd(a.dias) - diasOrd(b.dias) ||
      a.numeroAta.localeCompare(b.numeroAta)
  );

  const porPrazo = (a: ItemFila, b: ItemFila) => diasOrd(a.dias) - diasOrd(b.dias) || a.numero.localeCompare(b.numero);
  // Pista parcial antes de "sem pista": é onde a decisão é menos óbvia.
  precisamDecisao.sort((a, b) => Number(b.situacao === 'PARCIAL') - Number(a.situacao === 'PARCIAL') || porPrazo(a, b));
  aguardamVinculo.sort(porPrazo);
  naoPertencem.sort((a, b) => a.numero.localeCompare(b.numero));

  return { atasSemGestor, precisamDecisao, aguardamVinculo, naoPertencem, aVincularPorGestor, totalAVincular };
}
