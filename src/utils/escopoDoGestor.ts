import type { AtaManager, ContractManager } from '../types';

/** Par ata ↔ contrato dos vínculos por item (public.arp_item_contract_links). */
export interface VinculoAtaContrato {
  ataKey: string;
  contractKey: string;
}

export interface EscopoDoGestor {
  contractKeys: Set<string>;
  ataKeys: Set<string>;
}

/**
 * Carteira de um gestor (perfil "Gestor de Atas e Contratos"): as atas atribuídas a ele (ata_managers) trazem os
 * contratos vinculados a elas, e os contratos atribuídos (contract_managers) trazem as atas de que vêm. Contrato sem
 * ata ("avulso") só entra por atribuição direta. Regra única para o painel do próprio gestor, para o filtro de gestor
 * do coordenador e para o resumo por gestor da Visão Geral.
 */
export function escopoDoGestor(
  userId: string,
  contractManagers: Iterable<Pick<ContractManager, 'contractKey' | 'gestorUserId'> | undefined>,
  ataManagers: Iterable<Pick<AtaManager, 'ataKey' | 'gestorUserId'> | undefined>,
  vinculos: Iterable<VinculoAtaContrato>
): EscopoDoGestor {
  const contratosDiretos = new Set<string>();
  for (const m of contractManagers) if (m && m.gestorUserId === userId) contratosDiretos.add(m.contractKey);
  const atasDiretas = new Set<string>();
  for (const m of ataManagers) if (m && m.gestorUserId === userId) atasDiretas.add(m.ataKey);

  const contractKeys = new Set(contratosDiretos);
  const ataKeys = new Set(atasDiretas);
  for (const v of vinculos) {
    if (atasDiretas.has(v.ataKey)) contractKeys.add(v.contractKey);
    if (contratosDiretos.has(v.contractKey)) ataKeys.add(v.ataKey);
  }
  return { contractKeys, ataKeys };
}

export interface GestorDaCarteira {
  userId: string;
  nome: string;
}

/** Gestores com alguma ata ou contrato atribuído (só os ligados a um usuário do sistema), em ordem alfabética. */
export function listarGestores(
  contractManagers: Iterable<Pick<ContractManager, 'gestorNome' | 'gestorUserId'> | undefined>,
  ataManagers: Iterable<Pick<AtaManager, 'gestorNome' | 'gestorUserId'> | undefined>
): GestorDaCarteira[] {
  const porId = new Map<string, string>();
  for (const m of [...contractManagers, ...ataManagers]) {
    if (m?.gestorUserId && m.gestorNome && !porId.has(m.gestorUserId)) porId.set(m.gestorUserId, m.gestorNome);
  }
  return [...porId].map(([userId, nome]) => ({ userId, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
