import type { ContratoFiscalizacao, SituacaoFiscalizacao } from '../services/fiscalizacaoService';

/** Nome do setor nas telas (decisão de 10/11/2026). */
export const NOME_SFC = 'SFC/CGLIC';

export const ROTULO_SITUACAO: Record<SituacaoFiscalizacao, string> = {
  A_DEFINIR: 'A definir',
  SFC: 'SFC/CGLIC',
  MISTA: 'Mista',
  AREA: 'Área requisitante',
  AREA_PADRAO: 'Área requisitante'
};

/** Trilho da Distribuição: a decisão de quem fiscaliza (Área requisitante junta a decisão e o padrão). */
export type SegmentoDistribuicao = 'A_DEFINIR' | 'SFC' | 'MISTA' | 'AREA' | 'TODOS';

export function segmentoDoContrato(c: Pick<ContratoFiscalizacao, 'situacao'>): Exclude<SegmentoDistribuicao, 'TODOS'> {
  return c.situacao === 'AREA_PADRAO' ? 'AREA' : c.situacao;
}

/** A área requisitante fiscaliza o contrato, todo ou em parte? */
export function comArea(c: Pick<ContratoFiscalizacao, 'situacao'>): boolean {
  return c.situacao === 'AREA' || c.situacao === 'AREA_PADRAO' || c.situacao === 'MISTA';
}

/** Valor do filtro "Unidade" para contrato com a área requisitante e sem unidade indicada. */
export const UNIDADE_A_INDICAR = '__a_indicar__';

/** Unidade interna do contrato com a área requisitante: a indicada; sem indicação, a única da divisão do contrato. */
export function unidadeDaArea(c: Pick<ContratoFiscalizacao, 'situacao' | 'unidadeArea' | 'unidadesDoContrato'>): string | null {
  if (!comArea(c)) return null;
  if (c.unidadeArea) return c.unidadeArea;
  return c.unidadesDoContrato?.length === 1 ? c.unidadesDoContrato[0] : null;
}

/** A unidade veio da divisão do contrato (sugestão), não de uma decisão do coordenador? */
export function unidadeSugerida(c: Pick<ContratoFiscalizacao, 'unidadeArea'>): boolean {
  return !c.unidadeArea;
}

export function comSfc(c: Pick<ContratoFiscalizacao, 'situacao'>): boolean {
  return c.situacao === 'SFC' || c.situacao === 'MISTA';
}

/** O contrato é de emenda (há linha de pedido de emenda ligada a ele)? */
export function deEmenda(c: Pick<ContratoFiscalizacao, 'emendas'>): boolean {
  return c.emendas.length > 0;
}

/** Decisão que foge do padrão pede motivo: emenda com a área requisitante, ou contrato sem emenda com a SFC/CGLIC. */
export function decisaoPedeMotivo(c: Pick<ContratoFiscalizacao, 'emendas'>, decisao: 'SFC' | 'MISTA' | 'AREA'): boolean {
  return deEmenda(c) ? decisao === 'AREA' : decisao !== 'AREA';
}

/** Sugestão ao abrir a janela: a decisão que já existe ou o padrão (emenda = SFC/CGLIC). */
export function decisaoSugerida(c: Pick<ContratoFiscalizacao, 'situacao' | 'emendas'>): 'SFC' | 'MISTA' | 'AREA' {
  if (c.situacao === 'SFC' || c.situacao === 'MISTA' || c.situacao === 'AREA') return c.situacao;
  return deEmenda(c) ? 'SFC' : 'AREA';
}

export const MOTIVO_MINIMO = 10;

/** O usuário é o fiscal do contrato? */
export function ehDoFiscal(c: Pick<ContratoFiscalizacao, 'fiscalUserId'>, userId: string | null | undefined): boolean {
  return Boolean(userId) && c.fiscalUserId === userId;
}

/** Autuado = tem o Processo SEI de acompanhamento contratual (migration 294); o SEI do contrato não basta. */
export function autuado(c: Pick<ContratoFiscalizacao, 'processoNup'>): boolean {
  return Boolean(c.processoNup);
}

/** O que falta no contrato com a SFC/CGLIC: a autuação do Processo SEI (a portaria saiu em 12/11/2026). */
export interface PendenciaFiscalizacao {
  chave: string;
  tipo: 'AUTUAR';
  contrato: ContratoFiscalizacao;
}

export function pendenciasDoContrato(c: ContratoFiscalizacao): PendenciaFiscalizacao[] {
  if (!comSfc(c)) return [];
  const p: PendenciaFiscalizacao[] = [];
  if (!autuado(c)) p.push({ chave: `${c.contractKey}:AUTUAR`, tipo: 'AUTUAR', contrato: c });
  return p;
}

export interface CargaDoFiscal {
  userId: string;
  nome: string;
  /** Perfil quando não é o de Gestor de Fiscalização (ex.: "Coordenador"): etiqueta no cartão. */
  outroPerfil?: string;
  contratos: number;
  aAutuar: number;
}

/** Servidor ativo que pode aparecer como fiscal; `perfil` vem da lista de usuários (gestor_fiscalizacao, coordenador…). */
export interface ServidorFiscal {
  id: string;
  nome: string;
  perfil?: string;
}

export const PERFIL_FISCAL = 'gestor_fiscalizacao';

/** Pode receber contratos como fiscal: Gestor de Fiscalização ou Coordenador (o banco confere o mesmo). */
export function podeSerFiscal(perfil: string | undefined): boolean {
  return perfil === undefined || perfil === PERFIL_FISCAL || perfil === 'coordenador';
}

/**
 * Quem aparece como fiscal nas telas: todo Gestor de Fiscalização (mesmo sem contrato, para o rodapé "Sem carteira")
 * e qualquer outro servidor ativo que tenha contrato como fiscal — quem tem carteira aparece, seja qual for o perfil.
 */
export function fiscaisVisiveis<T extends ServidorFiscal>(servidores: T[], idsComTrabalho: ReadonlySet<string>): T[] {
  return servidores.filter((s) => s.perfil === undefined || s.perfil === PERFIL_FISCAL || idsComTrabalho.has(s.id));
}

/** Ids dos fiscais com contrato da SFC/CGLIC (ou fiscalização mista). */
export function idsDosFiscaisComContrato(contratos: ContratoFiscalizacao[]): Set<string> {
  return new Set(contratos.filter((c) => comSfc(c) && c.fiscalUserId).map((c) => c.fiscalUserId as string));
}

/** Contratos por fiscal, com os que faltam autuar. */
export function cargaPorFiscal(contratos: ContratoFiscalizacao[], servidores: ServidorFiscal[], rotuloDoPerfil: (perfil: string) => string = rotuloPadraoDoPerfil): CargaDoFiscal[] {
  return fiscaisVisiveis(servidores, idsDosFiscaisComContrato(contratos))
    .map((f) => {
      const titular = contratos.filter((c) => comSfc(c) && c.fiscalUserId === f.id);
      return {
        userId: f.id,
        nome: f.nome,
        ...(f.perfil && f.perfil !== PERFIL_FISCAL ? { outroPerfil: rotuloDoPerfil(f.perfil) } : {}),
        contratos: titular.length,
        aAutuar: titular.filter((c) => !autuado(c)).length
      };
    })
    .sort((a, b) => b.contratos - a.contratos || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type RelacaoComEquipe = 'ACIMA' | 'NA_MEDIA' | 'ABAIXO';
export const ROTULO_RELACAO_EQUIPE: Record<RelacaoComEquipe, string> = { ACIMA: 'Acima da média', NA_MEDIA: 'Na média', ABAIXO: 'Abaixo da média' };

/** Mesma capacidade do coordenador na Distribuição de Atas e Contratos (nivelGestor.ts, CAPACIDADE_COORDENADOR). */
export const CAPACIDADE_COORDENADOR_FISCAL = 0.5;

export interface OcupacaoDoFiscal {
  /** Contratos ÷ capacidade (Coordenador: metade). */
  ocupacao: number;
  /** `null` para quem fica fora da média (outro perfil que não Coordenador, ou equipe com menos de 2). */
  relacao: RelacaoComEquipe | null;
}

/**
 * Média da equipe de fiscais, na mesma conta da Distribuição de Atas e Contratos: ocupação = contratos ÷ capacidade
 * (a fiscalização não tem peso de complexidade nem nível). Gestor de Fiscalização vale 100%; Coordenador entra com
 * metade (divide o tempo com a coordenação); outro perfil (ex.: Gestor) aparece mas fica fora da média. Faixa ±25%.
 */
export function mediaDaEquipeFiscal(carga: CargaDoFiscal[]): { media: number | null; porFiscal: Map<string, OcupacaoDoFiscal> } {
  const capacidade = (f: CargaDoFiscal) => (!f.outroPerfil ? 1 : f.outroPerfil === 'Coordenador' ? CAPACIDADE_COORDENADOR_FISCAL : null);
  const porFiscal = new Map<string, OcupacaoDoFiscal>();
  for (const f of carga) {
    const c = capacidade(f);
    porFiscal.set(f.userId, { ocupacao: c ? f.contratos / c : f.contratos, relacao: null });
  }
  const naConta = carga.filter((f) => f.contratos > 0 && capacidade(f) !== null);
  if (naConta.length < 2) return { media: null, porFiscal };
  const media = naConta.reduce((s, f) => s + (porFiscal.get(f.userId) as OcupacaoDoFiscal).ocupacao, 0) / naConta.length;
  for (const f of naConta) {
    const o = porFiscal.get(f.userId) as OcupacaoDoFiscal;
    o.relacao = o.ocupacao > media * 1.25 ? 'ACIMA' : o.ocupacao < media * 0.75 ? 'ABAIXO' : 'NA_MEDIA';
  }
  return { media, porFiscal };
}

function rotuloPadraoDoPerfil(perfil: string): string {
  if (perfil === 'coordenador') return 'Coordenador';
  if (perfil === 'gestor') return 'Gestor';
  if (perfil === 'consulta') return 'Consulta';
  return perfil;
}

/** "00055/2026" a partir da chave 200331-00055-2026 quando o número não veio. */
export function numeroDoContrato(c: Pick<ContratoFiscalizacao, 'numero' | 'contractKey'>): string {
  if (c.numero) return c.numero;
  const m = /^\d{6}-(\d+)-(\d{4})$/.exec(c.contractKey);
  return m ? `${m[1]}/${m[2]}` : c.contractKey;
}

/** Hoje em Brasília, AAAA-MM-DD (as RPCs conferem "até hoje" no fuso de Brasília). */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Contrato 360 aberto na aba Fiscalização. */
export const rotaDoContrato = (c: Pick<ContratoFiscalizacao, 'contractKey'>) => `/contratos/${encodeURIComponent(c.contractKey)}?aba=fiscalizacao`;

/** Carga de uma unidade interna como área requisitante (aba Equipe da Distribuição); sigla nula = unidade a indicar. */
export interface CargaDaArea {
  sigla: string | null;
  toda: number;
  mista: number;
  /** Contratos em que a unidade veio da divisão do contrato, sem decisão do coordenador. */
  pelaDivisao: number;
}

export function cargaPorArea(contratos: ContratoFiscalizacao[]): CargaDaArea[] {
  const mapa = new Map<string | null, CargaDaArea>();
  for (const c of contratos) {
    if (!comArea(c)) continue;
    const sigla = unidadeDaArea(c);
    const a = mapa.get(sigla) ?? { sigla, toda: 0, mista: 0, pelaDivisao: 0 };
    if (c.situacao === 'MISTA') a.mista += 1; else a.toda += 1;
    if (sigla && unidadeSugerida(c)) a.pelaDivisao += 1;
    mapa.set(sigla, a);
  }
  return [...mapa.values()].sort((x, y) => (x.sigla === null ? 1 : y.sigla === null ? -1 : y.toda + y.mista - (x.toda + x.mista)));
}
