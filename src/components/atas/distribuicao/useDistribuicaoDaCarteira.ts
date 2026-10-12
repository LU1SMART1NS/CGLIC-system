import { useMemo } from 'react';
import { getArpPrazo } from '../../../hooks/useAtasPortfolio';
import { formatContractNumber } from '../../../utils/contractNumber';
import type { ComplexidadeAjuste } from '../../../services/complexidadeAjusteService';
import { buildDistribuicaoEquipe } from './distribuicaoEquipe';
import { mesesDeVigencia } from './complexidade';
import type { usePendenciasVinculoAta } from './usePendenciasVinculoAta';
import { chaveGestaoDaArp } from '../../../utils/ataIdentidade';

type Carteira = Pick<ReturnType<typeof usePendenciasVinculoAta>, 'atas' | 'contratos' | 'links'>;

/** Categoria do contrato: `categoria` no Contratos.gov.br, `nomeCategoria` no Compras.gov.br. */
function categoriaDoContrato(raw: unknown): string | undefined {
  const r = raw as { categoria?: unknown; nomeCategoria?: unknown } | undefined;
  const c = r?.categoria ?? r?.nomeCategoria;
  return typeof c === 'string' ? c : undefined;
}

/**
 * Carga de cada gestor e contratos com gestor diferente da ata, a partir da carteira já carregada. Serve à Central de
 * Distribuição e ao número da Visão Geral no menu (mesma conta nos dois lugares).
 */
export function useDistribuicaoDaCarteira({ atas, contratos, links, ajustes }: Carteira & { ajustes?: Record<string, ComplexidadeAjuste> }) {
  return useMemo(
    () =>
      buildDistribuicaoEquipe({
        atas: atas.scopedArps.map((arp) => ({
          numeroAta: arp.numeroAtaRegistroPreco,
          chave: chaveGestaoDaArp(arp),
          uasg: arp.codigoUnidadeGerenciadora,
          objeto: arp.objeto,
          dias: getArpPrazo(arp).dias,
          faixa: getArpPrazo(arp).faixa,
          valor: Number(arp.valorTotal) || 0,
          gestorNome: atas.gestorByAta[chaveGestaoDaArp(arp)],
          itens: (atas.itemsByAta[`${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`] || []).length
        })),
        contratos: contratos.rows.map((row) => ({
          contractKey: row.contractKey,
          numero: formatContractNumber(row.contract),
          objeto: row.contract.objeto,
          dias: row.diasRestantes,
          faixa: row.faixa,
          valor: row.contract.valorGlobal || row.contract.valorInicial || 0,
          gestorNome: row.gestorNome,
          categoria: categoriaDoContrato(row.contract.raw),
          mesesVigencia: mesesDeVigencia(row.contract.dataVigenciaInicio, row.contract.dataVigenciaFim)
        })),
        links,
        attentionItems: contratos.attentionItems,
        ajustes
      }),
    [atas.scopedArps, atas.gestorByAta, atas.itemsByAta, contratos.rows, contratos.attentionItems, links, ajustes]
  );
}
