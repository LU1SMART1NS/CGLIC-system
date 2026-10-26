/**
 * Áreas (gavetas) do Início: Situação para todos, Distribuição para coordenador e consulta, Alocação para o gestor de saldos;
 * saldo a vencer, nome curto, empenho a conferir, notas sem pedido e sobra de emenda no Início do gestor de emendas. Nomes de 1 a 3
 * palavras (decisão de 25/10/2026): o resumo no botão diz o número e a regra fica no ⓘ da gaveta aberta.
 */
export type PainelGavetaId = 'situacao' | 'distribuicao' | 'alocacao' | 'saldoLivre' | 'semNomeCurto' | 'empenhoAConferir' | 'notasSemPedido' | 'sobraEmenda';

export const PAINEL_GAVETA_NOMES: Record<PainelGavetaId, string> = {
  situacao: 'Situação',
  distribuicao: 'Distribuição',
  alocacao: 'Alocação',
  saldoLivre: 'Saldo a vencer',
  semNomeCurto: 'Nome do item',
  empenhoAConferir: 'Empenho a conferir',
  notasSemPedido: 'Notas sem pedido',
  sobraEmenda: 'Sobra de emenda'
};
