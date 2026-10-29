/**
 * Sobra das emendas (protótipo aprovado em 26/10/2026, migration 204). A emenda é a unidade da conta:
 *   sobra = valor no SIOP − o maior entre os ofícios e o empenhado (migration 232, aprovado em 28/10/2026).
 * - Valor: o da emenda registrada (emendas_siop, um por emenda, com a data da leitura do SIOP). Sem registro, o maior
 *   valor visto na conferência dos pedidos (antes da migration 232 cada pedido guardava o da emenda inteira).
 * - Ofícios: a soma do valor do ofício de cada pedido. Pedido conferido sem esse valor fica "ofício a informar" e a
 *   conta volta à regra antiga (empenhado + em andamento), até a CAEP informar.
 * - Em andamento, com todos os ofícios informados: o que foi oficiado e ainda não empenhou (falta empenhar).
 * - Empenhado: o das notas da SENASP (UGs 200330 e 200331) que o Portal da Transparência liga à emenda, somadas pela
 *   tabela empenhos (migration 205; o empenhado do Portal é o da emenda inteira, de todos os órgãos). Sem os documentos
 *   lidos, o das notas ligadas às linhas no sistema. Fica "a confirmar" se alguma linha empenhada ainda não tem nota
 *   ou se alguma nota da SENASP ainda não está no sistema.
 * - Em andamento: as linhas sem nota dos pedidos antes do empenho, pelo preço de hoje (o do quadro do parlamentar).
 * Regras aprovadas: só emendas do ano corrente; uma emenda por pedido; aviso quando a sobra compra o item mais barato.
 * Ano encerrado (28/10/2026): o que não foi empenhado até 31/12 perdeu o crédito. Não há "em andamento" nem pedido
 * novo; o resto (valor − empenhado) fica como "Não empenhado".
 */
import type { EmendaSiop, ItemCaep, NotaDaLinha, PedidoEmenda } from '../services/emendasService';
import type { PrecoDoItem } from '../services/emendasQuadroService';
import { jaEmpenhado, linhasAtivas, precoParaEmenda, valorDaLinha } from './emendasPedidos';
import { nomeDoPedido } from './emendasNomeDoPedido';

/** O que o Portal diz da emenda (emenda_execucao_portal). */
export interface ExecucaoNoPortal {
  codigo: string;
  encontrada: boolean;
  valorEmpenhado: number | null;
  valorLiquidado: number | null;
  valorPago: number | null;
  lidoEm: string | null;
  /** Notas da SENASP que o Portal liga à emenda (migration 205); null enquanto os documentos não foram lidos. */
  notasSenasp: number | null;
  empenhadoSenasp: number | null;
  /** Notas da SENASP que o sistema ainda não tem (sem valor na soma). */
  notasSemValor: number | null;
}

export type SituacaoDaSobra = 'sobra' | 'conferir' | 'informar' | 'acima' | 'executada' | 'semValor' | 'naoEmpenhado';

export interface SobraDaEmenda {
  /** Ano + nº (12 dígitos), o código do Portal. */
  codigo: string;
  emenda: string;
  ano: number;
  autorId: string | null;
  /** Pedidos não cancelados com a emenda, do mais antigo ao mais novo. */
  /** `nome` é o que a tela mostra ("Pedido 1/2026"); `numero` é o sequencial interno, só para ordenar. */
  pedidos: Array<{ id: string; numero: number; nome: string; etapa: PedidoEmenda['etapa'] }>;
  valor: number | null;
  /** Data da leitura do SIOP que deu o valor (emenda registrada); null quando o valor veio só dos pedidos. */
  valorLidoEm: string | null;
  /** Soma dos valores dos ofícios informados. */
  oficiado: number;
  /** Pedidos conferidos sem o valor do ofício. */
  oficiosAInformar: number;
  empenhado: number;
  fonteDoEmpenhado: 'PORTAL' | 'NOTAS';
  emAndamento: number;
  sobra: number;
  /** Linhas dos pedidos empenhados ainda sem nota ligada (só pesa quando o empenhado vem das notas). */
  linhasSemNota: number;
  /** Notas da SENASP no Portal que o sistema ainda não tem (o empenhado fica a menos). */
  notasSemValor: number;
  situacao: SituacaoDaSobra;
}

const CENTAVO = 0.005;
const arredondar = (v: number) => Math.round(v * 100) / 100;

/** Código do Portal da emenda: ano + nº. */
export const codigoDaEmenda = (emenda: string, ano: number) => `${ano}${emenda}`;

/** Menor preço de hoje entre os itens que a CAEP ainda pode oferecer (ata vigente e saldo livre). */
export function menorPrecoDisponivel(itens: Map<string, ItemCaep>, reservado: Map<string, number>, precos?: Map<string, PrecoDoItem>): number | null {
  let menor: number | null = null;
  for (const i of itens.values()) {
    if (i.ataEncerrada || i.alocado - (reservado.get(i.itemKey) ?? 0) <= 0) continue;
    const p = precoParaEmenda(i.itemKey, itens, precos).valor;
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
  precos?: Map<string, PrecoDoItem>;
  /** Sobra mínima para virar "sobra": o item mais barato disponível. Sem ele, qualquer valor acima de um centavo. */
  minimo: number | null;
  /** Ano já encerrado: sem "em andamento" e sem sobra; o resto fica "Não empenhado". */
  encerrado?: boolean;
  /** Emendas registradas (emendas_siop): o valor da emenda no SIOP. */
  emendas?: EmendaSiop[];
  /** Também as emendas registradas sem pedido (o valor inteiro fica a indicar). Parlamentares, 29/10/2026. */
  incluirSemPedido?: boolean;
}): SobraDaEmenda[] {
  const { pedidos, ano, itens, notas, portal, precos, minimo, encerrado = false, emendas = [], incluirSemPedido = false } = opts;
  const registradas = new Map(emendas.filter((e) => e.ano === ano).map((e) => [codigoDaEmenda(e.numero, ano), e]));
  const grupos = new Map<string, PedidoEmenda[]>();
  for (const p of pedidos) {
    if (p.etapa === 'CANCELADO' || !p.siopEmenda || p.siopEmendaAno !== ano) continue;
    const c = codigoDaEmenda(p.siopEmenda, ano);
    grupos.set(c, [...(grupos.get(c) ?? []), p]);
  }
  if (incluirSemPedido) for (const c of registradas.keys()) if (!grupos.has(c)) grupos.set(c, []);
  const resultado: SobraDaEmenda[] = [];
  for (const [codigo, ps] of grupos) {
    ps.sort((a, b) => a.numero - b.numero);
    const registrada = registradas.get(codigo);
    const valores = ps.map((p) => p.siopValor).filter((v): v is number => v != null);
    const valor = registrada ? registrada.valor : valores.length ? Math.max(...valores) : null;
    const oficiado = arredondar(ps.reduce((s, p) => s + (p.oficioValor ?? 0), 0));
    const oficiosAInformar = ps.filter((p) => p.oficioValor == null).length;

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
    // Só as notas da SENASP (migration 205): o empenhado do Portal é o da emenda inteira, de todos os órgãos.
    const peloPortal = Boolean(doPortal?.notasSenasp != null && doPortal.empenhadoSenasp != null);
    const notasSemValor = peloPortal ? doPortal!.notasSemValor ?? 0 : 0;
    const empenhado = arredondar(peloPortal ? doPortal!.empenhadoSenasp! : [...porNota.values()].reduce((s, v) => s + v, 0));
    // Todos os ofícios informados: o comprometido é o maior entre os ofícios e o empenhado; o que falta empenhar dos
    // ofícios fica "em andamento". Com ofício a informar, a regra antiga (pelas linhas sem nota).
    const comOficios = oficiosAInformar === 0;
    if (comOficios) emAndamento = Math.max(0, oficiado - empenhado);
    emAndamento = encerrado ? 0 : arredondar(emAndamento);
    const sobra = valor == null ? 0 : arredondar(valor - empenhado - emAndamento);
    const situacao: SituacaoDaSobra =
      valor == null
        ? 'semValor'
        : empenhado - valor > CENTAVO || (comOficios && oficiado - valor > CENTAVO)
          ? 'acima'
          : (!peloPortal && linhasSemNota > 0) || notasSemValor > 0
            ? 'conferir'
            : !comOficios && !encerrado
              ? 'informar'
            : encerrado
              ? sobra > CENTAVO
                ? 'naoEmpenhado'
                : 'executada'
              : sobra >= (minimo ?? 0.01)
                ? 'sobra'
                : 'executada';
    resultado.push({
      codigo,
      emenda: codigo.slice(4),
      ano,
      autorId: ps[0]?.autorId ?? registrada?.autorId ?? null,
      pedidos: ps.map((p) => ({ id: p.id, numero: p.numero, nome: nomeDoPedido(p), etapa: p.etapa })),
      valor,
      valorLidoEm: registrada?.vistaEm ?? null,
      oficiado,
      oficiosAInformar,
      empenhado,
      fonteDoEmpenhado: peloPortal ? 'PORTAL' : 'NOTAS',
      emAndamento,
      sobra,
      linhasSemNota,
      notasSemValor,
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
  /** O que ficou sem empenho nas emendas de ano encerrado (crédito perdido). */
  naoEmpenhado: number;
  /** A pior situação entre as emendas, para a etiqueta da linha. */
  situacao: SituacaoDaSobra | null;
}

const PESO: Record<SituacaoDaSobra, number> = { acima: 0, conferir: 1, informar: 2, sobra: 3, naoEmpenhado: 4, semValor: 5, executada: 6 };

export function sobraPorAutor(emendas: SobraDaEmenda[]): Map<string, SobraDoAutor> {
  const m = new Map<string, SobraDoAutor>();
  for (const e of emendas) {
    const chave = e.autorId ?? '';
    const a = m.get(chave) ?? { emendas: [], valor: 0, empenhado: 0, emAndamento: 0, sobra: 0, naoEmpenhado: 0, situacao: null };
    a.emendas.push(e);
    a.valor += e.valor ?? 0;
    a.empenhado += e.empenhado;
    a.emAndamento += e.emAndamento;
    if (e.situacao === 'sobra') a.sobra += e.sobra;
    if (e.situacao === 'naoEmpenhado') a.naoEmpenhado += e.sobra;
    if (a.situacao == null || PESO[e.situacao] < PESO[a.situacao]) a.situacao = e.situacao;
    m.set(chave, a);
  }
  return m;
}

export const ROTULO_SITUACAO_SOBRA: Record<SituacaoDaSobra, string> = {
  sobra: 'Valor a indicar',
  conferir: 'Empenhado a confirmar',
  informar: 'Ofício a informar',
  acima: 'Ofícios ou empenho acima do SIOP',
  executada: 'Executada',
  semValor: 'Sem valor do SIOP',
  naoEmpenhado: 'Não empenhado'
};
