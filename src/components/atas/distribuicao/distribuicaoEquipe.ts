import type { PrazoFaixa } from '../../carteira/carteiraPrazo';
import type { ArpItemContractLinkPair } from '../../../services/arpContractLinkService';
import type { DashboardAttentionItem } from '../../../types/managementDashboard';

/** Ata já com prazo e gestor (chave do gestor = número da ata, como em ata_managers). */
export interface DistribuicaoAta {
  numeroAta: string;
  uasg?: string;
  objeto?: string;
  dias?: number | null;
  faixa: PrazoFaixa;
  valor: number;
  gestorNome?: string;
}

export interface DistribuicaoContrato {
  contractKey: string;
  numero: string;
  objeto?: string;
  dias?: number | null;
  faixa: PrazoFaixa;
  valor: number;
  gestorNome?: string;
}

/** Ata ou contrato vigente listado dentro da linha do gestor. */
export interface DistribuicaoItem {
  tipo: 'ATA' | 'CONTRATO';
  /** Número da ata (chave do gestor) ou chave do contrato. */
  chave: string;
  uasg?: string;
  numero: string;
  objeto: string;
  faixa: PrazoFaixa;
  dias: number | null;
  valor: number;
  urgentes: number;
  acompanhar: number;
}

export interface CargaInstrumentos {
  vigentes: number;
  criticos: number;
  atencao: number;
  valor: number;
}

export interface DistribuicaoLinha {
  /** `null` = instrumentos sem gestor atribuído. */
  gestorNome: string | null;
  atas: CargaInstrumentos;
  contratos: CargaInstrumentos;
  /** Alertas em aberto (Funil Único de Atenção) nas atas e contratos vigentes do gestor. */
  pendencias: Pendencias;
  /** Chaves das atas e contratos vigentes do gestor — alvos para transferir a carteira. */
  ataKeys: string[];
  contractKeys: string[];
  /** Atas e contratos vigentes do gestor, os mais urgentes primeiro (alertas urgentes, depois menor prazo). */
  itens: DistribuicaoItem[];
}

/** Mesma gravidade da Visão Geral: urgentes = crítica ou urgente (tarefa vencida, fatura vencida, saldo crítico…); o resto é acompanhamento. */
export interface Pendencias {
  urgentes: number;
  acompanhar: number;
}

/** Contrato vigente vinculado a uma ata cujo gestor não é o mesmo (a regra é herdar o gestor da ata). */
export interface DistribuicaoDivergencia {
  numeroAta: string;
  gestorAta?: string;
  contractKey: string;
  numeroContrato: string;
  gestorContrato?: string;
}

export interface DistribuicaoEquipe {
  linhas: DistribuicaoLinha[];
  divergencias: DistribuicaoDivergencia[];
  totais: { atas: CargaInstrumentos; contratos: CargaInstrumentos; gestores: number };
}

/** Vigente = mesmo critério dos cards e do filtro padrão das carteiras (sem expirados e sem data). */
export function isVigente(faixa: PrazoFaixa): boolean {
  return faixa !== 'EXPIRADO' && faixa !== 'SEM_DATA';
}

const cargaVazia = (): CargaInstrumentos => ({ vigentes: 0, criticos: 0, atencao: 0, valor: 0 });

function somar(carga: CargaInstrumentos, faixa: PrazoFaixa, valor: number) {
  carga.vigentes++;
  carga.valor += valor;
  if (faixa === 'CRITICO') carga.criticos++;
  else if (faixa === 'ATENCAO') carga.atencao++;
}

/** Número da ata a partir do alerta (`numeroAta` ou a chave `numeroAta-uasg`). */
function numeroAtaDoAlerta(item: DashboardAttentionItem): string | undefined {
  return item.numeroAta || item.arpKey?.replace(/-\d{6}$/, '');
}

/**
 * Distribuição da carteira vigente por gestor: atas e contratos (quantidade, prazo e valor),
 * pendências em aberto e contratos vinculados com gestor diferente do da ata.
 * Linhas ordenadas por carga (atas + contratos vigentes); "Sem gestor" vem primeiro.
 */
export function buildDistribuicaoEquipe(input: {
  atas: DistribuicaoAta[];
  contratos: DistribuicaoContrato[];
  links: ArpItemContractLinkPair[];
  attentionItems: DashboardAttentionItem[];
}): DistribuicaoEquipe {
  const linhas = new Map<string | null, DistribuicaoLinha>();
  const linha = (gestorNome?: string) => {
    const key = gestorNome || null;
    let l = linhas.get(key);
    if (!l) {
      l = { gestorNome: key, atas: cargaVazia(), contratos: cargaVazia(), pendencias: { urgentes: 0, acompanhar: 0 }, ataKeys: [], contractKeys: [], itens: [] };
      linhas.set(key, l);
    }
    return l;
  };

  const totais = { atas: cargaVazia(), contratos: cargaVazia(), gestores: 0 };
  const ataPorNumero = new Map<string, DistribuicaoAta>();
  const contratoPorChave = new Map<string, DistribuicaoContrato>();
  const itemAta = new Map<string, DistribuicaoItem>();
  const itemContrato = new Map<string, DistribuicaoItem>();

  for (const ata of input.atas) {
    if (!isVigente(ata.faixa)) continue;
    ataPorNumero.set(ata.numeroAta, ata);
    const l = linha(ata.gestorNome);
    somar(l.atas, ata.faixa, ata.valor);
    l.ataKeys.push(ata.numeroAta);
    const item: DistribuicaoItem = {
      tipo: 'ATA',
      chave: ata.numeroAta,
      uasg: ata.uasg,
      numero: ata.numeroAta,
      objeto: ata.objeto || '',
      faixa: ata.faixa,
      dias: ata.dias ?? null,
      valor: ata.valor,
      urgentes: 0,
      acompanhar: 0
    };
    l.itens.push(item);
    itemAta.set(ata.numeroAta, item);
    somar(totais.atas, ata.faixa, ata.valor);
  }
  for (const contrato of input.contratos) {
    if (!isVigente(contrato.faixa)) continue;
    contratoPorChave.set(contrato.contractKey, contrato);
    const l = linha(contrato.gestorNome);
    somar(l.contratos, contrato.faixa, contrato.valor);
    l.contractKeys.push(contrato.contractKey);
    const item: DistribuicaoItem = {
      tipo: 'CONTRATO',
      chave: contrato.contractKey,
      numero: contrato.numero,
      objeto: contrato.objeto || '',
      faixa: contrato.faixa,
      dias: contrato.dias ?? null,
      valor: contrato.valor,
      urgentes: 0,
      acompanhar: 0
    };
    l.itens.push(item);
    itemContrato.set(contrato.contractKey, item);
    somar(totais.contratos, contrato.faixa, contrato.valor);
  }

  const contar = (gestorNome: string | undefined, alvo: DistribuicaoItem | undefined, alerta: DashboardAttentionItem) => {
    const { pendencias } = linha(gestorNome);
    const urgente = alerta.severity === 'CRITICA' || alerta.severity === 'URGENTE';
    if (urgente) pendencias.urgentes++;
    else pendencias.acompanhar++;
    if (alvo) {
      if (urgente) alvo.urgentes++;
      else alvo.acompanhar++;
    }
  };
  for (const item of input.attentionItems) {
    const contrato = item.contractKey ? contratoPorChave.get(item.contractKey) : undefined;
    if (contrato) {
      contar(contrato.gestorNome, itemContrato.get(contrato.contractKey), item);
      continue;
    }
    const numeroAta = item.contractKey ? undefined : numeroAtaDoAlerta(item);
    const ata = numeroAta ? ataPorNumero.get(numeroAta) : undefined;
    if (ata) contar(ata.gestorNome, itemAta.get(ata.numeroAta), item);
  }

  const divergencias: DistribuicaoDivergencia[] = [];
  const vistos = new Set<string>();
  for (const { ataKey, contractKey } of input.links) {
    const par = `${ataKey}|${contractKey}`;
    if (vistos.has(par)) continue;
    vistos.add(par);
    const contrato = contratoPorChave.get(contractKey);
    const ata = ataPorNumero.get(ataKey);
    if (!contrato || !ata) continue;
    if ((ata.gestorNome || '') !== (contrato.gestorNome || '')) {
      divergencias.push({
        numeroAta: ata.numeroAta,
        gestorAta: ata.gestorNome,
        contractKey,
        numeroContrato: contrato.numero,
        gestorContrato: contrato.gestorNome
      });
    }
  }
  divergencias.sort((a, b) => a.numeroAta.localeCompare(b.numeroAta) || a.numeroContrato.localeCompare(b.numeroContrato));

  const carga = (l: DistribuicaoLinha) => l.atas.vigentes + l.contratos.vigentes;
  const ordenadas = Array.from(linhas.values()).sort((a, b) => {
    if (a.gestorNome === null) return -1;
    if (b.gestorNome === null) return 1;
    return carga(b) - carga(a) || a.gestorNome.localeCompare(b.gestorNome, 'pt-BR');
  });
  const diasOrd = (d: number | null) => (d === null ? Number.POSITIVE_INFINITY : d);
  for (const l of ordenadas) {
    l.itens.sort(
      (a, b) =>
        b.urgentes - a.urgentes ||
        diasOrd(a.dias) - diasOrd(b.dias) ||
        a.tipo.localeCompare(b.tipo) ||
        a.numero.localeCompare(b.numero)
    );
  }
  totais.gestores = ordenadas.filter((l) => l.gestorNome !== null).length;

  return { linhas: ordenadas, divergencias, totais };
}
