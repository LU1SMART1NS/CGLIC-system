/** Endereços das páginas do menu Vínculos. */
export const ROTAS_VINCULACAO = {
  contratos: '/vinculacao/contratos',
  empenhosItens: '/vinculacao/empenhos-itens',
  empenhosContrato: '/vinculacao/empenhos-contrato',
  /** Empenhos ao contrato, visão "Sem contrato" (notas que nenhum contrato lista; migration 256). */
  notasForaDoContrato: '/vinculacao/empenhos-contrato?ver=sem-contrato'
} as const;

/** Página da área Alocação (itens da ata às unidades internas). */
export const ROTA_ALOCACAO = '/alocacao';
