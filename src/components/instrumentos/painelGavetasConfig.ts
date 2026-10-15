/** Áreas (gavetas) da Visão Geral: Situação para todos, Distribuição para coordenador e consulta, Alocação para o gestor de saldos. */
export type PainelGavetaId = 'situacao' | 'distribuicao' | 'alocacao';

export const PAINEL_GAVETA_NOMES: Record<PainelGavetaId, string> = {
  situacao: 'Situação',
  distribuicao: 'Distribuição',
  alocacao: 'Alocação'
};
