/** Abas do Pedido 360 (protótipo aprovado em 27/10/2026). Andamento é a padrão e fica fora do endereço. */
export type Pedido360Aba = 'andamento' | 'itens' | 'execucao' | 'quadro';

export const PEDIDO360_ABAS: Array<{ id: Pedido360Aba; label: string }> = [
  { id: 'andamento', label: 'Andamento' },
  { id: 'itens', label: 'Itens' },
  { id: 'execucao', label: 'Execução' },
  { id: 'quadro', label: 'Quadro do ofício' }
];
