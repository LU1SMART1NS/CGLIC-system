import { useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useContractsPortfolio } from '../../hooks/useContractsPortfolio';
import { canFilterByGestor } from '../carteira/carteiraGestor';
import { formatContractNumber } from '../../utils/contractNumber';
import { naoCarregou } from '../fonte/useLeiturasComFalha';
import { useContratosFiscalizacao } from '../../hooks/useFiscalizacao';
import { ehDoFiscal } from '../../utils/fiscalizacao';

export interface ContratoDoFinanceiro {
  numero: string;
  fornecedorNome?: string;
  gestorNome?: string;
  /** Vigência encerrada. */
  expirado?: boolean;
  /** Fim da vigência (YYYY-MM-DD), quando a fonte informa. */
  vigenciaFim?: string;
  /** Valor global (ou inicial) do contrato. */
  valor?: number;
  fornecedorCnpj?: string;
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
 * gestor de cada chave, e o recorte do perfil "gestor", que vê só o financeiro dos próprios contratos, e do gestor de
 * fiscalização, que vê só o dos contratos em que é o fiscal. Usa a versão
 * leve da carteira, sem o painel do Início: nenhuma aba do Financeiro mostra as pendências dos contratos.
 */
export function useContratosDoFinanceiro({ enabled = true }: { enabled?: boolean } = {}) {
  const { role, user } = useAuth();
  // enabled: false (números do menu antes de a tela encher) não lê nada; as telas do Financeiro e de Vínculos leem na hora.
  const { rows, isLoading, isLoadingScope, leiturasDosContratos } = useContractsPortfolio({ pendencias: false, enabled });
  const showGestorFilter = canFilterByGestor(role);

  const porChave = useMemo(() => {
    const map = new Map<string, ContratoDoFinanceiro>();
    for (const r of rows) {
      map.set(r.contractKey, {
        numero: formatContractNumber(r.contract),
        fornecedorNome: r.contract.fornecedorNome || undefined,
        gestorNome: r.gestorNome,
        expirado: r.faixa === 'EXPIRADO',
        vigenciaFim: r.contract.dataVigenciaFim || undefined,
        valor: r.contract.valorGlobal || r.contract.valorInicial || undefined,
        fornecedorCnpj: r.contract.fornecedorCnpjCpf || undefined
      });
    }
    return map;
  }, [rows]);

  // Gestor de fiscalização: o recorte vem da Fiscalização (contratos em que ele é o fiscal), não da carteira.
  const ehFiscal = role === 'gestor_fiscalizacao';
  const fiscalizacao = useContratosFiscalizacao({ enabled: enabled && ehFiscal });
  const leituras = [...(leiturasDosContratos ?? []), ...(ehFiscal ? [{ rotulo: 'contratos da fiscalização', query: fiscalizacao }] : [])];
  const contratosNaoCarregaram =
    leituras.some((l) => (role === 'gestor' || l.rotulo.startsWith('contratos da UASG')) && naoCarregou(l.query)) ||
    (ehFiscal && naoCarregou(fiscalizacao));

  /** Gestor: só as chaves da carteira dele. Gestor de fiscalização: só os contratos em que é o fiscal. Demais perfis: sem recorte (null). */
  const escopo = useMemo(() => {
    if (role === 'gestor') return new Set(porChave.keys());
    if (ehFiscal) return new Set((fiscalizacao.data ?? []).filter((c) => ehDoFiscal(c, user?.id)).map((c) => c.contractKey));
    return null;
  }, [role, ehFiscal, porChave, fiscalizacao.data, user?.id]);

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
    isLoading: isLoading || (role === 'gestor' && isLoadingScope) || (ehFiscal && fiscalizacao.isLoading),
    /** Contratos, gestores e o escopo do gestor: se falharem, a tela avisa (sem eles o gestor veria o Financeiro vazio). */
    leituras,
    /**
     * Os contratos (ou, no perfil gestor, alguma leitura do recorte dele) falharam sem leitura anterior: número,
     * vigência e recorte dependem deles, então contagens e "nada a fazer" não valem.
     */
    contratosNaoCarregaram
  };
}
