import type { DistribuicaoDoEmpenho } from '../../services/distribuicaoEmpenhoService';
import type { EmpenhoForaDoContrato, TipoDeCorrecao } from '../../services/empenhosForaDoContratoService';
import { TIPO_SUGERIDO } from '../../services/empenhosForaDoContratoService';
import { chaveDaNota, type PagamentoDaFatura } from '../../services/pagamentoDaFaturaService';
import { numeroDaChave } from '../../utils/contractKeyUtils';
import { credorDiferenteDoFornecedor } from '../../utils/fornecedorMatch';

/** Nota que espera a equipe: a vincular ou a rever (as vinculadas automaticamente não entram na fila). */
export const aguardaVinculoAosItens = (d: DistribuicaoDoEmpenho) => d.situacao === 'A_DISTRIBUIR' || d.situacao === 'REVISAR';

/** Nota que o servidor vinculou porque só um item explica o valor dela (aparece em "Vinculadas pelo valor"). */
export const vinculadaPeloValor = (d: DistribuicaoDoEmpenho) => d.situacao === 'DISTRIBUIDA' && d.origem === 'VALOR';

/** Nota que a equipe vinculou (aparece em "Vinculadas pela equipe"). */
export const vinculadaPelaEquipe = (d: DistribuicaoDoEmpenho) => d.situacao === 'DISTRIBUIDA' && d.origem === 'USUARIO';

/** Sugestão que pode ser aceita sem escolha: igual ao total de um item ou múltiplo do preço de um item só. */
export const temSugestaoUnica = (d: DistribuicaoDoEmpenho) =>
  (d.sugestaoTipo === 'TOTAL_DO_ITEM' || d.sugestaoTipo === 'MULTIPLO_DO_PRECO') && d.sugestao.length === 1;

/** Pode entrar no lote "Vincular pela sugestão": a vincular (não a rever) e com sugestão única. */
export const entraNoLote = (d: DistribuicaoDoEmpenho) => d.situacao === 'A_DISTRIBUIR' && temSugestaoUnica(d);

export type FiltroSugestao = 'TODOS' | 'UNICA' | 'VARIAS' | 'NENHUMA';

export function passaFiltroSugestao(d: DistribuicaoDoEmpenho, filtro: FiltroSugestao): boolean {
  if (filtro === 'TODOS') return true;
  if (filtro === 'UNICA') return temSugestaoUnica(d);
  if (filtro === 'VARIAS') return d.sugestaoTipo === 'VARIAS_POSSIBILIDADES';
  return !d.sugestaoTipo || d.sugestaoTipo === 'SEM_SUGESTAO';
}

/** A rever primeiro, depois as mais recentes. */
export function ordenarFila(lista: DistribuicaoDoEmpenho[], emissaoDe: (d: DistribuicaoDoEmpenho) => string | null | undefined): DistribuicaoDoEmpenho[] {
  const peso = (d: DistribuicaoDoEmpenho) => (d.situacao === 'REVISAR' ? 0 : 1);
  return [...lista].sort((a, b) => peso(a) - peso(b) || (emissaoDe(b) ?? '').localeCompare(emissaoDe(a) ?? ''));
}

// -----------------------------------------------------------------------------------------------------
// Empenhos ao contrato: notas que a fatura cita fora do contrato (migration 117)
// -----------------------------------------------------------------------------------------------------

export const CONTRATOS_GOV = 'https://contratos.comprasnet.gov.br';
/** Abre o portal em outra aba (chamar no próprio clique, senão o navegador bloqueia). */
export const abrirContratosGov = () => window.open(CONTRATOS_GOV, '_blank', 'noopener,noreferrer');

/** Segmento do trilho: "A conferir" inclui as marcadas há mais de 7 dias sem a correção chegar. */
export type SegmentoForaDoContrato = 'A_CONFERIR' | 'CORRIGINDO' | 'TODAS';

export function noSegmento(l: Pick<EmpenhoForaDoContrato, 'situacao'>, segmento: SegmentoForaDoContrato): boolean {
  if (segmento === 'TODAS') return true;
  if (segmento === 'CORRIGINDO') return l.situacao === 'CORRIGINDO';
  return l.situacao === 'A_CONFERIR' || l.situacao === 'CORRECAO_NAO_CHEGOU';
}

/** Conta no menu: o que ainda pede o gestor (sem marca, ou marcada e a correção não chegou). */
export const pedeOGestor = (l: Pick<EmpenhoForaDoContrato, 'situacao'>) => noSegmento(l, 'A_CONFERIR');

// -----------------------------------------------------------------------------------------------------
// Contratos encerrados (decisão de 15/10/2026): fora do número do menu; "Deixar como está" com justificativa
// -----------------------------------------------------------------------------------------------------

export type FiltroVigencia = 'VIGENTES' | 'ENCERRADOS' | 'TODOS';

/** Filtro Vigência das duas filas. Contrato sem data de fim conta como vigente. */
export function passaVigencia(expirado: boolean | undefined, filtro: FiltroVigencia): boolean {
  if (filtro === 'TODOS') return true;
  return filtro === 'ENCERRADOS' ? Boolean(expirado) : !expirado;
}

/**
 * Linha deixada como está: tem a marca do gestor E o contrato está encerrado. Se o contrato voltar a ficar
 * vigente (prorrogação), a marca deixa de valer e a linha volta à fila.
 */
export const deixadaComoEsta = (expirado: boolean | undefined, temMarca: boolean) => Boolean(expirado) && temMarca;

/** O número do ícone do menu conta só linhas de contratos vigentes (as encerradas ficam no filtro "Encerrados"). */
export const contaNoMenu = (expirado: boolean | undefined) => !expirado;

export interface ContratoDaConferencia {
  numero: string;
  fornecedorNome?: string;
  fornecedorCnpj?: string;
}

export interface ConferenciaDaNota {
  /** "O que aconteceu", numa frase. */
  frase: string;
  /** "O que fazer no Contratos.gov.br": um caso por linha. */
  fazer: Array<{ se: string; faca: string }>;
  /** Dados da nota e da fatura, em letra menor. */
  dados: string[];
}

const juntar = (l: string[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (v: string | null) => {
  if (!v) return '';
  const [a, m, d] = v.slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : v;
};

/**
 * Notas deste contrato que a OB pagou e a fatura não cita: é nelas que a fatura devia estar. Só quando a OB não paga a
 * nota citada (se paga, a citação está certa e falta a nota no contrato) e não é nota em dobro (esse caso já manda trocar).
 */
export function trocaSugeridaPelaOb(l: EmpenhoForaDoContrato, pagamento?: PagamentoDaFatura | null): string[] {
  if (!pagamento || l.veredito === 'NOTA_EM_DOBRO') return [];
  const pagas = new Set(pagamento.obs.flatMap((o) => o.notas.map(chaveDaNota)));
  if (pagas.has(chaveDaNota(l.numeroEmpenho))) return [];
  const citadas = new Set([l.numeroEmpenho, ...l.outrasNotasDaFatura.map((n) => n.numeroEmpenho ?? '')].map(chaveDaNota));
  return pagamento.notasDoContrato.filter((n) => pagas.has(chaveDaNota(n)) && !citadas.has(chaveDaNota(n)));
}

/** O que a janela "Vou corrigir" já marca: trocar o número quando a OB mostra a nota certa; senão, conforme o veredito. */
export const tipoSugerido = (l: EmpenhoForaDoContrato, pagamento?: PagamentoDaFatura | null): TipoDeCorrecao =>
  trocaSugeridaPelaOb(l, pagamento).length > 0 ? 'CORRIGIR_NUMERO_NA_FATURA' : TIPO_SUGERIDO[l.veredito];

/** Texto da conferência de uma nota: o que aconteceu, o que fazer no Contratos.gov.br e os dados. */
export function conferenciaDaNota(l: EmpenhoForaDoContrato, contrato: ContratoDaConferencia, pagamento?: PagamentoDaFatura | null): ConferenciaDaNota {
  const numeroFatura = l.fatura.numero || String(l.idFatura);
  const outros = l.outrosContratos.map(numeroDaChave);
  let frase: string;
  let fazer: ConferenciaDaNota['fazer'];
  if (l.veredito === 'EM_OUTRO_CONTRATO') {
    frase = `Esta nota está ${outros.length === 1 ? 'no contrato' : 'nos contratos'} ${juntar(outros)} e não neste.`;
    fazer = [
      { se: `Se a fatura é ${outros.length === 1 ? `do ${outros[0]}` : 'de outro desses contratos'}:`, faca: `mude a fatura ${outros.length === 1 ? 'para aquele contrato' : 'para o contrato certo'}.` },
      { se: 'Se a nota paga os dois contratos:', faca: `inclua a nota também no ${contrato.numero}.` }
    ];
  } else if (l.veredito === 'NOTA_EM_DOBRO') {
    const reg = l.registroNoContrato;
    frase = `O Contratos.gov.br tem dois registros da nota ${l.numeroEmpenho}. Este contrato tem um${reg ? `, com valor ${moeda(reg.valorEmpenhado)}` : ''}. A fatura usa o outro, que não está neste contrato.`;
    fazer = [
      { se: `Na fatura ${numeroFatura}:`, faca: 'troque a nota pelo registro que está neste contrato.' },
      { se: 'Se o registro deste contrato é que está errado:', faca: 'inclua neste contrato o registro que a fatura usa e retire o outro.' }
    ];
  } else {
    frase = 'Esta nota não está em nenhum contrato da CGLIC no Contratos.gov.br.';
    fazer = [
      { se: 'Se a nota é deste contrato:', faca: `inclua a nota no ${contrato.numero}.` },
      { se: 'Se o número foi digitado errado:', faca: `corrija a nota na fatura ${numeroFatura}.` }
    ];
  }

  const dados: string[] = [];
  if (l.nota) {
    const n = l.nota;
    const mesmoCredor =
      n.credorNome || n.credorCnpjCpf
        ? !credorDiferenteDoFornecedor({ nome: n.credorNome ?? undefined, cnpj: n.credorCnpjCpf ?? undefined }, { nome: contrato.fornecedorNome, cnpj: contrato.fornecedorCnpj })
        : null;
    const credor = n.credorNome ? ` · ${n.credorNome}${mesmoCredor === true ? ', mesmo credor do contrato' : mesmoCredor === false ? ', credor diferente do fornecedor do contrato' : ''}` : '';
    dados.push(`${n.numeroOficial} · UG ${n.uasgEmitente}${n.dataEmissao ? ` · emitida em ${data(n.dataEmissao)}` : ''} · ${moeda(n.valorEmpenhado)}${credor}.`);
  }
  if (l.registroNoContrato) {
    const r = l.registroNoContrato;
    dados.push(`No contrato: ${r.numeroOficial} · UG ${r.uasgEmitente}${r.dataEmissao ? ` · emitida em ${data(r.dataEmissao)}` : ''} · ${moeda(r.valorEmpenhado)}.`);
  }
  const outrasNotas = l.outrasNotasDaFatura.filter((n) => n.numeroEmpenho);
  const sobreFatura = `Fatura ${numeroFatura}${l.fatura.referencia ? ` · ref. ${l.fatura.referencia}` : ''}${l.fatura.emissao ? ` · ${data(l.fatura.emissao)}` : ''} · ${moeda(l.fatura.valorLiquido)}`;
  dados.push(
    outrasNotas.length > 0
      ? `${sobreFatura} · cita também ${juntar(outrasNotas.map((n) => `${n.numeroEmpenho}${n.noContrato ? ' (deste contrato)' : ''}`))}.`
      : `${sobreFatura}.`
  );
  for (const h of l.homonimas) {
    dados.push(`Há também uma ${l.numeroEmpenho} da UG ${h.uasgEmitente}${h.credorNome ? `, de ${h.credorNome}` : ''}, sem relação com esta.`);
  }

  // O que a OB diz: qual nota pagou a fatura. Vem por último nos dados e, havendo nota certa neste contrato, abre o "o que fazer".
  for (const o of pagamento?.obs ?? []) {
    if (o.notas.length === 0) continue;
    const cita = o.notas.some((n) => chaveDaNota(n) === chaveDaNota(l.numeroEmpenho));
    dados.push(`A OB ${o.numero}${o.emissao ? ` (${data(o.emissao)})` : ''} pagou esta fatura com ${juntar(o.notas)}${cita ? ', e a nota citada está entre elas' : ''}.`);
  }
  const troca = trocaSugeridaPelaOb(l, pagamento);
  if (troca.length > 0) {
    fazer.unshift({
      se: `A OB pagou esta fatura com ${juntar(troca)}, que ${troca.length === 1 ? 'está' : 'estão'} neste contrato:`,
      faca: `na fatura ${numeroFatura}, troque a ${l.numeroEmpenho} por ${troca.length === 1 ? 'ela' : 'elas'}.`
    });
  }
  return { frase, fazer, dados };
}
