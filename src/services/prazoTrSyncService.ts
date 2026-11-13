/**
 * Leitura do prazo de entrega no Termo de Referência das atas novas (recurso 'prazo_tr', UASG 000000, migration 303).
 *
 * A carga de 13/11/2026 (migration 301) leu os editais das atas que já estavam no banco. Atas que chegam depois ficavam
 * sem sugestão: o gestor informava o prazo à mão. Agora, de 6 em 6 horas, o servidor pega no banco as compras com ata
 * sem leitura (atas_para_leitura_do_tr), baixa do PNCP o Termo de Referência (ou o edital com o TR dentro, inclusive
 * zips dentro de zips), lê a cláusula de entrega (trPrazoParser.ts, a mesma regra da carga) e grava a sugestão para
 * todas as atas da compra (gravar_leitura_prazo_tr). O gestor da ata confirma na Ata 360.
 *
 * Cada compra conta uma tentativa antes de baixar (o PDF pode derrubar a função); depois de 2 tentativas sem leitura,
 * a compra sai da fila e a ata fica para o gestor informar. PDF e zip: o mesmo leitor do reajuste.
 */
import { supabase } from './supabaseClient';
import { executarComReserva, mensagemDeErro, UASG_TODAS, type ResultadoSincronizacao } from './sincronizacaoFontesService';
import { baixar, pedirLista, textosDoArquivo, type LeitorDeArquivos } from './reajusteAtasSyncService';
import { enderecoDoArquivo } from './atasAMontarSyncService';
import { lerPrazoDoTr, type PrazoLidoDoTr } from './trPrazoParser';

export const RECURSO_PRAZO_TR = 'prazo_tr' as const;
export const FONTE_PNCP_PRAZO_TR = 'PNCP (edital e Termo de Referência)';
/** Tempo máximo lendo o PNCP numa execução (a Edge Function tem 150 s). */
export const ORCAMENTO_PRAZO_TR_MS = 95_000;
/** Agendamento de 6 em 6 horas (migration 303); a trava do banco aceita no mínimo 1 hora. */
const VALIDADE_PRAZO_TR = '1 hour';
/** Uma compra nova só começa com pelo menos isto de tempo (baixar e ler um edital grande leva até ~40 s). */
const TEMPO_MINIMO_POR_COMPRA_MS = 25_000;
const PAUSA_ENTRE_PEDIDOS_MS = 1_200;
const URL_PNCP = '/api-pncp/api/pncp/v1/orgaos';
/**
 * PDF dentro do pacote do edital: até 20 MB (o reajuste fica em 10 MB). O edital único do pregão 23/2025 tem 15,7 MB;
 * o PDF é lido página a página e fechado logo depois, um de cada vez.
 */
const MAX_BYTES_PDF = 20 * 1024 * 1024;
/** O TR primeiro; sem ele, o edital (que traz o TR como anexo) e o aviso da contratação direta. */
const ORDEM_DOS_DOCUMENTOS = ['Termo de Referência', 'Edital', 'Aviso de Contratação Direta'];

export interface CompraDaFilaDoTr {
  numero_controle_compra: string;
  atas: string[];
  tentativas: number;
}

export interface LeituraParaGravar extends PrazoLidoDoTr {
  numero_controle_compra: string;
  documento: string | null;
  url: string;
}

export interface OpcoesPrazoTr {
  forcar?: boolean;
  orcamentoMs?: number;
  leitor: LeitorDeArquivos;
  fetcher?: typeof fetch;
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
  /** Teste (dry): o banco simulado no lugar do de verdade. */
  banco?: BancoDoPrazoTr;
}

export interface BancoDoPrazoTr {
  fila(): Promise<CompraDaFilaDoTr[]>;
  tentativa(controle: string): Promise<void>;
  gravar(leitura: LeituraParaGravar): Promise<number>;
}

interface ArquivoPncp {
  sequencialDocumento: number;
  titulo?: string;
  tipoDocumentoNome?: string;
  url: string;
}

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** "00394494000136-1-001038/2025" → endereço da compra no PNCP. */
export function partesDaCompra(controle: string): { cnpj: string; ano: string; sequencial: number } | null {
  const m = /^(\d{14})-1-(\d{6})\/(\d{4})$/.exec(controle.trim());
  return m ? { cnpj: m[1], sequencial: Number(m[2]), ano: m[3] } : null;
}

/** Página pública da compra no PNCP (o link "Abrir no PNCP" da janela do prazo). */
export const paginaDaCompra = (p: { cnpj: string; ano: string; sequencial: number }) => `https://pncp.gov.br/app/editais/${p.cnpj}/${p.ano}/${p.sequencial}`;

const bancoDeVerdade: BancoDoPrazoTr = {
  async fila() {
    if (!supabase) throw new Error('Supabase não configurado.');
    const { data, error } = await supabase.rpc('atas_para_leitura_do_tr', { p_limite: 50 });
    if (error) throw new Error(mensagemDeErro(error));
    return (data ?? []) as CompraDaFilaDoTr[];
  },
  async tentativa(controle) {
    if (!supabase) throw new Error('Supabase não configurado.');
    const { error } = await supabase.rpc('registrar_tentativa_leitura_tr', { p_compra: controle });
    if (error) throw new Error(mensagemDeErro(error));
  },
  async gravar(l) {
    if (!supabase) throw new Error('Supabase não configurado.');
    const { data, error } = await supabase.rpc('gravar_leitura_prazo_tr', {
      p_payload: {
        numero_controle_compra: l.numero_controle_compra, leitura: l.leitura, motivo: l.motivo, dias: l.dias, contagem: l.contagem,
        contagem_dita: l.contagemDita, inicio: l.inicio, trechos: l.trechos, documento: l.documento, url: l.url
      }
    });
    if (error) throw new Error(mensagemDeErro(error));
    return Number(data) || 0;
  }
};

/** Lê a cláusula de entrega de uma compra. Sem tempo para terminar, devolve null (a compra fica para a próxima). */
export async function lerPrazoDaCompra(
  controle: string,
  ctx: { leitor: LeitorDeArquivos; fetcher: typeof fetch; esperar: (ms: number) => Promise<void>; restaMs: () => number }
): Promise<LeituraParaGravar | null> {
  const p = partesDaCompra(controle);
  if (!p) return null;
  const url = paginaDaCompra(p);
  const arquivos = await pedirLista<ArquivoPncp>(`${URL_PNCP}/${p.cnpj}/compras/${p.ano}/${p.sequencial}/arquivos`, ctx.fetcher, ctx.esperar);
  const candidatos = arquivos
    .filter((a) => ORDEM_DOS_DOCUMENTOS.includes(String(a.tipoDocumentoNome ?? '')))
    .sort((a, b) => ORDEM_DOS_DOCUMENTOS.indexOf(String(a.tipoDocumentoNome)) - ORDEM_DOS_DOCUMENTOS.indexOf(String(b.tipoDocumentoNome)));
  if (!candidatos.length) {
    return { ...lerPrazoDoTr(''), motivo: 'sem edital ou Termo de Referência no PNCP', numero_controle_compra: controle, documento: null, url };
  }
  let melhor: LeituraParaGravar | null = null;
  for (const a of candidatos) {
    if (ctx.restaMs() < TEMPO_MINIMO_POR_COMPRA_MS) return melhor;
    await ctx.esperar(PAUSA_ENTRE_PEDIDOS_MS);
    const bytes = await baixar(enderecoDoArquivo(a.url), ctx.fetcher, ctx.esperar);
    const documento = a.tipoDocumentoNome === 'Termo de Referência' ? `Termo de Referência (${a.titulo ?? 'PNCP'})` : `${a.tipoDocumentoNome} e anexos`;
    const textos = bytes ? await textosDoArquivo(bytes, ctx.leitor, { soPartesDoEdital: true, maxBytesPdf: MAX_BYTES_PDF, parar: (t) => lerPrazoDoTr(t).leitura === 'CLARO' }) : [];
    const lido = lerPrazoDoTr(textos.join('\n'));
    const leitura: LeituraParaGravar = { ...lido, numero_controle_compra: controle, documento, url };
    if (!melhor || (melhor.leitura === 'SEM_CLAUSULA' && lido.leitura !== 'SEM_CLAUSULA')) melhor = leitura;
    if (lido.leitura !== 'SEM_CLAUSULA') break;
  }
  return melhor;
}

async function processar(opts: OpcoesPrazoTr): Promise<{ compras: number; lidas: number; atas: number; pendentes: number; falhas: string[]; leituras: LeituraParaGravar[] }> {
  const fetcher = opts.fetcher ?? fetch;
  const esperar = opts.esperar ?? dormir;
  const agora = opts.agora ?? (() => Date.now());
  const inicio = agora();
  const restaMs = () => (opts.orcamentoMs ?? ORCAMENTO_PRAZO_TR_MS) - (agora() - inicio);
  const banco = opts.banco ?? bancoDeVerdade;
  const fila = await banco.fila();
  const c = { compras: fila.length, lidas: 0, atas: 0, pendentes: 0, falhas: [] as string[], leituras: [] as LeituraParaGravar[] };
  for (const compra of fila) {
    if (restaMs() < TEMPO_MINIMO_POR_COMPRA_MS) {
      c.pendentes++;
      continue;
    }
    try {
      await banco.tentativa(compra.numero_controle_compra);
      const lida = await lerPrazoDaCompra(compra.numero_controle_compra, { leitor: opts.leitor, fetcher, esperar, restaMs });
      if (!lida) {
        c.pendentes++;
        continue;
      }
      c.atas += await banco.gravar(lida);
      c.lidas++;
      c.leituras.push(lida);
    } catch (err) {
      c.falhas.push(`${compra.numero_controle_compra}: ${mensagemDeErro(err)}`);
    }
  }
  return c;
}

export async function sincronizarPrazoTr(opts: OpcoesPrazoTr): Promise<ResultadoSincronizacao> {
  return executarComReserva(RECURSO_PRAZO_TR, UASG_TODAS, { forcar: opts.forcar, validade: VALIDADE_PRAZO_TR }, async () => {
    const c = await processar(opts);
    const mensagem = `${c.compras} compra(s) na fila; ${c.lidas} lida(s), ${c.atas} ata(s) com sugestão` +
      (c.pendentes ? `; ${c.pendentes} para a próxima execução` : '') +
      (c.falhas.length ? `; falhas: ${c.falhas.join('; ')}` : '');
    return {
      status: c.falhas.length || c.pendentes ? 'PARCIAL' : 'SUCESSO',
      total: c.lidas,
      fontesComFalha: c.falhas.length ? [FONTE_PNCP_PRAZO_TR] : [],
      mensagem: mensagem.slice(0, 1000)
    };
  });
}

/** Teste sem gravar (dry): lê a fila e o PNCP, sem contar tentativa nem gravar. */
export async function testarPrazoTr(opts: OpcoesPrazoTr): Promise<Record<string, unknown>> {
  let fila: CompraDaFilaDoTr[] = [];
  try {
    fila = await bancoDeVerdade.fila();
  } catch (err) {
    return { observacao: `fila indisponível (migration 303 aplicada?): ${mensagemDeErro(err)}` };
  }
  const banco: BancoDoPrazoTr = { fila: async () => fila, tentativa: async () => {}, gravar: async () => 0 };
  const c = await processar({ ...opts, banco });
  return {
    naFila: fila.length,
    lidas: c.lidas,
    pendentes: c.pendentes,
    falhas: c.falhas,
    leituras: c.leituras.map((l) => ({ compra: l.numero_controle_compra, leitura: l.leitura, dias: l.dias, inicio: l.inicio, contagem: l.contagem, motivo: l.motivo, documento: l.documento }))
  };
}
