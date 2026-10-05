import { contractMatchesCompra } from '../../modals/linkContractSuggestions';
import type { PrazoFaixa } from '../../carteira/carteiraPrazo';
import type { ContractDashboardRecord } from '../../../types';
import { isVigente } from './distribuicaoEquipe';

/**
 * Fila "Contratos sem ata" da Central de Distribuição: contratos vigentes sem vínculo com item de ata
 * (arp_item_contract_links) e que o coordenador ainda não confirmou como "sem ata". Para cada um, as atas
 * prováveis pelos mesmos critérios do modal "Vincular Contrato" (mesma compra e mesmo fornecedor).
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
  /** Registro completo, para abrir o modal de vínculo já com o contrato escolhido. */
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
  /** Ata com itens no banco (sem itens não dá para vincular pelo modal). */
  temItens: boolean;
}

export type MotivoSugestao = 'COMPRA_E_FORNECEDOR' | 'COMPRA' | 'FORNECEDOR';

export interface AtaSugerida {
  numeroAta: string;
  uasg: string;
  motivo: MotivoSugestao;
  gestorNome?: string;
  temItens: boolean;
}

/** UNICA: uma ata com mesma compra e fornecedor; VARIAS: mais de uma; PARCIAL: só compra ou só fornecedor; NENHUMA: sem pista. */
export type SituacaoFila = 'UNICA' | 'VARIAS' | 'PARCIAL' | 'NENHUMA';

export interface ItemFila extends FilaContrato {
  situacao: SituacaoFila;
  sugestoes: AtaSugerida[];
}

export interface FilaSemAta {
  /** Ainda sem vínculo e sem confirmação, na ordem de trabalho (mais fáceis e mais urgentes primeiro). */
  pendentes: ItemFila[];
  /** Confirmados pelo coordenador como sem ata (para consulta e para desfazer). */
  confirmados: ItemFila[];
  contagem: Record<SituacaoFila, number>;
}

const MAX_SUGESTOES = 5;
const ORDEM: Record<SituacaoFila, number> = { UNICA: 0, VARIAS: 1, PARCIAL: 2, NENHUMA: 3 };
const ORDEM_MOTIVO: Record<MotivoSugestao, number> = { COMPRA_E_FORNECEDOR: 0, COMPRA: 1, FORNECEDOR: 2 };
const digits = (v?: string | null) => (v || '').replace(/\D/g, '');

export function sugerirAtas(contrato: FilaContrato, atas: FilaAta[]): { situacao: SituacaoFila; sugestoes: AtaSugerida[] } {
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
      gestorNome: ata.gestorNome,
      temItens: ata.temItens
    });
  }
  sugestoes.sort((a, b) => ORDEM_MOTIVO[a.motivo] - ORDEM_MOTIVO[b.motivo] || a.numeroAta.localeCompare(b.numeroAta));

  const fortes = sugestoes.filter((s) => s.motivo === 'COMPRA_E_FORNECEDOR').length;
  const situacao: SituacaoFila = fortes === 1 ? 'UNICA' : fortes > 1 ? 'VARIAS' : sugestoes.length > 0 ? 'PARCIAL' : 'NENHUMA';
  return { situacao, sugestoes: sugestoes.slice(0, MAX_SUGESTOES) };
}

export function buildFilaSemAta(input: {
  contratos: FilaContrato[];
  atas: FilaAta[];
  /** contract_key de todos os contratos já vinculados a algum item de ata. */
  vinculados: Set<string>;
  /** contract_key dos contratos confirmados como sem ata. */
  confirmadosSemAta: Set<string>;
}): FilaSemAta {
  const pendentes: ItemFila[] = [];
  const confirmados: ItemFila[] = [];
  const contagem: Record<SituacaoFila, number> = { UNICA: 0, VARIAS: 0, PARCIAL: 0, NENHUMA: 0 };

  for (const contrato of input.contratos) {
    if (!isVigente(contrato.faixa) || input.vinculados.has(contrato.contractKey)) continue;
    const item: ItemFila = { ...contrato, ...sugerirAtas(contrato, input.atas) };
    if (input.confirmadosSemAta.has(contrato.contractKey)) {
      confirmados.push(item);
      continue;
    }
    pendentes.push(item);
    contagem[item.situacao]++;
  }

  const dias = (d: number | null) => (d === null ? Number.POSITIVE_INFINITY : d);
  pendentes.sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || dias(a.dias) - dias(b.dias) || a.numero.localeCompare(b.numero));
  confirmados.sort((a, b) => a.numero.localeCompare(b.numero));
  return { pendentes, confirmados, contagem };
}
