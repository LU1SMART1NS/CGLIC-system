import { fetchArps, fetchArpItems, enrichArpsBatchWithPncpVigencia } from './api';
import { cacheArpsInDb, cacheArpItemsInDb } from './dbCacheService';
import { isSupabaseConfigured } from './supabaseClient';
import type { FilterParams, SyncMetadata, ArpRecord, ArpItemRecord } from '../types';

const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 Horas
const SYNC_STORAGE_KEY = 'saldoarp-sync-metadata';

export interface SyncProgressCallback {
  (progress: { step: string; percent: number; current?: number; total?: number }): void;
}

let isSyncingInProgress = false;

/**
 * Obtém os metadados da última sincronização
 */
export function getLastSyncMetadata(): SyncMetadata {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  return {
    isCachedInDb: isSupabaseConfigured,
    status: 'IDLE'
  };
}

/**
 * Salva metadados da sincronização
 */
export function saveSyncMetadata(metadata: Partial<SyncMetadata>): void {
  try {
    const current = getLastSyncMetadata();
    const updated: SyncMetadata = {
      ...current,
      ...metadata,
      ultimoSyncEm: metadata.ultimoSyncEm || new Date().toISOString()
    };
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * Executa a sincronização completa das Atas e Itens da UASG
 * Consulta Compras.gov + PNCP e persiste no banco Supabase
 */
export async function runFullSync(
  params: FilterParams = {
    dataVigenciaInicialMin: '2024-01-01',
    dataVigenciaInicialMax: '2028-08-21',
    codigoUnidadeGerenciadora: '200331',
    numeroAtaRegistroPreco: ''
  },
  onProgress?: SyncProgressCallback
): Promise<{
  success: boolean;
  totalAtas: number;
  totalItens: number;
  arps?: ArpRecord[];
  itemsByAta?: Record<string, ArpItemRecord[]>;
  error?: string;
}> {
  if (isSyncingInProgress) {
    return { success: false, totalAtas: 0, totalItens: 0, error: 'Sincronização já em andamento' };
  }

  isSyncingInProgress = true;
  saveSyncMetadata({ status: 'SYNCING', mensagem: 'Iniciando sincronização com APIs do governo...' });

  try {
    onProgress?.({ step: 'Consultando Atas de Registro de Preço...', percent: 15 });

    // 1. Busca lista de Atas
    const arpsResponse = await fetchArps({
      ...params,
      numeroAtaRegistroPreco: '' // sincroniza todas da UASG
    });

    const arpsList = arpsResponse.resultado || [];
    if (arpsList.length === 0) {
      saveSyncMetadata({
        status: 'SUCCESS',
        totalAtas: 0,
        totalItens: 0,
        mensagem: 'Nenhuma ata encontrada para sincronizar.'
      });
      isSyncingInProgress = false;
      return { success: true, totalAtas: 0, totalItens: 0, arps: [], itemsByAta: {} };
    }

    onProgress?.({ step: 'Sincronizando vigências PNCP...', percent: 35, current: arpsList.length, total: arpsList.length });

    // 2. Enriquece vigências PNCP
    const enrichedArps = await enrichArpsBatchWithPncpVigencia(arpsList);

    // 3. Salva atas no Supabase
    await cacheArpsInDb(enrichedArps);

    onProgress?.({ step: 'Carregando itens das atas...', percent: 50, current: 0, total: enrichedArps.length });

    // 4. Busca e armazena itens das atas (com concorrência controlada)
    let totalItensCount = 0;
    const itemsByAta: Record<string, ArpItemRecord[]> = {};
    const batchSize = 5;
    for (let i = 0; i < enrichedArps.length; i += batchSize) {
      const chunk = enrichedArps.slice(i, i + batchSize);
      await Promise.allSettled(
        chunk.map(async (arp) => {
          try {
            const itemsRes = await fetchArpItems(
              arp.dataVigenciaInicial,
              arp.codigoUnidadeGerenciadora,
              arp.numeroAtaRegistroPreco,
              arp
            );
            if (itemsRes.resultado && itemsRes.resultado.length > 0) {
              const ataKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`;
              itemsByAta[ataKey] = itemsRes.resultado;
              totalItensCount += itemsRes.resultado.length;
              await cacheArpItemsInDb(
                arp.numeroAtaRegistroPreco,
                arp.codigoUnidadeGerenciadora,
                itemsRes.resultado
              );
            }
          } catch (e) {
            console.warn(`Falha ao sincronizar itens da ata ${arp.numeroAtaRegistroPreco}:`, e);
          }
        })
      );

      const progressPercent = Math.min(95, Math.round(50 + ((i + chunk.length) / enrichedArps.length) * 45));
      onProgress?.({
        step: `Sincronizando itens (${i + chunk.length}/${enrichedArps.length})...`,
        percent: progressPercent,
        current: i + chunk.length,
        total: enrichedArps.length
      });
    }

    saveSyncMetadata({
      status: 'SUCCESS',
      totalAtas: enrichedArps.length,
      totalItens: totalItensCount,
      isCachedInDb: true,
      ultimoSyncEm: new Date().toISOString(),
      mensagem: `Sincronização concluída com sucesso: ${enrichedArps.length} atas e ${totalItensCount} itens.`
    });

    onProgress?.({ step: 'Sincronização concluída!', percent: 100, current: enrichedArps.length, total: enrichedArps.length });

    isSyncingInProgress = false;
    return {
      success: true,
      totalAtas: enrichedArps.length,
      totalItens: totalItensCount,
      arps: enrichedArps,
      itemsByAta
    };
  } catch (error: any) {
    console.error('Erro na sincronização completa:', error);
    saveSyncMetadata({
      status: 'ERROR',
      mensagem: error.message || 'Erro durante a sincronização com as APIs governamentais.'
    });
    isSyncingInProgress = false;
    return { success: false, totalAtas: 0, totalItens: 0, error: error.message };
  }
}

/**
 * Verifica se a sincronização periódica (a cada 3 horas) deve ser disparada
 */
export async function checkAndTriggerAutoSync(
  uasg: string = '200331',
  onSyncDone?: () => void
): Promise<boolean> {
  const meta = getLastSyncMetadata();
  const lastSyncTime = meta.ultimoSyncEm ? new Date(meta.ultimoSyncEm).getTime() : 0;
  const now = Date.now();

  const isExpired = now - lastSyncTime > SYNC_INTERVAL_MS;

  if (isExpired && !isSyncingInProgress) {
    console.info(`[AutoSync] Última sincronização há mais de 3 horas (${new Date(lastSyncTime).toLocaleString()}). Iniciando sync em background...`);
    runFullSync({
      dataVigenciaInicialMin: '2024-01-01',
      dataVigenciaInicialMax: '2028-08-21',
      codigoUnidadeGerenciadora: uasg,
      numeroAtaRegistroPreco: ''
    }).then((res) => {
      if (res.success && onSyncDone) {
        onSyncDone();
      }
    }).catch(err => {
      console.warn('[AutoSync] Falha no auto-sync:', err);
    });
    return true;
  }

  return false;
}
