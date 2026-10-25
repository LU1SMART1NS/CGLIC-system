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
 */
import { supabase } from './supabaseClient';
import { fetchNotaDoTesouro } from './api';
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
    naturezadespesadescricao: texto(raw?.naturezadespesadescricao)
  };
}

/** Pergunta a nota nas duas UGs. Lança se o Tesouro falhar em alguma: a nota fica para a próxima execução. */
export async function consultarNotaNasDuasUgs(numero: string): Promise<NotaDoTesouro[]> {
  const respostas = await Promise.all(UGS_DAS_NOTAS.map((ug) => fetchNotaDoTesouro(ug, numero)));
  return respostas.map(normalizarNotaDoTesouro).filter((n): n is NotaDoTesouro => n !== null && n.numero === numero.toUpperCase());
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
export async function contarNotasEmendasTesouroPendentes(): Promise<Record<string, unknown>> {
  const pendentes = await notasATrazer();
  const amostra = pendentes[0] ? await consultarNotaNasDuasUgs(pendentes[0]) : [];
  return {
    pendentes: pendentes.length,
    amostra: pendentes[0] ?? null,
    amostraUgs: amostra.map((n) => `${n.ug}: ${n.picodigo ?? '?'} ${n.nome ?? ''}`.trim())
  };
}

export async function sincronizarNotasDasEmendasDoTesouro(
  opts: { forcar?: boolean; orcamentoMs?: number; agora?: () => number; concorrencia?: number } = {}
): Promise<ResultadoSincronizacao> {
  const agora = opts.agora ?? (() => Date.now());
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_NOTAS_EMENDAS_TESOURO_MS;
  return executarComReserva(
    RECURSO_NOTAS_EMENDAS_TESOURO,
    UASG_TODAS,
    { forcar: opts.forcar, validade: VALIDADE_NOTAS_EMENDAS_TESOURO },
    async () => {
      const inicio = agora();
      const fila = await notasATrazer();
      if (fila.length === 0) {
        return { status: 'SUCESSO', total: 0, fontesComFalha: [], mensagem: 'Nenhuma nota das emendas a trazer do Tesouro.' };
      }

      let proxima = 0;
      const erros: string[] = [];
      const resultado: Record<string, number> = {};
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
      const pendentes = fila.length - proxima;

      const gravadas = resultado.GRAVADA ?? 0;
      const recusadas = Object.entries(resultado).filter(([s]) => s !== 'GRAVADA' && s !== 'JA_EXISTIA');
      const partes = [`${proxima - erros.length} de ${fila.length} nota(s) consultada(s) no Tesouro`, `${gravadas} gravada(s)`];
      if (recusadas.length) partes.push(`sem a nota da emenda: ${recusadas.map(([s, n]) => `${n} ${s}`).join(', ')}`);
      if (erros.length) partes.push(`${erros.length} com falha (ex.: ${erros[0]})`);
      if (pendentes) partes.push(`o tempo da execução acabou e ${pendentes} nota(s) ficam para a próxima`);
      const mensagem = `${partes.join(', ')}.`;
      return erros.length || pendentes
        ? { status: 'PARCIAL', total: gravadas, fontesComFalha: [FONTE_NOTAS_EMENDAS_TESOURO], mensagem }
        : { status: 'SUCESSO', total: gravadas, fontesComFalha: [], mensagem };
    }
  );
}
