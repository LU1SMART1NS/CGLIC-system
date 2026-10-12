import React from 'react';
import { ActionButton, AlertCard, AppButton, Modal, NoticeBar, useToast } from '../../design-system';
import { useAcoesContratado } from '../../hooks/useContratadoDoItem';
import { avaliarDivisao, linhasDaDivisao, type LinhaDivisao } from '../../utils/contratadoPorUnidade';
import type { ContratadoDaUnidade, QuantidadeDoContrato } from '../../services/contratadoUnidadeService';
import type { InternalAllocation } from '../../types';
import { formatNumber } from './itemBalanceUtils';

export interface ContratoParaDividir {
  contractKey: string;
  numeroContrato: string;
  quantidade: QuantidadeDoContrato;
}

interface UnidadesDoContratoModalProps {
  itemKey: string;
  tituloItem: string;
  contrato: ContratoParaDividir | null;
  /** Alocações do item (as unidades que podem receber parte do contrato). */
  allocations: InternalAllocation[];
  /** Contratado de cada unidade no item, somando todos os contratos (v_arp_item_unidade_contratado). */
  unidades: ContratadoDaUnidade[];
  /** Nome completo das unidades, pela sigla. */
  nomeDaUnidade?: (sigla: string) => string | undefined;
  /** Pode dividir (gestor e coordenador). */
  podeEditar: boolean;
  onFechar: () => void;
}

const CORES = ['#1351b4', '#168821', '#c2850c', '#7b3fa0', '#0f7b8a', '#c4161c', '#5992ed', '#636363'];
const CINZA = 'var(--text-muted)';
const secao: React.CSSProperties = { margin: '0 0 0.4rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: CINZA };
const th: React.CSSProperties = { textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: CINZA, padding: '0.4rem 0.5rem', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '0.5rem', borderBottom: '1px solid #e2e8f0', verticalAlign: 'middle', fontSize: '0.85rem' };
const nums: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/**
 * Janela "Unidades do contrato no item" (migration 103): quanto do contratado deste contrato, neste item, é de cada
 * unidade interna. Só unidades alocadas no item recebem; cada uma até o livre dela (alocado − contratado nos outros
 * contratos). A soma não passa do contrato; o que faltar fica "sem unidade".
 */
export const UnidadesDoContratoModal: React.FC<UnidadesDoContratoModalProps> = ({ contrato, ...rest }) =>
  contrato ? <JanelaUnidades key={contrato.contractKey} contrato={contrato} {...rest} /> : null;

const JanelaUnidades: React.FC<Omit<UnidadesDoContratoModalProps, 'contrato'> & { contrato: ContratoParaDividir }> = ({
  itemKey,
  tituloItem,
  contrato,
  allocations,
  unidades,
  nomeDaUnidade,
  podeEditar,
  onFechar
}) => {
  const q = contrato.quantidade;
  const total = q.quantidadeContratada ?? 0;
  const toast = useToast();
  const { dividir, desfazerDivisao } = useAcoesContratado(itemKey);
  const [linhas, setLinhas] = React.useState<LinhaDivisao[]>(() => linhasDaDivisao(q, allocations, unidades));
  const [erro, setErro] = React.useState<string | null>(null);
  const salvando = dividir.isPending || desfazerDivisao.isPending;
  const aval = avaliarDivisao(linhas, total);
  const semQuantidade = q.quantidadeContratada == null || q.quantidadeContratada <= 0;
  const corDe = (i: number) => CORES[i % CORES.length];

  const alterar = (unidade: string, texto: string) => setLinhas((ls) => ls.map((l) => (l.unidade === unidade ? { ...l, texto } : l)));

  const salvar = async () => {
    if (!aval.podeSalvar) return;
    setErro(null);
    try {
      await dividir.mutateAsync({
        contractKey: contrato.contractKey,
        unidades: linhas
          .map((l) => ({ unidade: l.unidade, quantidade: aval.porLinha.get(l.unidade)?.quantidade ?? 0 }))
          .filter((u) => u.quantidade > 0),
        quantidadeVista: total
      });
      toast.success(`Unidades do contrato ${contrato.numeroContrato} gravadas.`);
      onFechar();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível gravar a divisão.');
    }
  };

  const desfazer = async () => {
    setErro(null);
    try {
      await desfazerDivisao.mutateAsync(contrato.contractKey);
      toast.success(`A divisão do contrato ${contrato.numeroContrato} foi desfeita.`);
      onFechar();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível desfazer a divisão.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onFechar}
      title="Unidades do contrato no item"
      subtitle={`Contrato ${contrato.numeroContrato} · ${tituloItem}`}
      size="lg"
      dismissible={!salvando}
      testId="unidades-contrato-modal"
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: CINZA, flex: '1 1 240px', minWidth: 0 }} data-testid="unidades-contrato-resumo">
            {aval.mudancas.length === 0 ? (
              'Nenhuma alteração.'
            ) : (
              <>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {aval.mudancas.length} {aval.mudancas.length === 1 ? 'alteração' : 'alterações'}:
                </strong>{' '}
                {aval.mudancas.join(' · ')}
              </>
            )}
          </span>
          <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {podeEditar && q.divisaoOrigem === 'USUARIO' && (
              <ActionButton
                action="desfazer"
                size="sm"
                label="Desfazer divisão"
                title="Volta o contrato para sem unidade (ou para a divisão automática, se o item tiver uma unidade só)."
                onClick={() => void desfazer()}
                disabled={salvando}
                data-testid="unidades-contrato-desfazer"
              />
            )}
            <ActionButton action={podeEditar ? 'cancelar' : 'fechar'} size="sm" onClick={onFechar} disabled={salvando} />
            {podeEditar && !semQuantidade && (
              <AppButton variant="primary" size="sm" onClick={() => void salvar()} isLoading={dividir.isPending} disabled={salvando || !aval.podeSalvar} data-testid="unidades-contrato-salvar">
                Salvar divisão
              </AppButton>
            )}
          </span>
        </div>
      }
    >
      {semQuantidade ? (
        <NoticeBar tone="warning" testId="unidades-contrato-sem-quantidade">
          O contrato ainda não tem quantidade neste item. Ajuste a quantidade contratada primeiro.
        </NoticeBar>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div data-testid="unidades-contrato-regua">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1.25rem', fontSize: '0.82rem', marginBottom: '0.45rem', fontVariantNumeric: 'tabular-nums' }}>
              <span>
                Contratado no item <strong>{formatNumber(total)}</strong>
              </span>
              <span>
                Nas unidades <strong>{formatNumber(aval.soma)}</strong>
              </span>
              <span>
                Sem unidade <strong>{formatNumber(aval.semUnidade)}</strong>
              </span>
            </div>
            <div aria-hidden="true" style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', background: '#e2e8f0' }}>
              {linhas.map((l, i) => {
                const n = aval.porLinha.get(l.unidade)?.quantidade ?? 0;
                return n > 0 ? <span key={l.unidade} style={{ width: `${Math.min(100, (n / Math.max(total, aval.soma, 1)) * 100)}%`, background: corDe(i) }} /> : null;
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem 0.9rem', marginTop: '0.4rem', fontSize: '0.75rem', color: CINZA }}>
              {linhas.map((l, i) => (
                <span key={l.unidade}>
                  <i style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '2px', background: corDe(i), marginRight: '0.3rem', verticalAlign: '-1px' }} />
                  {l.unidade}
                </span>
              ))}
            </div>
          </div>

          {q.divisaoOrigem === 'AUTO' && (
            <NoticeBar tone="info" testId="unidades-contrato-auto">
              Dividido automaticamente: o item tinha uma unidade alocada quando o contrato foi vinculado. Ao salvar aqui, a divisão passa a ser sua e a
              automação não mexe mais nela.
            </NoticeBar>
          )}
          {q.situacao === 'CONFERIR' && (
            <NoticeBar tone="warning" testId="unidades-contrato-conferir">
              Confira esta divisão: ela foi feita sobre {formatNumber(q.divisaoQuantidadeBase ?? 0)}, passa da quantidade do contrato ou tem unidade sem
              alocação no item.
            </NoticeBar>
          )}
          {(erro || aval.erros.length > 0 || aval.avisos.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {erro && <AlertCard severity="CRITICA" title={erro} testId="unidades-contrato-erro" />}
              {aval.erros.map((e) => (
                <p key={e} role="alert" style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-danger-text)' }}>
                  {e}
                </p>
              ))}
              {aval.avisos.map((a) => (
                <NoticeBar key={a} tone="warning" testId="unidades-contrato-aviso">
                  {a}
                </NoticeBar>
              ))}
            </div>
          )}

          <div>
            <p style={secao}>Quanto deste contrato é de cada unidade</p>
            {linhas.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: CINZA }}>
                Nenhuma unidade alocada neste item. Aloque primeiro, na aba Alocação interna.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="unidades-contrato-tabela">
                  <thead>
                    <tr>
                      <th style={th}>Unidade interna</th>
                      <th style={{ ...th, textAlign: 'right' }}>Alocado</th>
                      <th style={{ ...th, textAlign: 'right' }}>Em outros contratos</th>
                      <th style={{ ...th, textAlign: 'right' }}>Livre</th>
                      <th style={{ ...th, textAlign: 'right' }}>Deste contrato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => {
                      const a = aval.porLinha.get(l.unidade)!;
                      const ruim = a.invalida || a.naoCabe;
                      return (
                        <tr key={l.unidade} data-testid={`unidades-contrato-linha-${l.unidade}`} style={{ background: a.alterada ? 'var(--color-warning-bg)' : undefined }}>
                          <td style={td}>
                            <strong style={{ display: 'block' }}>{l.unidade}</strong>
                            {nomeDaUnidade?.(l.unidade) && <small style={{ color: CINZA, fontSize: '0.75rem' }}>{nomeDaUnidade(l.unidade)}</small>}
                            {l.alocado === 0 && <small style={{ display: 'block', color: 'var(--danger)', fontSize: '0.75rem' }}>sem alocação no item</small>}
                          </td>
                          <td style={{ ...td, ...nums }}>{formatNumber(l.alocado)}</td>
                          <td style={{ ...td, ...nums }}>{formatNumber(l.contratadoOutros)}</td>
                          <td style={{ ...td, ...nums, color: a.livre < 0 ? 'var(--danger)' : undefined }}>{formatNumber(a.livre)}</td>
                          <td style={{ ...td, ...nums }}>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={l.texto}
                              placeholder="0"
                              onChange={(e) => alterar(l.unidade, e.target.value)}
                              disabled={salvando || !podeEditar}
                              aria-label={`Quantidade do contrato para ${l.unidade}`}
                              aria-invalid={ruim || undefined}
                              data-testid={`unidades-contrato-qtd-${l.unidade}`}
                              style={{
                                width: '110px',
                                textAlign: 'right',
                                fontVariantNumeric: 'tabular-nums',
                                fontSize: '0.85rem',
                                padding: '0.4rem 0.6rem',
                                border: `1px solid ${ruim ? 'var(--color-danger-solid)' : '#cbd5e1'}`,
                                borderRadius: '6px'
                              }}
                            />
                            {a.naoCabe && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-danger-text)', marginTop: '0.15rem' }}>não cabe: livre {formatNumber(Math.max(a.livre, 0))}</span>}
                            {a.alterada && !ruim && l.original > 0 && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-warning-text)', marginTop: '0.15rem' }}>antes {formatNumber(l.original)}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ ...td, fontWeight: 700 }} colSpan={4}>
                        Soma
                      </td>
                      <td style={{ ...td, ...nums, fontWeight: 700 }}>{formatNumber(aval.soma)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: CINZA }}>
              Só unidades alocadas neste item recebem parte do contrato. Para contratar por outra unidade, aloque primeiro. Só números inteiros.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
};
