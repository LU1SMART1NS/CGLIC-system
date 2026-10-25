/**
 * Grupos de Trabalho Integrados (GTI) do ComprasSUSP e a fatia de cada um nas atas (migration 139).
 *
 * O Compras.gov.br não diz de qual força é a UASG: o sistema sugere pelo nome da UASG e pela sigla do órgão,
 * e o coordenador confirma em Ajustes › Grupos das UASGs. Só o grupo confirmado entra nas fatias.
 * No item, a fatia é a quantidade registrada dos órgãos participantes somada por grupo; na ata (vários itens),
 * é o valor dessa quantidade (quantidade × valor unitário de cada item, migration 141), porque unidades de itens
 * diferentes não se comparam. Fora da conta: a SENASP, a gerenciadora e as adesões. Protótipo aprovado em
 * 15/10/2026: o filtro padrão é o "interesse principal" (maior fatia).
 */

export const GRUPOS_GTI = ['LIGABOM', 'CNCG', 'CNPC', 'CONDPCI', 'CONSESP'] as const;
export type GrupoGti = (typeof GRUPOS_GTI)[number];
/** Grupo que o coordenador pode confirmar: os cinco GTIs ou "Outros" (fora deles). */
export type GrupoConfirmavel = GrupoGti | 'OUTROS';
/** Grupo de uma fatia: o confirmado ou "a confirmar". */
export type GrupoDaFatia = GrupoConfirmavel | 'A_CONFIRMAR';

export const GRUPOS_CONFIRMAVEIS: readonly GrupoConfirmavel[] = [...GRUPOS_GTI, 'OUTROS'];
const ORDEM_FATIA: readonly GrupoDaFatia[] = [...GRUPOS_CONFIRMAVEIS, 'A_CONFIRMAR'];

export const GRUPO_GTI_INFO: Record<GrupoDaFatia, { rotulo: string; curto: string; descricao: string; cor: string }> = {
  LIGABOM: { rotulo: 'LIGABOM', curto: 'LIGABOM', descricao: 'Corpos de Bombeiros', cor: 'var(--gti-ligabom)' },
  CNCG: { rotulo: 'CNCG', curto: 'CNCG', descricao: 'Polícias Militares', cor: 'var(--gti-cncg)' },
  CNPC: { rotulo: 'CNPC', curto: 'CNPC', descricao: 'Polícias Civis', cor: 'var(--gti-cnpc)' },
  CONDPCI: { rotulo: 'CONDPCI', curto: 'CONDPCI', descricao: 'Polícias Científicas', cor: 'var(--gti-condpci)' },
  CONSESP: { rotulo: 'CONSESP', curto: 'CONSESP', descricao: 'Secretarias de Segurança Pública', cor: 'var(--gti-consesp)' },
  OUTROS: { rotulo: 'Outros', curto: 'Outros', descricao: 'Fora dos cinco GTIs', cor: 'var(--gti-outros)' },
  A_CONFIRMAR: { rotulo: 'A confirmar', curto: 'A confirmar', descricao: 'Grupo da UASG ainda não confirmado', cor: 'var(--gti-a-confirmar)' }
};

const ehGti = (v: string): v is GrupoGti => (GRUPOS_GTI as readonly string[]).includes(v);

export function ehGrupoConfirmavel(v: unknown): v is GrupoConfirmavel {
  return typeof v === 'string' && (GRUPOS_CONFIRMAVEIS as readonly string[]).includes(v);
}

// ------------------------------------------------------------------------------
// Sugestão
// ------------------------------------------------------------------------------

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Polícias e órgãos federais: fora dos cinco GTIs, mesmo quando o nome fala em "perícia" ou "polícia". */
const FEDERAL = /\bDPF\b|\bDPRF\b|\bPRF\b|POLICIA FEDERAL|P\. ?FEDERAL|POL\.? RODO?V\.? FED|RODOVIARIA FEDERAL|\bDEPEN\b|\bMJ\b/;
const REGRAS: Array<[GrupoGti, RegExp]> = [
  ['LIGABOM', /BOMB|\bCBM|DEFESA CIVIL/],
  ['CONDPCI', /CIENTIF|PERICIA|PERITO|CRIMINALISTICA|MEDICINA LEGAL|\bIGP\b|POLITEC|\bIML\b|INSTITUTO DE IDENTIFICACAO/],
  ['CNPC', /POLICIA CIVIL|POL\.? ?CIV|POLIC\.? ?CIV|DELEGACIA GERAL|\bPC[A-Z]{2}\b|^PC\b/],
  ['CNCG', /POLICIA MILITAR|POL\.? ?MILIT|BRIGADA MILITAR|\bPM\b|\bPM[A-Z]{2}\b|POLICIAMENTO|POLICIA RODOVIARIA/],
  ['CONSESP', /SEGURANCA|SEG\.? ?PUB|SEG\.? ?DEF|DEFESA SOCIAL|DEF\.? ?SOC|\bSSP\b|\bSESP\b|\bSEJUSP\b|\bSEDS\b|\bSESDEC\b|\bSSPDS\b|SEC\.? ?S\.? ?PUBL/]
];
const FORA = /MUNICIPAL|MUNIC\.|PREFEITURA|CAMARA|UNIVERSIDADE|UNIV\.|\bINST\.? ?FED|INSTITUTO FEDERAL|\bIF\b|\bUF[A-Z]{1,3}\b|TRIBUNAL|JUSTICA FEDERAL|EXERCITO|MARINHA|AERONAUTICA|BATALHAO DE|COMANDO DA|RECEITA FEDERAL|PENIT|PRISIONAL|RESSOCIALIZ|DETRAN|TRANSITO|SAUDE|EDUCACAO|\bMUN\b|SENADO|AGENCIA NACIONAL|EMBRAPA|\bIFES\b|\bMEC\b|PROCURADORIA|FAZENDA/;

/**
 * Grupo sugerido para a UASG, ou null quando nada no nome e na sigla indica o grupo. É só sugestão: vale o que o
 * coordenador confirmar. Ordem: polícias federais, as cinco forças, depois esfera e nomes de fora (universidade,
 * tribunal, prefeitura...). A força vem antes da esfera porque Bombeiros, PM e PC do DF são da esfera federal.
 */
export function sugerirGrupoGti(nome: string | null | undefined, sigla?: string | null, esfera?: string | null): GrupoConfirmavel | null {
  const texto = semAcento(`${sigla ?? ''} | ${nome ?? ''}`);
  if (!texto.replace(/[|\s]/g, '')) return null;
  if (FEDERAL.test(texto)) return 'OUTROS';
  const municipal = esfera === 'M' || /MUNICIPAL|PREFEITURA/.test(texto);
  for (const [grupo, regra] of REGRAS) {
    // Secretaria federal com "segurança" no nome (ex.: Gabinete de Segurança Institucional) não é do CONSESP.
    if (regra.test(texto)) return municipal || (grupo === 'CONSESP' && esfera === 'F') ? 'OUTROS' : grupo;
  }
  if (municipal || esfera === 'F' || FORA.test(texto)) return 'OUTROS';
  return null;
}

/** Situação da UASG em Ajustes › Grupos das UASGs: confirmada, com sugestão a confirmar ou sem sugestão. */
export type SituacaoGrupoUasg = 'CONFIRMADAS' | 'A_CONFIRMAR' | 'SEM_SUGESTAO';

export function situacaoGrupoUasg(grupo: GrupoConfirmavel | null, sugestao: GrupoConfirmavel | null): SituacaoGrupoUasg {
  return grupo ? 'CONFIRMADAS' : sugestao ? 'A_CONFIRMAR' : 'SEM_SUGESTAO';
}

/** UASGs ainda sem grupo confirmado, separadas em com sugestão (a confirmar) e sem sugestão (número do menu Ajustes). */
export function contarUasgsSemGrupo(
  uasgs: Array<{ nome: string | null; nomeNaAta: string | null; siglaOrgao: string | null; esferaOrgao: string | null; grupo: GrupoConfirmavel | null }>
): { aConfirmar: number; semSugestao: number } {
  const c = { aConfirmar: 0, semSugestao: 0 };
  for (const u of uasgs) {
    const situacao = situacaoGrupoUasg(u.grupo, sugerirGrupoGti(u.nome ?? u.nomeNaAta, u.siglaOrgao, u.esferaOrgao));
    if (situacao === 'A_CONFIRMAR') c.aConfirmar++;
    else if (situacao === 'SEM_SUGESTAO') c.semSugestao++;
  }
  return c;
}

// ------------------------------------------------------------------------------
// Fatias
// ------------------------------------------------------------------------------

export interface LinhaFatiaGti {
  numero_ata: string;
  uasg_gerenciadora: string;
  grupo: string;
  quantidade: number | string;
  orgaos: number;
  /** Quantidade × valor unitário de cada item (migration 141). Ausente antes da migration: vale a quantidade. */
  valor?: number | string | null;
}

export interface FatiaGti {
  grupo: GrupoDaFatia;
  quantidade: number;
  orgaos: number;
  /** Percentual inteiro do total da ata ou do item (0 quando o total é zero). */
  pct: number;
}

export interface FatiasDaAta {
  total: number;
  /** Na ordem dos grupos (LIGABOM … CONSESP, Outros, A confirmar), só os que têm órgãos. */
  fatias: FatiaGti[];
  /** GTI com a maior fatia (empate: o primeiro na ordem). Null sem quantidade em nenhum dos cinco. */
  principal: (FatiaGti & { grupo: GrupoGti }) | null;
  /** Órgãos participantes ainda sem grupo confirmado. */
  orgaosAConfirmar: number;
  /** O que `quantidade` mede: unidades (item) ou valor em R$ (ata, migration 141). Ausente = unidades. */
  medida?: 'UNIDADES' | 'VALOR';
}

/** Chave igual à da carteira: "{numeroAta}-{uasgGerenciadora}". */
export const chaveAtaGti = (numeroAta: string, uasg: string) => `${numeroAta}-${uasg}`;

/** Linha da v_item_gti_fatias: a mesma soma, por item ("{numeroAta}-{uasg}-{00001}"). */
export interface LinhaFatiaItemGti {
  item_key: string;
  grupo: string;
  quantidade: number | string;
  orgaos: number;
}

/** Chave do item igual à da cópia dos órgãos: número do item com 5 dígitos. */
export const chaveItemGti = (numeroAta: string, uasg: string, numeroItem: string | number) =>
  `${numeroAta}-${uasg}-${String(numeroItem).replace(/\D/g, '').padStart(5, '0')}`;

/**
 * Monta as fatias de cada ata a partir das linhas da v_ata_gti_fatias. A fatia da ata é pelo valor (quantidade ×
 * valor unitário de cada item, migration 141): `quantidade` das fatias passa a ser esse valor em R$.
 */
export function montarFatiasGti(linhas: LinhaFatiaGti[]): Map<string, FatiasDaAta> {
  const temValor = (l: LinhaFatiaGti) => l.valor != null && l.valor !== '';
  const porAta = montarFatiasPorChave(
    linhas.map((l) => ({
      chave: chaveAtaGti(l.numero_ata, l.uasg_gerenciadora),
      grupo: l.grupo,
      orgaos: l.orgaos,
      quantidade: temValor(l) ? (l.valor as number | string) : l.quantidade
    }))
  );
  if (linhas.some(temValor)) for (const f of porAta.values()) f.medida = 'VALOR';
  return porAta;
}

/** Monta as fatias de cada item a partir das linhas da v_item_gti_fatias. */
export function montarFatiasItensGti(linhas: LinhaFatiaItemGti[]): Map<string, FatiasDaAta> {
  return montarFatiasPorChave(linhas.map((l) => ({ ...l, chave: l.item_key })));
}

function montarFatiasPorChave(linhas: Array<{ chave: string; grupo: string; quantidade: number | string; orgaos: number }>): Map<string, FatiasDaAta> {
  const porAta = new Map<string, Map<GrupoDaFatia, { quantidade: number; orgaos: number }>>();
  for (const l of linhas) {
    const grupo = (ORDEM_FATIA as readonly string[]).includes(l.grupo) ? (l.grupo as GrupoDaFatia) : 'A_CONFIRMAR';
    const chave = l.chave;
    const grupos = porAta.get(chave) ?? new Map();
    const atual = grupos.get(grupo) ?? { quantidade: 0, orgaos: 0 };
    const q = Number(l.quantidade);
    grupos.set(grupo, { quantidade: atual.quantidade + (Number.isFinite(q) && q > 0 ? q : 0), orgaos: atual.orgaos + (Number(l.orgaos) || 0) });
    porAta.set(chave, grupos);
  }
  const resultado = new Map<string, FatiasDaAta>();
  for (const [chave, grupos] of porAta) {
    resultado.set(chave, resumirFatias([...grupos].map(([grupo, v]) => ({ grupo, ...v }))));
  }
  return resultado;
}

/** Fatias a partir de quantidades por grupo (também usada no item, com os órgãos da aba). */
export function resumirFatias(grupos: Array<{ grupo: GrupoDaFatia; quantidade: number; orgaos: number }>): FatiasDaAta {
  const total = grupos.reduce((s, g) => s + g.quantidade, 0);
  const fatias = grupos
    .filter((g) => g.orgaos > 0)
    .map((g) => ({ ...g, pct: total > 0 ? Math.round((100 * g.quantidade) / total) : 0 }))
    .sort((a, b) => ORDEM_FATIA.indexOf(a.grupo) - ORDEM_FATIA.indexOf(b.grupo));
  let principal: FatiasDaAta['principal'] = null;
  for (const f of fatias) {
    if (!ehGti(f.grupo) || f.quantidade <= 0) continue;
    if (!principal || f.quantidade > principal.quantidade) principal = { ...f, grupo: f.grupo };
  }
  const orgaosAConfirmar = fatias.find((f) => f.grupo === 'A_CONFIRMAR')?.orgaos ?? 0;
  return { total, fatias, principal, orgaosAConfirmar };
}

// ------------------------------------------------------------------------------
// Filtro da carteira
// ------------------------------------------------------------------------------

export type FiltroGti = GrupoGti | 'TODOS';
export const FILTRO_GTI_VALUES: readonly FiltroGti[] = ['TODOS', ...GRUPOS_GTI];

/** Como contar o interesse do GTI na ata. */
export type ModoFiltroGti = 'PRINCIPAL' | '50' | '20' | 'PRESENCA';
export const MODO_FILTRO_GTI_VALUES: readonly ModoFiltroGti[] = ['PRINCIPAL', '50', '20', 'PRESENCA'];
export const MODO_FILTRO_GTI_LABEL: Record<ModoFiltroGti, string> = {
  PRINCIPAL: 'Interesse principal',
  '50': 'Fatia de 50% ou mais',
  '20': 'Fatia de 20% ou mais',
  PRESENCA: 'Qualquer participação'
};

export function passaFiltroGti(fatias: FatiasDaAta | undefined, gti: FiltroGti, modo: ModoFiltroGti): boolean {
  if (gti === 'TODOS') return true;
  if (!fatias) return false;
  const f = fatias.fatias.find((x) => x.grupo === gti);
  if (modo === 'PRINCIPAL') return fatias.principal?.grupo === gti;
  if (!f) return false;
  if (modo === 'PRESENCA') return f.orgaos > 0;
  return f.pct >= Number(modo);
}

/** Quantas atas cada GTI traria no modo escolhido (contagem no menu do filtro). */
export function contarPorGti(fatiasDasAtas: Array<FatiasDaAta | undefined>, modo: ModoFiltroGti): Partial<Record<GrupoGti, number>> {
  const contagem: Partial<Record<GrupoGti, number>> = {};
  for (const grupo of GRUPOS_GTI) {
    const n = fatiasDasAtas.filter((f) => passaFiltroGti(f, grupo, modo)).length;
    if (n > 0) contagem[grupo] = n;
  }
  return contagem;
}

/** Percentual do GTI na ata (0 sem fatia): ordena a lista quando o filtro está ligado. */
export function pctDoGti(fatias: FatiasDaAta | undefined, gti: GrupoGti): number {
  return fatias?.fatias.find((f) => f.grupo === gti)?.pct ?? 0;
}

// ------------------------------------------------------------------------------
// Texto da célula "GTI" das carteiras
// ------------------------------------------------------------------------------

/** Fatia que vira texto ao lado do destaque a partir deste percentual. */
export const FATIA_SECUNDARIA_MIN_PCT = 20;

export interface ResumoCelulaGti {
  /** Em negrito, com a bolinha: o GTI com a maior fatia ou, sem GTI, a maior fatia (Outros ou a confirmar). */
  destaque: FatiaGti | null;
  /** Em cinza, depois do destaque: a maior das outras fatias, se tiver 20% ou mais (outro GTI, Outros ou a confirmar). */
  secundaria: FatiaGti | null;
}

/**
 * O que a célula escreve: o GTI principal em destaque (é por ele que o filtro conta) e a maior outra fatia
 * quando ela pesa, para não esconder um segundo grupo, órgãos de fora dos GTIs ou o que falta confirmar.
 */
export function resumirCelulaGti(fatias: FatiasDaAta | undefined): ResumoCelulaGti {
  if (!fatias || fatias.fatias.length === 0) return { destaque: null, secundaria: null };
  const porTamanho = [...fatias.fatias].sort((a, b) => b.quantidade - a.quantidade || ORDEM_FATIA.indexOf(a.grupo) - ORDEM_FATIA.indexOf(b.grupo));
  const destaque = fatias.principal ?? porTamanho[0] ?? null;
  const secundaria = porTamanho.find((f) => f.grupo !== destaque?.grupo && f.pct >= FATIA_SECUNDARIA_MIN_PCT) ?? null;
  return { destaque, secundaria };
}

/** "LIGABOM 92%", "Outros 55%", "72% a confirmar". */
export function textoDaFatia(f: Pick<FatiaGti, 'grupo' | 'pct'>): string {
  return f.grupo === 'A_CONFIRMAR' ? `${f.pct}% a confirmar` : `${GRUPO_GTI_INFO[f.grupo].rotulo} ${f.pct}%`;
}
