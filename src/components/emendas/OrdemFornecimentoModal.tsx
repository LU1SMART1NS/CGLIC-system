import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppDateInput } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useRegistrarInformacaoOrdem, useRegistrarOrdemDoContrato } from '../../hooks/useEmendas';
import { documentoSeiDaEtapaValido } from '../../utils/emendasPedidos';
import { ordensDoPedido, type EstadoDaOrdem } from '../../utils/emendasOrdem';
import { dataBR } from '../../utils/emendasKits';
import { nomeDoPedido } from '../../utils/emendasNomeDoPedido';
import type { AlvoDaOrdem, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';

interface Props {
  modo: 'INFORMACAO' | 'ORDEM';
  pedido: PedidoEmenda;
  /** Todos os pedidos: outro pedido no mesmo contrato entra na mesma Informação ou Ordem. */
  pedidos: PedidoEmenda[];
  notas: Map<string, NotaDaLinha>;
  /** Contratos já marcados ao abrir (os da linha de "Com você" ou de "Com outros"). */
  contratos: string[];
  /** "Pedido 1/2026 · Dep. A", para os outros pedidos do contrato. */
  nomeDoOutro: (p: PedidoEmenda) => string;
  onClose: () => void;
}

const caixa: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  fontSize: '0.85rem',
  padding: '0.5rem 0.65rem',
  border: '1px solid var(--color-border, #e2e8f0)',
  borderRadius: 6
};
const legenda: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem' };
const fieldset: React.CSSProperties = { border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' };
const sub: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--text-muted)' };

/** O que ainda falta naquele pedido × contrato para esta janela. */
const precisa = (modo: Props['modo'], e: EstadoDaOrdem) => (modo === 'INFORMACAO' ? e === 'A_INFORMAR' : e === 'NA_SFC');

/**
 * Informação da ComprasSUSP e Ordem de Fornecimento da SFC por contrato (migration 250, leitura do SEI em 29/10/2026):
 * um documento SEI por contrato, que vale para todos os pedidos daquele contrato. A janela marca os contratos deste
 * pedido e, em cada um, os outros pedidos que ainda esperam o mesmo registro. Registrar de novo corrige (retificação).
 */
export const OrdemFornecimentoModal: React.FC<Props> = ({ modo, pedido, pedidos, notas, contratos, nomeDoOutro, onClose }) => {
  const informacao = useRegistrarInformacaoOrdem();
  const ordem = useRegistrarOrdemDoContrato();
  const salvarNoBanco = modo === 'INFORMACAO' ? informacao : ordem;
  const toast = useToast();
  const hoje = hojeEmBrasilia();
  const doPedido = useMemo(() => ordensDoPedido(pedido, notas), [pedido, notas]);
  // Os outros pedidos de cada contrato, na contratação, com o que falta neles.
  const outros = useMemo(() => {
    const mapa = new Map<string, Array<{ p: PedidoEmenda; estado: EstadoDaOrdem }>>();
    for (const q of pedidos) {
      if (q.id === pedido.id || q.etapa !== 'CONTRATACAO') continue;
      for (const o of ordensDoPedido(q, notas)) {
        if (!doPedido.some((x) => x.contractKey === o.contractKey)) continue;
        mapa.set(o.contractKey, [...(mapa.get(o.contractKey) ?? []), { p: q, estado: o.estado }]);
      }
    }
    return mapa;
  }, [pedidos, pedido.id, notas, doPedido]);
  const chave = (p: string, c: string) => `${p}|${c}`;
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(() => {
    const s = new Set<string>();
    for (const c of contratos) {
      s.add(chave(pedido.id, c));
      for (const o of outros.get(c) ?? []) if (precisa(modo, o.estado)) s.add(chave(o.p.id, c));
    }
    return s;
  });
  const [documentoSei, setDocumentoSei] = useState('');
  const [data, setData] = useState(hoje);
  const [tentou, setTentou] = useState(false);

  const alvos: AlvoDaOrdem[] = [...marcados].map((k) => {
    const [pedidoId, contractKey] = k.split('|');
    return { pedidoId, contractKey };
  });
  const pendencias: string[] = [];
  if (alvos.length === 0) pendencias.push('pelo menos um contrato');
  if (!documentoSeiDaEtapaValido(documentoSei)) pendencias.push('o número SEI (só números, 7 a 10 dígitos)');
  if (!data || data > hoje) pendencias.push('a data (hoje ou antes)');

  const alterna = (k: string, sim: boolean) =>
    setMarcados((m) => {
      const prox = new Set(m);
      if (sim) prox.add(k);
      else prox.delete(k);
      return prox;
    });

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    try {
      await salvarNoBanco.mutateAsync({ alvos, data, documentoSei: documentoSei.replace(/\D/g, '') });
      const n = new Set(alvos.map((a) => a.contractKey)).size;
      toast.success(`${modo === 'INFORMACAO' ? 'Informação' : 'Ordem de Fornecimento'} registrada em ${n === 1 ? '1 contrato' : `${n} contratos`}.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const titulo = modo === 'INFORMACAO' ? 'Informação para a Ordem de Fornecimento' : 'Ordem de Fornecimento emitida';
  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!salvarNoBanco.isPending}
      size="md"
      testId={`emendas-ordem-modal-${modo}`}
      title={`${titulo} · ${nomeDoPedido(pedido)}`}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvarNoBanco.isPending} />
          <AppButton
            type="submit"
            form="emendas-ordem-form"
            variant="primary"
            disabled={salvarNoBanco.isPending || doPedido.length === 0}
            isLoading={salvarNoBanco.isPending}
            data-testid="emendas-ordem-salvar"
          >
            Registrar
          </AppButton>
        </>
      }
    >
      <form id="emendas-ordem-form" onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {modo === 'INFORMACAO'
            ? 'A Informação da ComprasSUSP vai no processo do contrato, com item, emenda, beneficiário, CNPJ e local de entrega, para o Setor de Fiscalização de Contratos emitir a Ordem.'
            : 'A Ordem de Fornecimento é emitida pelo Setor de Fiscalização de Contratos no processo do contrato, com todos os beneficiários.'}
        </div>
        <fieldset style={fieldset}>
          <legend style={legenda}>Contratos (um documento SEI por contrato)</legend>
          {doPedido.map((o) => {
            const k = chave(pedido.id, o.contractKey);
            const feito = modo === 'INFORMACAO' ? o.registro?.informacaoEm : o.registro?.ordemEm;
            return (
              <div key={o.contractKey} style={{ ...caixa, background: marcados.has(k) ? 'var(--color-info-bg, #e6eefb)' : undefined }}>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', fontWeight: 700 }}>
                  <input type="checkbox" checked={marcados.has(k)} onChange={(e) => alterna(k, e.target.checked)} data-testid={`emendas-ordem-contrato-${o.numero}`} />
                  Contrato {o.numero} · {o.itens === 1 ? '1 item deste pedido' : `${o.itens} itens deste pedido`}
                </label>
                {feito && <span style={sub}>Já registrada em {dataBR(feito)}: registrar de novo corrige (retificação).</span>}
                {(outros.get(o.contractKey) ?? []).map(({ p: q, estado }) => {
                  const kq = chave(q.id, o.contractKey);
                  return (
                    <label key={kq} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', paddingLeft: '1.4rem' }}>
                      <input type="checkbox" checked={marcados.has(kq)} onChange={(e) => alterna(kq, e.target.checked)} data-testid={`emendas-ordem-outro-${q.id}`} />
                      <span>
                        também {nomeDoOutro(q)}
                        {!precisa(modo, estado) && <span style={sub}> · já tem</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </fieldset>
        <AppInput
          label={modo === 'INFORMACAO' ? 'Número SEI da Informação' : 'Número SEI da Ordem de Fornecimento'}
          inputMode="numeric"
          placeholder="Ex.: 37530982"
          value={documentoSei}
          onChange={(e) => setDocumentoSei(e.target.value)}
          error={tentou && !documentoSeiDaEtapaValido(documentoSei) ? 'Informe o número (7 a 10 dígitos).' : undefined}
          data-testid="emendas-ordem-sei"
        />
        <AppDateInput label={modo === 'INFORMACAO' ? 'Assinada em' : 'Emitida em'} max={hoje} value={data} onValueChange={setData} data-testid="emendas-ordem-data" />
        {tentou && pendencias.length > 0 && (
          <NoticeBar tone="danger" testId="emendas-ordem-pendencias">
            Falta: {pendencias.join(', ')}.
          </NoticeBar>
        )}
      </form>
    </Modal>
  );
};
