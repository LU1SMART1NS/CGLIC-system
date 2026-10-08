import { ROTAS_VINCULACAO, ROTA_ALOCACAO } from '../vinculacao/vinculacaoConfig';
import type { ContagensExtras } from '../vinculacao/contagemExtras';

/** Número de pendências de uma área do menu, se fica vermelho e para onde o clique leva enquanto houver pendência. */
export interface PendenciaDaArea {
  contagem: number;
  vermelho?: boolean;
  destino: string;
}

export interface FontesDoMenu {
  empenhos: { aosItens: number; aoContrato: number } | null;
  financeiro: { total: number; urgente: boolean } | null;
  extras: ContagensExtras;
}

/**
 * Regras dos números do menu (só pendências que o perfil resolve; quem calcula cada parte já filtra pelo perfil). Com
 * número, a área abre direto na página e no segmento da pendência; sem número, o menu volta à última página usada.
 */
export function pendenciasDoMenu({ empenhos, financeiro, extras }: FontesDoMenu): Record<string, PendenciaDaArea | undefined> {
  const r: Record<string, PendenciaDaArea | undefined> = {};

  // Visão Geral (coordenador): o número soma as filas da Central de Distribuição, mas o clique abre sempre no Painel;
  // a Distribuição fica a uma aba de distância.
  const atas = extras.atasSemGestor ?? 0;
  const diverg = extras.gestorDiferente ?? 0;
  if (atas + diverg > 0) r['visao-geral'] = { contagem: atas + diverg, destino: '/instrumentos' };

  // Alocação: itens sem alocação ou alocados em parte.
  if ((extras.itensAAlocar ?? 0) > 0) r.alocacao = { contagem: extras.itensAAlocar!, destino: ROTA_ALOCACAO };

  // Vinculação: abre na primeira fila com pendência, na ordem das abas.
  const contratos = extras.contratosAta ?? 0;
  const aoContrato = empenhos?.aoContrato ?? 0;
  const aosItens = empenhos?.aosItens ?? 0;
  const vinc = contratos + aoContrato + aosItens;
  if (vinc > 0) {
    r.vinculacao = {
      contagem: vinc,
      destino: contratos > 0 ? ROTAS_VINCULACAO.contratos : aoContrato > 0 ? ROTAS_VINCULACAO.empenhosContrato : ROTAS_VINCULACAO.empenhosItens
    };
  }

  // Financeiro: "Precisa de ação" de Pagamentos (segmento padrão da página); vermelho com erro no SIAFI ou prazo vencido.
  if (financeiro && financeiro.total > 0) r['execucao-financeira'] = { contagem: financeiro.total, vermelho: financeiro.urgente, destino: '/pagamentos' };

  return r;
}
