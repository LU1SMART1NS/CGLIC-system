import { useMemo, useState } from 'react';
import type { FonteComFalha } from '../../types/managementDashboard';

/** O que a faixa precisa de uma consulta do React Query (useQuery devolve tudo isto). */
export interface ConsultaDaTela {
  data?: unknown;
  isError: boolean;
  error: unknown;
  isFetching?: boolean;
  refetch: () => Promise<unknown>;
}

/** Uma leitura da tela, com o nome que a pessoa entende ("faturas", "gestores dos contratos"). */
export interface LeituraDaTela {
  rotulo: string;
  query: ConsultaDaTela;
}

function mensagemDoErro(err: unknown): string {
  if (err instanceof Error) return err.message;
  const msg = (err as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && msg ? msg : String(err ?? 'erro desconhecido');
}

/** A leitura falhou e não há nenhuma leitura boa dela na tela (o React Query guarda a última boa em `data`). */
export function naoCarregou(query: ConsultaDaTela): boolean {
  return query.isError && query.data === undefined;
}

/**
 * Falhas das leituras, uma linha por rótulo (a mesma fonte lida em duas UASGs aparece uma vez). Com leitura boa
 * anterior, o React Query mantém o dado: a fonte "não atualizou" (DESATUALIZADA); sem ela, "não carregou".
 */
export function falhasDasLeituras(leituras: readonly LeituraDaTela[]): FonteComFalha[] {
  const porRotulo = new Map<string, FonteComFalha>();
  for (const { rotulo, query } of leituras) {
    if (!query.isError) continue;
    const falha: FonteComFalha = {
      rotulo,
      situacao: query.data === undefined ? 'NAO_CARREGOU' : 'DESATUALIZADA',
      mensagem: mensagemDoErro(query.error)
    };
    const atual = porRotulo.get(rotulo);
    if (!atual || (falha.situacao === 'NAO_CARREGOU' && atual.situacao !== 'NAO_CARREGOU')) porRotulo.set(rotulo, falha);
  }
  return [...porRotulo.values()];
}

/**
 * Junta as leituras de uma tela e devolve as que falharam, para a faixa "não carregou" (FontesComFalhaAviso): a tela
 * mostra o que carregou e diz o que ficou de fora, em vez de trocar a falha por "nenhum", "0" ou "Não atribuído".
 * "Tentar novamente" relê só as consultas que falharam.
 */
export function useLeiturasComFalha(leituras: readonly LeituraDaTela[]) {
  const falhas = falhasDasLeituras(leituras);
  const assinatura = falhas.map((f) => `${f.rotulo}:${f.situacao}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const falhasEstaveis = useMemo(() => falhas, [assinatura]);
  const [relendo, setRelendo] = useState(false);
  const comErro = leituras.filter((l) => l.query.isError);

  const tentarDeNovo = async () => {
    setRelendo(true);
    try {
      await Promise.allSettled(comErro.map((l) => l.query.refetch()));
    } finally {
      setRelendo(false);
    }
  };

  return {
    falhas: falhasEstaveis,
    /** Alguma leitura falhou sem leitura boa anterior: números que dependem dela podem estar abaixo do real. */
    algumaNaoCarregou: falhasEstaveis.some((f) => f.situacao === 'NAO_CARREGOU'),
    tentarDeNovo,
    tentando: relendo || comErro.some((l) => l.query.isFetching)
  };
}
