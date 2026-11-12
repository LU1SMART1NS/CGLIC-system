/**
 * Regras de exibição da aba Quantitativos (Item 360). Os números vêm das views da migration 109
 * (situação, gerenciado e cota própria são calculados no banco); aqui só se monta o que a tela mostra:
 * o rótulo da situação, o destino sugerido de um remanejamento, o contratado de cada órgão e o extrato
 * da cota própria, que explica de onde veio cada diferença.
 */
import type { ContratoDoParticipante, OrgaoQuantitativo, QuantitativosDoItem, SituacaoOrgao } from '../services/quantitativosService';

const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);

/** Situações em que o gestor de saldo pode confirmar remanejamento ou marcar "continua do órgão". */
export const SITUACOES_COM_ACAO: ReadonlySet<SituacaoOrgao> = new Set(['GERENCIADO', 'REMANEJADO_A_MENOS']);

/** Órgão que mudou no mesmo segundo no Compras.gov.br e está acima da ata assinada: destino provável. */
export function destinoSugerido(orgaos: OrgaoQuantitativo[], uasg: string): string | null {
  const o = orgaos.find((x) => x.uasg === uasg);
  if (!o?.atualizadoEm) return null;
  const par = orgaos.find((x) => x.uasg !== uasg && !x.ehSenasp && x.atualizadoEm === o.atualizadoEm && x.acima > 0);
  return par?.uasg ?? null;
}

/** Órgãos que mudaram no mesmo segundo que este (a mesma operação no Compras.gov.br). */
export function mudaramNoMesmoSegundo(orgaos: OrgaoQuantitativo[], uasg: string): OrgaoQuantitativo[] {
  const o = orgaos.find((x) => x.uasg === uasg);
  if (!o?.atualizadoEm || !o.mudou) return [];
  return orgaos.filter((x) => x.uasg !== uasg && x.atualizadoEm === o.atualizadoEm);
}

/** Quanto do remanejamento a menos é definitivo (não marcado como "continua do órgão" nem confirmado). */
export const definitivoAutomatico = (o: OrgaoQuantitativo) => (o.situacao === 'REMANEJADO_A_MENOS' ? Math.max(o.resto - o.gerenciado, 0) : 0);

export interface FluxoDaCota {
  de: string;
  /** Nulo = destino não informado (conta como devolvido à SENASP). */
  para: string | null;
  quantidade: number;
  /** Veio da regra (redução no Compras.gov.br), não de uma confirmação do gestor. */
  automatico: boolean;
}

export interface ExtratoDaCota {
  assinadaSenasp: number;
  /** Remanejado pela SENASP para órgãos, acima da ata assinada deles. */
  cedido: Array<{ uasg: string; quantidade: number }>;
  /** Remanejado de órgãos para a SENASP (ou sem destino informado). */
  recebido: FluxoDaCota[];
  /** Entre participantes: não mexe na cota. */
  entre: FluxoDaCota[];
  /** Remanejado da cota própria para não participantes (migration 219). */
  paraNaoParticipantes: number;
  /**
   * Acima da ata assinada dos órgãos sem lastro: parte do registrado acima do homologado (migration 142). Não saiu da
   * SENASP (o registrado dela não caiu), então não mexe na cota.
   */
  semLastro: Array<{ uasg: string; quantidade: number }>;
  cota: number;
  /** O extrato bate com a conta do banco (registrado − gerenciado − desconto). Não bate quando as somas não fecham. */
  confere: boolean;
}

/** Registrado acima do homologado com o aviso aberto (utils/registradoAcima): o excedente e a parte da SENASP. */
export interface ExcedenteDoItem {
  excedente: number;
  excedenteSenasp: number;
  desconto: number;
  resolvido: boolean;
}

export function extratoDaCotaPropria(q: QuantitativosDoItem, registradoAcima?: ExcedenteDoItem | null): ExtratoDaCota {
  const acima = new Map<string, number>();
  for (const o of q.orgaos) {
    if (o.ehSenasp) continue;
    if (o.situacao === 'FORA_DA_ATA') acima.set(o.uasg, o.quantidadeRegistrada ?? 0);
    else if (o.acima > 0) acima.set(o.uasg, o.acima);
  }
  const senasp = new Set(q.orgaos.filter((o) => o.ehSenasp).map((o) => o.uasg));
  const entre: FluxoDaCota[] = [];
  const recebido: FluxoDaCota[] = [];
  const fluxo = (de: string, quantidade: number, para: string | null, automatico: boolean) => {
    let resta = quantidade;
    if (resta <= 0) return;
    const livreNoDestino = para && !senasp.has(para) ? acima.get(para) ?? 0 : 0;
    if (para && livreNoDestino > 0) {
      const usa = Math.min(resta, livreNoDestino);
      acima.set(para, livreNoDestino - usa);
      entre.push({ de, para, quantidade: usa, automatico });
      resta -= usa;
    }
    if (resta > 0) recebido.push({ de, para, quantidade: resta, automatico });
  };

  // Confirmados primeiro, até o confirmado válido de cada órgão (o banco limita à falta).
  const usadoPorOrigem = new Map<string, number>();
  for (const r of q.remanejamentos) {
    const o = q.orgaos.find((x) => x.uasg === r.uasgOrigem);
    const limite = o?.remanejadoConfirmado ?? 0;
    const usado = usadoPorOrigem.get(r.uasgOrigem) ?? 0;
    const qtd = Math.min(r.quantidade, Math.max(limite - usado, 0));
    usadoPorOrigem.set(r.uasgOrigem, usado + qtd);
    fluxo(r.uasgOrigem, qtd, r.uasgDestino, false);
  }
  for (const o of q.orgaos) {
    const def = definitivoAutomatico(o);
    if (def > 0) fluxo(o.uasg, def, destinoSugerido(q.orgaos, o.uasg), true);
  }

  // Registrado acima do homologado: o excedente que não está na SENASP está nos órgãos e não tem lastro; não saiu da
  // cota (00062/2024 item 3: PR +10 e GO +1 com a SENASP ainda em 106 registrados).
  const semLastro: Array<{ uasg: string; quantidade: number }> = [];
  let restoSemLastro = registradoAcima && !registradoAcima.resolvido ? Math.max(registradoAcima.excedente - registradoAcima.excedenteSenasp, 0) : 0;
  for (const [uasg, v] of [...acima.entries()].sort((a, b) => b[1] - a[1])) {
    if (restoSemLastro <= 0) break;
    const tira = Math.min(v, restoSemLastro);
    if (tira <= 0) continue;
    acima.set(uasg, v - tira);
    semLastro.push({ uasg, quantidade: tira });
    restoSemLastro -= tira;
  }
  const cedido = [...acima.entries()].filter(([, v]) => v > 0).map(([uasg, quantidade]) => ({ uasg, quantidade }));
  const soma = (l: Array<{ quantidade: number }>) => l.reduce((s, x) => s + x.quantidade, 0);
  // Todo o remanejado pela SENASP, pendente ou já no Compras.gov.br: o extrato parte da ata assinada, que não muda.
  const paraNaoParticipantes = q.orgaos.filter((o) => o.ehSenasp).reduce((s, o) => s + o.remanejadoNaoParticipante, 0);
  const cota = q.assinadaSenasp - soma(cedido) + soma(recebido) - paraNaoParticipantes;
  const doBanco = q.cotaPropria - (registradoAcima?.desconto ?? 0);
  return { assinadaSenasp: q.assinadaSenasp, cedido, recebido, entre, paraNaoParticipantes, semLastro, cota, confere: Math.abs(cota - doBanco) < 0.0001 };
}

export type EstadoContratado =
  | { tipo: 'SENASP'; quantidade: number }
  | { tipo: 'CONTRATOS'; quantidade: number; contratos: ContratoDoParticipante[] }
  /** O órgão publica no Contratos.gov.br e não tem contrato nesta compra: zero real. */
  | { tipo: 'NENHUM'; quantidade: 0 }
  /** O órgão não publica contratos no Contratos.gov.br. */
  | { tipo: 'SEM_FONTE' }
  /** A sincronização ainda não leu este órgão. */
  | { tipo: 'NAO_LIDO' };

export function contratadoDoOrgao(uasg: string, ehSenasp: boolean, q: QuantitativosDoItem, contratadoSenasp: number): EstadoContratado {
  if (ehSenasp) return { tipo: 'SENASP', quantidade: contratadoSenasp };
  const contratos = q.contratos.filter((c) => c.uasg === uasg);
  if (contratos.length > 0) return { tipo: 'CONTRATOS', quantidade: contratos.reduce((s, c) => s + (c.quantidade ?? 0), 0), contratos };
  const leitura = q.leituras.get(uasg);
  if (!leitura) return { tipo: 'NAO_LIDO' };
  return leitura.contratosNaUg > 0 ? { tipo: 'NENHUM', quantidade: 0 } : { tipo: 'SEM_FONTE' };
}

export type TomDaSituacao = 'neutral' | 'info' | 'warning' | 'danger';

export interface TextoDaSituacao {
  rotulo: string;
  tom: TomDaSituacao;
  detalhe: string | null;
}

const data = (iso: string | null) => (iso ? new Date(iso.length === 19 ? `${iso}-03:00` : iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null);

/** Rótulo, cor e detalhe da situação de um participante, com os nomes aprovados no protótipo. */
export function textoDaSituacao(o: OrgaoQuantitativo, q: QuantitativosDoItem, nomeDe: (uasg: string) => string): TextoDaSituacao {
  const quando = data(o.mudouEm);
  const confirmado = q.remanejamentos.filter((r) => r.uasgOrigem === o.uasg);
  const paraQuem = (uasg: string | null) => (uasg ? nomeDe(uasg) : 'a SENASP');
  const textoConfirmado = o.remanejadoConfirmado > 0 && confirmado.length > 0
    ? `${fmt(o.remanejadoConfirmado)} remanejados para ${paraQuem(confirmado[confirmado.length - 1].uasgDestino)} (confirmado)`
    : null;
  const juntar = (...partes: Array<string | null>) => partes.filter(Boolean).join(' · ') || null;
  switch (o.situacao) {
    case 'IGUAL':
      return { rotulo: 'Igual à ata assinada', tom: 'neutral', detalhe: null };
    case 'GERENCIADO':
      return {
        rotulo: `Gerenciado pela SENASP · ${fmt(o.gerenciado)}`,
        tom: 'info',
        detalhe: juntar(o.semRegistro ? 'órgão sem registro no Compras.gov' : 'desde o registro da ata', o.continuaDoOrgao ? 'confirmado que continua do órgão' : null, textoConfirmado)
      };
    case 'REMANEJADO_A_MENOS': {
      const def = definitivoAutomatico(o);
      const destino = destinoSugerido(q.orgaos, o.uasg);
      return {
        rotulo: `Remanejado · ${fmt(def)} a menos`,
        tom: o.gerenciado > 0 ? 'info' : 'neutral',
        detalhe: juntar(
          quando ? `em ${quando}` : null,
          def > 0 ? (destino ? `para ${nomeDe(destino)} (mesmo segundo)` : 'destino não registrado, conta como devolvido à SENASP') : null,
          o.gerenciado > 0 ? `${fmt(o.gerenciado)} continuam do órgão, gerenciados pela SENASP` : null,
          textoConfirmado
        )
      };
    }
    case 'REMANEJADO_A_MAIS':
    case 'ACIMA_DA_ATA': {
      const extrato = extratoDaCotaPropria(q);
      const vindos = extrato.entre.filter((e) => e.para === o.uasg).map((e) => `${fmt(e.quantidade)} de ${nomeDe(e.de)}`);
      const daCota = extrato.cedido.find((c) => c.uasg === o.uasg)?.quantidade ?? 0;
      return {
        rotulo: o.situacao === 'REMANEJADO_A_MAIS' ? `Remanejado · ${fmt(o.acima)} a mais` : `Acima da ata assinada · ${fmt(o.acima)}`,
        tom: 'info',
        detalhe: juntar(o.situacao === 'REMANEJADO_A_MAIS' && quando ? `em ${quando}` : null, ...vindos, daCota > 0 ? `${fmt(daCota)} da cota da SENASP` : null)
      };
    }
    case 'REMANEJAMENTO_CONFIRMADO': {
      const ultimo = confirmado[confirmado.length - 1];
      return {
        rotulo: `Remanejamento confirmado · ${fmt(o.remanejadoConfirmado)}`,
        tom: 'neutral',
        detalhe: ultimo ? `para ${ultimo.uasgDestino ? nomeDe(ultimo.uasgDestino) : 'a SENASP (destino não informado)'}` : null
      };
    }
    case 'FORA_DA_ATA':
      return { rotulo: 'Fora da ata assinada', tom: 'danger', detalhe: `registrado ${fmt(o.quantidadeRegistrada ?? 0)}, sem quantidade na ata` };
    default:
      return { rotulo: '', tom: 'neutral', detalhe: null };
  }
}

/** Máximo que o gestor de saldo pode confirmar como remanejado (o banco confere de novo). */
export function maximoParaConfirmar(o: OrgaoQuantitativo): number {
  if (o.situacao === 'GERENCIADO') return o.resto;
  if (o.situacao === 'REMANEJADO_A_MENOS') return Math.max(o.resto - o.gerenciado, 0);
  return 0;
}

/** Valida o número do documento SEI (8 dígitos). */
export const documentoSeiValido = (v: string) => /^\d{8}$/.test(v.trim());
