/**
 * Envio à CCGA por ata, devolução à CAEP e Voltar etapa (migration 248, protótipo aprovado em 29/10/2026, D1–D8).
 *
 * Cada item do pedido tem a sua situação na CCGA: enviado ao gestor da ata, devolvido por ele à CAEP ou não enviado.
 * Item com contrato no Contratos.gov.br já é contrato assinado e não volta (D3). O banco confere as mesmas regras.
 */
import type { EmendaAContratar, EtapaPedido, LinhaPedido, MovimentoDoPedido, NotaDaLinha, PedidoEmenda } from '../services/emendasService';
import { dataBR } from './emendasKits';
import { ataDoItem, linhasAtivas, ROTULO_ETAPA } from './emendasPedidos';

/** O banco já tem a situação dos itens na CCGA (migration 248 aplicada). */
export const temSituacaoNaCcga = (p: PedidoEmenda): boolean => p.linhas.some((l) => l.ccgaSituacao !== undefined);

/** Item contratado: a nota está num contrato do Contratos.gov.br. */
export const linhaContratada = (l: Pick<LinhaPedido, 'id'>, notas: Map<string, NotaDaLinha>): boolean => Boolean(notas.get(l.id)?.contractKey);

export interface AtaNaCcga {
  /** "NÚMERO-UASG", como nas telas de Emendas. */
  ataKey: string;
  numeroAta: string;
  linhas: LinhaPedido[];
}

function porAta(linhas: LinhaPedido[]): AtaNaCcga[] {
  const mapa = new Map<string, LinhaPedido[]>();
  for (const l of linhas) {
    if (!l.itemKey) continue;
    const chave = ataDoItem(l.itemKey);
    mapa.set(chave, [...(mapa.get(chave) ?? []), l]);
  }
  return [...mapa]
    .map(([ataKey, ls]) => ({ ataKey, numeroAta: ataKey.split('-')[0], linhas: ls.sort((a, b) => a.ordem - b.ordem) }))
    .sort((a, b) => a.numeroAta.localeCompare(b.numeroAta));
}

/** Atas com itens a enviar: depois da nota, sem contrato e fora da CCGA (inclui os devolvidos, para reenviar). */
export function atasParaEnviar(p: PedidoEmenda, notas: Map<string, NotaDaLinha>): AtaNaCcga[] {
  if (p.etapa !== 'EMPENHADO' && p.etapa !== 'CONTRATACAO') return [];
  // Sem a migration, o pedido em contratação foi enviado inteiro.
  if (p.etapa === 'CONTRATACAO' && !temSituacaoNaCcga(p)) return [];
  return porAta(linhasAtivas(p).filter((l) => l.ccgaSituacao !== 'ENVIADA' && !linhaContratada(l, notas)));
}

/** Atas com itens na CCGA ou devolvidos, sem contrato: o que a CAEP pode tirar de lá (D6). */
export function atasParaDesfazer(p: PedidoEmenda, notas: Map<string, NotaDaLinha>): AtaNaCcga[] {
  if (p.etapa !== 'CONTRATACAO') return [];
  return porAta(linhasAtivas(p).filter((l) => (l.ccgaSituacao === 'ENVIADA' || l.ccgaSituacao === 'DEVOLVIDA') && !linhaContratada(l, notas)));
}

/** Itens devolvidos pela CCGA que esperam a CAEP (reenviar ou anular). */
export const linhasDevolvidas = (p: PedidoEmenda, notas: Map<string, NotaDaLinha>): LinhaPedido[] =>
  p.etapa === 'EMPENHADO' || p.etapa === 'CONTRATACAO' ? linhasAtivas(p).filter((l) => l.ccgaSituacao === 'DEVOLVIDA' && !linhaContratada(l, notas)) : [];

/** Voltar etapa (D7): de cada etapa, para onde volta e o que é apagado. Nota emitida e o que vem da fonte não voltam. */
export function voltaDaEtapa(p: PedidoEmenda): { para: EtapaPedido; apaga: string } | null {
  const sei = (n: string | null) => (n ? ` · SEI ${n}` : '');
  switch (p.etapa) {
    case 'MINUTA':
      return { para: 'RESERVADO', apaga: `Minuta enviada em ${dataBR(p.minutaEm)} e os preços guardados com ela` };
    case 'OFICIO':
      return {
        para: p.minutaEm ? 'MINUTA' : 'RESERVADO',
        apaga: `Ofício recebido em ${dataBR(p.oficioEm)}${sei(p.oficioDocumentoSei)}. Não conta como devolução do ofício`
      };
    case 'CONFERIDO':
      return { para: 'OFICIO', apaga: `Conferência no SIOP de ${dataBR(p.conferidoEm)}. Os itens tirados na conferência não voltam` };
    case 'SOLICITADO':
      return { para: 'CONFERIDO', apaga: `Solicitação de empenho de ${dataBR(p.solicitadoEm)}${sei(p.solicitadoDocumentoSei)} e as solicitações das atas` };
    case 'AUTORIZADO':
      return { para: 'SOLICITADO', apaga: `Autorização de ${dataBR(p.autorizadoEm)} e as datas de assinatura das solicitações` };
    case 'CGOFI':
      return { para: 'AUTORIZADO', apaga: `Envio à CGOFI de ${dataBR(p.cgofiEm)}${sei(p.cgofiDocumentoSei)}` };
    default:
      return null;
  }
}

/** Uma frase para cada movimento do histórico do pedido. */
export function textoDoMovimento(m: MovimentoDoPedido, quantos: number): { titulo: string; detalhe: string | null } {
  const ata = m.ataKey ? `ata ${m.ataKey.split('-')[0]}` : '';
  const itens = quantos === 1 ? '1 item' : `${quantos} itens`;
  switch (m.acao) {
    case 'ENVIO_CCGA':
      return { titulo: `Enviado à CCGA · ${ata} · ${itens}`, detalhe: null };
    case 'DEVOLUCAO_CCGA':
      return { titulo: `Devolvido à CAEP · ${ata} · ${itens}`, detalhe: [m.motivo, m.explicacao].filter(Boolean).join(': ') || null };
    case 'DESFEITO_CCGA':
      return { titulo: `Envio desfeito pela CAEP · ${ata} · ${itens}`, detalhe: m.motivo };
    default:
      return {
        titulo: `Voltou de "${m.etapaDe ? ROTULO_ETAPA[m.etapaDe] : '?'}" para "${m.etapaPara ? ROTULO_ETAPA[m.etapaPara] : '?'}"`,
        detalhe: m.motivo
      };
  }
}

/** Um pedido numa ata: o que o gestor da ata recebe para contratar (D1). */
export interface EnvioParaContratar {
  pedidoId: string;
  pedidoNome: string;
  autor: string | null;
  ataKey: string;
  gestorNome: string | null;
  /** Dia do envio mais antigo do grupo. */
  enviadoEm: string | null;
  documentosSei: string[];
  linhas: EmendaAContratar[];
}

/**
 * O que aparece no Início (D1, D2): o gestor vê as atas dele (o banco já recorta); o coordenador vê as atas sem gestor
 * ou, com um gestor escolhido no filtro do painel, as atas daquele gestor. Envios desfeitos ficam 7 dias, como aviso.
 */
export function enviosParaContratar(
  linhas: EmendaAContratar[],
  escopo: { coordenador: boolean; gestorNome?: string | null }
): { aContratar: EnvioParaContratar[]; desfeitos: EmendaAContratar[] } {
  const doEscopo = linhas.filter((r) =>
    !escopo.coordenador ? true : escopo.gestorNome ? r.gestorNome === escopo.gestorNome : !r.gestorUserId
  );
  const grupos = new Map<string, EnvioParaContratar>();
  for (const r of doEscopo) {
    if (r.tipo !== 'A_CONTRATAR') continue;
    const chave = `${r.pedidoId}|${r.ataKey}`;
    const g = grupos.get(chave) ?? {
      pedidoId: r.pedidoId,
      pedidoNome: r.pedidoNome,
      autor: r.autorNome ? `${r.autorNome}${r.autorUf ? ` (${r.autorUf})` : ''}` : null,
      ataKey: r.ataKey,
      gestorNome: r.gestorNome,
      enviadoEm: null,
      documentosSei: [],
      linhas: []
    };
    g.linhas.push(r);
    if (r.data && (!g.enviadoEm || r.data < g.enviadoEm)) g.enviadoEm = r.data;
    if (r.documentoSei && !g.documentosSei.includes(r.documentoSei)) g.documentosSei.push(r.documentoSei);
    grupos.set(chave, g);
  }
  const aContratar = [...grupos.values()].sort(
    (a, b) => (a.enviadoEm ?? '9999').localeCompare(b.enviadoEm ?? '9999') || a.ataKey.localeCompare(b.ataKey) || a.pedidoNome.localeCompare(b.pedidoNome, 'pt-BR')
  );
  const desfeitos = doEscopo.filter((r) => r.tipo === 'DESFEITO').sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
  return { aContratar, desfeitos };
}
