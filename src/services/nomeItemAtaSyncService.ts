/**
 * Nome do item lido na ata assinada das atas novas (recurso 'nome_item_ata', UASG 000000, migration 313).
 *
 * A carga de 16/11/2026 (migration 312) gravou o nome de 478 dos 480 itens das atas vigentes, conferido pelo usuário.
 * Atas que chegam depois ficavam sem nome (a tela mostra a descrição). Agora, de 6 em 6 horas, o servidor pega no
 * banco as atas vigentes ainda não lidas (atas_para_leitura_do_nome), baixa do PNCP o PDF da ata assinada (o arquivo
 * de menor sequencial da ata), lê a tabela de preços (nomeItemAtaParser.ts) e grava o nome dos itens que ainda não
 * têm linha em itens_nome_na_ata (gravar_nomes_lidos_da_ata). Nunca reescreve um nome que já existe.
 *
 * Em dúvida, o item fica sem nome; o motivo fica guardado na leitura da ata (itens_nome_leituras.sem_nome) e entra
 * na contagem do resumo. Cada ata conta uma tentativa antes de baixar (o PDF pode derrubar a função); depois de 2
 * tentativas sem leitura, a ata sai da fila.
 */
import { supabase } from './supabaseClient';
import { executarComReserva, mensagemDeErro, UASG_TODAS, type ResultadoSincronizacao } from './sincronizacaoFontesService';
import { baixar, partesDoControle, pedirLista } from './reajusteAtasSyncService';
import { enderecoDoArquivo } from './atasAMontarSyncService';
import { lerNomesDosItens, pdfEhDaAta, type PaginaDoPdf } from './nomeItemAtaParser';

export const RECURSO_NOME_ITEM_ATA = 'nome_item_ata' as const;
export const FONTE_PNCP_NOME_ITEM = 'PNCP (ata assinada)';
/** Tempo máximo lendo o PNCP numa execução (a Edge Function tem 150 s). */
export const ORCAMENTO_NOME_ITEM_ATA_MS = 95_000;
/** Agendamento de 6 em 6 horas (migration 313); a trava do banco aceita no mínimo 1 hora. */
const VALIDADE_NOME_ITEM_ATA = '1 hour';
/** Uma ata nova só começa com pelo menos isto de tempo (a ata assinada tem de 5 a 20 páginas). */
const TEMPO_MINIMO_POR_ATA_MS = 12_000;
const PAUSA_ENTRE_PEDIDOS_MS = 800;
const URL_PNCP = '/api-pncp/api/pncp/v1/orgaos';
/** A tabela de preços fica nas primeiras páginas; as 40 primeiras bastam (a maior ata da carga tem 30). */
const MAX_PAGINAS = 40;

export interface LeitorDePedacos {
  /** Pedaços de texto do PDF com a posição (x, y, largura, altura), página a página. */
  pedacosDoPdf(bytes: Uint8Array, opts?: { maxPaginas?: number }): Promise<PaginaDoPdf[]>;
}

export interface ItemDaFilaDoNome {
  item_key: string;
  numero_item: string;
  valor_unitario: number | null;
}

export interface AtaDaFilaDoNome {
  numero_controle_pncp: string;
  numero_ata: string;
  codigo_uasg: string;
  tentativas: number;
  itens: ItemDaFilaDoNome[];
}

export interface LeituraDosNomesParaGravar {
  numero_controle_pncp: string;
  nomes: Array<{ item_key: string; nome: string }>;
  sem_nome: Array<{ item_key: string; motivo: string }>;
  /** Por que a ata inteira não foi lida (sem PDF no PNCP, arquivo que não é PDF); null quando foi lida. */
  motivo: string | null;
}

export interface BancoDoNomeItem {
  fila(): Promise<AtaDaFilaDoNome[]>;
  tentativa(controle: string): Promise<void>;
  gravar(leitura: LeituraDosNomesParaGravar): Promise<number>;
}

export interface OpcoesNomeItemAta {
  forcar?: boolean;
  orcamentoMs?: number;
  leitor: LeitorDePedacos;
  fetcher?: typeof fetch;
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
  /** Teste (dry): o banco simulado no lugar do de verdade. */
  banco?: BancoDoNomeItem;
}

interface ArquivoPncp {
  sequencialDocumento: number;
  titulo?: string;
  tipoDocumentoNome?: string;
  url: string;
}

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const ehPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

const bancoDeVerdade: BancoDoNomeItem = {
  async fila() {
    if (!supabase) throw new Error('Supabase não configurado.');
    const { data, error } = await supabase.rpc('atas_para_leitura_do_nome', { p_limite: 40 });
    if (error) throw new Error(mensagemDeErro(error));
    return (data ?? []) as AtaDaFilaDoNome[];
  },
  async tentativa(controle) {
    if (!supabase) throw new Error('Supabase não configurado.');
    const { error } = await supabase.rpc('registrar_tentativa_leitura_nome', { p_controle: controle });
    if (error) throw new Error(mensagemDeErro(error));
  },
  async gravar(l) {
    if (!supabase) throw new Error('Supabase não configurado.');
    const { data, error } = await supabase.rpc('gravar_nomes_lidos_da_ata', { p_payload: l });
    if (error) throw new Error(mensagemDeErro(error));
    return Number(data) || 0;
  }
};

/** Lê a ata assinada de uma ata da fila. Sem tempo para terminar, devolve null (a ata fica para a próxima). */
export async function lerNomesDaAta(
  ata: AtaDaFilaDoNome,
  ctx: { leitor: LeitorDePedacos; fetcher: typeof fetch; esperar: (ms: number) => Promise<void>; restaMs: () => number }
): Promise<LeituraDosNomesParaGravar | null> {
  const controle = ata.numero_controle_pncp;
  const semLeitura = (motivo: string): LeituraDosNomesParaGravar => ({
    numero_controle_pncp: controle,
    nomes: [],
    sem_nome: ata.itens.map((i) => ({ item_key: i.item_key, motivo })),
    motivo
  });
  const p = partesDoControle(controle);
  if (!p) return semLeitura('número de controle do PNCP inválido');
  const arquivos = await pedirLista<ArquivoPncp>(`${URL_PNCP}/${p.cnpj}/compras/${p.ano}/${p.sequencial}/atas/${p.sequencialAta}/arquivos`, ctx.fetcher, ctx.esperar);
  // A ata assinada é o primeiro arquivo; os seguintes são termos aditivos e apostilamentos.
  const ataAssinada = [...arquivos].sort((a, b) => a.sequencialDocumento - b.sequencialDocumento)[0];
  if (!ataAssinada) return semLeitura('ata sem arquivo no PNCP');
  if (ctx.restaMs() < TEMPO_MINIMO_POR_ATA_MS) return null;
  await ctx.esperar(PAUSA_ENTRE_PEDIDOS_MS);
  const bytes = await baixar(enderecoDoArquivo(ataAssinada.url), ctx.fetcher, ctx.esperar);
  if (!bytes) return semLeitura('arquivo da ata grande demais ou indisponível');
  if (!ehPdf(bytes)) return semLeitura('arquivo da ata não é PDF');
  const paginas = await ctx.leitor.pedacosDoPdf(bytes, { maxPaginas: MAX_PAGINAS });
  // O PNCP já trouxe o PDF de outra ata (00037/2026 com o da 27/2026): sem o número desta ata no título, não lê.
  if (!pdfEhDaAta(paginas, ata.numero_ata)) return semLeitura('PDF do PNCP sem o número desta ata no título');
  // O mesmo número de controle pode estar em mais de uma linha de ata (outra UASG): o nome vale para todas.
  const chaves = new Map<number, string[]>();
  const precos = new Map<number, number | null>();
  for (const i of ata.itens) {
    const n = Number(i.numero_item);
    chaves.set(n, [...(chaves.get(n) ?? []), i.item_key]);
    if (!precos.has(n)) precos.set(n, i.valor_unitario === null ? null : Number(i.valor_unitario));
  }
  const lidos = lerNomesDosItens(paginas, [...precos].map(([numero, valorUnitario]) => ({ numero, valorUnitario })));
  return {
    numero_controle_pncp: controle,
    nomes: lidos.nomes.flatMap((n) => (chaves.get(n.numero) ?? []).map((item_key) => ({ item_key, nome: n.nome }))),
    sem_nome: lidos.semNome.flatMap((x) => (chaves.get(x.numero) ?? []).map((item_key) => ({ item_key, motivo: x.motivo }))),
    motivo: lidos.tabelas ? null : 'sem tabela de preços com coluna de nome'
  };
}

async function processar(opts: OpcoesNomeItemAta): Promise<{ atas: number; lidas: number; nomes: number; semNome: number; pendentes: number; falhas: string[]; leituras: LeituraDosNomesParaGravar[] }> {
  const fetcher = opts.fetcher ?? fetch;
  const esperar = opts.esperar ?? dormir;
  const agora = opts.agora ?? (() => Date.now());
  const inicio = agora();
  const restaMs = () => (opts.orcamentoMs ?? ORCAMENTO_NOME_ITEM_ATA_MS) - (agora() - inicio);
  const banco = opts.banco ?? bancoDeVerdade;
  const fila = await banco.fila();
  const c = { atas: fila.length, lidas: 0, nomes: 0, semNome: 0, pendentes: 0, falhas: [] as string[], leituras: [] as LeituraDosNomesParaGravar[] };
  for (const ata of fila) {
    if (restaMs() < TEMPO_MINIMO_POR_ATA_MS) {
      c.pendentes++;
      continue;
    }
    try {
      await banco.tentativa(ata.numero_controle_pncp);
      const lida = await lerNomesDaAta(ata, { leitor: opts.leitor, fetcher, esperar, restaMs });
      if (!lida) {
        c.pendentes++;
        continue;
      }
      c.nomes += await banco.gravar(lida);
      c.semNome += lida.sem_nome.length;
      c.lidas++;
      c.leituras.push(lida);
    } catch (err) {
      c.falhas.push(`${ata.numero_ata}-${ata.codigo_uasg}: ${mensagemDeErro(err)}`);
    }
  }
  return c;
}

export async function sincronizarNomeItemAta(opts: OpcoesNomeItemAta): Promise<ResultadoSincronizacao> {
  return executarComReserva(RECURSO_NOME_ITEM_ATA, UASG_TODAS, { forcar: opts.forcar, validade: VALIDADE_NOME_ITEM_ATA }, async () => {
    const c = await processar(opts);
    const mensagem = `${c.atas} ata(s) na fila; ${c.lidas} lida(s), ${c.nomes} nome(s) gravado(s)` +
      (c.semNome ? `, ${c.semNome} item(ns) sem nome (em dúvida)` : '') +
      (c.pendentes ? `; ${c.pendentes} para a próxima execução` : '') +
      (c.falhas.length ? `; falhas: ${c.falhas.join('; ')}` : '');
    return {
      status: c.falhas.length || c.pendentes ? 'PARCIAL' : 'SUCESSO',
      total: c.nomes,
      fontesComFalha: c.falhas.length ? [FONTE_PNCP_NOME_ITEM] : [],
      mensagem: mensagem.slice(0, 1000)
    };
  });
}

/** Teste sem gravar (dry): lê a fila e o PNCP, sem contar tentativa nem gravar. */
export async function testarNomeItemAta(opts: OpcoesNomeItemAta): Promise<Record<string, unknown>> {
  let fila: AtaDaFilaDoNome[] = [];
  try {
    fila = await bancoDeVerdade.fila();
  } catch (err) {
    return { observacao: `fila indisponível (migration 313 aplicada?): ${mensagemDeErro(err)}` };
  }
  const banco: BancoDoNomeItem = { fila: async () => fila, tentativa: async () => {}, gravar: async (l) => l.nomes.length };
  const c = await processar({ ...opts, banco });
  return {
    naFila: fila.length,
    lidas: c.lidas,
    nomes: c.nomes,
    semNome: c.semNome,
    pendentes: c.pendentes,
    falhas: c.falhas,
    leituras: c.leituras.map((l) => ({ ata: l.numero_controle_pncp, motivo: l.motivo, nomes: l.nomes, semNome: l.sem_nome }))
  };
}
