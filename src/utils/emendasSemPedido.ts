/**
 * Emendas sem pedido (protótipo aprovado em 26/10/2026, migration 205): a emenda que a CAEP viu no SIOP antes de o
 * parlamentar falar com ela. A aba Emendas junta as emendas registradas e os números que só existem nos pedidos
 * (conferência com o SIOP); a emenda registrada sem pedido avisa desde o primeiro dia e fica urgente depois de N dias
 * sem contato registrado (Ajustes › Regras de Alertas).
 */
import { EMENDAS_RULES } from '../config/alertRules';
import type { BeneficiarioEmenda, ContatoDaEmenda, EmendaSiop, OrgaoAspar, PedidoEmenda } from '../services/emendasService';
import { diasEntre } from './emendasKits';

/** Dias sem contato registrado até a emenda sem pedido ficar urgente (padrão 7). */
export const diasSemContatoParaUrgente = (): number => EMENDAS_RULES.semPedidoDiasSemContato;

export type SituacaoDaEmenda = 'SEM_CONTATO' | 'EM_CONVERSA' | 'COM_PEDIDO';

export const ROTULO_SITUACAO_EMENDA: Record<SituacaoDaEmenda, string> = {
  SEM_CONTATO: 'Sem pedido · sem contato',
  EM_CONVERSA: 'Sem pedido · em conversa',
  COM_PEDIDO: 'Com pedido'
};

export interface EmendaNaLista {
  /** Id da emenda registrada, ou "pedido:ano:número" para o número que só existe nos pedidos. */
  chave: string;
  /** Vazio quando a emenda só existe nos pedidos (o nº veio da conferência com o SIOP). */
  emenda: EmendaSiop | null;
  ano: number | null;
  numero: string;
  autorId: string | null;
  valor: number | null;
  gnd: string | null;
  /** Pedidos da emenda, sem os cancelados, do mais novo ao mais antigo. */
  pedidos: PedidoEmenda[];
  /** Conversas registradas, da mais antiga à mais nova. */
  contatos: ContatoDaEmenda[];
  situacao: SituacaoDaEmenda;
  /** Desde o dia em que a emenda foi vista no SIOP (só na emenda registrada sem pedido). */
  diasSemPedido: number | null;
  /** Desde o último contato, ou desde o registro quando não houve nenhum (só sem pedido). */
  diasSemContato: number | null;
  /** Sem pedido e sem contato registrado há N dias ou mais. */
  urgente: boolean;
}

/** "42680021" → "4268 0021" (os 4 do autor e os 4 da emenda, como no SIOP). */
export { numeroDaEmendaEmTexto as numeroDaEmenda } from './emendasPedidos';

/** Nº e ano como a CAEP digita: "2026 4268 0021" ou "4268 0021" com o ano à parte. Igual a emendas_numero_e_ano no banco. */
export function lerNumeroDaEmenda(texto: string, anoPadrao: number | null): { numero: string; ano: number } | null {
  const d = texto.replace(/\D/g, '');
  if (d.length === 12) return { numero: d.slice(4), ano: Number(d.slice(0, 4)) };
  if (d.length === 8 && anoPadrao) return { numero: d, ano: anoPadrao };
  return null;
}

/** Ano da emenda no pedido: o conferido no SIOP ou, sem ele, o ano da reserva. */
const anoDoPedido = (p: PedidoEmenda): number => p.siopEmendaAno ?? Number(p.reservadoEm.slice(0, 4));

/** O pedido é desta emenda: nasceu dela, ou tem o mesmo nº conferido (e o mesmo ano, quando o pedido tem). */
export function pedidoDaEmenda(p: PedidoEmenda, e: EmendaSiop): boolean {
  if (p.emendaId) return p.emendaId === e.id;
  return p.siopEmenda === e.numero && (p.siopEmendaAno == null || p.siopEmendaAno === e.ano);
}

export function emendasNaLista(emendas: EmendaSiop[], pedidos: PedidoEmenda[], contatos: ContatoDaEmenda[], hoje: string): EmendaNaLista[] {
  const ativos = pedidos.filter((p) => p.etapa !== 'CANCELADO');
  const contatosPorEmenda = new Map<string, ContatoDaEmenda[]>();
  for (const c of contatos) contatosPorEmenda.set(c.emendaId, [...(contatosPorEmenda.get(c.emendaId) ?? []), c]);
  const usados = new Set<string>();
  const limite = diasSemContatoParaUrgente();

  const registradas = emendas.map((e): EmendaNaLista => {
    const daEmenda = ativos.filter((p) => pedidoDaEmenda(p, e));
    for (const p of daEmenda) usados.add(p.id);
    const conversas = [...(contatosPorEmenda.get(e.id) ?? [])].sort((a, b) => a.contatoEm.localeCompare(b.contatoEm) || a.criadoEm.localeCompare(b.criadoEm));
    const semPedido = daEmenda.length === 0;
    const ultimo = conversas.at(-1)?.contatoEm ?? null;
    const diasSemContato = semPedido ? Math.max(0, diasEntre(ultimo && ultimo > e.vistaEm ? ultimo : e.vistaEm, hoje)) : null;
    return {
      chave: e.id,
      emenda: e,
      ano: e.ano,
      numero: e.numero,
      autorId: e.autorId,
      valor: e.valor,
      gnd: e.gnd,
      pedidos: daEmenda.sort((a, b) => b.numero - a.numero),
      contatos: conversas,
      situacao: !semPedido ? 'COM_PEDIDO' : conversas.length ? 'EM_CONVERSA' : 'SEM_CONTATO',
      diasSemPedido: semPedido ? Math.max(0, diasEntre(e.vistaEm, hoje)) : null,
      diasSemContato,
      urgente: semPedido && diasSemContato != null && diasSemContato >= limite
    };
  });

  // Números que só existem nos pedidos (conferidos no SIOP antes do registro de emendas): uma linha por ano + nº.
  const soNosPedidos = new Map<string, EmendaNaLista>();
  for (const p of ativos) {
    if (usados.has(p.id) || !p.siopEmenda) continue;
    const ano = anoDoPedido(p);
    const chave = `pedido:${ano}:${p.siopEmenda}`;
    const l = soNosPedidos.get(chave) ?? {
      chave,
      emenda: null,
      ano,
      numero: p.siopEmenda,
      autorId: p.autorId,
      valor: null,
      gnd: null,
      pedidos: [],
      contatos: [],
      situacao: 'COM_PEDIDO' as const,
      diasSemPedido: null,
      diasSemContato: null,
      urgente: false
    };
    l.pedidos.push(p);
    l.valor ??= p.siopValor;
    l.gnd ??= p.siopGnd;
    l.autorId ??= p.autorId;
    soNosPedidos.set(chave, l);
  }
  for (const l of soNosPedidos.values()) l.pedidos.sort((a, b) => b.numero - a.numero);

  return [...registradas, ...soNosPedidos.values()].sort(compararEmendas);
}

/** Sem pedido primeiro (urgentes, depois as que esperam há mais tempo); depois o ano mais novo e o nº. */
function compararEmendas(a: EmendaNaLista, b: EmendaNaLista): number {
  const semA = a.situacao !== 'COM_PEDIDO';
  const semB = b.situacao !== 'COM_PEDIDO';
  if (semA !== semB) return semA ? -1 : 1;
  if (semA && semB) {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
    return (b.diasSemPedido ?? 0) - (a.diasSemPedido ?? 0) || a.numero.localeCompare(b.numero);
  }
  return (b.ano ?? 0) - (a.ano ?? 0) || a.numero.localeCompare(b.numero);
}

export const semPedido = (l: EmendaNaLista): boolean => l.situacao !== 'COM_PEDIDO';

/** Para o número do menu e o Início: emendas sem pedido e quantas estão urgentes. */
export function contaEmendasSemPedido(lista: EmendaNaLista[]): { total: number; urgentes: number; valor: number } {
  const sem = lista.filter(semPedido);
  return { total: sem.length, urgentes: sem.filter((l) => l.urgente).length, valor: sem.reduce((s, l) => s + (l.valor ?? 0), 0) };
}

/**
 * Parlamentar pelo código do autor (os 4 primeiros dígitos do nº), aprendido com as emendas registradas e os pedidos
 * que já têm o nº. Código que aparece com mais de um autor fica de fora (a CAEP escolhe).
 */
export function autorPeloCodigo(emendas: EmendaSiop[], pedidos: PedidoEmenda[]): Map<string, string> {
  const vistos = new Map<string, Set<string>>();
  const anotar = (numero: string | null, autor: string | null) => {
    if (!numero || numero.length !== 8 || !autor) return;
    const cod = numero.slice(0, 4);
    vistos.set(cod, (vistos.get(cod) ?? new Set()).add(autor));
  };
  for (const e of emendas) anotar(e.numero, e.autorId);
  for (const p of pedidos) anotar(p.siopEmenda, p.autorId);
  const m = new Map<string, string>();
  for (const [cod, autores] of vistos) if (autores.size === 1) m.set(cod, [...autores][0]);
  return m;
}

export const ORGAOS_ASPAR: OrgaoAspar[] = ['PM', 'BM', 'PC', 'PCI', 'SSP'];

export const NOME_ORGAO_ASPAR: Record<OrgaoAspar, string> = {
  PM: 'Polícia Militar',
  BM: 'Corpo de Bombeiros Militar',
  PC: 'Polícia Civil',
  PCI: 'Polícia Científica / Perícia',
  SSP: 'Secretaria de Segurança Pública'
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Órgão do beneficiário pelo nome (só para pôr a ASPAR dele em primeiro; não grava nada). */
export function orgaoDoBeneficiario(b: Pick<BeneficiarioEmenda, 'nome' | 'sigla' | 'razaoSocial'> | undefined): OrgaoAspar | null {
  if (!b) return null;
  const t = semAcento(`${b.nome} ${b.sigla ?? ''} ${b.razaoSocial ?? ''}`);
  if (/bombeiro/.test(t)) return 'BM';
  if (/policia militar/.test(t)) return 'PM';
  if (/policia civil/.test(t)) return 'PC';
  if (/pericia|cientifica|criminalistica|tecnico-cientifica|politec/.test(t)) return 'PCI';
  if (/seguranca publica|secretaria/.test(t)) return 'SSP';
  return null;
}

/** As ASPAR na ordem da tela: o órgão do beneficiário indicado no SIOP primeiro. */
export const orgaosNaOrdem = (primeiro: OrgaoAspar | null): OrgaoAspar[] => (primeiro ? [primeiro, ...ORGAOS_ASPAR.filter((o) => o !== primeiro)] : ORGAOS_ASPAR);

export const ROTULO_MEIO: Record<ContatoDaEmenda['meio'], string> = {
  TELEFONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  REUNIAO: 'Reunião'
};

/** "hoje", "1 dia", "N dias". */
export const textoDias = (n: number): string => (n <= 0 ? 'hoje' : n === 1 ? '1 dia' : `${n} dias`);
/** "hoje" ou "há N dias". */
export const haDias = (n: number): string => (n <= 0 ? 'hoje' : `há ${textoDias(n)}`);
