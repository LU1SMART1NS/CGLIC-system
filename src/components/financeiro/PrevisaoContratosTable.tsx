import React, { useCallback } from 'react';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { formatCurrency } from '../carteira/carteiraFormat';
import { carteiraFornecedor, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { CarteiraIdLink, abrirAoClicarNaLinha } from '../carteira/CarteiraRowLink';
import type { TipoExpectativa } from '../../services/expectativaPagamentoService';
import { dataBR } from './financeiroFormat';
import { ROTULO_TIPO, type LinhaExpectativa } from './previsaoLinha';

const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };
const AUTOMATICO = '__AUTO__';

/** Valor de cada um dos 3 meses como barrinhas (altura proporcional ao maior), com os valores no título. */
const Historico: React.FC<{ linha: LinhaExpectativa; meses: string[] }> = ({ linha, meses }) => {
  const h = linha.historico;
  if (!h || h.mesesComPagamento === 0) return <span style={subtle}>sem pagamento nos 3 meses</span>;
  const maior = h.maior ?? 1;
  const titulo = h.porMes.map((p) => `${p.mes.slice(5)}/${p.mes.slice(0, 4)}: ${p.valor ? formatCurrency(p.valor) : 'sem pagamento'}`).join(' · ');
  return (
    <div title={titulo} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem' }}>
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '22px' }}>
        {h.porMes.map((p, i) => (
          <span
            key={meses[i]}
            style={{
              width: '8px',
              height: p.valor ? `${Math.max(3, Math.round((p.valor / maior) * 22))}px` : '2px',
              background: p.valor ? 'var(--primary)' : '#cbd5e1',
              borderRadius: '2px'
            }}
          />
        ))}
      </div>
      <div>
        <div style={{ fontWeight: 700 }}>
          {h.mesesComPagamento} de {meses.length} · média {formatCurrency(h.media ?? 0)}
        </div>
        {h.mesesComPagamento > 1 && (
          <div style={subtle}>
            de {formatCurrency(h.menor ?? 0)} a {formatCurrency(h.maior ?? 0)}
          </div>
        )}
      </div>
    </div>
  );
};

export const PrevisaoContratosTable: React.FC<{
  linhas: LinhaExpectativa[];
  total: number;
  meses: string[];
  podeMarcar: boolean;
  onMarcar: (contractKey: string, tipo: TipoExpectativa | null) => void;
  onOpen: (linha: LinhaExpectativa) => void;
  onResetFilters: () => void;
  pageSize?: number;
}> = ({ linhas, total, meses, podeMarcar, onMarcar, onOpen, onResetFilters, pageSize = 20 }) => {
  const { currentPage, setPage, pageItems } = useCarteiraPagination(linhas, useCallback((l: LinhaExpectativa) => l.contractKey, []), pageSize);

  if (total === 0) {
    return <CarteiraNoResults title="Nenhum contrato vigente." description="Não há contratos vigentes no escopo do seu perfil." onResetFilters={onResetFilters} />;
  }
  if (linhas.length === 0) {
    return <CarteiraNoResults title="Nenhum contrato neste grupo." description="Escolha outro grupo ou limpe os filtros." onResetFilters={onResetFilters} />;
  }

  return (
    <div data-testid="previsao-contratos-table" className="carteira-shell" style={carteiraTableShell}>
      <div style={{ overflowX: 'auto' }}>
        <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={carteiraTh}>Contrato</th>
              <th style={carteiraTh}>Pagamentos nos 3 meses</th>
              <th style={carteiraTh}>Como é pago</th>
              <th style={carteiraTh}>Entregas previstas</th>
              <th style={carteiraTh}>Gestor</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((l) => {
              const valorSelect = l.marca?.tipo ?? AUTOMATICO;
              const sugestaoTexto = l.sugestao === 'MENSAL' ? 'mensal?' : l.sugestao === 'TALVEZ_MENSAL' ? 'talvez mensal' : 'sem padrão';
              return (
                <tr key={l.contractKey} data-testid={`previsao-row-${l.contractKey}`} className="carteira-row-link" onClick={abrirAoClicarNaLinha(() => onOpen(l))}>
                  <td data-role="id" style={{ ...carteiraTd, minWidth: '220px', maxWidth: '340px' }}>
                    <CarteiraIdLink onClick={() => onOpen(l)} label={`Ver os pagamentos do contrato ${l.numero}`} title="Ver os pagamentos do contrato">
                      {l.numero}
                    </CarteiraIdLink>
                    {l.fornecedorNome && <div title={l.fornecedorNome} style={carteiraFornecedor}>{l.fornecedorNome}</div>}
                  </td>
                  <td data-label="3 meses" style={{ ...carteiraTd, minWidth: '250px', whiteSpace: 'nowrap' }}>
                    <Historico linha={l} meses={meses} />
                  </td>
                  <td data-label="Como é pago" style={{ ...carteiraTd, minWidth: '190px' }}>
                    <div>
                      {podeMarcar ? (
                        <select
                          className="form-input"
                          aria-label={`Como o contrato ${l.numero} é pago`}
                          value={valorSelect}
                          onChange={(e) => onMarcar(l.contractKey, e.target.value === AUTOMATICO ? null : (e.target.value as TipoExpectativa))}
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                          data-testid={`previsao-tipo-${l.contractKey}`}
                        >
                          <option value={AUTOMATICO}>Automático · {sugestaoTexto}</option>
                          <option value="MENSAL">Mensal</option>
                          <option value="ENTREGA">Por entrega</option>
                          <option value="EVENTUAL">Eventual</option>
                        </select>
                      ) : l.marca ? (
                        <StatusBadge label={ROTULO_TIPO[l.marca.tipo]} variant="info" size="sm" dot={false} />
                      ) : (
                        <span style={subtle}>Automático · {sugestaoTexto}</span>
                      )}
                      {l.marca?.valorMensal ? <div style={subtle}>valor mensal informado: {formatCurrency(l.marca.valorMensal)}</div> : null}
                      {l.marca?.atualizadoPorNome && <div style={subtle}>marcado por {l.marca.atualizadoPorNome}</div>}
                    </div>
                  </td>
                  <td data-label="Entregas previstas" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    {l.entregas.length > 0 ? (
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {l.entregas.length} {l.entregas.length === 1 ? 'entrega' : 'entregas'}
                        </div>
                        <div style={subtle}>
                          próxima {dataBR(l.entregas[0].dataPrevista)} · {formatCurrency(l.entregas[0].valor)}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td data-label="Gestor" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                    {l.gestorNome || <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CarteiraPagination page={currentPage} pageSize={pageSize} total={linhas.length} onChange={setPage} testIdPrefix="previsao" />
    </div>
  );
};
