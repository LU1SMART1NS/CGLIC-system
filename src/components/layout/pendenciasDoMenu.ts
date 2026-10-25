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
  /** UASGs sem grupo (GTI) confirmado, com e sem sugestão; só o coordenador recebe número. */
  gruposUasgs?: { aConfirmar: number; semSugestao: number } | null;
  /** Pedidos de emenda com algum aviso e, deles, os com aviso vermelho; só o coordenador e o gestor de emendas recebem número. */
  emendas?: { total: number; urgentes: number } | null;
}

/**
 * Regras dos números do menu (só pendências que o perfil resolve; quem calcula cada parte já filtra pelo perfil). Com
 * número, a área abre direto na página e no segmento da pendência; sem número, o menu volta à última página usada.
 */
export function pendenciasDoMenu({ empenhos, financeiro, extras, gruposUasgs, emendas }: FontesDoMenu): Record<string, PendenciaDaArea | undefined> {
  const r: Record<string, PendenciaDaArea | undefined> = {};

  // Início (coordenador): as filas da Central de Distribuição.
  const atas = extras.atasSemGestor ?? 0;
  const diverg = extras.gestorDiferente ?? 0;
  if (atas + diverg > 0) r['visao-geral'] = { contagem: atas + diverg, destino: atas > 0 ? '/atas/distribuicao' : '/atas/distribuicao?aba=DIVERGENCIAS' };

  // Alocação: itens sem alocação ou alocados em parte.
  if ((extras.itensAAlocar ?? 0) > 0) r.alocacao = { contagem: extras.itensAAlocar!, destino: ROTA_ALOCACAO };

  // Vínculos: abre na primeira fila com pendência, na ordem das abas.
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

  // Emendas (padrão do Financeiro): pedidos com algum aviso; vermelho com aviso vermelho (prazo de indicação vencido, ata
  // encerrada…). Abre Pedidos em "Com algum aviso".
  if (emendas && emendas.total > 0) r.emendas = { contagem: emendas.total, vermelho: emendas.urgentes > 0, destino: '/emendas/pedidos?aviso=com' };

  // Ajustes (coordenador): UASGs sem grupo confirmado; abre em "A confirmar" e, sem nenhuma lá, em "Sem sugestão".
  const aConfirmar = gruposUasgs?.aConfirmar ?? 0;
  const semSugestao = gruposUasgs?.semSugestao ?? 0;
  if (aConfirmar + semSugestao > 0) {
    r.configuracoes = {
      contagem: aConfirmar + semSugestao,
      destino: `/admin/grupos-uasgs?situacao=${aConfirmar > 0 ? 'A_CONFIRMAR' : 'SEM_SUGESTAO'}`
    };
  }

  return r;
}
