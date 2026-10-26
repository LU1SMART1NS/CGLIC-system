import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useRegistrarAnulacao } from '../../hooks/useEmendas';
import { documentoSeiDaEtapaValido, identificacaoDoPedido, linhasAtivas, linhasComEmpenhoAnulado } from '../../utils/emendasPedidos';
import { formatNumber } from '../../utils/format';
import type { ItemCaep, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';
import { LinhaDoPedido } from './emendasPartes';

interface Props {
  pedido: PedidoEmenda;
  itens: Map<string, ItemCaep>;
  notas: Map<string, NotaDaLinha>;
  nomeDoAutor: string;
  onClose: () => void;
}

/**
 * Registro da anulação de empenho (protótipo aprovado em 26/10/2026, migration 203): abre com as linhas da nota zerada
 * no Tesouro já marcadas; o gestor confere, informa o documento SEI, a data e o motivo. Todas as linhas: o pedido volta
 * a "Itens reservados"; parte delas: vão para um pedido novo, ligado a este. O saldo da CAEP não muda.
 */
export const AnulacaoModal: React.FC<Props> = ({ pedido, itens, notas, nomeDoAutor, onClose }) => {
  const registrar = useRegistrarAnulacao();
  const toast = useToast();
  const ativas = linhasAtivas(pedido);
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(() => new Set(linhasComEmpenhoAnulado(pedido, notas).map((l) => l.id)));
  const [documento, setDocumento] = useState('');
  const [data, setData] = useState('');
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);
  const hoje = hojeEmBrasilia();

  const total = marcadas.size > 0 && marcadas.size === ativas.length;
  const pendencias: string[] = [];
  if (marcadas.size === 0) pendencias.push('pelo menos um item');
  if (!documentoSeiDaEtapaValido(documento)) pendencias.push('o documento SEI da anulação (só números, 7 a 10 dígitos)');
  if (!data || data > hoje) pendencias.push('a data da anulação (hoje ou antes)');
  if (!motivo.trim()) pendencias.push('o motivo');

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    try {
      const r = await registrar.mutateAsync({ pedidoId: pedido.id, versao: pedido.versao, linhas: [...marcadas], documentoSei: documento.replace(/\D/g, ''), data, motivo: motivo.trim() });
      toast.success(r.total ? `Anulação registrada: o pedido ${pedido.numero} voltou a "Itens reservados".` : `Anulação registrada: os itens foram para o pedido ${r.novoNumero}, em "Itens reservados".`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!registrar.isPending}
      size="md"
      testId="emendas-anulacao-modal"
      title={`Registrar anulação do empenho · Pedido ${pedido.numero}`}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={registrar.isPending} />
          <AppButton type="submit" form="emendas-anulacao-form" variant="primary" disabled={registrar.isPending} isLoading={registrar.isPending} data-testid="emendas-anulacao-salvar">
            Registrar anulação
          </AppButton>
        </>
      }
    >
      <form id="emendas-anulacao-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {nomeDoAutor} · {identificacaoDoPedido(pedido)}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <legend style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Itens cujo empenho foi anulado</legend>
          {ativas.map((l) => {
            const nota = notas.get(l.id);
            return (
              <label key={l.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.85rem', padding: '0.45rem 0.6rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={marcadas.has(l.id)}
                  onChange={(e) =>
                    setMarcadas((m) => {
                      const prox = new Set(m);
                      if (e.target.checked) prox.add(l.id);
                      else prox.delete(l.id);
                      return prox;
                    })
                  }
                  style={{ marginTop: 3 }}
                  data-testid={`emendas-anulacao-linha-${l.id}`}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <LinhaDoPedido linha={l} itens={itens} />
                  <span style={{ display: 'block', fontSize: '0.78rem', color: nota?.nota && (nota.valorEmpenhado ?? 1) <= 0.01 ? 'var(--color-danger-text)' : 'var(--text-muted)' }}>
                    {nota?.nota ? `${nota.nota}${(nota.valorEmpenhado ?? 1) <= 0.01 ? ' · empenhado zero no Tesouro' : ''}` : 'sem nota ligada'}
                  </span>
                </span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(l.quantidade)}</b>
              </label>
            );
          })}
        </fieldset>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.6rem' }}>
          <AppInput
            label="Documento SEI da anulação"
            inputMode="numeric"
            placeholder="Só números"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            error={tentou && !documentoSeiDaEtapaValido(documento) ? 'Informe o número do documento (7 a 10 dígitos).' : undefined}
            data-testid="emendas-anulacao-sei"
          />
          <AppInput
            label="Data da anulação"
            type="date"
            max={hoje}
            value={data}
            onChange={(e) => setData(e.target.value)}
            error={tentou && (!data || data > hoje) ? 'Informe a data (hoje ou antes).' : undefined}
            data-testid="emendas-anulacao-data"
          />
        </div>
        <AppTextarea
          label="Motivo"
          rows={2}
          placeholder="Ex.: fornecedor não assinou o contrato; nota cancelada por duplicidade"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          error={tentou && !motivo.trim() ? 'Informe o motivo.' : undefined}
          data-testid="emendas-anulacao-motivo"
        />
        {marcadas.size > 0 && (
          <NoticeBar tone="info" testId="emendas-anulacao-resumo">
            {total
              ? `Todos os itens do pedido: o pedido ${pedido.numero} volta para "Itens reservados" (interlocução com o parlamentar). As datas e os documentos das etapas seguintes ficam guardados no registro da anulação.`
              : `${marcadas.size} de ${ativas.length} itens voltam à interlocução: como o pedido ${pedido.numero} continua com ${ativas.length - marcadas.size} ${ativas.length - marcadas.size === 1 ? 'item empenhado' : 'itens empenhados'}, os marcados vão para um pedido novo em "Itens reservados", ligado a este.`}{' '}
            O saldo da CAEP não muda: a quantidade continua reservada até a troca com o parlamentar.
          </NoticeBar>
        )}
        {tentou && pendencias.length > 0 && (
          <NoticeBar tone="danger" testId="emendas-anulacao-pendencias">
            Falta: {pendencias.join(', ')}.
          </NoticeBar>
        )}
      </form>
    </Modal>
  );
};
