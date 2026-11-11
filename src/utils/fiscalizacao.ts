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

/** O que falta no contrato com a SFC/CGLIC nesta entrega: portaria e autuação do processo. */
export interface PendenciaFiscalizacao {
  chave: string;
  tipo: 'AUTUAR' | 'PORTARIA';
  contrato: ContratoFiscalizacao;
}

export function pendenciasDoContrato(c: ContratoFiscalizacao): PendenciaFiscalizacao[] {
  if (!comSfc(c)) return [];
  const p: PendenciaFiscalizacao[] = [];
  if (!c.processoSei) p.push({ chave: `${c.contractKey}:AUTUAR`, tipo: 'AUTUAR', contrato: c });
  if (!c.portariaSei) p.push({ chave: `${c.contractKey}:PORTARIA`, tipo: 'PORTARIA', contrato: c });
  return p;
}

export interface CargaDoFiscal {
  userId: string;
  nome: string;
  contratos: number;
  aAutuar: number;
  /** Contratos do fiscal sem portaria registrada. */
  semPortaria: number;
}

/** Contratos por fiscal, com os que faltam autuar e os sem portaria. */
export function cargaPorFiscal(contratos: ContratoFiscalizacao[], fiscais: Array<{ id: string; nome: string }>): CargaDoFiscal[] {
  return fiscais
    .map((f) => {
      const titular = contratos.filter((c) => comSfc(c) && c.fiscalUserId === f.id);
      return {
        userId: f.id,
        nome: f.nome,
        contratos: titular.length,
        aAutuar: titular.filter((c) => !c.processoSei).length,
        semPortaria: titular.filter((c) => !c.portariaSei).length
      };
    })
    .sort((a, b) => b.contratos - a.contratos || a.nome.localeCompare(b.nome, 'pt-BR'));
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
