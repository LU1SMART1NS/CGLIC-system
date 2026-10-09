import { supabase, isSupabaseConfigured, ehServidor } from './supabaseClient';
import type { DbAta } from './supabaseClient';
import type { ArpRecord, ArpItemRecord, SyncMetadata } from '../types';

import { formatPncpAtaUrl, formatPncpCompraUrl } from '../utils/pncpUtils';
import { deduplicarItensPorNumero } from './api';
import { isUasgCglic } from '../config/unidadesGestoras';

/**
 * Coluna que filtra as atas de uma UASG. UASG da CGLIC = carteira (gerenciadas + atas de outros órgãos em que
 * a SENASP participa, migration 106); outra UASG = atas gerenciadas por ela (abrir a Ata 360 de uma delas).
 */
export function colunaDaUasgDaAta(uasg: string): 'uasg_carteira' | 'codigo_uasg' {
  return isUasgCglic(uasg) ? 'uasg_carteira' : 'codigo_uasg';
}

/**
 * Persiste registros de ARPs buscados das APIs governamentais no Supabase.
 * Devolve false se a gravação falhou (a sincronização usa isso; os demais chamadores ignoram).
 */
export async function cacheArpsInDb(arps: ArpRecord[]): Promise<boolean> {
  // No navegador não grava: a escrita em atas_registro_preco é só do servidor (migration 84).
  if (!ehServidor || !isSupabaseConfigured || !supabase || !arps || arps.length === 0) return false;

  try {
    const rows = arps.map((arp) => ({
      numero_ata: arp.numeroAtaRegistroPreco,
      codigo_uasg: arp.codigoUnidadeGerenciadora,
      nome_uasg: arp.nomeUnidadeGerenciadora,
      ano_compra: arp.anoCompra,
      numero_compra: arp.numeroCompra,
      modalidade: arp.nomeModalidadeCompra,
      objeto: arp.objeto,
      valor_total: arp.valorTotal,
      data_vigencia_inicial: arp.dataVigenciaInicial,
      data_vigencia_final: arp.dataVigenciaFinal,
      status_ata: arp.statusAta,
      numero_controle_pncp: arp.numeroControlePncpAta,
      data_hora_atualizacao_api: arp.dataHoraAtualizacao || new Date().toISOString(),
      ultimo_sync_em: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('atas_registro_preco')
      .upsert(rows, { onConflict: 'numero_ata,codigo_uasg' });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Erro ao armazenar ARPs em cache no Supabase', error);
    return false;
  }
}

/**
 * Grava o processo da compra de uma ata (só o servidor). Atualiza só essa coluna: a ata em si já foi gravada
 * pela lista, e reenviá-la aqui poderia apagar campos que esta chamada não conhece.
 */
export async function gravarProcessoDaAta(numeroAta: string, codigoUasg: string, processo: string): Promise<boolean> {
  if (!ehServidor || !isSupabaseConfigured || !supabase) return false;
  const { error } = await supabase
    .from('atas_registro_preco')
    .update({ processo_compra: processo })
    .eq('numero_ata', numeroAta)
    .eq('codigo_uasg', codigoUasg);
  if (error) {
    console.warn(`Não foi possível gravar o processo da ata ${numeroAta}`, error);
    return false;
  }
  return true;
}

/**
 * A ata está cancelada? O banco guarda isso em status_ata ('Cancelada', do Compras.gov.br ou do PNCP). As telas
 * olham `isCanceladaPncp`, que não tem coluna: sem esta tradução, uma ata cancelada com vigência futura (00005/2026)
 * aparecia como vigente e com saldo.
 */
export function ataCanceladaNoBanco(statusAta?: string | null): boolean {
  return /cancelad/i.test(statusAta || '');
}

/**
 * Consulta ARPs diretamente do banco Supabase
 */
export async function fetchArpsFromDb(codigoUasg?: string, numeroAta?: string): Promise<{ arps: ArpRecord[]; syncInfo: SyncMetadata }> {
  if (!isSupabaseConfigured || !supabase) {
    return { arps: [], syncInfo: { isCachedInDb: false } };
  }

  try {
    let query = supabase.from('atas_registro_preco').select('*');

    if (codigoUasg) {
      query = query.eq(colunaDaUasgDaAta(codigoUasg), codigoUasg);
    }
    if (numeroAta) {
      query = query.ilike('numero_ata', `%${numeroAta}%`);
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      const arps: ArpRecord[] = data.map((d: DbAta) => ({
        numeroAtaRegistroPreco: d.numero_ata,
        codigoUnidadeGerenciadora: d.codigo_uasg,
        nomeUnidadeGerenciadora: d.nome_uasg || '',
        linkAtaPNCP: formatPncpAtaUrl(null, d.numero_controle_pncp, d.numero_ata),
        linkCompraPNCP: formatPncpCompraUrl(null, null, d.numero_controle_pncp),
        codigoOrgao: 0,
        nomeOrgao: d.nome_uasg || '',
        numeroCompra: d.numero_compra || '',
        anoCompra: d.ano_compra || '',
        codigoModalidadeCompra: '05',
        nomeModalidadeCompra: d.modalidade || 'Pregão',
        // O banco não guarda a assinatura: vazio, e não o início da vigência (a Ata 360 a busca no Compras.gov.br).
        dataAssinatura: '',
        dataVigenciaInicial: d.data_vigencia_inicial || '',
        dataVigenciaFinal: d.data_vigencia_final || '',
        valorTotal: Number(d.valor_total) || 0,
        statusAta: d.status_ata || 'Ata de Registro de Preços',
        objeto: d.objeto || '',
        quantidadeItens: 0,
        dataHoraAtualizacao: d.data_hora_atualizacao_api || new Date().toISOString(),
        dataHoraInclusao: d.ultimo_sync_em || new Date().toISOString(),
        dataHoraExclusao: null,
        ataExcluido: false,
        numeroControlePncpAta: d.numero_controle_pncp || '',
        numeroControlePncpCompra: '',
        idCompra: `${d.codigo_uasg}${d.numero_compra}${d.ano_compra}`,
        processoCompra: d.processo_compra ?? undefined,
        isCanceladaPncp: ataCanceladaNoBanco(d.status_ata),
        uasgCarteira: d.uasg_carteira || d.codigo_uasg,
        papelSenasp: d.papel_senasp || 'GERENCIADORA'
      }));

      const syncInfo: SyncMetadata = {
        isCachedInDb: true,
        ultimoSyncEm: data[0].ultimo_sync_em,
        dataHoraAtualizacaoApi: data[0].data_hora_atualizacao_api,
        totalAtas: arps.length
      };

      return { arps, syncInfo };
    }
  } catch (error) {
    console.warn('Falha ao ler cache de ARPs do Supabase', error);
  }

  return { arps: [], syncInfo: { isCachedInDb: false } };
}

/**
 * Consulta ARPs com seus respectivos Itens de forma unificada no Supabase (<50ms)
 */
export async function fetchArpsWithItemsFromDb(uasg?: string): Promise<{
  arps: ArpRecord[];
  itemsByAta: Record<string, ArpItemRecord[]>;
  syncInfo: SyncMetadata;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { arps: [], itemsByAta: {}, syncInfo: { isCachedInDb: false } };
  }

  try {
    let query = supabase.from('atas_registro_preco').select('*, itens_ata(*)');

    if (uasg) {
      query = query.eq(colunaDaUasgDaAta(uasg), uasg);
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      const itemsByAta: Record<string, ArpItemRecord[]> = {};
      const arps: ArpRecord[] = data.map((d: any) => {
        const key = `${d.numero_ata}-${d.codigo_uasg}`;

        if (d.itens_ata && Array.isArray(d.itens_ata) && d.itens_ata.length > 0) {
          const mappedItems = d.itens_ata.map((it: any) => ({
            numeroAtaRegistroPreco: d.numero_ata,
            codigoUnidadeGerenciadora: d.codigo_uasg,
            numeroCompra: d.numero_compra || '',
            anoCompra: d.ano_compra || '',
            codigoModalidadeCompra: '05',
            // O banco não guarda a assinatura: vazio, e não o início da vigência (a Ata 360 a busca no Compras.gov.br).
        dataAssinatura: '',
            dataVigenciaInicial: d.data_vigencia_inicial || '',
            dataVigenciaFinal: d.data_vigencia_final || '',
            numeroItem: it.numero_item,
            codigoItem: parseInt(it.numero_item, 10) || 1,
            descricaoItem: it.descricao_item || '',
            tipoItem: 'Material',
            quantidadeHomologadaItem: Number(it.quantidade_homologada) || 0,
            classificacaoFornecedor: '001',
            niFornecedor: it.fornecedor_cnpj_cpf || '',
            nomeRazaoSocialFornecedor: it.fornecedor_razao_social || '',
            quantidadeHomologadaVencedor: Number(it.quantidade_homologada) || 0,
            valorUnitario: Number(it.valor_unitario) || 0,
            valorTotal: Number(it.valor_total) || 0,
            maximoAdesao: Number(it.maximo_adesao) || 0,
            nomeUnidadeGerenciadora: d.nome_uasg || '',
            nomeModalidadeCompra: d.modalidade || 'Pregão',
            idCompra: `${d.codigo_uasg}${d.numero_compra}${d.ano_compra}`,
            numeroControlePncpCompra: '',
            dataHoraInclusao: it.ultimo_sync_em || '',
            dataHoraAtualizacao: it.ultimo_sync_em || '',
            quantidadeEmpenhada: 0,
            percentualMaiorDesconto: 0,
            situacaoSicaf: '1',
            dataHoraExclusao: null,
            itemExcluido: false,
            numeroControlePncpAta: d.numero_controle_pncp || '',
            codigoPdm: it.codigo_pdm || 0,
            nomePdm: it.descricao_item || '',
            quantidadeEstimadaEdital: Number(it.quantidade_homologada) || 0
          } as ArpItemRecord));

          // Os itens do banco já são os da ata: a sincronização só grava itens do fornecedor certo (Compras.gov.br,
          // ou PNCP com o fornecedor indicado pelo coordenador em atas_fornecedor_pncp).
          itemsByAta[key] = mappedItems;
        }

        const itemsCount = itemsByAta[key] ? itemsByAta[key].length : (d.itens_ata?.length || 0);

        return {
          numeroAtaRegistroPreco: d.numero_ata,
          codigoUnidadeGerenciadora: d.codigo_uasg,
          nomeUnidadeGerenciadora: d.nome_uasg || '',
          linkAtaPNCP: formatPncpAtaUrl(null, d.numero_controle_pncp, d.numero_ata),
          linkCompraPNCP: formatPncpCompraUrl(null, null, d.numero_controle_pncp),
          codigoOrgao: 0,
          nomeOrgao: d.nome_uasg || '',
          numeroCompra: d.numero_compra || '',
          anoCompra: d.ano_compra || '',
          codigoModalidadeCompra: '05',
          nomeModalidadeCompra: d.modalidade || 'Pregão',
          // O banco não guarda a assinatura: vazio, e não o início da vigência (a Ata 360 a busca no Compras.gov.br).
        dataAssinatura: '',
          dataVigenciaInicial: d.data_vigencia_inicial || '',
          dataVigenciaFinal: d.data_vigencia_final || '',
          valorTotal: Number(d.valor_total) || 0,
          statusAta: d.status_ata || 'Ata de Registro de Preços',
          objeto: d.objeto || '',
          quantidadeItens: itemsCount,
          dataHoraAtualizacao: d.data_hora_atualizacao_api || new Date().toISOString(),
          dataHoraInclusao: d.ultimo_sync_em || new Date().toISOString(),
          dataHoraExclusao: null,
          ataExcluido: false,
          numeroControlePncpAta: d.numero_controle_pncp || '',
          numeroControlePncpCompra: '',
          idCompra: `${d.codigo_uasg}${d.numero_compra}${d.ano_compra}`,
          processoCompra: d.processo_compra ?? undefined,
          isCanceladaPncp: ataCanceladaNoBanco(d.status_ata),
          uasgCarteira: d.uasg_carteira || d.codigo_uasg,
          papelSenasp: d.papel_senasp || 'GERENCIADORA'
        };
      });

      const totalItemsCount = Object.values(itemsByAta).reduce((acc, list) => acc + list.length, 0);

      const syncInfo: SyncMetadata = {
        isCachedInDb: true,
        ultimoSyncEm: data[0]?.ultimo_sync_em || new Date().toISOString(),
        dataHoraAtualizacaoApi: data[0]?.data_hora_atualizacao_api,
        totalAtas: arps.length,
        totalItens: totalItemsCount,
        status: 'SUCCESS'
      };

      return { arps, itemsByAta, syncInfo };
    }
  } catch (error) {
    console.warn('Falha ao ler ARPs com itens do Supabase', error);
  }

  return { arps: [], itemsByAta: {}, syncInfo: { isCachedInDb: false } };
}

/**
 * Persiste Itens da Ata no Supabase
 */
/** O que o banco já tem de uma ata: usado pela sincronização para só reler os itens que precisam. */
export interface EstadoAtaNoBanco {
  /** Quantos itens a ata tem gravados. */
  itens: number;
  /** Leitura mais antiga entre os itens da ata (ISO), ou null se não há itens. */
  itensLidosEmMaisAntigo: string | null;
  /** Processo da compra já gravado; null = ainda não consultado no PNCP (vazio = o PNCP não informa). */
  processoCompra?: string | null;
}

/**
 * Estado das atas da UASG no banco, por número da ata. Se o banco não responder, devolve um mapa vazio:
 * a sincronização então relê os itens de todas as atas, como antes.
 */
export async function fetchEstadoAtasNoBanco(uasg: string): Promise<Map<string, EstadoAtaNoBanco>> {
  const estado = new Map<string, EstadoAtaNoBanco>();
  if (!isSupabaseConfigured || !supabase) return estado;
  try {
    const { data, error } = await supabase
      .from('atas_registro_preco')
      .select('numero_ata, processo_compra, itens_ata(ultimo_sync_em)')
      .eq('codigo_uasg', uasg);
    if (error) throw error;
    for (const linha of (data ?? []) as Array<{ numero_ata: string; processo_compra: string | null; itens_ata: Array<{ ultimo_sync_em: string | null }> | null }>) {
      const lidos = (linha.itens_ata ?? []).map((i) => i.ultimo_sync_em).filter((t): t is string => Boolean(t)).sort();
      estado.set(linha.numero_ata, { itens: linha.itens_ata?.length ?? 0, itensLidosEmMaisAntigo: lidos[0] ?? null, processoCompra: linha.processo_compra ?? null });
    }
  } catch (err) {
    console.warn('Não foi possível ler o estado das atas no banco; os itens de todas serão relidos.', err);
    return new Map();
  }
  return estado;
}

/** Tamanho da coluna itens_ata.fornecedor_cnpj_cpf (migration 73; antes era 20). */
export const TAMANHO_IDENTIFICADOR_FORNECEDOR = 255;

/**
 * Identificador do fornecedor como a fonte entrega: CNPJ, CPF ou, para fornecedor estrangeiro, um texto
 * ("ESTRANGEIRO_CESKÁ_ZBROJOVKA_AS"). Vazio vira nulo. Só corta se passar do tamanho da coluna (nunca
 * aconteceu), para uma gravação não falhar por causa de um campo de referência.
 */
export function cnpjCpfParaGravar(valor?: string | null): string | null {
  const texto = (valor || '').trim();
  if (!texto) return null;
  return texto.slice(0, TAMANHO_IDENTIFICADOR_FORNECEDOR);
}

export async function cacheArpItemsInDb(ataNumero: string, uasg: string, items: ArpItemRecord[]): Promise<boolean> {
  // No navegador não grava: a escrita em itens_ata é só do servidor (migration 84).
  if (!ehServidor || !isSupabaseConfigured || !supabase || !items || items.length === 0) return false;

  try {
    // 1. Obter id da Ata
    const { data: ataData } = await supabase
      .from('atas_registro_preco')
      .select('id')
      .eq('numero_ata', ataNumero)
      .eq('codigo_uasg', uasg)
      .maybeSingle();

    if (!ataData) return false;

    const rows = deduplicarItensPorNumero(items).map((item) => ({
      ata_id: ataData.id,
      numero_item: item.numeroItem,
      codigo_pdm: item.codigoPdm,
      // A coluna não aceita vazio: sem descrição na fonte, vale o nome do material (PDM).
      descricao_item: item.descricaoItem || item.nomePdm || 'Descrição não informada pela fonte oficial',
      fornecedor_cnpj_cpf: cnpjCpfParaGravar(item.niFornecedor),
      fornecedor_razao_social: item.nomeRazaoSocialFornecedor,
      quantidade_homologada: item.quantidadeHomologadaItem,
      valor_unitario: item.valorUnitario,
      valor_total: item.valorTotal,
      maximo_adesao: item.maximoAdesao,
      ultimo_sync_em: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('itens_ata')
      .upsert(rows, { onConflict: 'ata_id,numero_item' });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Erro ao salvar itens da Ata no Supabase', error);
    return false;
  }
}

export interface EmpenhoDetail {
  numeroEmpenho: string;
  dataEmpenho?: string;
  numeroContrato?: string;
  numeroProcessoSei?: string;
  unidadeNome?: string;
  quantidadeEmpenhada?: number;
}

/**
 * Consulta detalhes de Empenhos e Contratos associados a uma Ata no Supabase
 */
export async function fetchEmpenhoDetailsFromDb(numeroAta: string, uasg: string): Promise<EmpenhoDetail[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data: ataData } = await supabase
      .from('atas_registro_preco')
      .select('id')
      .eq('numero_ata', numeroAta)
      .eq('codigo_uasg', uasg)
      .maybeSingle();

    if (!ataData) return [];

    const { data: itensData } = await supabase
      .from('itens_ata')
      .select('id')
      .eq('ata_id', ataData.id);

    if (!itensData || itensData.length === 0) return [];

    const itemIds = itensData.map(i => i.id);

    const { data: alocacoes } = await supabase
      .from('alocacoes_internas')
      .select(`
        id,
        unidade_nome,
        quantidade_empenhada,
        numero_empenho,
        data_empenho,
        processo_sei_id,
        processos_sei ( numero_processo_sei )
      `)
      .in('item_id', itemIds);

    if (alocacoes && alocacoes.length > 0) {
      return alocacoes
        .filter((a: any) => a.numero_empenho || a.quantidade_empenhada > 0)
        .map((a: any) => ({
          numeroEmpenho: a.numero_empenho || '',
          dataEmpenho: a.data_empenho || '',
          numeroProcessoSei: a.processos_sei?.numero_processo_sei || '',
          unidadeNome: a.unidade_nome || '',
          quantidadeEmpenhada: Number(a.quantidade_empenhada) || 0
        }));
    }
  } catch (error) {
    console.warn('Erro ao consultar empenhos do Supabase', error);
  }

  return [];
}

/**
 * Retorna o conjunto de chaves de Atas (numeroAta-uasg) que possuem empenhos vinculados no Supabase e localStorage
 */
export async function fetchAtasWithEmpenhosSet(): Promise<Set<string>> {
  const set = new Set<string>();

  if (isSupabaseConfigured && supabase) {
    try {
      // 1. Consulta alocacoes_internas no Supabase
      const { data: alocacoes } = await supabase
        .from('alocacoes_internas')
        .select(`
          numero_empenho,
          quantidade_empenhada,
          itens_ata (
            numero_item,
            atas_registro_preco (
              numero_ata,
              codigo_uasg
            )
          )
        `);

      if (alocacoes && alocacoes.length > 0) {
        alocacoes.forEach((al: any) => {
          if (al.numero_empenho || Number(al.quantidade_empenhada) > 0) {
            const ata = al.itens_ata?.atas_registro_preco;
            if (ata && ata.numero_ata && ata.codigo_uasg) {
              set.add(`${ata.numero_ata}-${ata.codigo_uasg}`);
              set.add(`${ata.numero_ata.replace(/^0+/, '')}-${ata.codigo_uasg}`);
            }
          }
        });
      }

      // 2. Consulta tabela empenho_links no Supabase
      const { data: empenhoLinks } = await supabase
        .from('empenho_links')
        .select('item_key');

      if (empenhoLinks && empenhoLinks.length > 0) {
        empenhoLinks.forEach((link: any) => {
          const parts = (link.item_key || '').split('-');
          if (parts.length >= 3) {
            parts.pop(); // remove itemNum
            const uasg = parts.pop();
            const numAta = parts.join('-');
            if (numAta && uasg) {
              set.add(`${numAta}-${uasg}`);
              set.add(`${numAta.replace(/^0+/, '')}-${uasg}`);
            }
          }
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar Atas com empenhos do Supabase', e);
    }
  }

  // 3. Complementa com localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('saldoarp-empenho-links-')) {
        const parts = key.replace('saldoarp-empenho-links-', '').split('-');
        if (parts.length >= 3) {
          parts.pop(); // remove itemNum
          const uasg = parts.pop();
          const numAta = parts.join('-');
          if (numAta && uasg) {
            set.add(`${numAta}-${uasg}`);
            set.add(`${numAta.replace(/^0+/, '')}-${uasg}`);
          }
        }
      }
    }
  } catch {}

  return set;
}

/**
 * Retorna o conjunto de chaves de Atas (numeroAta-uasg) que possuem alocações internas cadastradas (Supabase + localStorage)
 */
export async function fetchAtasWithAllocationsSet(): Promise<Set<string>> {
  const set = new Set<string>();

  if (isSupabaseConfigured && supabase) {
    try {
      // 1. Consulta arp_allocations (tabela de alocações internas por item_key)
      const { data: arpAllocations } = await supabase
        .from('arp_allocations')
        .select('item_key');

      if (arpAllocations && arpAllocations.length > 0) {
        arpAllocations.forEach((alloc: any) => {
          const parts = (alloc.item_key || '').split('-');
          if (parts.length >= 3) {
            parts.pop(); // remove itemNum
            const uasg = parts.pop();
            const numAta = parts.join('-');
            if (numAta && uasg) {
              set.add(`${numAta}-${uasg}`);
              set.add(`${numAta.replace(/^0+/, '')}-${uasg}`);
            }
          }
        });
      }

      // 2. Consulta alocacoes_internas via join com itens_ata
      const { data: alocacoes } = await supabase
        .from('alocacoes_internas')
        .select(`
          quantidade_alocada,
          itens_ata (
            numero_item,
            atas_registro_preco (
              numero_ata,
              codigo_uasg
            )
          )
        `);

      if (alocacoes && alocacoes.length > 0) {
        alocacoes.forEach((al: any) => {
          if (Number(al.quantidade_alocada) > 0) {
            const ata = al.itens_ata?.atas_registro_preco;
            if (ata && ata.numero_ata && ata.codigo_uasg) {
              set.add(`${ata.numero_ata}-${ata.codigo_uasg}`);
              set.add(`${ata.numero_ata.replace(/^0+/, '')}-${ata.codigo_uasg}`);
            }
          }
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar Atas com alocações do Supabase', e);
    }
  }

  // 3. Complementa com localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('saldoarp-allocations-')) {
        const data = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(data) && data.length > 0) {
          const parts = key.replace('saldoarp-allocations-', '').split('-');
          if (parts.length >= 3) {
            parts.pop(); // remove itemNum
            const uasg = parts.pop();
            const numAta = parts.join('-');
            if (numAta && uasg) {
              set.add(`${numAta}-${uasg}`);
              set.add(`${numAta.replace(/^0+/, '')}-${uasg}`);
            }
          }
        }
      }
    }
  } catch {}

  return set;
}

