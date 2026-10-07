import { saveAtaManagerRpc } from './ataManagerService';
import { saveContractManagerRpc } from '../adapters/contractManagementRpcAdapter';
import type { ArpItemContractLinkPair } from './arpContractLinkService';
import type { ContractDashboardRecord } from '../types';

/**
 * Atribuição de gestor com propagação Ata ↔ contratos vinculados.
 *
 * Regra de negócio: o gestor de uma Ata é também o gestor dos contratos
 * vinculados a ela (arp_item_contract_links). Alterar o gestor de uma Ata OU
 * de um contrato atualiza o grupo ligado a eles — a Ata e os contratos da Ata.
 *
 * Contrato em mais de uma Ata (migration 86): ele não leva a troca de uma Ata
 * para a outra. As Atas continuam com os gestores que têm; trocar a Ata deixa
 * o contrato com o banco (acompanha se as outras Atas dele concordam, senão o
 * coordenador é avisado) e trocar o contrato muda só o contrato.
 */

export type ManagerTarget = { tipo: 'ATA'; ataKey: string } | { tipo: 'CONTRATO'; contractKey: string };

export interface ManagerPropagation {
  ataKeys: string[];
  contractKeys: string[];
}

/** Grupo conectado (Atas e contratos) alcançado a partir dos alvos, pelos vínculos item↔contrato. */
export function resolveManagerPropagation(targets: ManagerTarget[], links: ArpItemContractLinkPair[]): ManagerPropagation {
  const contractsByAta = new Map<string, Set<string>>();
  const atasByContract = new Map<string, Set<string>>();
  for (const { ataKey, contractKey } of links) {
    if (!contractsByAta.has(ataKey)) contractsByAta.set(ataKey, new Set());
    contractsByAta.get(ataKey)!.add(contractKey);
    if (!atasByContract.has(contractKey)) atasByContract.set(contractKey, new Set());
    atasByContract.get(contractKey)!.add(ataKey);
  }

  const atas = new Set<string>();
  const contracts = new Set<string>();
  const queue: ManagerTarget[] = [...targets];

  while (queue.length > 0) {
    const next = queue.shift()!;
    if (next.tipo === 'ATA') {
      if (atas.has(next.ataKey)) continue;
      atas.add(next.ataKey);
      for (const c of contractsByAta.get(next.ataKey) || []) {
        if ((atasByContract.get(c)?.size ?? 0) <= 1) queue.push({ tipo: 'CONTRATO', contractKey: c });
      }
    } else {
      if (contracts.has(next.contractKey)) continue;
      contracts.add(next.contractKey);
      const atasDele = atasByContract.get(next.contractKey);
      if (atasDele && atasDele.size === 1) for (const a of atasDele) queue.push({ tipo: 'ATA', ataKey: a });
    }
  }

  return { ataKeys: Array.from(atas).sort(), contractKeys: Array.from(contracts).sort() };
}

/** Separa a chave canônica "UASG-NUMERO-ANO" (ex.: 200330-00065-2021). */
export function parseContractKey(contractKey: string): { uasg: string; numero: string; ano: number } | null {
  const match = /^(\d{6})-(.+)-(\d{4})$/.exec((contractKey || '').trim());
  if (!match) return null;
  return { uasg: match[1], numero: match[2], ano: parseInt(match[3], 10) };
}

function contractRpcInput(contractKey: string, contract?: ContractDashboardRecord) {
  const parsed = parseContractKey(contractKey);
  if (parsed) return parsed;
  if (!contract) return null;
  const ano = typeof contract.ano === 'number' ? contract.ano : parseInt(String(contract.ano || '').replace(/\D/g, ''), 10);
  if (!contract.uasg || !contract.numero || !ano) return null;
  return { uasg: contract.uasg, numero: contract.numero, ano };
}

export interface ManagerAssignmentResult {
  atualizados: { atas: string[]; contratos: string[] };
  falhas: Array<{ chave: string; tipo: 'ATA' | 'CONTRATO'; erro: string }>;
}

/**
 * Grava o mesmo gestor em todo o grupo propagado. As gravações são
 * independentes (uma RPC por Ata/contrato): se alguma falhar, as demais
 * seguem e a falha é devolvida para a tela avisar o usuário.
 */
export async function assignManagerWithPropagation(params: {
  targets: ManagerTarget[];
  gestorNome: string;
  gestorUserId?: string | null;
  links: ArpItemContractLinkPair[];
  contractsByKey?: Map<string, ContractDashboardRecord>;
}): Promise<ManagerAssignmentResult> {
  const { targets, links, contractsByKey } = params;
  const gestorNome = params.gestorNome.trim();
  const gestorUserId = params.gestorUserId ?? null;
  const { ataKeys, contractKeys } = resolveManagerPropagation(targets, links);

  const result: ManagerAssignmentResult = { atualizados: { atas: [], contratos: [] }, falhas: [] };
  const mensagem = (err: unknown) => (err instanceof Error ? err.message : String(err));

  const ataJobs = ataKeys.map(async (ataKey) => {
    try {
      await saveAtaManagerRpc({ ataKey, gestorNome, gestorUserId });
      result.atualizados.atas.push(ataKey);
    } catch (err) {
      result.falhas.push({ chave: ataKey, tipo: 'ATA', erro: mensagem(err) });
    }
  });

  const contractJobs = contractKeys.map(async (contractKey) => {
    const input = contractRpcInput(contractKey, contractsByKey?.get(contractKey));
    if (!input) {
      result.falhas.push({ chave: contractKey, tipo: 'CONTRATO', erro: 'Chave de contrato inválida' });
      return;
    }
    try {
      await saveContractManagerRpc({ ...input, gestorNome, gestorUserId });
      result.atualizados.contratos.push(contractKey);
    } catch (err) {
      result.falhas.push({ chave: contractKey, tipo: 'CONTRATO', erro: mensagem(err) });
    }
  });

  await Promise.all([...ataJobs, ...contractJobs]);
  return result;
}
