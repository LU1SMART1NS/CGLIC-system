import { ROTAS_VINCULACAO, ROTA_ALOCACAO } from '../vinculacao/vinculacaoConfig';
import type { ContagensExtras } from '../vinculacao/contagemExtras';

/** Número de pendências de uma área do menu, se fica vermelho e para onde o clique leva enquanto houver pendência. */
export interface PendenciaDaArea {
  contagem: number;
  vermelho?: boolean;
  /** Por que o número está vermelho, para o leitor de tela (padrão: prazo vencido ou erro). */
  motivoVermelho?: string;
  destino: string;
}

export interface FontesDoMenu {
  empenhos: { aosItens: number; aoContrato: number } | null;
  financeiro: { total: number; urgente: boolean } | null;
  extras: ContagensExtras;
  /** UASGs sem grupo (GTI) confirmado, com e sem sugestão; só o coordenador recebe número. */
  gruposUasgs?: { aConfirmar: number; semSugestao: number } | null;
  /** Beneficiários de emenda sem grupo confirmado, com e sem sugestão; só o coordenador e o gestor de emendas recebem número. */
  gruposBeneficiarios?: { aConfirmar: number; semSugestao: number } | null;
  /**
   * Pedidos de emenda com algum aviso mais as emendas sem pedido (migration 205) e, deles, os com aviso vermelho; só o
   * coordenador e o gestor de emendas recebem número. `semPedido` diz quantas do total são emendas sem pedido.
   */
  emendas?: { total: number; urgentes: number; semPedido?: number } | null;
  /** Fornecedores vencedores de pregão ainda sem ata (Atas › A montar); só gestor e coordenador recebem número. */
  atasAMontar?: number | null;
  /** Pedidos de emenda a contratar (migration 248): o gestor nas atas dele, o coordenador nas atas sem gestor. */
  emendasAContratar?: number | null;
}

/**
 * Regras dos números do menu (só pendências que o perfil resolve; quem calcula cada parte já filtra pelo perfil). Com
 * número, a área abre direto na página e no segmento da pendência; sem número, o menu volta à última página usada.
 */
export function pendenciasDoMenu({ empenhos, financeiro, extras, gruposUasgs, gruposBeneficiarios, emendas, atasAMontar, emendasAContratar }: FontesDoMenu): Record<string, PendenciaDaArea | undefined> {
  const r: Record<string, PendenciaDaArea | undefined> = {};

  // Início: as filas da Central de Distribuição (coordenador) e os pedidos de emenda a contratar (gestor e coordenador).
  const atas = extras.atasSemGestor ?? 0;
  const diverg = extras.gestorDiferente ?? 0;
  const aContratar = emendasAContratar ?? 0;
  if (atas + diverg + aContratar > 0)
    r['visao-geral'] = {
      contagem: atas + diverg + aContratar,
      destino: atas > 0 ? '/atas/distribuicao' : diverg > 0 ? '/atas/distribuicao?aba=DIVERGENCIAS' : '/instrumentos?gaveta=emendasAContratar'
    };

  // Atas e Contratos: atas a montar, sempre em vermelho (a ata precisa ir ao SEI); abre a Carteira de Atas em "A montar".
  if (atasAMontar && atasAMontar > 0)
    r.carteira = { contagem: atasAMontar, vermelho: true, motivoVermelho: 'atas a montar', destino: '/atas?ver=montar' };

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
  // encerrada…). Abre Pedidos sem filtro.
  if (emendas && emendas.total > 0)
    r.emendas = {
      contagem: emendas.total,
      vermelho: emendas.urgentes > 0,
      // Só emendas sem pedido: o clique abre a lista delas; com pedidos com aviso, Pedidos sem filtro.
      destino: emendas.semPedido && emendas.semPedido === emendas.total ? '/emendas/emendas?situacao=sem&ano=todos' : '/emendas/pedidos?ano=todos'
    };

  // Ajustes: UASGs (coordenador) e beneficiários de emenda (coordenador e gestor de emendas) sem grupo confirmado. Abre
  // na primeira tela com pendência, na ordem das abas (Grupos das UASGs antes de Grupos dos beneficiários), em "A
  // confirmar" e, sem nenhum lá, em "Sem sugestão".
  const uasgs = (gruposUasgs?.aConfirmar ?? 0) + (gruposUasgs?.semSugestao ?? 0);
  const benef = (gruposBeneficiarios?.aConfirmar ?? 0) + (gruposBeneficiarios?.semSugestao ?? 0);
  if (uasgs + benef > 0) {
    r.configuracoes = {
      contagem: uasgs + benef,
      destino:
        uasgs > 0
          ? `/admin/grupos-uasgs?situacao=${gruposUasgs!.aConfirmar > 0 ? 'A_CONFIRMAR' : 'SEM_SUGESTAO'}`
          : `/emendas/grupos-beneficiarios?situacao=${gruposBeneficiarios!.aConfirmar > 0 ? 'A_CONFIRMAR' : 'SEM_SUGESTAO'}`
    };
  }

  return r;
}
