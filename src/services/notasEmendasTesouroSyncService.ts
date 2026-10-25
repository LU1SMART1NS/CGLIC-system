/**
 * Notas das emendas parlamentares trazidas pelo Tesouro (migration 184). As notas citadas nos despachos de empenho do
 * SEI são da UG 200330 e só chegariam pela lista de empenhos do contrato (UASG 200331) no Contratos.gov.br, onde o
 * gestor nem sempre as inclui. Sem a nota em `empenhos`, a leitura do Portal (itens_notas_siafi) não a lê.
 *
 * Roda no servidor, sob a trava do banco (recurso 'notas_emendas_tesouro', uma execução para as duas UGs): pergunta
 * ao STA cada nota de notas_das_emendas_a_trazer() nas duas UGs (o número se repete em 200330 e 200331) e manda as
 * respostas a gravar_notas_do_tesouro, que escolhe a UG pelo plano interno da emenda e registra a tentativa.
 * A nota que falhou no Tesouro não é mandada: volta na próxima execução. Estudo:
 * docs/estudos/notas-das-emendas-pelo-tesouro.md.
 *
 * Migration 192: quando o Tesouro tem a nota no saldo contábil da UG 200330 mas não a descreve (o STA volta vazio),
 * o Portal da Transparência diz se ela é da emenda (/emendas/documentos/{ano + nº}) e quem é o favorecido
 * (/despesas/documentos/{código}); notas_das_emendas_pelo_portal lista essas notas e gravar_notas_pelo_portal grava.
 */
import { supabase } from './supabaseClient';
import { fetchNotaDoTesouro } from './api';
import { criarConsultorDoPortal, type ConsultorDoPortal } from './itensNotasSiafiSyncService';
import { mapPostgresErrorToAppError } from '../adapters/rpcErrorAdapter';
import { executarComReserva, mensagemDeErro, UASG_TODAS, type ResultadoSincronizacao } from './sincronizacaoFontesService';

export const RECURSO_NOTAS_EMENDAS_TESOURO = 'notas_emendas_tesouro' as const;
export const FONTE_NOTAS_EMENDAS_TESOURO = 'Notas de empenho (Tesouro, STA)';
/** O cron chama uma vez por dia; a validade um pouco menor garante que cada chamada leia. */
export const VALIDADE_NOTAS_EMENDAS_TESOURO = '20 hours';
export const ORCAMENTO_NOTAS_EMENDAS_TESOURO_MS = 100_000;
/** Notas perguntadas ao mesmo tempo (cada uma nas duas UGs). Do servidor, o STA leva de 2 a 60 s por consulta. */
export const CONCORRENCIA_NOTAS_EMENDAS_TESOURO = 4;
/** O mesmo número de nota existe nas duas UGs; a da emenda sai do plano interno, no banco. */
export const UGS_DAS_NOTAS = ['200330', '200331'] as const;

/** Campos da resposta do STA que a gravação usa. */
export interface NotaDoTesouro {
  ug: string;
  numero: string;
  emissao: string | null;
  nome: string | null;
  cpfcnpjugidgener: string | null;
  picodigo: string | null;
  pidescricao: string | null;
  naturezadespesa: string | null;
  naturezadespesadescricao: string | null;
  /** Descrição da nota no SIAFI; vale quando o plano interno cadastrado não é o da emenda (migration 200). */
  observacao: string | null;
}

const texto = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

/** Resposta do STA no formato da gravação. Null sem UG ou número de nota válidos. */
export function normalizarNotaDoTesouro(raw: any): NotaDoTesouro | null {
  const ug = String(raw?.ug ?? '').trim();
  const numero = String(raw?.numero ?? '').trim().toUpperCase();
  if (!/^\d{6}$/.test(ug) || !/^\d{4}NE\d{6}$/.test(numero)) return null;
  return {
    ug,
    numero,
    emissao: texto(raw?.emissao),
    nome: texto(raw?.nome),
    cpfcnpjugidgener: texto(raw?.cpfcnpjugidgener),
    picodigo: texto(raw?.picodigo),
    pidescricao: texto(raw?.pidescricao),
    naturezadespesa: texto(raw?.naturezadespesa),
    naturezadespesadescricao: texto(raw?.naturezadespesadescricao),
    observacao: texto(raw?.observacao)?.slice(0, 2000) ?? null
  };
}

/** Pergunta a nota nas duas UGs. Lança se o Tesouro falhar em alguma: a nota fica para a próxima execução. */
export async function consultarNotaNasDuasUgs(numero: string): Promise<NotaDoTesouro[]> {
  const respostas = await Promise.all(UGS_DAS_NOTAS.map((ug) => fetchNotaDoTesouro(ug, numero)));
  return respostas.map(normalizarNotaDoTesouro).filter((n): n is NotaDoTesouro => n !== null && n.numero === numero.toUpperCase());
}

/** Nota que o Tesouro não descreve na 200330, com a emenda do pedido que a cita e os anos a tentar (migration 192). */
export interface NotaParaOPortal {
  numero: string;
  emenda: string;
  anos: number[];
}

/** O que o Portal diz da nota: a emenda que ele liga a ela (null se nenhuma dos anos tentados) e o favorecido. */
export interface NotaPeloPortal {
  numero: string;
  emenda_codigo: string | null;
  autor: string | null;
  data: string | null;
  favorecido_codigo: string | null;
  favorecido_nome: string | null;
}

/** Até 10 páginas de 15 documentos por emenda: as emendas das CAEP têm poucas notas. */
const MAX_PAGINAS_DA_EMENDA = 10;
const POR_PAGINA_DO_PORTAL = 15;
const UG_DAS_EMENDAS = '200330';

/** "27/07/2026" ou "2026-07-27" → "2026-07-27". */
export function dataDoPortal(v: unknown): string | null {
  const s = String(v ?? '').trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** Procura a nota nos documentos da emenda (ano + nº) e, achando, lê o documento dela. */
export async function consultarNotaNoPortal(n: NotaParaOPortal, consultar: ConsultorDoPortal): Promise<NotaPeloPortal> {
  const codigoDaNota = `${UG_DAS_EMENDAS}00001${n.numero.toUpperCase()}`;
  for (const ano of n.anos) {
    const codigoDaEmenda = `${ano}${n.emenda}`;
    for (let pagina = 1; pagina <= MAX_PAGINAS_DA_EMENDA; pagina++) {
      const docs = await consultar(`/emendas/documentos/${codigoDaEmenda}?pagina=${pagina}`);
      const lista = Array.isArray(docs) ? (docs as Array<Record<string, unknown>>) : [];
      if (lista.some((d) => String(d.codigoDocumento ?? '').toUpperCase() === codigoDaNota)) {
        const doc = (await consultar(`/despesas/documentos/${codigoDaNota}`)) as Record<string, unknown> | null;
        return {
          numero: n.numero,
          emenda_codigo: codigoDaEmenda,
          autor: texto(doc?.autor),
          data: dataDoPortal(doc?.data),
          favorecido_codigo: texto(doc?.codigoFavorecido),
          favorecido_nome: texto(doc?.nomeFavorecido)
        };
      }
      if (lista.length < POR_PAGINA_DO_PORTAL) break;
    }
  }
  return { numero: n.numero, emenda_codigo: null, autor: null, data: null, favorecido_codigo: null, favorecido_nome: null };
}

async function notasParaOPortal(): Promise<NotaParaOPortal[]> {
  const { data, error } = await supabase!.rpc('notas_das_emendas_pelo_portal');
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data ?? []) as Array<{ numero_oficial: string; emenda: string; anos: number[] }>).map((l) => ({
    numero: String(l.numero_oficial),
    emenda: String(l.emenda),
    anos: (l.anos ?? []).map(Number)
  }));
}

async function gravarPeloPortal(notas: NotaPeloPortal[]): Promise<Record<string, number>> {
  const { data, error } = await supabase!.rpc('gravar_notas_pelo_portal', { p_notas: notas });
  if (error) throw mapPostgresErrorToAppError(error);
  return (data ?? {}) as Record<string, number>;
}

async function notasATrazer(): Promise<string[]> {
  const { data, error } = await supabase!.rpc('notas_das_emendas_a_trazer');
  if (error) throw mapPostgresErrorToAppError(error);
  return ((data ?? []) as Array<{ numero_oficial: string }>).map((l) => String(l.numero_oficial));
}

async function gravar(consultadas: string[], notas: NotaDoTesouro[]): Promise<Record<string, number>> {
  const { data, error } = await supabase!.rpc('gravar_notas_do_tesouro', { p_consultadas: consultadas, p_notas: notas });
  if (error) throw mapPostgresErrorToAppError(error);
  return (data ?? {}) as Record<string, number>;
}

/** Teste sem gravar: quantas notas faltam e a resposta do Tesouro para a primeira. */
export async function contarNotasEmendasTesouroPendentes(chave?: string): Promise<Record<string, unknown>> {
  const pendentes = await notasATrazer();
  const amostra = pendentes[0] ? await consultarNotaNasDuasUgs(pendentes[0]) : [];
  // Migration 192: as notas que o Tesouro não descreve e a resposta do Portal para a primeira (nada é gravado).
  const doPortal = await notasParaOPortal();
  const amostraPortal =
    chave && doPortal[0] ? await consultarNotaNoPortal(doPortal[0], criarConsultorDoPortal({ chave, base: '/api-transparencia/api-de-dados' })) : null;
  return {
    pendentes: pendentes.length,
    amostra: pendentes[0] ?? null,
    amostraUgs: amostra.map((n) => `${n.ug}: ${n.picodigo ?? '?'} ${n.nome ?? ''}`.trim()),
    peloPortal: doPortal.length,
    amostraPortal
  };
}

export async function sincronizarNotasDasEmendasDoTesouro(
  opts: {
    forcar?: boolean;
    orcamentoMs?: number;
    agora?: () => number;
    concorrencia?: number;
    /** Chave do Portal da Transparência; sem ela, o passo do Portal (migration 192) fica de fora. */
    chave?: string;
    fetcher?: typeof fetch;
    esperar?: (ms: number) => Promise<void>;
  } = {}
): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_NOTAS_EMENDAS_TESOURO_MS;
  return executarComReserva(
    RECURSO_NOTAS_EMENDAS_TESOURO,
    UASG_TODAS,
    { forcar: opts.forcar, validade: VALIDADE_NOTAS_EMENDAS_TESOURO },
    async () => {
      const inicio = agora();
      const erros: string[] = [];
      const partes: string[] = [];

      // 1) Portal: as poucas notas que o Tesouro não descreve na 200330. Vem antes porque a fila do Tesouro pode
      // gastar o tempo todo; usa no máximo 40% dele.
      let gravadasPeloPortal = 0;
      let pendentesNoPortal = 0;
      const doPortal = opts.chave ? await notasParaOPortal() : [];
      if (doPortal.length) {
        const consultar = criarConsultorDoPortal({ chave: opts.chave!, fetcher: opts.fetcher, esperar: opts.esperar, base: '/api-transparencia/api-de-dados' });
        const resultadoPortal: Record<string, number> = {};
        let feitas = 0;
        for (const n of doPortal) {
          if (agora() - inicio > orcamento * 0.4) break;
          feitas++;
          try {
            const r = await gravarPeloPortal([await consultarNotaNoPortal(n, consultar)]);
            for (const [situacao, q] of Object.entries(r)) resultadoPortal[situacao] = (resultadoPortal[situacao] ?? 0) + Number(q);
          } catch (err) {
            erros.push(`${n.numero} (Portal): ${mensagemDeErro(err)}`);
          }
        }
        pendentesNoPortal = doPortal.length - feitas;
        gravadasPeloPortal = resultadoPortal.GRAVADA ?? 0;
        const outras = Object.entries(resultadoPortal).filter(([s]) => s !== 'GRAVADA');
        partes.push(
          `${feitas} de ${doPortal.length} nota(s) que o Tesouro não descreve consultada(s) no Portal da Transparência, ${gravadasPeloPortal} gravada(s)` +
            (outras.length ? ` (${outras.map(([s, q]) => `${q} ${s}`).join(', ')})` : '')
        );
      }

      // 2) Tesouro: as notas citadas no SEI e as da 200330 que o sistema não tem.
      const fila = await notasATrazer();
      let proxima = 0;
      const resultado: Record<string, number> = {};
      if (fila.length) {
        // As consultas ao Tesouro correm em paralelo; as gravações, uma por vez, nota a nota (o que já foi gravado fica
        // se o tempo da função acabar).
        let filaDeGravacao: Promise<unknown> = Promise.resolve();
        const gravarNaVez = (numero: string, notas: NotaDoTesouro[]) => {
          const vez = filaDeGravacao.then(() => gravar([numero], notas));
          filaDeGravacao = vez.catch(() => undefined);
          return vez;
        };
        // Não somar na mesma linha do await: com trabalhadores em paralelo, perde somas.
        const trabalhador = async () => {
          while (proxima < fila.length) {
            if (agora() - inicio > orcamento) return;
            const numero = fila[proxima++];
            try {
              const notas = await consultarNotaNasDuasUgs(numero);
              const r = await gravarNaVez(numero, notas);
              for (const [situacao, n] of Object.entries(r)) resultado[situacao] = (resultado[situacao] ?? 0) + Number(n);
            } catch (err) {
              erros.push(`${numero}: ${mensagemDeErro(err)}`);
            }
          }
        };
        await Promise.all(Array.from({ length: Math.max(1, opts.concorrencia ?? CONCORRENCIA_NOTAS_EMENDAS_TESOURO) }, trabalhador));
      }
      const pendentes = fila.length - proxima + pendentesNoPortal;

      const gravadasNoTesouro = resultado.GRAVADA ?? 0;
      const gravadas = gravadasNoTesouro + gravadasPeloPortal;
      if (fila.length) {
        const errosDoTesouro = erros.filter((e) => !e.includes('(Portal)')).length;
        const recusadas = Object.entries(resultado).filter(([s]) => s !== 'GRAVADA' && s !== 'JA_EXISTIA');
        partes.unshift(`${proxima - errosDoTesouro} de ${fila.length} nota(s) consultada(s) no Tesouro, ${gravadasNoTesouro} gravada(s)`);
        if (recusadas.length) partes.splice(1, 0, `sem a nota da emenda: ${recusadas.map(([s, n]) => `${n} ${s}`).join(', ')}`);
      }
      if (!partes.length) {
        return { status: 'SUCESSO', total: 0, fontesComFalha: [], mensagem: 'Nenhuma nota das emendas a trazer do Tesouro.' };
      }
      if (erros.length) partes.push(`${erros.length} com falha (ex.: ${erros[0]})`);
      if (pendentes) partes.push(`o tempo da execução acabou e ${pendentes} nota(s) ficam para a próxima`);
      const mensagem = `${partes.join(', ')}.`;
      return erros.length || pendentes
        ? { status: 'PARCIAL', total: gravadas, fontesComFalha: [FONTE_NOTAS_EMENDAS_TESOURO], mensagem }
        : { status: 'SUCESSO', total: gravadas, fontesComFalha: [], mensagem };
    }
  );
}
