/**
 * Sincronização das Atas de Registro de Preços (e seus itens) com o Compras.gov.br e o PNCP.
 *
 * Mesmo modelo dos contratos (contratosOficiaisService): as telas leem as atas do banco
 * (atas_registro_preco / itens_ata), e a sincronização roda em segundo plano, uma vez para todos,
 * sob a trava de sincronizacao_fontes (recurso 'atas'). Só o coordenador força pelo botão.
 *
 * Substitui a regra antiga de "sincronizar a cada 3 horas", que guardava o horário no navegador de
 * cada usuário e só disparava com o banco de atas vazio (na prática, nunca rodava).
 */

import { fetchArpsDasFontes, fetchArpItems, fetchPncpProcessoCompra, limparCachesAtas } from './api';
import { cacheArpsInDb, cacheArpItemsInDb, fetchEstadoAtasNoBanco, gravarProcessoDaAta, type EstadoAtaNoBanco } from './dbCacheService';
import {
  executarComReserva,
  uasgsSincronizandoAgoraDe,
  VALIDADE_PADRAO,
  type ResultadoConcluido,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';
import type { ArpRecord, FilterParams } from '../types';

export const RECURSO_ATAS = 'atas' as const;

/** Janela de vigência consultada no Compras.gov.br. */
export const JANELA_VIGENCIA_ATAS = {
  dataVigenciaInicialMin: '2024-01-01',
  dataVigenciaInicialMax: '2028-08-21'
};

/**
 * Atas cujos itens são consultados ao mesmo tempo. Com 5, o Compras.gov.br recusava dezenas de
 * consultas por excesso de requisições (429); as consultas repetidas agora são reaproveitadas.
 */
const ITENS_EM_PARALELO = 2;

/** Consultas do processo da compra (PNCP) por execução. O número não muda: após a primeira carga quase nada resta a consultar. */
export const PROCESSOS_POR_EXECUCAO = 100;
/** Tempo máximo do passo do processo, contado do início dele (não da sincronização: a lista de atas já gasta boa parte do orçamento). */
export const PROCESSOS_TEMPO_MAXIMO_MS = 30_000;
const PROCESSOS_EM_PARALELO = 4;

export const FONTE_ITENS_ATAS = 'Itens das atas';

export interface SyncProgressCallback {
  (progress: { step: string; percent: number; current?: number; total?: number }): void;
}

/** Itens lidos há mais que isto são relidos mesmo sem mudança na fonte (renovação periódica). */
export const ITENS_VALIDADE_DIAS = 7;
/** Ata alterada na fonte nos últimos dias: relê os itens (a hora da fonte pode vir sem fuso, daí a folga). */
export const ATA_ALTERADA_RECENTE_DIAS = 2;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface OpcoesDaColeta {
  onProgress?: SyncProgressCallback;
  /** Relê os itens de todas as atas, sem olhar o que o banco já tem (botão do coordenador). */
  forcar?: boolean;
  /**
   * Tempo máximo, em ms, para consultar itens. Ao esgotar, para e grava o que tem como PARCIAL, e as atas
   * que ficaram serão lidas na próxima execução. Usado no servidor, onde a Edge Function tem tempo limitado.
   */
  orcamentoMs?: number;
  agora?: () => number;
}

/**
 * A ata precisa ter os itens relidos nas fontes? Sim quando: o coordenador forçou; a ata ainda não tem itens
 * gravados; os itens foram lidos há mais de ITENS_VALIDADE_DIAS; ou a ata foi alterada na fonte nos últimos
 * ATA_ALTERADA_RECENTE_DIAS dias. Caso contrário os itens do banco continuam valendo: a quantidade homologada
 * de uma ata não muda, e o consumo vem dos contratos, que têm sincronização própria.
 */
export function ataPrecisaDeItens(arp: ArpRecord, estado: EstadoAtaNoBanco | undefined, agora: number, forcar: boolean): boolean {
  if (forcar || !estado || estado.itens === 0) return true;
  const lidoEm = estado.itensLidosEmMaisAntigo ? Date.parse(estado.itensLidosEmMaisAntigo) : NaN;
  if (Number.isNaN(lidoEm) || agora - lidoEm > ITENS_VALIDADE_DIAS * DIA_MS) return true;
  const alteradaNaFonte = arp.dataHoraAtualizacao ? Date.parse(arp.dataHoraAtualizacao) : NaN;
  return !Number.isNaN(alteradaNaFonte) && agora - alteradaNaFonte < ATA_ALTERADA_RECENTE_DIAS * DIA_MS;
}

/**
 * Atas cujo processo da compra ainda não foi consultado no PNCP (nulo no banco) e que têm o identificador da
 * compra para consultar. '' no banco quer dizer que o PNCP já respondeu sem processo: não se consulta de novo.
 */
export function atasSemProcessoConsultado(atas: ArpRecord[], estado: Map<string, EstadoAtaNoBanco>): ArpRecord[] {
  return atas.filter((arp) => {
    const gravado = estado.get(arp.numeroAtaRegistroPreco)?.processoCompra;
    return (gravado === null || gravado === undefined) && Boolean(arp.numeroControlePncpCompra);
  });
}

/**
 * Lê no PNCP e grava o processo da compra das atas que ainda não o têm. A consulta é por compra (várias atas
 * da mesma compra repetem o número). Falha de consulta ou de gravação não derruba a sincronização: a ata fica
 * sem número e a próxima execução tenta de novo.
 */
async function completarProcessoDasAtas(
  atas: ArpRecord[],
  estado: Map<string, EstadoAtaNoBanco>,
  agora: () => number,
  fimDoOrcamento: number | undefined
): Promise<void> {
  const pendentes = atasSemProcessoConsultado(atas, estado).slice(0, PROCESSOS_POR_EXECUCAO);
  if (pendentes.length === 0) return;
  const inicioDoPasso = agora();
  const prazoEsgotado = () => agora() - inicioDoPasso > PROCESSOS_TEMPO_MAXIMO_MS || (fimDoOrcamento !== undefined && agora() > fimDoOrcamento);
  const porCompra = new Map<string, string | null>();
  for (let i = 0; i < pendentes.length; i += PROCESSOS_EM_PARALELO) {
    if (prazoEsgotado()) return;
    await Promise.all(
      pendentes.slice(i, i + PROCESSOS_EM_PARALELO).map(async (arp) => {
        const compra = arp.numeroControlePncpCompra;
        if (!porCompra.has(compra)) porCompra.set(compra, await fetchPncpProcessoCompra(compra));
        const processo = porCompra.get(compra);
        if (processo === null || processo === undefined) return;
        await gravarProcessoDaAta(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, processo);
      })
    );
  }
}

/**
 * Consulta as atas e os itens nas fontes oficiais e grava no banco. Não apaga nada: ata ou item que
 * some de uma resposta continua no banco. Lança erro se a lista de atas não vier ou não for gravada.
 * A lista de atas é sempre relida (é uma consulta só); os itens, só das atas que precisam (ataPrecisaDeItens).
 */
export async function coletarEGravarAtas(
  params: FilterParams,
  opcoes: OpcoesDaColeta = {}
): Promise<ResultadoConcluido> {
  const { onProgress, forcar = false, orcamentoMs, agora = () => Date.now() } = opcoes;
  const inicio = agora();
  onProgress?.({ step: 'Consultando atas de registro de preços...', percent: 10 });

  // O que o banco já tem, lido ANTES de gravar a lista nova.
  const estadoNoBanco = await fetchEstadoAtasNoBanco(params.codigoUnidadeGerenciadora || '');

  // Lista das atas, já com as vigências do PNCP. Falha da fonte vira erro (não cai para o banco).
  const atas = await fetchArpsDasFontes(params);
  if (atas.length === 0) {
    return { status: 'SUCESSO', total: 0, fontesComFalha: [] };
  }

  onProgress?.({ step: 'Gravando atas...', percent: 35, current: 0, total: atas.length });
  const gravou = await cacheArpsInDb(atas);
  if (!gravou) throw new Error('Não foi possível gravar as atas no banco.');

  // Processo da compra (PNCP). Tem tempo próprio e para antes de gastar o orçamento todo: os itens vêm depois e são o principal.
  await completarProcessoDasAtas(atas, estadoNoBanco, agora, orcamentoMs !== undefined ? inicio + orcamentoMs * 0.7 : undefined);

  // Só as atas que precisam de itens. Ordem: as sem itens primeiro, depois as de itens lidos há mais tempo.
  // Assim o orçamento de tempo não deixa de fora as que mais precisam, e uma releitura forçada que estourou o
  // tempo continua de onde parou quando o coordenador clica de novo (as já relidas passam a ser as mais novas).
  const momento = agora();
  const leitura = (numero: string) => {
    const e = estadoNoBanco.get(numero);
    return e && e.itens > 0 && e.itensLidosEmMaisAntigo ? Date.parse(e.itensLidosEmMaisAntigo) || 0 : 0;
  };
  const pendentes = atas
    .filter((arp) => ataPrecisaDeItens(arp, estadoNoBanco.get(arp.numeroAtaRegistroPreco), momento, forcar))
    .sort((a, b) => leitura(a.numeroAtaRegistroPreco) - leitura(b.numeroAtaRegistroPreco));

  let falhasConsulta = 0;
  let falhasGravacao = 0;
  let adiadas = 0;
  for (let i = 0; i < pendentes.length; i += ITENS_EM_PARALELO) {
    if (orcamentoMs !== undefined && agora() - inicio > orcamentoMs) {
      adiadas = pendentes.length - i;
      break;
    }
    const lote = pendentes.slice(i, i + ITENS_EM_PARALELO);
    const resultados = await Promise.all(
      lote.map(async (arp): Promise<'ok' | 'consulta' | 'gravacao'> => {
        let itens;
        try {
          itens = await fetchArpItems(arp.dataVigenciaInicial, arp.codigoUnidadeGerenciadora, arp.numeroAtaRegistroPreco, arp, { estrito: true });
        } catch (err) {
          console.warn(`[sincronizacao] itens da ata ${arp.numeroAtaRegistroPreco} não consultados:`, err);
          return 'consulta';
        }
        // Ata sem itens nas fontes não é falha (ex.: compra com vários fornecedores sem indicação de qual é o da ata).
        if (!itens.resultado || itens.resultado.length === 0) return 'ok';
        const gravouItens = await cacheArpItemsInDb(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, itens.resultado);
        return gravouItens ? 'ok' : 'gravacao';
      })
    );
    falhasConsulta += resultados.filter((r) => r === 'consulta').length;
    falhasGravacao += resultados.filter((r) => r === 'gravacao').length;

    const feitas = Math.min(i + lote.length, pendentes.length);
    onProgress?.({
      step: `Sincronizando itens (${feitas}/${pendentes.length})...`,
      percent: Math.min(95, Math.round(35 + (feitas / Math.max(pendentes.length, 1)) * 60)),
      current: feitas,
      total: pendentes.length
    });
  }

  onProgress?.({ step: 'Sincronização concluída!', percent: 100, current: atas.length, total: atas.length });
  const plural = (n: number) => `${n} ${n === 1 ? 'ata' : 'atas'}`;
  const problemas = [
    falhasConsulta > 0 ? `o Compras.gov.br não entregou os itens de ${plural(falhasConsulta)}` : '',
    falhasGravacao > 0 ? `não foi possível gravar os itens de ${plural(falhasGravacao)} no banco` : '',
    adiadas > 0 ? `o tempo da execução acabou e os itens de ${plural(adiadas)} ficam para a próxima` : ''
  ].filter(Boolean);
  return problemas.length > 0
    ? {
        status: 'PARCIAL',
        total: atas.length,
        fontesComFalha: [FONTE_ITENS_ATAS],
        mensagem: `${problemas.join(' e ')}.`
      }
    : { status: 'SUCESSO', total: atas.length, fontesComFalha: [] };
}

/**
 * Sincroniza as atas da UASG com as fontes oficiais, sob a trava do banco.
 * Devolve NAO_RESERVADO quando outra pessoa já está sincronizando ou os dados ainda estão na validade
 * (sem forçar). `forcar` é só para o coordenador; a função do banco recusa para os outros perfis.
 */
export async function sincronizarAtas(
  uasg: string,
  opts: { forcar?: boolean; onProgress?: SyncProgressCallback; orcamentoMs?: number } = {}
): Promise<ResultadoSincronizacao> {
  const cleanUasg = (uasg || '').trim();
  return executarComReserva(RECURSO_ATAS, cleanUasg, { forcar: opts.forcar, validade: VALIDADE_PADRAO }, async () => {
    // Sem isso, uma segunda sincronização na mesma sessão reaproveitaria as respostas da primeira.
    limparCachesAtas();
    return coletarEGravarAtas(
      { ...JANELA_VIGENCIA_ATAS, codigoUnidadeGerenciadora: cleanUasg, numeroAtaRegistroPreco: '' },
      { onProgress: opts.onProgress, forcar: opts.forcar, orcamentoMs: opts.orcamentoMs }
    );
  });
}

/** UASGs sincronizando atas neste navegador agora. */
export function uasgsSincronizandoAtasAgora(): readonly string[] {
  return uasgsSincronizandoAgoraDe(RECURSO_ATAS);
}
