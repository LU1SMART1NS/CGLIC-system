/**
 * Registro do histórico de um contrato no Contratos.gov.br
 * Endpoint: GET /api/contrato/{contrato_id}/historico
 *
 * A primeira linha costuma ser o próprio contrato (tipo "Contrato"); as demais são termos
 * ("Termo Aditivo", "Termo de Apostilamento"). Os nomes são os da API (snake_case) e os
 * valores monetários vêm como texto em formato brasileiro ("1.270.002,00").
 */
export interface ContratosGovHistoricoRecord {
  id: number | string;
  contrato_id?: number | string;
  tipo?: string;
  numero?: string;
  qualificacao_termo?: Array<{ codigo?: number; descricao?: string }> | null;
  observacao?: string | null;
  data_assinatura?: string | null;
  data_publicacao?: string | null;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
  valor_global?: string | number | null;
  valor_inicial?: string | number | null;
  novo_valor_global?: string | number | null;
  data_inicio_novo_valor?: string | null;
  criado_em?: string | null;
  alterado_em?: string | null;
}
