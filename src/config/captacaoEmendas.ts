/**
 * Captação principal das Emendas (migration 218): de qual grupo é cada beneficiário e a fatia de cada grupo no valor
 * dos pedidos, como a coluna "Interesse principal" das carteiras de Atas e Itens (gruposGti.ts).
 *
 * Grupos aprovados em 27/10/2026: os cinco GTIs, o CNGM (guardas e secretarias municipais de segurança) e "Outros"
 * (Polícia Penal e o que não é dos conselhos). Sem grupo "Distrital": PMDF, PCDF e CBMDF ficam no conselho da força.
 * O sistema sugere pelo nome, pela sigla e pela natureza jurídica da Receita; vale só o grupo confirmado.
 * A fatia é pelo valor das linhas (quantidade × preço previsto, kits abertos); linha sem beneficiário fica fora.
 */
import {
  GRUPOS_GTI,
  MODO_FILTRO_GTI_LABEL,
  MODO_FILTRO_GTI_VALUES,
  resumirFatias,
  type FatiasDaAta,
  type GrupoDaFatia,
  type GrupoPrincipal,
  type ModoFiltroGti
} from './gruposGti';
import type { BeneficiarioEmenda, ItemCaep, PedidoEmenda } from '../services/emendasService';
import type { PrecoPrevisto } from '../services/emendasQuadroService';
import { linhasAtivas, valorDaLinha } from '../utils/emendasPedidos';

/** Grupos que podem ser a captação principal (filtro e contagem). */
export const GRUPOS_CAPTACAO: readonly GrupoPrincipal[] = [...GRUPOS_GTI, 'CNGM'];
/** Grupo que se confirma para o beneficiário. */
export type GrupoBeneficiario = GrupoPrincipal | 'OUTROS';
export const GRUPOS_BENEFICIARIO: readonly GrupoBeneficiario[] = [...GRUPOS_CAPTACAO, 'OUTROS'];

export const ehGrupoBeneficiario = (v: unknown): v is GrupoBeneficiario =>
  typeof v === 'string' && (GRUPOS_BENEFICIARIO as readonly string[]).includes(v);

/** Os modos do filtro, com o padrão chamado "Captação principal". */
export const MODO_CAPTACAO_LABEL: Record<ModoFiltroGti, string> = { ...MODO_FILTRO_GTI_LABEL, PRINCIPAL: 'Captação principal' };

/** Grupo confirmado de um beneficiário (tabela emenda_beneficiario_grupo). */
export interface GrupoConfirmadoBeneficiario {
  beneficiarioId: string;
  grupo: GrupoBeneficiario;
  confirmadoPorNome: string | null;
  confirmadoEm: string | null;
}

// ------------------------------------------------------------------------------
// Sugestão
// ------------------------------------------------------------------------------

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/**
 * Regras na ordem em que valem. Medição de 27/10/2026 (549 beneficiários): os nomes são de unidades (delegacias,
 * batalhões, pelotões), não de órgãos, por isso a regra é outra que a das UASGs.
 */
const REGRAS: Array<[GrupoBeneficiario, RegExp]> = [
  // A guarda externa dos presídios é batalhão da PM, não Polícia Penal.
  ['CNCG', /GUARDA EXTERNA/],
  ['OUTROS', /POLICIA PENAL|PRESIDIO|PENITENC|PRISIONAL|\bPP-/],
  ['LIGABOM', /BOMBEIRO|\bCBM|\bGBM|\bSBM|\bBBM|DEFESA CIVIL/],
  ['CONDPCI', /CIENTIF|PERICIA|CRIMINALIST|MEDICINA LEGAL|\bIML\b|IDENTIFICACAO/],
  ['CNPC', /DELEGACIA|DISTRITO POLICIAL|POLICIA CIVIL|\bDP\b|\bDDM\b|\bDIG\b|DEIC|DEINTER|DENARC|DHPP|\bPC[A-Z]{2}\b|ANTISSEQUESTRO|\bGARRA\b/],
  ['CNCG', /BATALHAO|COMPANHIA|PELOTAO|POLICIA MILITAR|\bBPM|\bCPM|\bBOPE\b|\bBAEP\b|\bPM[A-Z]{0,2}\b|POLICIAMENTO|RONDA|CHOQUE|\bCIA\b/]
];
const SEGURANCA = /SEGURANCA|DEFESA SOCIAL|\bSSP|\bSESP|\bSEJUSP|\bSSPDS/;

/**
 * Grupo sugerido para o beneficiário, ou null quando nada indica. É só sugestão: vale o que a CAEP ou o coordenador
 * confirmar. Município (natureza jurídica, prefeitura ou guarda) vai para o CNGM; secretaria de segurança sem
 * "Estado" no nome também (ex.: Secretaria de Segurança Pública de Cascavel, sem CNPJ na base).
 */
export function sugerirGrupoBeneficiario(b: Pick<BeneficiarioEmenda, 'nome' | 'sigla' | 'naturezaJuridica'>): GrupoBeneficiario | null {
  const texto = semAcento(`${b.sigla ?? ''} | ${b.nome ?? ''}`);
  if (/MUNIC/i.test(b.naturezaJuridica ?? '') || /MUNICIPAL|PREFEITURA|GUARDA CIVIL/.test(texto)) return 'CNGM';
  for (const [grupo, regra] of REGRAS) if (regra.test(texto)) return grupo;
  if (SEGURANCA.test(texto)) return /ESTADO|DISTRITO FEDERAL/.test(texto) ? 'CONSESP' : 'CNGM';
  return null;
}

export type SituacaoGrupoBeneficiario = 'A_CONFIRMAR' | 'SEM_SUGESTAO' | 'CONFIRMADOS';

export const situacaoGrupoBeneficiario = (grupo: GrupoBeneficiario | null, sugestao: GrupoBeneficiario | null): SituacaoGrupoBeneficiario =>
  grupo ? 'CONFIRMADOS' : sugestao ? 'A_CONFIRMAR' : 'SEM_SUGESTAO';

// ------------------------------------------------------------------------------
// Fatias
// ------------------------------------------------------------------------------

/** Fatia de um grupo com os beneficiários e o valor de cada um (gaveta do pedido). */
export interface BeneficiariosDaFatia {
  grupo: GrupoDaFatia;
  beneficiarios: Array<{ id: string; valor: number }>;
}

/**
 * Fatias da captação de um ou mais pedidos (a linha da lista, o parlamentar ou a emenda), pelo valor das linhas
 * ativas. Beneficiário sem grupo confirmado entra como "a confirmar"; linha sem beneficiário fica fora.
 * `orgaos` das fatias = quantos beneficiários.
 */
export function fatiasDaCaptacao(
  pedidos: PedidoEmenda[],
  grupos: Map<string, GrupoBeneficiario>,
  itens: Map<string, ItemCaep>,
  precos?: Map<string, PrecoPrevisto>
): FatiasDaAta & { porBeneficiario: BeneficiariosDaFatia[] } {
  const porGrupo = new Map<GrupoDaFatia, Map<string, number>>();
  for (const p of pedidos) {
    if (p.etapa === 'CANCELADO') continue;
    for (const l of linhasAtivas(p)) {
      if (!l.beneficiarioId) continue;
      const g: GrupoDaFatia = grupos.get(l.beneficiarioId) ?? 'A_CONFIRMAR';
      const m = porGrupo.get(g) ?? new Map<string, number>();
      m.set(l.beneficiarioId, (m.get(l.beneficiarioId) ?? 0) + valorDaLinha(l, itens, precos));
      porGrupo.set(g, m);
    }
  }
  const resumo = resumirFatias(
    [...porGrupo].map(([grupo, m]) => ({ grupo, quantidade: [...m.values()].reduce((s, v) => s + v, 0), orgaos: m.size }))
  );
  const porBeneficiario = resumo.fatias.map((f) => ({
    grupo: f.grupo,
    beneficiarios: [...(porGrupo.get(f.grupo) ?? new Map<string, number>())].map(([id, valor]) => ({ id, valor })).sort((a, b) => b.valor - a.valor)
  }));
  return { ...resumo, medida: 'VALOR', porBeneficiario };
}

/** Mapa beneficiário → grupo confirmado. */
export const mapaDeGrupos = (lista: GrupoConfirmadoBeneficiario[] | null | undefined): Map<string, GrupoBeneficiario> =>
  new Map((lista ?? []).map((g) => [g.beneficiarioId, g.grupo]));

// ------------------------------------------------------------------------------
// Filtro na URL (?captacao=&captacaoConta=), o mesmo nas três visões de Pedidos
// ------------------------------------------------------------------------------

export const lerFiltroCaptacao = (v: string | null): GrupoPrincipal | 'TODOS' =>
  v && (GRUPOS_CAPTACAO as readonly string[]).includes(v) ? (v as GrupoPrincipal) : 'TODOS';
export const lerModoCaptacao = (v: string | null): ModoFiltroGti =>
  v && (MODO_FILTRO_GTI_VALUES as readonly string[]).includes(v) ? (v as ModoFiltroGti) : 'PRINCIPAL';
