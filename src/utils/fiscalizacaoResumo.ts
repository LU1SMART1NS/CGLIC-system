// Contas das listas e telas 360 da Fiscalização (Contratos, Beneficiários, Programas), a partir dos itens.
import type { EntregaFiscalizacao, OrigemDoRecurso } from '../services/fiscalizacaoService';
import { etapaDef, foiEntregue, itemConcluido, ordemDaEtapa, prazoDaEntrega, rotuloDoBeneficiario, type FaseEntrega, type TomPrazo, nomeDoItem } from './fiscalizacaoEntregas';

const ORDEM_DA_FASE: FaseEntrega[] = ['PREPARACAO', 'EXECUCAO', 'RECEBIMENTO', 'PAGAMENTO', 'FINALIZADO'];
const somar = (es: EntregaFiscalizacao[]) => es.reduce((t, e) => t + e.quantidade, 0);

export interface Resumo {
  entregas: number;
  unidades: number;
  /** Unidades que a SFC/CGLIC acompanha (a área requisitante fica de fora do percentual). */
  acompanhadas: number;
  entregues: number;
  andamento: number;
  semInicio: number;
  area: number;
  vencidas: number;
  proxima: { texto: string; tom: TomPrazo; dias: number | null } | null;
  /** Fase que segura o conjunto: a menos adiantada entre as entregas da SFC/CGLIC que não acabaram (Ofício à SAL ou Finalizado). */
  fase: FaseEntrega | null;
  etapas: number;
  noExercito: number;
}

export function resumir(es: EntregaFiscalizacao[]): Resumo {
  const sfc = es.filter((e) => e.responsavel === 'SFC');
  const entregues = sfc.filter(foiEntregue);
  const semInicio = sfc.filter((e) => ordemDaEtapa(e.etapa) < ordemDaEtapa('ORDEM'));
  const abertas = sfc.filter((e) => !foiEntregue(e));
  const prazos = abertas.map((e) => prazoDaEntrega(e)).filter((p) => p.dias != null).sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
  const fases = sfc.filter((e) => !itemConcluido(e)).map((e) => etapaDef(e.etapa).fase);
  const fase = sfc.length === 0 ? null : fases.length === 0 ? 'FINALIZADO' : ORDEM_DA_FASE.find((f) => fases.includes(f)) ?? null;
  return {
    entregas: es.length,
    unidades: somar(es),
    acompanhadas: somar(sfc),
    entregues: somar(entregues),
    semInicio: somar(semInicio),
    andamento: somar(sfc) - somar(entregues) - somar(semInicio),
    area: somar(es.filter((e) => e.responsavel === 'AREA')),
    vencidas: abertas.filter((e) => prazoDaEntrega(e).tom === 'danger').length,
    proxima: prazos[0] ?? null,
    fase,
    etapas: new Set(sfc.map((e) => e.etapa)).size,
    noExercito: abertas.filter((e) => e.etapa === 'CONTROLADO').length
  };
}

/**
 * Contratos com a fiscalização encerrada: têm itens da SFC/CGLIC e todos chegaram ao fim (Ofício à SAL ou Finalizado),
 * a mesma regra do trilho Finalizados das abas Contratos e Itens. Saem das contas e pendências do Painel.
 */
export function contratosFinalizados(es: EntregaFiscalizacao[]): Set<string> {
  const fim = new Set<string>();
  for (const [chave, doContrato] of agrupar(es.filter((e) => e.responsavel === 'SFC'), (e) => e.contractKey)) {
    if (doContrato.every(itemConcluido)) fim.add(chave);
  }
  return fim;
}

export function agrupar<K>(es: EntregaFiscalizacao[], chave: (e: EntregaFiscalizacao) => K): Map<K, EntregaFiscalizacao[]> {
  const m = new Map<K, EntregaFiscalizacao[]>();
  for (const e of es) {
    const k = chave(e);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return m;
}

/** Beneficiário pelo cadastro; o da planilha sem cadastro fica pelo nome escrito (cada grafia vira uma linha). */
export const chaveDoBeneficiario = (e: EntregaFiscalizacao) => (e.beneficiarioId ? e.beneficiarioId : `planilha:${e.beneficiarioTexto ?? '—'}`);
export const semCadastro = (e: EntregaFiscalizacao) => !e.beneficiarioId;
export const nomeDoBeneficiario = (e: EntregaFiscalizacao) => (e.beneficiarioNome ? rotuloDoBeneficiario(e).principal : e.beneficiarioTexto ?? 'Destinatário a informar');
export const rotaDoBeneficiario = (chave: string) => `/fiscalizacao/beneficiarios/${encodeURIComponent(chave)}`;
export const rotaDoPrograma = (id: string) => `/fiscalizacao/programas/${id}`;
export const numero = (n: number) => n.toLocaleString('pt-BR');
export const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);

export const contratosDe = (es: EntregaFiscalizacao[]) => [...new Set(es.map((e) => e.contratoNumero))];
export const ufsDe = (es: EntregaFiscalizacao[]) => [...new Set(es.map((e) => e.uf).filter((u): u is string => Boolean(u)))].sort();
export const programasDe = (es: EntregaFiscalizacao[]) => [...new Set(es.map((e) => e.programaTexto).filter((p): p is string => Boolean(p)))];
export const qtdTexto = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
export const diasAte = (data: string, hoje: string) => Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 864e5);
/** Filtro Prazo das listas de conjuntos (beneficiário, programa): com item vencido, vencendo em 30 dias, ou em dia. */
export const passaPrazo = (r: Resumo, filtro: string) => !filtro || (filtro === 'danger' ? r.vencidas > 0 : filtro === 'warning' ? r.vencidas === 0 && r.proxima?.tom === 'warning' : r.vencidas === 0 && r.proxima?.tom !== 'warning');

/** Ordena a situação pelo prazo: vencidos (mais antigos) primeiro, depois os que vencem, por fim entregues e área. */
export const ordemDaSituacao = (e: EntregaFiscalizacao): number => {
  if (e.responsavel === 'AREA') return 1e9;
  if (e.entregueEm) return 1e8 + ordemDaEtapa(e.etapa);
  return prazoDaEntrega(e).dias ?? 1e7;
};
/** Número de contrato (00055/2026) em ordem de ano e número. */
export const chaveDeOrdem = (numero: string) => { const [n, a] = numero.split('/'); return `${a ?? ''}-${(n ?? '').padStart(6, '0')}`; };


/** Os dois itens com mais unidades ("70× nome") e quantos sobram. */
export const textoQuantidade = (es: EntregaFiscalizacao[]) => {
  const itens = [...agrupar(es, nomeDoItem).entries()].map(([nome, l]) => ({ nome, qtd: l.reduce((t, e) => t + e.quantidade, 0) })).sort((a, b) => b.qtd - a.qtd);
  const corta = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);
  return { primeiros: itens.slice(0, 2).map((i) => `${numero(i.qtd)}× ${corta(i.nome)}`), resto: Math.max(0, itens.length - 2), total: itens.length };
};

/** Contratado: os dois itens maiores e, numa linha, o total de itens, unidades e contratos (sem "e mais N"). */

/** Opções do filtro Prazo das listas de conjuntos. */
export const opcoesDePrazo = (contar: (t: TomPrazo) => number) => [
  { value: 'danger', label: 'Com entrega vencida', count: contar('danger') },
  { value: 'warning', label: 'Vence em 30 dias', count: contar('warning') },
  { value: 'neutral', label: 'No prazo ou sem data', count: contar('neutral') }
];

/** Origem do recurso do programa (migration 265): rótulos do cadastro. */
export const ROTULO_ORIGEM: Record<OrigemDoRecurso, string> = {
  EMENDA: 'Emenda parlamentar',
  FNSP: 'Fundo Nacional de Segurança Pública (FNSP)',
  FUNDO: 'BNDES',
  OUTRO: 'Outro'
};

/**
 * Inclui e retira do programa pelas marcas da janela: o que foi marcado e não estava entra; o que estava e foi desmarcado
 * sai. Item de outro programa nunca entra na conta (a janela não deixa marcar).
 */
export function mudancasDoPrograma(antes: ReadonlySet<string>, depois: ReadonlySet<string>): { incluir: string[]; retirar: string[] } {
  return { incluir: [...depois].filter((id) => !antes.has(id)), retirar: [...antes].filter((id) => !depois.has(id)) };
}

/** Endereço de entrega do cadastro do beneficiário (migration 265): rua, número e complemento; bairro e CEP embaixo. */
export function enderecoDeEntrega(e: Pick<EntregaFiscalizacao, 'entregaLogradouro' | 'entregaNumero' | 'entregaComplemento' | 'entregaBairro' | 'entregaCep' | 'municipio' | 'uf'>): { rua: string | null; detalhe: string } {
  const rua = e.entregaLogradouro ? [e.entregaLogradouro, e.entregaNumero, e.entregaComplemento].filter(Boolean).join(', ') : null;
  const cidade = e.municipio ? `${e.municipio}/${e.uf ?? ''}`.replace(/\/$/, '') : e.uf ?? '';
  const cep = e.entregaCep ? `CEP ${e.entregaCep.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : '';
  return { rua, detalhe: [e.entregaBairro, cidade, cep].filter(Boolean).join(' · ') || '—' };
}
