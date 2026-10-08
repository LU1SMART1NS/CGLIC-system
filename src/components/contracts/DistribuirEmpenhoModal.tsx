import React from 'react';
import { ActionButton, AppButton, AppTextarea, Modal, NoticeBar } from '../../design-system';
import { lerValorEmReais } from './EmpenhoVinculoModals';
import type { DistribuicaoDoEmpenho, ParcelaDoItem } from '../../services/distribuicaoEmpenhoService';
import { motivoDaRevisao, type ItemNumerado } from '../../utils/distribuicaoEmpenho';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
/** Valor no campo, no formato brasileiro sem o "R$" ("1.197.000,00"). */
const noCampo = (v: number) => (v > 0 ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
const EPS = 0.005;
const OBS_MAX = 500;

interface DistribuirEmpenhoModalProps {
  /** Nota a distribuir; nula fecha a janela. */
  distribuicao: DistribuicaoDoEmpenho | null;
  numeroContrato: string;
  itens: ItemNumerado[];
  /** Empenhado por item nas outras notas do contrato (sem esta). */
  empenhadoOutras: Map<number, number>;
  isLoading: boolean;
  erro?: string;
  onSalvar: (parcelas: ParcelaDoItem[], observacao: string) => void;
  onFechar: () => void;
}

/**
 * O gestor reparte o valor da NE entre os itens do contrato. A quantidade sai do valor ÷ preço do item e só
 * serve de conferência; salva quando a soma fecha com o valor da nota (protótipo aprovado em 08/10/2026).
 */
export const DistribuirEmpenhoModal: React.FC<DistribuirEmpenhoModalProps> = (props) =>
  // Uma janela por nota: abre já com a distribuição atual (editar) ou vazia.
  props.distribuicao ? <JanelaDistribuir key={props.distribuicao.contratoEmpenhoId} {...props} d={props.distribuicao} /> : null;

const JanelaDistribuir: React.FC<DistribuirEmpenhoModalProps & { d: DistribuicaoDoEmpenho }> = ({
  d,
  numeroContrato,
  itens,
  empenhadoOutras,
  isLoading,
  erro,
  onSalvar,
  onFechar
}) => {
  const [valores, setValores] = React.useState<Record<number, string>>(() =>
    Object.fromEntries(d.parcelas.map((p) => [p.numeroItem, noCampo(p.valor)]))
  );
  const [observacao, setObservacao] = React.useState(d.observacao ?? '');

  const lidos = itens.map((i) => {
    const texto = valores[i.numeroItem] ?? '';
    const valor = texto.trim() === '' ? 0 : lerValorEmReais(texto);
    return { item: i, texto, valor };
  });
  const invalido = lidos.some((l) => l.valor == null);
  const soma = lidos.reduce((s, l) => s + (l.valor ?? 0), 0);
  const falta = d.valorNota - soma;
  const fecha = !invalido && Math.abs(falta) < EPS && soma > 0;
  const obsLonga = observacao.trim().length > OBS_MAX;

  const tudoNoItem = (numeroItem: number) => setValores({ [numeroItem]: noCampo(d.valorNota) });
  const salvar = () => {
    if (!fecha || obsLonga) return;
    const parcelas = lidos.filter((l) => (l.valor ?? 0) > 0).map((l) => ({ numeroItem: l.item.numeroItem, valor: l.valor as number }));
    onSalvar(parcelas, observacao);
  };
  const revisao = motivoDaRevisao(d);
  const jaDistribuida = d.situacao === 'DISTRIBUIDA' || d.situacao === 'REVISAR';

  return (
    <Modal
      isOpen
      onClose={onFechar}
      title={`Distribuir ${d.numeroOficial} entre os itens`}
      subtitle={`Contrato ${numeroContrato} · valor da nota ${brl(d.valorNota)}`}
      size="xl"
      dismissible={!isLoading}
      testId="distribuir-empenho-modal"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', width: '100%' }}>
          <span
            data-testid="distribuir-total"
            style={{ fontSize: '0.85rem', fontWeight: 600, color: fecha ? 'var(--color-success-text, #005715)' : soma > d.valorNota + EPS ? 'var(--danger)' : 'var(--text-secondary)' }}
          >
            {invalido
              ? 'Há um valor inválido. Use o formato 1.234,56.'
              : fecha
                ? `Distribuído ${brl(soma)} de ${brl(d.valorNota)} · fecha com a nota`
                : soma > d.valorNota + EPS
                  ? `Distribuído ${brl(soma)}: passa do valor da nota em ${brl(soma - d.valorNota)}`
                  : `Distribuído ${brl(soma)} de ${brl(d.valorNota)} · falta ${brl(falta)}`}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <ActionButton action="cancelar" size="sm" onClick={onFechar} disabled={isLoading} />
            <AppButton variant="primary" size="sm" onClick={salvar} disabled={!fecha || obsLonga || isLoading} isLoading={isLoading} data-testid="distribuir-salvar">
              Salvar distribuição
            </AppButton>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {erro && <NoticeBar tone="danger" testId="distribuir-erro">{erro}</NoticeBar>}
        {revisao && <NoticeBar tone="warning">{revisao}</NoticeBar>}
        {jaDistribuida && !revisao && d.origem === 'USUARIO' && (
          <NoticeBar tone="info">
            Distribuída por {d.distribuidoPorNome || 'usuário'}
            {d.distribuidoEm ? ` em ${new Date(d.distribuidoEm).toLocaleDateString('pt-BR')}` : ''}. Salvar substitui a distribuição.
          </NoticeBar>
        )}

        {d.sugestao.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }} data-testid="distribuir-sugestoes">
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sugestão</span>
            {d.sugestao.map((s) => (
              <AppButton key={s.numeroItem} variant="outline" size="sm" onClick={() => tudoNoItem(s.numeroItem)}>
                {d.sugestaoTipo === 'TOTAL_DO_ITEM' ? `Igual ao total do item ${s.numeroItem}` : `${num(s.quantidade)} un do item ${s.numeroItem}`}
              </AppButton>
            ))}
            {d.sugestaoTipo === 'VARIAS_POSSIBILIDADES' && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Mais de uma possibilidade: escolha uma.</span>
            )}
          </div>
        )}

        <div className="table-scroll" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Descrição</th>
                <th style={{ textAlign: 'right' }}>Contratado</th>
                <th style={{ textAlign: 'right' }}>Outras notas</th>
                <th style={{ textAlign: 'right' }}>Nesta nota (R$)</th>
                <th style={{ textAlign: 'right' }}>Quantidade</th>
                <th aria-label="Atalho" />
              </tr>
            </thead>
            <tbody>
              {lidos.map(({ item: i, texto, valor }) => {
                const outras = empenhadoOutras.get(i.numeroItem) ?? 0;
                const q = valor != null && valor > 0 && i.valorUnitario ? valor / i.valorUnitario : null;
                const inteiro = q == null || Math.abs(q - Math.round(q)) < 1e-6;
                return (
                  <tr key={i.numeroItem}>
                    <td style={{ fontWeight: 700 }}>{i.numeroItem}</td>
                    <td style={{ minWidth: '200px', maxWidth: '340px' }}>{i.descricao || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {i.quantidade != null ? `${num(i.quantidade)} un` : '—'}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{i.valorTotal != null ? brl(i.valorTotal) : ''}</div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{brl(outras)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        className="form-input"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={texto}
                        aria-label={`Valor desta nota no item ${i.numeroItem}`}
                        data-testid={`distribuir-valor-${i.numeroItem}`}
                        onChange={(e) => setValores((v) => ({ ...v, [i.numeroItem]: e.target.value }))}
                        disabled={isLoading}
                        style={{ width: '140px', textAlign: 'right', padding: '0.35rem 0.5rem', fontVariantNumeric: 'tabular-nums', borderColor: valor == null ? 'var(--danger)' : undefined }}
                      />
                    </td>
                    <td
                      style={{ textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'monospace', color: inteiro ? undefined : 'var(--warning)' }}
                      title={inteiro ? undefined : 'Não é múltiplo do preço unitário do item'}
                    >
                      {q != null ? `${num(q)} un` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <AppButton variant="ghost" size="sm" onClick={() => tudoNoItem(i.numeroItem)} disabled={isLoading} title="Toda a nota neste item">
                        Tudo aqui
                      </AppButton>
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
