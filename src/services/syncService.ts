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

import { fetchArpsDasFontes, fetchArpItems, limparCachesAtas } from './api';
import { cacheArpsInDb, cacheArpItemsInDb } from './dbCacheService';
import {
  executarComReserva,
  uasgsSincronizandoAgoraDe,
  VALIDADE_PADRAO,
  type ResultadoConcluido,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';
import type { FilterParams } from '../types';

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

export const FONTE_ITENS_ATAS = 'Itens das atas';

export interface SyncProgressCallback {
  (progress: { step: string; percent: number; current?: number; total?: number }): void;
}

/**
 * Consulta as atas e os itens nas fontes oficiais e grava no banco. Não apaga nada: ata ou item que
 * some de uma resposta continua no banco. Lança erro se a lista de atas não vier ou não for gravada.
 */
export async function coletarEGravarAtas(
  params: FilterParams,
  onProgress?: SyncProgressCallback
): Promise<ResultadoConcluido> {
  onProgress?.({ step: 'Consultando atas de registro de preços...', percent: 10 });

  // Lista das atas, já com as vigências do PNCP. Falha da fonte vira erro (não cai para o banco).
  const atas = await fetchArpsDasFontes(params);
  if (atas.length === 0) {
    return { status: 'SUCESSO', total: 0, fontesComFalha: [] };
  }

  onProgress?.({ step: 'Gravando atas...', percent: 35, current: 0, total: atas.length });
  const gravou = await cacheArpsInDb(atas);
  if (!gravou) throw new Error('Não foi possível gravar as atas no banco.');

  let falhasConsulta = 0;
  let falhasGravacao = 0;
  for (let i = 0; i < atas.length; i += ITENS_EM_PARALELO) {
    const lote = atas.slice(i, i + ITENS_EM_PARALELO);
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
        const gravou = await cacheArpItemsInDb(arp.numeroAtaRegistroPreco, arp.codigoUnidadeGerenciadora, itens.resultado);
        return gravou ? 'ok' : 'gravacao';
      })
    );
    falhasConsulta += resultados.filter((r) => r === 'consulta').length;
    falhasGravacao += resultados.filter((r) => r === 'gravacao').length;

    const feitas = Math.min(i + lote.length, atas.length);
    onProgress?.({
      step: `Sincronizando itens (${feitas}/${atas.length})...`,
      percent: Math.min(95, Math.round(35 + (feitas / atas.length) * 60)),
      current: feitas,
      total: atas.length
    });
  }

  onProgress?.({ step: 'Sincronização concluída!', percent: 100, current: atas.length, total: atas.length });
  const plural = (n: number) => `${n} ${n === 1 ? 'ata' : 'atas'}`;
  const problemas = [
    falhasConsulta > 0 ? `o Compras.gov.br não entregou os itens de ${plural(falhasConsulta)}` : '',
    falhasGravacao > 0 ? `não foi possível gravar os itens de ${plural(falhasGravacao)} no banco` : ''
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
  opts: { forcar?: boolean; onProgress?: SyncProgressCallback } = {}
): Promise<ResultadoSincronizacao> {
  const cleanUasg = (uasg || '').trim();
  return executarComReserva(RECURSO_ATAS, cleanUasg, { forcar: opts.forcar, validade: VALIDADE_PADRAO }, async () => {
    // Sem isso, uma segunda sincronização na mesma sessão reaproveitaria as respostas da primeira.
    limparCachesAtas();
    return coletarEGravarAtas({ ...JANELA_VIGENCIA_ATAS, codigoUnidadeGerenciadora: cleanUasg, numeroAtaRegistroPreco: '' }, opts.onProgress);
  });
}

/** UASGs sincronizando atas neste navegador agora. */
export function uasgsSincronizandoAtasAgora(): readonly string[] {
  return uasgsSincronizandoAgoraDe(RECURSO_ATAS);
}
