/**
 * Sobra das emendas (protótipo aprovado em 26/10/2026, migration 204). A emenda é a unidade da conta:
 *   sobra = valor no SIOP − empenhado − em andamento.
 * - Valor: o informado na conferência com o SIOP (o maior entre os pedidos da emenda: cada um guarda o da emenda inteira).
 * - Empenhado: o do Portal da Transparência (todas as notas da emenda); sem a emenda no Portal, o das notas ligadas às
 *   linhas no sistema, e a emenda fica "a confirmar" se alguma linha empenhada ainda não tem nota.
 * - Em andamento: as linhas sem nota dos pedidos antes do empenho, pelo preço previsto (o do quadro do parlamentar).
 * Regras aprovadas: só emendas do ano corrente; uma emenda por pedido; aviso quando a sobra compra o item mais barato.
 */
import type { ItemCaep, NotaDaLinha, PedidoEmenda } from '../services/emendasService';
import type { PrecoPrevisto } from '../services/emendasQuadroService';
import { jaEmpenhado, linhasAtivas, precoParaEmenda, valorDaLinha } from './emendasPedidos';

/** O que o Portal diz da emenda (emenda_execucao_portal). */
export interface ExecucaoNoPortal {
  codigo: string;
  encontrada: boolean;
  valorEmpenhado: number | null;
  valorLiquidado: number | null;
  valorPago: number | null;
  lidoEm: string | null;
}

export type SituacaoDaSobra = 'sobra' | 'conferir' | 'acima' | 'executada' | 'semValor';

export interface SobraDaEmenda {
  /** Ano + nº (12 dígitos), o código do Portal. */
  codigo: string;
  emenda: string;
  ano: number;
  autorId: string | null;
  /** Pedidos não cancelados com a emenda, do mais antigo ao mais novo. */
  pedidos: Array<{ id: string; numero: number; etapa: PedidoEmenda['etapa'] }>;
  valor: number | null;
  empenhado: number;
  fonteDoEmpenhado: 'PORTAL' | 'NOTAS';
  emAndamento: number;
  sobra: number;
  /** Linhas dos pedidos empenhados ainda sem nota ligada (só pesa quando o empenhado vem das notas). */
  linhasSemNota: number;
  situacao: SituacaoDaSobra;
}

const CENTAVO = 0.005;
const arredondar = (v: number) => Math.round(v * 100) / 100;

/** Código do Portal da emenda: ano + nº. */
export const codigoDaEmenda = (emenda: string, ano: number) => `${ano}${emenda}`;

/** Menor preço previsto entre os itens que a CAEP ainda pode oferecer (ata vigente e saldo livre). */
export function menorPrecoDisponivel(itens: Map<string, ItemCaep>, reservado: Map<string, number>, precos?: Map<string, PrecoPrevisto>): number | null {
  let menor: number | null = null;
  for (const i of itens.values()) {
    if (i.ataEncerrada || i.alocado - (reservado.get(i.itemKey) ?? 0) <= 0) continue;
    const p = precoParaEmenda(i.itemKey, itens, precos).previsto;
    if (p > 0 && (menor == null || p < menor)) menor = p;
  }
  return menor;
}

export function sobraDasEmendas(opts: {
  pedidos: PedidoEmenda[];
  ano: number;
  itens: Map<string, ItemCaep>;
  notas: Map<string, NotaDaLinha>;
  portal: Map<string, ExecucaoNoPortal>;
  precos?: Map<string, PrecoPrevisto>;
  /** Sobra mínima para virar "sobra": o item mais barato disponível. Sem ele, qualquer valor acima de um centavo. */
  minimo: number | null;
}): SobraDaEmenda[] {
  const { pedidos, ano, itens, notas, portal, precos, minimo } = opts;
  const grupos = new Map<string, PedidoEmenda[]>();
  for (const p of pedidos) {
    if (p.etapa === 'CANCELADO' || !p.siopEmenda || p.siopEmendaAno !== ano) continue;
    const c = codigoDaEmenda(p.siopEmenda, ano);
    grupos.set(c, [...(grupos.get(c) ?? []), p]);
  }
  const resultado: SobraDaEmenda[] = [];
  for (const [codigo, ps] of grupos) {
    ps.sort((a, b) => a.numero - b.numero);
    const valores = ps.map((p) => p.siopValor).filter((v): v is number => v != null);
    const valor = valores.length ? Math.max(...valores) : null;

    // Empenhado pelas notas ligadas: cada nota uma vez só (a mesma nota cobre várias linhas).
    const porNota = new Map<string, number>();
    let linhasSemNota = 0;
    let emAndamento = 0;
    for (const p of ps) {
      for (const l of linhasAtivas(p)) {
        const n = notas.get(l.id);
        if (n?.nota) porNota.set(n.empenhoId ?? n.nota, n.valorEmpenhado ?? 0);
        else if (jaEmpenhado(p.etapa)) linhasSemNota++;
        else emAndamento += valorDaLinha(l, itens, precos);
      }
    }
    const doPortal = portal.get(codigo);
    const peloPortal = Boolean(doPortal?.encontrada && doPortal.valorEmpenhado != null);
    const empenhado = arredondar(peloPortal ? doPortal!.valorEmpenhado! : [...porNota.values()].reduce((s, v) => s + v, 0));
    emAndamento = arredondar(emAndamento);
    const sobra = valor == null ? 0 : arredondar(valor - empenhado - emAndamento);
    const situacao: SituacaoDaSobra =
      valor == null
        ? 'semValor'
        : empenhado - valor > CENTAVO
          ? 'acima'
          : !peloPortal && linhasSemNota > 0
            ? 'conferir'
            : sobra >= (minimo ?? 0.01)
              ? 'sobra'
              : 'executada';
    resultado.push({
      codigo,
      emenda: codigo.slice(4),
      ano,
      autorId: ps[0].autorId,
      pedidos: ps.map((p) => ({ id: p.id, numero: p.numero, etapa: p.etapa })),
      valor,
      empenhado,
      fonteDoEmpenhado: peloPortal ? 'PORTAL' : 'NOTAS',
      emAndamento,
      sobra,
      linhasSemNota,
      situacao
    });
  }
  return resultado.sort((a, b) => b.sobra - a.sobra);
}

export interface SobraDoAutor {
  emendas: SobraDaEmenda[];
  valor: number;
  empenhado: number;
  emAndamento: number;
  /** Só a sobra que dá para usar (emendas em "sobra"). */
  sobra: number;
  /** A pior situação entre as emendas, para a etiqueta da linha. */
  situacao: SituacaoDaSobra | null;
}

const PESO: Record<SituacaoDaSobra, number> = { acima: 0, conferir: 1, sobra: 2, semValor: 3, executada: 4 };

export function sobraPorAutor(emendas: SobraDaEmenda[]): Map<string, SobraDoAutor> {
  const m = new Map<string, SobraDoAutor>();
  for (const e of emendas) {
    const chave = e.autorId ?? '';
    const a = m.get(chave) ?? { emendas: [], valor: 0, empenhado: 0, emAndamento: 0, sobra: 0, situacao: null };
    a.emendas.push(e);
    a.valor += e.valor ?? 0;
    a.empenhado += e.empenhado;
    a.emAndamento += e.emAndamento;
    if (e.situacao === 'sobra') a.sobra += e.sobra;
    if (a.situacao == null || PESO[e.situacao] < PESO[a.situacao]) a.situacao = e.situacao;
    m.set(chave, a);
  }
  return m;
}

export const ROTULO_SITUACAO_SOBRA: Record<SituacaoDaSobra, string> = {
  sobra: 'Sobra para novo pedido',
  conferir: 'Empenhado a confirmar',
  acima: 'Empenhado acima do valor',
  executada: 'Executada',
  semValor: 'Sem valor do SIOP'
};
