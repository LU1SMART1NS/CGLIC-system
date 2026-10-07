import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionButton, NoticeBar, StatusBadge, useToast } from '../../design-system';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { usePrevisaoMensal } from '../../hooks/usePrevisaoMensal';
import { differenceInBusinessDays, parseDateBRT } from '../../services/temporalEngineService';
import { mesDaProximaPrevisao, prazoDaPrevisao, somarMes, textoParaSei, type LinhaPrevisao, type OrigemPrevisao } from '../../services/previsaoMensalService';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { hasActiveCarteiraFilters, useCarteiraFilters, type CarteiraFilterSchema } from '../carteira/carteiraFilters';
import { formatCurrency, formatCurrencyCompact } from '../carteira/carteiraFormat';
import { carteiraSubtitle, carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { useContratosDoFinanceiro } from './useContratosDoFinanceiro';
import { dataBR, normalizarBusca, rotuloDoMes } from './financeiroFormat';
import { AjustarLinhaModal, IncluirLinhaModal, RegistrarEnvioModal } from './PrevisaoMesModais';


interface FiltrosPrevisaoMes {
  origem: string;
  emenda: string;
  busca: string;
}
const ORIGENS = ['MANTIDAS', 'FATURA', 'CICLO', 'MENSAL', 'ENTREGA', 'MANUAL', 'RETIRADAS'] as const;
const FILTROS: CarteiraFilterSchema<FiltrosPrevisaoMes> = {
  origem: { param: 'origem', default: 'MANTIDAS', values: ORIGENS },
  emenda: { param: 'emenda', default: 'TODAS', values: ['TODAS', 'SIM', 'NAO'] },
  busca: { param: 'busca', default: '' }
};

const ORIGEM: Record<OrigemPrevisao, { label: string; variant: 'info' | 'neutral' | 'warning' | 'purple' | 'success' }> = {
  FATURA: { label: 'Fatura', variant: 'info' },
  CICLO: { label: 'Ciclo', variant: 'purple' },
  MENSAL: { label: 'Mensal', variant: 'neutral' },
  ENTREGA: { label: 'Entrega prevista', variant: 'warning' },
  MANUAL: { label: 'Incluída', variant: 'success' }
};
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };

/**
 * Previsão do mês (Portaria DGFNSP 50/2025, art. 5º, § 2º, III): as linhas que a CGLIC informa até o último dia útil
 * do mês anterior, com ajustes linha a linha, a tabela para colar no SEI e o registro do envio.
 */
export const PrevisaoMes: React.FC = () => {
  const toast = useToast();
  const { user, role } = useAuth();
  const podeEditar = role === 'gestor' || role === 'admin';
  const registradoPorNome = (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || undefined;
  const [params, setParams] = useSearchParams();
  const proxima = mesDaProximaPrevisao();
  const mes = /^\d{4}-\d{2}$/.test(params.get('mes') ?? '') ? (params.get('mes') as string) : proxima;
  const mudarMes = (m: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (m === proxima) next.delete('mes');
        else next.set('mes', m);
        return next;
      },
      { replace: true }
    );

  const { contrato, lista: contratos, escopo, isLoading: carregandoContratos } = useContratosDoFinanceiro();
  const vigentes = useMemo(() => new Set(contratos.filter((c) => !c.expirado && (!escopo || escopo.has(c.contractKey))).map((c) => c.contractKey)), [contratos, escopo]);
  const { linhas: todas, envio, prazoEmenda, sugeridosSemMarca, isLoading, ajustar, registrarEnvio } = usePrevisaoMensal(mes, vigentes);
  const { filters, setFilter, resetFilters } = useCarteiraFilters(FILTROS);

  const [ajustando, setAjustando] = useState<LinhaPrevisao | null>(null);
  const [incluindo, setIncluindo] = useState(false);
  const [registrando, setRegistrando] = useState(false);

  // Perfil gestor: só os próprios contratos.
  const linhas = useMemo(() => todas.filter((l) => !escopo || escopo.has(l.contractKey)), [todas, escopo]);
  const mantidas = linhas.filter((l) => !l.retirada && !l.semValor);
  const total = mantidas.reduce((s, l) => s + l.valor, 0);
  const totalEmendas = mantidas.filter((l) => l.emenda).reduce((s, l) => s + l.valor, 0);
  const n = (o: string) =>
    o === 'MANTIDAS' ? linhas.filter((l) => !l.retirada).length : o === 'RETIRADAS' ? linhas.filter((l) => l.retirada).length : linhas.filter((l) => !l.retirada && l.origem === o).length;

  const lista = useMemo(() => {
    const q = normalizarBusca(filters.busca);
    return linhas
      .filter((l) => {
        if (filters.origem === 'RETIRADAS' ? !l.retirada : l.retirada) return false;
        if (!['MANTIDAS', 'RETIRADAS'].includes(filters.origem) && l.origem !== filters.origem) return false;
        if (filters.emenda === 'SIM' && !l.emenda) return false;
        if (filters.emenda === 'NAO' && l.emenda) return false;
        if (q) {
          const c = contrato(l.contractKey);
          if (!normalizarBusca(`${c.numero} ${c.fornecedorNome ?? ''} ${l.empenho ?? ''} ${l.detalhe}`).includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => contrato(a.contractKey).numero.localeCompare(contrato(b.contractKey).numero) || b.valor - a.valor);
  }, [linhas, filters, contrato]);

  // Prazo (último dia útil do mês anterior) e situação.
  const prazo = prazoDaPrevisao(mes);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diasAtePrazo = differenceInBusinessDays(parseDateBRT(prazo) ?? hoje, hoje);
  const prazoPassou = (parseDateBRT(prazo)?.getTime() ?? 0) < hoje.getTime();

  const copiar = async () => {
    const paraCopiar = lista.filter((l) => !l.retirada && !l.semValor);
    try {
      await navigator.clipboard.writeText(textoParaSei(paraCopiar, contrato));
      toast.success(`Tabela copiada (${paraCopiar.length} ${paraCopiar.length === 1 ? 'linha' : 'linhas'}). Cole no documento do SEI.`);
    } catch {
      toast.error('Não foi possível copiar. Tente de novo.');
    }
  };
  const alternarRetirada = async (l: LinhaPrevisao) => {
    try {
      if (l.origem === 'MANUAL') {
        await ajustar({ chave: l.chave, remover: true });
        toast.success('Linha incluída apagada.');
      } else {
        await ajustar({ chave: l.chave, retirada: !l.retirada, valor: l.ajustada && l.valor !== l.valorOriginal ? l.valor : null, subitem: l.subitem, emenda: l.emenda === l.emendaAutomatica ? null : l.emenda, registradoPorNome });
      }
    } catch (err) {
      toast.error((err as { message?: string } | null)?.message || 'Não foi possível alterar a linha.');
    }
  };

  const opcoesMes = [-3, -2, -1, 0, 1].map((d) => somarMes(proxima, d));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label htmlFor="previsao-mes" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Previsão de</label>
        <select id="previsao-mes" className="form-input" value={mes} onChange={(e) => mudarMes(e.target.value)} style={{ width: 'auto' }} data-testid="previsao-mes">
          {opcoesMes.map((m) => (
            <option key={m} value={m}>
              {rotuloDoMes(m)}{m === proxima ? ' (próxima)' : ''}
            </option>
          ))}
        </select>
      </div>

      {envio ? (
        <NoticeBar tone="success" testId="previsao-enviada">
          Previsão de {rotuloDoMes(mes)} enviada em {dataBR(envio.enviadoEm)} (SEI {envio.sei}
          {envio.enviadoPorNome ? `, por ${envio.enviadoPorNome}` : ''}) · {envio.linhas.length} linhas · {formatCurrency(envio.total)}. Se mudar algo,
          registre o envio de novo.
        </NoticeBar>
      ) : (
        <NoticeBar tone={prazoPassou ? 'danger' : diasAtePrazo <= 3 ? 'warning' : 'info'} testId="previsao-prazo">
          Previsão de {rotuloDoMes(mes)}: informar até {dataBR(prazo)} (último dia útil de {rotuloDoMes(somarMes(mes, -1))}, Portaria 50, art. 5º, § 2º, III) ·{' '}
          {prazoPassou ? 'o prazo passou' : diasAtePrazo === 0 ? 'vence hoje' : `faltam ${diasAtePrazo} ${diasAtePrazo === 1 ? 'dia útil' : 'dias úteis'}`} · ainda não enviada.
        </NoticeBar>
      )}
      {totalEmendas > 0 && (
        <NoticeBar tone={prazoEmenda ? 'info' : 'warning'} testId="previsao-emendas">
          Emendas parlamentares nesta previsão: {formatCurrency(totalEmendas)}.{' '}
          {prazoEmenda
            ? `Prazo próprio: ${dataBR(prazoEmenda.dataLimite)} (${prazoEmenda.portaria}, Portaria 50, art. 5º, § 3º).`
            : 'O prazo das emendas deste mês não está cadastrado: o coordenador cadastra em Regras de Alertas.'}{' '}
          Use o filtro Emenda para copiar só essas linhas.
        </NoticeBar>
      )}
      {sugeridosSemMarca > 0 && (
        <NoticeBar tone="warning" testId="previsao-sugeridos-sem-marca">
          {sugeridosSemMarca} {sugeridosSemMarca === 1 ? 'contrato parece mensal e ainda não foi marcado' : 'contratos parecem mensais e ainda não foram marcados'}:
          não entram na previsão. Marque em "Como cada contrato é pago".
        </NoticeBar>
      )}

      {isLoading || carregandoContratos ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-busy="true" aria-label="Montando a previsão...">
          <SkeletonLoader variant="rectangular" height="40px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : (
        <>
          <CarteiraSegmentTabs
            testIdPrefix="previsao-origem"
            ariaLabel="Origem da linha"
            active={filters.origem}
            onSelect={(v) => setFilter('origem', v)}
            segments={[
              { id: 'MANTIDAS', label: 'Previstas', count: n('MANTIDAS') },
              { id: 'FATURA', label: 'Faturas', count: n('FATURA'), title: 'Faturas do Contratos.gov.br ainda não pagas' },
              { id: 'CICLO', label: 'Ciclos', count: n('CICLO'), title: 'Ciclos de pagamento em aberto' },
              { id: 'MENSAL', label: 'Mensais', count: n('MENSAL'), title: 'Contratos mensais ainda sem nota' },
              { id: 'ENTREGA', label: 'Entregas', count: n('ENTREGA'), title: 'Entregas previstas para o mês' },
              { id: 'MANUAL', label: 'Incluídas', count: n('MANUAL') },
              { id: 'RETIRADAS', label: 'Retiradas', count: n('RETIRADAS') }
            ]}
            meta={`${formatCurrencyCompact(total)} previstos`}
          />

          <CarteiraFilterBar
            busca={filters.busca}
            searchPlaceholder="Buscar por contrato, contratada, empenho..."
            onChangeBusca={(v) => setFilter('busca', v)}
            hasActiveFilters={hasActiveCarteiraFilters(FILTROS, filters)}
            onResetFilters={resetFilters}
            counter={carteiraCounter(lista.length, linhas.length, hasActiveCarteiraFilters(FILTROS, filters), 'linha', 'linhas')}
            testIdPrefix="previsao-mes"
          >
            <CarteiraFilterButton
              label="Emenda"
              value={filters.emenda}
              emptyValue="TODAS"
              options={[
                { value: 'SIM', label: 'Só emendas', count: linhas.filter((l) => !l.retirada && l.emenda).length },
                { value: 'NAO', label: 'Sem emendas', count: linhas.filter((l) => !l.retirada && !l.emenda).length }
              ]}
              onChange={(v) => setFilter('emenda', v)}
              testId="previsao-filter-emenda"
            />
          </CarteiraFilterBar>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {podeEditar && <ActionButton action="adicionar" size="sm" onClick={() => setIncluindo(true)} label="Incluir linha" data-testid="previsao-incluir" />}
            <ActionButton action="copiar" size="sm" onClick={() => void copiar()} label="Copiar para o SEI" data-testid="previsao-copiar" disabled={filters.origem === 'RETIRADAS'} />
            {podeEditar && (
              <ActionButton action="confirmar" size="sm" onClick={() => setRegistrando(true)} label={envio ? 'Registrar envio de novo' : 'Registrar envio'} disabled={mantidas.length === 0} data-testid="previsao-registrar" />
            )}
          </div>

          {lista.length === 0 ? (
            <NoticeBar tone="info" testId="previsao-vazia">Nenhuma linha neste grupo.</NoticeBar>
          ) : (
            <div data-testid="previsao-mes-table" className="carteira-shell" style={carteiraTableShell}>
              <div style={{ overflowX: 'auto' }}>
                <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={carteiraTh}>Contrato</th>
                      <th style={carteiraTh}>UG</th>
                      <th style={carteiraTh}>Empenho</th>
                      <th style={carteiraTh}>Subitem</th>
                      <th style={{ ...carteiraTh, textAlign: 'right' }}>Valor</th>
                      <th style={carteiraTh}>Origem</th>
                      {podeEditar && <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((l) => {
                      const c = contrato(l.contractKey);
                      const o = ORIGEM[l.origem];
                      return (
                        <tr key={l.chave} data-testid={`previsao-linha-${l.chave}`} style={{ opacity: l.retirada ? 0.6 : 1 }}>
                          <td data-role="id" style={{ ...carteiraTd, minWidth: '220px', maxWidth: '340px' }}>
                            <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{c.numero}</div>
                            <div title={c.fornecedorNome} style={carteiraSubtitle}>
                              {c.fornecedorNome}
                              {c.fornecedorCnpj ? ` · ${c.fornecedorCnpj}` : ''}
                            </div>
                          </td>
                          <td data-label="UG" style={carteiraTd}>{l.ug}</td>
                          <td data-label="Empenho" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                            <div>
                              <div>{l.empenho ?? <span style={{ color: '#94a3b8' }}>—</span>}</div>
                              {l.semSaldo && <div style={{ ...subtle, color: 'var(--color-danger-text)' }}>saldo não cobre</div>}
                            </div>
                          </td>
                          <td data-label="Subitem" style={carteiraTd}>{l.subitem ?? <span style={{ color: '#94a3b8' }}>—</span>}</td>
                          <td data-label="Valor" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div>
                              <strong>{l.semValor ? 'informe o valor' : formatCurrency(l.valor)}</strong>
                              {l.ajustada && l.valor !== l.valorOriginal && <div style={subtle}>calculado {formatCurrency(l.valorOriginal)}</div>}
                            </div>
                          </td>
                          <td data-label="Origem" style={{ ...carteiraTd, minWidth: '200px' }}>
                            <div>
                              <span style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                <StatusBadge label={o.label} variant={o.variant} size="sm" dot={false} />
                                {l.emenda && <StatusBadge label="Emenda" variant="warning" size="sm" dot={false} />}
                                {l.ajustada && <StatusBadge label="Ajustada" variant="neutral" size="sm" dot={false} />}
                              </span>
                              <div style={{ ...subtle, marginTop: '0.2rem' }}>{l.detalhe}</div>
                            </div>
                          </td>
                          {podeEditar && (
                            <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-flex', gap: '0.3rem' }}>
                                {!l.retirada && l.origem !== 'MANUAL' && (
                                  <ActionButton action="editar" size="sm" iconOnly label="Ajustar a linha" onClick={() => setAjustando(l)} />
                                )}
                                <ActionButton
                                  action={l.retirada ? 'restaurar' : 'remover'}
                                  size="sm"
                                  iconOnly
                                  label={l.origem === 'MANUAL' ? 'Apagar a linha incluída' : l.retirada ? 'Devolver à previsão' : 'Retirar da previsão'}
                                  onClick={() => void alternarRetirada(l)}
                                />
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <AjustarLinhaModal
        linha={ajustando}
        numeroContrato={ajustando ? contrato(ajustando.contractKey).numero : undefined}
        onClose={() => setAjustando(null)}
        onSubmit={(input) => ajustar({ chave: ajustando!.chave, retirada: false, ...input, registradoPorNome })}
        onDesfazer={() => ajustar({ chave: ajustando!.chave, remover: true })}
      />
      <IncluirLinhaModal
        isOpen={incluindo}
        contratos={contratos.filter((c) => !c.expirado && (!escopo || escopo.has(c.contractKey)))}
        onClose={() => setIncluindo(false)}
        onSubmit={(input) =>
          ajustar({
            chave: `manual-${crypto.randomUUID()}`,
            contractKey: input.contractKey,
            empenhoKey: input.empenhoKey,
            subitem: input.subitem,
            valor: input.valor,
            descricao: input.descricao || null,
            emenda: input.emenda,
            registradoPorNome
          })
        }
      />
      <RegistrarEnvioModal
        isOpen={registrando}
        mesRotulo={rotuloDoMes(mes)}
        quantidade={mantidas.length}
        total={total}
        jaEnviada={Boolean(envio)}
        onClose={() => setRegistrando(false)}
        onSubmit={async ({ sei, enviadoEm }) => {
          await registrarEnvio({
            sei,
            enviadoEm,
            registradoPorNome,
            linhas: mantidas.map((l) => ({
              chave: l.chave,
              origem: l.origem,
              contract_key: l.contractKey,
              contrato: contrato(l.contractKey).numero,
              ug: l.ug,
              empenho: l.empenho,
              subitem: l.subitem,
              valor: l.valor,
              emenda: l.emenda
            }))
          });
          toast.success('Envio da previsão registrado.');
        }}
      />
    </div>
  );
};
