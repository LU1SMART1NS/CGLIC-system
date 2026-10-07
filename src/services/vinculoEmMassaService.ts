import { saveArpContractItemLinks } from './arpContractLinkService';
import { syncContractItemQuantity } from './contractItemQuantitySyncService';
import { syncItemContractEmpenhos } from './itemContractEmpenhoService';
import { saveContractManagerRpc } from '../adapters/contractManagementRpcAdapter';
import type { ContractDashboardRecord } from '../types';

/** Um contrato a vincular a itens de uma ata (os mesmos passos do modal "Vincular Contrato" da Ata 360). */
export interface PlanoVinculo {
  contractKey: string;
  numero: string;
  contract: ContractDashboardRecord;
  numeroAta: string;
  uasg: string;
  /** `quantidade` (lida da API na conferência) só serve para mostrar ao usuário; o vínculo lê de novo ao gravar. */
  itens: Array<{ itemKey: string; numeroItem: string; valorUnitario?: number; quantidade?: number | null }>;
  /**
   * Contrato em atas de gestores diferentes: o gestor que o coordenador escolheu. Gravado depois do vínculo (o banco
   * deixa o contrato como estava quando ele já está em outra ata; migration 86). Só no último plano do contrato.
   */
  gestorFinal?: { nome: string; userId?: string | null };
}

export interface ResultadoVinculo {
  contractKey: string;
  numero: string;
  ok: boolean;
  /** Itens vinculados (0 quando falhou). */
  itens: number;
  erro?: string;
  /** O vínculo foi gravado, mas a quantidade ou os empenhos de algum item não puderam ser lidos da API. */
  avisos: string[];
}

const OBSERVACAO = 'Vínculo atribuído pela Coordenação';

/**
 * Vincula um contrato aos itens da ata e lê, para cada item, a quantidade contratada (que entra no saldo) e os
 * empenhos do contrato. A falha do vínculo é do contrato; a falha da leitura da API vira aviso (o vínculo vale e a
 * quantidade é lida de novo ao abrir o item).
 */
export async function vincularContrato(plano: PlanoVinculo): Promise<ResultadoVinculo> {
  const base = { contractKey: plano.contractKey, numero: plano.numero };
  try {
    await saveArpContractItemLinks({
      contractKey: plano.contractKey,
      itemKeys: plano.itens.map((i) => i.itemKey),
      observacoes: OBSERVACAO
    });
  } catch (err: any) {
    return { ...base, ok: false, itens: 0, erro: err?.message || 'Falha ao vincular o contrato.', avisos: [] };
  }

  const avisos: string[] = [];
  if (plano.gestorFinal) {
    try {
      await saveContractManagerRpc({
        uasg: plano.contract.uasg,
        numero: plano.contract.numero,
        ano: Number(plano.contract.ano),
        gestorNome: plano.gestorFinal.nome,
        gestorUserId: plano.gestorFinal.userId ?? null
      });
    } catch {
      avisos.push(`gestor ${plano.gestorFinal.nome} (troque na Central)`);
    }
  }
  for (const item of plano.itens) {
    let unitPrice = item.valorUnitario;
    try {
      const q = await syncContractItemQuantity({
        numeroAta: plano.numeroAta,
        uasg: plano.uasg,
        numeroItem: item.numeroItem,
        contractKey: plano.contractKey,
        contract: plano.contract
      });
      // O preço unitário do próprio contrato é a base certa da estimativa dos empenhos.
      if (q.valorUnitario) unitPrice = q.valorUnitario;
    } catch {
      avisos.push(`quantidade do item ${item.numeroItem}`);
    }
    try {
      await syncItemContractEmpenhos({
        numeroAta: plano.numeroAta,
        uasg: plano.uasg,
        numeroItem: item.numeroItem,
        contract: {
          contractKey: plano.contractKey,
          uasg: plano.contract.uasg,
          numero: plano.contract.numero,
          ano: plano.contract.ano,
          contratoId: plano.contract.contratoId
        },
        unitPrice
      });
    } catch {
      avisos.push(`empenhos do item ${item.numeroItem}`);
    }
  }
  return { ...base, ok: true, itens: plano.itens.length, avisos };
}

/**
 * Executa os vínculos em sequência (um contrato por vez, para não sobrecarregar a API nem o banco). Uma falha não
 * interrompe o lote; o resultado traz cada contrato. `parar` encerra depois do contrato em andamento.
 */
export async function executarVinculos(
  planos: PlanoVinculo[],
  opcoes: { onProgresso?: (feitos: number, total: number, atual: PlanoVinculo) => void; parar?: () => boolean } = {}
): Promise<ResultadoVinculo[]> {
  const resultados: ResultadoVinculo[] = [];
  for (const plano of planos) {
    if (opcoes.parar?.()) break;
    opcoes.onProgresso?.(resultados.length, planos.length, plano);
    resultados.push(await vincularContrato(plano));
  }
  return resultados;
}
