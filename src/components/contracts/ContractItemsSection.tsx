import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ErrorState } from '../../design-system/components/ErrorState';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { abrirAoClicarNaLinha, CarteiraIdLink } from '../carteira/CarteiraRowLink';
import { CarteiraSortHeader } from '../carteira/CarteiraSortHeader';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { buildAtaItemPath } from '../../hooks/useAta';
import {
  cruzarItensComVinculos,
  type ItemDoContrato,
  type ItensDoContrato,
  type VinculoDoContrato
} from '../../services/itensContratoService';

interface ContractItemsSectionProps {
  dados: ItensDoContrato | undefined;
  isLoading: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

const formatMoeda = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatQtd = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 4 }));
/** Número do item com cinco dígitos, como na ata ("00004"). */
const formatNumeroItem = (n: number | null) => (n === null ? '—' : String(n).padStart(5, '0'));
const rotuloDoVinculo = (v: VinculoDoContrato) => `Ata ${v.numeroAta} · Item ${formatNumeroItem(v.numeroItem)}`;

interface Linha {
  item: ItemDoContrato;
  vinculo: VinculoDoContrato | null;
}

const SORT_COLUMNS: Record<string, CarteiraSortColumn<Linha>> = {
  item: { value: (l) => l.item.numeroItem ?? l.item.posicao },
  quantidade: { value: (l) => l.item.quantidade ?? 0, firstDir: 'desc' },
  unitario: { value: (l) => l.item.valorUnitario ?? 0, firstDir: 'desc' },
  total: { value: (l) => l.item.valorTotal ?? 0, firstDir: 'desc' },
  vinculo: { value: (l) => (l.vinculo ? l.vinculo.numeroItem : Number.MAX_SAFE_INTEGER) }
};

/**
 * Itens do contrato, como a fonte oficial informa, lidos do banco (a sincronização grava; esta tela só lê).
 * Cada item mostra o item da ata a que está vinculado, e a tela avisa o vínculo que aponta para um item que o
 * contrato não tem.
 */
export const ContractItemsSection: React.FC<ContractItemsSectionProps> = ({ dados, isLoading, error, onRetry }) => {
  const navigate = useNavigate();
  const abrirItemDaAta = (v: VinculoDoContrato) => navigate(buildAtaItemPath(v.numeroAta, v.uasgAta, v.numeroItem));
  const itens = dados?.itens ?? [];
  const vinculos = dados?.vinculos ?? [];

  const { linhas, vinculosSemItem } = useMemo(() => {
    const cruzamento = cruzarItensComVinculos({ itens, vinculos });
    return {
      linhas: itens.map<Linha>((item) => ({ item, vinculo: cruzamento.vinculoPorPosicao.get(item.posicao) ?? null })),
      vinculosSemItem: cruzamento.vinculosSemItem
    };
  }, [itens, vinculos]);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(linhas, SORT_COLUMNS);
  const sort = { activeKey: sortKey, activeDir: sortDir, onSort: toggle };

  if (isLoading) return <SkeletonLoader variant="rectangular" count={3} testId="contract-items-loading" />;
  if (error) {
    return (
      <ErrorState
        title="Não foi possível carregar os itens do contrato."
        message={error.message}
        onRetry={onRetry}
        testId="contract-items-error"
      />
    );
  }

  if (!dados?.leitura && itens.length === 0) {
    return (
      <EmptyState
        testId="contract-items-not-read"
        title="Os itens deste contrato ainda não foram lidos."
        description="A sincronização com as fontes oficiais traz os itens de cada contrato. Ela roda de hora em hora; volte mais tarde."
      />
    );
  }
  if (itens.length === 0) {
    return (
      <EmptyState
        testId="contract-items-empty"
        title="As fontes oficiais não informam itens para este contrato."
        description="O Contratos.gov.br e o Compras.gov.br não devolveram itens. Isso acontece com contratos manuais ou ainda não publicados."
      />
    );
  }

  const valorTotal = itens.reduce((soma, i) => soma + (i.valorTotal ?? 0), 0);
  const algumVinculado = linhas.some((l) => l.vinculo);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {vinculosSemItem.length > 0 && (
        <NoticeBar tone="warning" testId="contract-items-orphan-links">
          {vinculosSemItem.length === 1
            ? `O vínculo ${rotuloDoVinculo(vinculosSemItem[0])} não corresponde a nenhum item deste contrato na fonte oficial. Confira o vínculo na ata.`
            : `Os vínculos ${vinculosSemItem.map(rotuloDoVinculo).join(', ')} não correspondem a itens deste contrato na fonte oficial. Confira os vínculos na ata.`}
        </NoticeBar>
      )}
      {!algumVinculado && vinculosSemItem.length === 0 && (
        <NoticeBar tone="info" testId="contract-items-no-links">
          Nenhum item deste contrato está vinculado a uma ata. O vínculo é feito na Ata 360, pela Coordenação.
        </NoticeBar>
      )}

      <div data-testid="contract-items-table" style={carteiraTableShell}>
        <div style={{ overflowX: 'auto' }}>
          <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <CarteiraSortHeader label="Item" sortKey="item" {...sort} />
                <CarteiraSortHeader label="Quantidade" sortKey="quantidade" align="right" {...sort} />
                <CarteiraSortHeader label="Valor unitário" sortKey="unitario" align="right" {...sort} />
                <CarteiraSortHeader label="Valor total" sortKey="total" align="right" {...sort} />
                <CarteiraSortHeader label="Item da ata" sortKey="vinculo" hint="Item da ata a que este item do contrato está vinculado. Clique na linha para abrir o item na ata." {...sort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ item, vinculo }) => {
                return (
                  <tr
                    key={item.posicao}
                    data-testid={`contract-item-row-${item.posicao}`}
                    className={vinculo ? 'carteira-row-link' : undefined}
                    onClick={vinculo ? abrirAoClicarNaLinha(() => abrirItemDaAta(vinculo)) : undefined}
                  >
                    <td style={{ ...carteiraTd, maxWidth: '520px', minWidth: '260px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                        {/* Com vínculo, o número do item já aparece na coluna "Item da ata"; sem vínculo, é só aqui. */}
                        {!vinculo && <span style={{ fontWeight: 800, flexShrink: 0 }}>{formatNumeroItem(item.numeroItem)}</span>}
                        <span
                          title={item.descricao ?? undefined}
                          style={{ fontWeight: 600, color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {item.descricao ?? 'Sem descrição'}
                        </span>
                      </div>
                    </td>
                    <td data-label="Quantidade" style={{ ...carteiraTd, textAlign: 'right' }}>{formatQtd(item.quantidade)}</td>
                    <td data-label="Valor unitário" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatMoeda(item.valorUnitario)}</td>
                    <td data-label="Valor total" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>{formatMoeda(item.valorTotal)}</td>
                    <td data-label="Item da ata" style={carteiraTd}>
                      {vinculo ? (
                        <CarteiraIdLink
                          onClick={() => abrirItemDaAta(vinculo)}
                          label={`Abrir o item ${formatNumeroItem(vinculo.numeroItem)} na ata ${vinculo.numeroAta}`}
                          title="Abrir o item na ata"
                          testId={`contract-item-link-${item.posicao}`}
                        >
                          {rotuloDoVinculo(vinculo)}
                        </CarteiraIdLink>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Sem vínculo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th style={{ ...carteiraTh, textAlign: 'left' }} colSpan={3}>
                  Total de {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                </th>
                <th style={{ ...carteiraTh, textAlign: 'right', whiteSpace: 'nowrap' }} data-testid="contract-items-total">
                  {formatMoeda(valorTotal)}
                </th>
                <th style={carteiraTh} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  );
};
