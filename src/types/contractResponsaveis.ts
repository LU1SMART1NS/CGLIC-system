/**
 * Designação de responsável por um contrato no Contratos.gov.br
 * Endpoint: GET /api/contrato/{contrato_id}/responsaveis
 *
 * `usuario` vem com o CPF mascarado na frente ("***.550.961-** - NOME"); só o nome é exibido.
 */
export interface ContratosGovResponsavelRecord {
  id: number | string;
  contrato_id?: number | string;
  usuario?: string | null;
  /** Ex.: "Gestor", "Gestor Substituto", "Fiscal Técnico", "Fiscal Técnico Substituto", "Fiscal Administrativo" */
  funcao_id?: string | null;
  portaria?: string | null;
  /** "Ativo" ou "Inativo" */
  situacao?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
}

/**
 * Garantia contratual no Contratos.gov.br
 * Endpoint: GET /api/contrato/{contrato_id}/garantias
 * `valor` vem como texto em formato brasileiro ("16.518,66").
 */
export interface ContratosGovGarantiaRecord {
  id: number | string;
  contrato_id?: number | string;
  tipo?: string | null;
  valor?: string | number | null;
  /** YYYY-MM-DD */
  vencimento?: string | null;
}
