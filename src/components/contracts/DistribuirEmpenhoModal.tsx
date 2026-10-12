import React from 'react';
import { ActionButton, AppButton, AppTextarea, Modal, NoticeBar, StatusBadge } from '../../design-system';
import type { DistribuicaoDoEmpenho, QuantidadeNoItem } from '../../services/distribuicaoEmpenhoService';
import { motivoDaRevisao, quantidadeDaParcela, quantidadeQuebrada, type ItemNumerado } from '../../utils/distribuicaoEmpenho';

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const OBS_MAX = 500;

interface DistribuirEmpenhoModalProps {
  /** Nota a vincular aos itens; nula fecha a janela. */
  distribuicao: DistribuicaoDoEmpenho | null;
  numeroContrato: string;
  itens: ItemNumerado[];
  /** Empenhado por item (em unidades) nas outras notas do contrato (sem esta). */
  empenhadoOutras: Map<number, number>;
  isLoading: boolean;
  erro?: string;
  onSalvar: (itens: QuantidadeNoItem[], observacao: string) => void;
  onFechar: () => void;
}

/** Quantidade digitada: inteiro maior que zero; vazio ou zero = item de fora; outro texto = inválido (null). */
function lerQuantidade(texto: string): number | null {
  const t = texto.trim();
  if (t === '') return 0;
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

/**
 * O gestor vincula a NE aos itens do contrato dizendo a quantidade de cada item (protótipo aprovado em 08-09/10/2026).
 * Sem preço e sem valor da nota: a única trava é ter quantidade em pelo menos um item. Passar do saldo do item avisa e
 * não bloqueia.
 */
export const DistribuirEmpenhoModal: React.FC<DistribuirEmpenhoModalProps> = (props) =>
  // Uma janela por nota: abre já com o vínculo atual (editar) ou com a sugestão.
  props.distribuicao ? <JanelaVincular key={props.distribuicao.contratoEmpenhoId} {...props} d={props.distribuicao} /> : null;

const JanelaVincular: React.FC<DistribuirEmpenhoModalProps & { d: DistribuicaoDoEmpenho }> = ({
  d,
  numeroContrato,
  itens,
  empenhadoOutras,
  isLoading,
  erro,
  onSalvar,
  onFechar
}) => {
  // Sugestão única (igual ao total ou múltiplo do preço de um item só): vale para o marcador "Informada".
  const sugestaoUnica = (d.sugestaoTipo === 'TOTAL_DO_ITEM' || d.sugestaoTipo === 'MULTIPLO_DO_PRECO') && d.sugestao.length === 1;
  const sugerida = new Map(sugestaoUnica ? d.sugestao.map((s) => [s.numeroItem, s.quantidade]) : []);
  const precoDe = new Map(itens.map((i) => [i.numeroItem, i.valorUnitario]));
  // Começa pelo vínculo atual (quantidade inteira) ou pela sugestão única.
  const inicial = (): Record<number, string> => {
    if (d.parcelas.length > 0) {
      return Object.fromEntries(
        d.parcelas.map((p) => {
          const q = quantidadeDaParcela(p, precoDe.get(p.numeroItem));
          return [p.numeroItem, q != null && !quantidadeQuebrada(q) ? String(Math.round(q)) : ''];
        })
      );
    }
    return Object.fromEntries([...sugerida.entries()].map(([n, q]) => [n, String(q)]));
  };
  const [textos, setTextos] = React.useState<Record<number, string>>(inicial);
  const [observacao, setObservacao] = React.useState(d.observacao ?? '');

  const linhas = itens.map((i) => {
    const texto = textos[i.numeroItem] ?? '';
    const quantidade = lerQuantidade(texto);
    const saldo = i.quantidade != null ? i.quantidade - (empenhadoOutras.get(i.numeroItem) ?? 0) : null;
    return { item: i, texto, quantidade, saldo };
  });
  const invalido = linhas.some((l) => l.quantidade == null);
  const comQuantidade = linhas.filter((l) => (l.quantidade ?? 0) > 0);
  const acimaDoSaldo = comQuantidade.filter((l) => l.saldo != null && (l.quantidade ?? 0) > l.saldo);
  const obsLonga = observacao.trim().length > OBS_MAX;
  const podeSalvar = !invalido && comQuantidade.length > 0 && !obsLonga;

  const usarSugestao = (numeroItem: number, quantidade: number) => setTextos({ [numeroItem]: String(quantidade) });
  const salvar = () => {
    if (!podeSalvar) return;
    onSalvar(comQuantidade.map((l) => ({ numeroItem: l.item.numeroItem, quantidade: l.quantidade as number })), observacao);
  };
  const revisao = motivoDaRevisao(d);
  const jaVinculada = d.situacao === 'DISTRIBUIDA' || d.situacao === 'REVISAR';

  return (
    <Modal
      isOpen
      onClose={onFechar}
      title={`Vincular ${d.numeroOficial} aos itens`}
      subtitle={`Contrato ${numeroContrato}`}
      size="xl"
      dismissible={!isLoading}
      testId="distribuir-empenho-modal"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', width: '100%' }}>
          <div data-testid="distribuir-total" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.85rem' }}>
            <span>
              Itens com quantidade{' '}
              <strong>
                {comQuantidade.length} de {itens.length}
              </strong>
            </span>
            {invalido ? (
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Use só números inteiros nas quantidades.</span>
            ) : comQuantidade.length === 0 ? (
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Informe a quantidade em pelo menos um item.</span>
            ) : (
              acimaDoSaldo.length > 0 && (
                <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                  {acimaDoSaldo.length === 1 ? '1 item acima' : `${acimaDoSaldo.length} itens acima`} do saldo a empenhar
                </span>
              )
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <ActionButton action="cancelar" size="sm" onClick={onFechar} disabled={isLoading} />
            <AppButton variant="primary" size="sm" onClick={salvar} disabled={!podeSalvar || isLoading} isLoading={isLoading} data-testid="distribuir-salvar">
              Vincular aos itens
            </AppButton>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {erro && <NoticeBar tone="danger" testId="distribuir-erro">{erro}</NoticeBar>}
        {revisao && <NoticeBar tone="warning">{revisao}</NoticeBar>}
        {jaVinculada && !revisao && d.origem === 'USUARIO' && (
          <NoticeBar tone="info">
            Vinculada aos itens por {d.distribuidoPorNome || 'usuário'}
            {d.distribuidoEm ? ` em ${new Date(d.distribuidoEm).toLocaleDateString('pt-BR')}` : ''}. Salvar substitui o vínculo atual.
          </NoticeBar>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Informe a quantidade desta nota em cada item. Item sem quantidade não recebe a nota.
          </span>
          {d.sugestao.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }} data-testid="distribuir-sugestoes">
              {d.sugestao.map((s) => (
                <AppButton key={s.numeroItem} variant="outline" size="sm" onClick={() => usarSugestao(s.numeroItem, s.quantidade)} disabled={isLoading}>
                  {sugestaoUnica ? `Usar sugestão: ${num(s.quantidade)} un do item ${s.numeroItem}` : `${num(s.quantidade)} un do item ${s.numeroItem}`}
                </AppButton>
              ))}
            </div>
          )}
        </div>

        <div className="table-scroll" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: 'right' }}>Saldo a empenhar</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ item: i, texto, quantidade, saldo }) => {
                const q = quantidade ?? 0;
                const informada = q > 0 && sugerida.get(i.numeroItem) !== q;
                const passa = saldo != null && q > saldo;
                return (
                  <tr key={i.numeroItem} style={q > 0 ? undefined : { color: 'var(--text-muted)' }}>
                    <td style={{ minWidth: '220px', maxWidth: '380px' }}>
                      <strong>Item {i.numeroItem}</strong> · {i.descricao || '—'}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Contratado {i.quantidade != null ? num(i.quantidade) : 'N/D'} · Empenhado {num(empenhadoOutras.get(i.numeroItem) ?? 0)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 700 }}>{saldo != null ? `${num(saldo)} un` : 'N/D'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          className="form-input"
                          inputMode="numeric"
                          placeholder="0"
                          value={texto}
                          aria-label={`Quantidade desta nota no item ${i.numeroItem}`}
                          data-testid={`distribuir-quantidade-${i.numeroItem}`}
                          onChange={(e) => setTextos((v) => ({ ...v, [i.numeroItem]: e.target.value }))}
                          disabled={isLoading}
                          style={{
                            width: '90px',
                            textAlign: 'right',
                            padding: '0.35rem 0.5rem',
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            borderColor: quantidade == null ? 'var(--danger)' : undefined
                          }}
                        />
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>un</span>
                        {informada && <StatusBadge label="Informada" variant="info" size="sm" dot={false} testId={`distribuir-informada-${i.numeroItem}`} />}
                      </div>
                      {passa && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.2rem' }} data-testid={`distribuir-passa-${i.numeroItem}`}>
                          Passa do saldo em {num(q - (saldo as number))} un
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <AppTextarea
          label="Observação (opcional)"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          maxLength={OBS_MAX}
          placeholder="Ex.: conforme a nota de empenho, 26 placas para o CIOP."
          disabled={isLoading}
        />
      </div>
    </Modal>
  );
};
