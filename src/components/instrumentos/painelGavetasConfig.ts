/**
 * Áreas (gavetas) do Início: Situação para todos, Distribuição para coordenador e consulta, Alocação para o gestor de saldos;
 * Saldo livre perto do fim e itens sem nome curto no Início do gestor de emendas.
 */
export type PainelGavetaId = 'situacao' | 'distribuicao' | 'alocacao' | 'saldoLivre' | 'semNomeCurto';

export const PAINEL_GAVETA_NOMES: Record<PainelGavetaId, string> = {
  situacao: 'Situação',
  distribuicao: 'Distribuição',
  alocacao: 'Alocação',
  saldoLivre: 'Saldo livre perto do fim',
  semNomeCurto: 'Itens sem nome curto'
};
