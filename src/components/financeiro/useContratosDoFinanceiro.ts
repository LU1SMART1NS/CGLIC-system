import { useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useContractsPortfolio } from '../../hooks/useContractsPortfolio';
import { canFilterByGestor } from '../carteira/carteiraGestor';
import { formatContractNumber } from '../../utils/contractNumber';

export interface ContratoDoFinanceiro {
  numero: string;
  fornecedorNome?: string;
  gestorNome?: string;
  /** Vigência encerrada. */
  expirado?: boolean;
  /** Valor global (ou inicial) do contrato. */
  valor?: number;
}

/** "200331-00094-2022" → "00094/2022" (quando o contrato não está na carteira carregada). */
export function numeroDaChave(contractKey: string): string {
  const m = contractKey.match(/^\d{6}-((?:NE)?\d{5})-(\d{4})$/);
  return m ? `${m[1]}/${m[2]}` : contractKey;
}

/** UASG do contrato, tirada da chave. */
export function uasgDaChave(contractKey: string): string {
  return contractKey.slice(0, 6);
}

/**
 * Contratos da carteira (mesmo cache da Carteira de Contratos) para as abas do Financeiro: número, fornecedor e
 * gestor de cada chave, e o recorte do perfil "gestor", que vê só o financeiro dos próprios contratos.
 */
export function useContratosDoFinanceiro() {
  const { role } = useAuth();
  const { rows, isLoading, isLoadingScope } = useContractsPortfolio();
  const showGestorFilter = canFilterByGestor(role);

  const porChave = useMemo(() => {
    const map = new Map<string, ContratoDoFinanceiro>();
    for (const r of rows) {
      map.set(r.contractKey, {
        numero: formatContractNumber(r.contract),
        fornecedorNome: r.contract.fornecedorNome || undefined,
        gestorNome: r.gestorNome,
        expirado: r.faixa === 'EXPIRADO',
        valor: r.contract.valorGlobal || r.contract.valorInicial || undefined
      });
    }
    return map;
  }, [rows]);

  /** Perfil gestor: só as chaves da carteira dele. Demais perfis: sem recorte (null). */
  const escopo = useMemo(() => (role === 'gestor' ? new Set(porChave.keys()) : null), [role, porChave]);

  /** Contratos para abrir um ciclo de pagamento: vigentes primeiro, depois pelo número. */
  const lista = useMemo(
    () =>
      rows
        .map((r) => ({
          contractKey: r.contractKey,
          numero: formatContractNumber(r.contract),
          fornecedorNome: r.contract.fornecedorNome || undefined,
          gestorNome: r.gestorNome,
          expirado: r.faixa === 'EXPIRADO'
        }))
        .sort((a, b) => Number(a.expirado) - Number(b.expirado) || b.numero.split('/').reverse().join('/').localeCompare(a.numero.split('/').reverse().join('/'))),
    [rows]
  );

  const contrato = useCallback(
    (contractKey: string): ContratoDoFinanceiro => porChave.get(contractKey) ?? { numero: numeroDaChave(contractKey) },
    [porChave]
  );

  return {
    contrato,
    lista,
    escopo,
    showGestorFilter,
    isLoading: isLoading || (role === 'gestor' && isLoadingScope)
  };
}
