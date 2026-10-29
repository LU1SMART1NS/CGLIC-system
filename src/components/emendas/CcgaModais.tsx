import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppTextarea, AppDateInput } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useDesfazerEnvioCcga, useEnviarCcga, useVoltarEtapa } from '../../hooks/useEmendas';
import { documentoSeiDaEtapaValido, identificacaoDoPedido, ROTULO_ETAPA } from '../../utils/emendasPedidos';
import { atasParaDesfazer, atasParaEnviar, voltaDaEtapa, type AtaNaCcga } from '../../utils/emendasCcga';
import { dataBR } from '../../utils/emendasKits';
import { formatNumber } from '../../utils/format';
import { nomeDoPedido } from '../../utils/emendasNomeDoPedido';
import type { ItemCaep, NotaDaLinha, PedidoEmenda } from '../../services/emendasService';
import { LinhaDoPedido } from './emendasPartes';

interface Props {
  pedido: PedidoEmenda;
  itens: Map<string, ItemCaep>;
  notas: Map<string, NotaDaLinha>;
  nomeDoAutor: string;
  onClose: () => void;
}

const caixa: React.CSSProperties = { display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.85rem', padding: '0.5rem 0.65rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 6 };
const legenda: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem' };
const fieldset: React.CSSProperties = { border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' };
const sub: React.CSSProperties = { display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)' };

/** Os itens da ata, um por linha, com a nota e a situação na CCGA. */
const ItensDaAta: React.FC<{ ata: AtaNaCcga; itens: Map<string, ItemCaep>; notas: Map<string, NotaDaLinha> }> = ({ ata, itens, notas }) => (
  <span style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.3rem' }}>
    {ata.linhas.map((l) => (
      <span key={l.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <LinhaDoPedido linha={l} itens={itens} semAta />
          <span style={sub}>
            {notas.get(l.id)?.nota ?? 'sem nota ligada'}
            {l.ccgaSituacao === 'DEVOLVIDA' ? ` · devolvido em ${dataBR(l.ccgaEm)}: ${l.ccgaMotivo ?? ''}` : ''}
            {l.ccgaSituacao === 'ENVIADA' ? ` · na CCGA desde ${dataBR(l.ccgaEm)}${l.despachoDocumentoSei ? ` · SEI ${l.despachoDocumentoSei}` : ''}` : ''}
          </span>
        </span>
        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(l.quantidade)}</b>
      </span>
    ))}
  </span>
);

/**
 * Envio à CCGA por ata (migration 248, D1): a CAEP escolhe as atas que vão agora, cada uma com o despacho SEI dela, e o
 * gestor de cada ata recebe o alerta no Início. Vale também para reenviar o que a CCGA devolveu.
 */
export const EnviarCcgaModal: React.FC<Props> = ({ pedido, itens, notas, nomeDoAutor, onClose }) => {
  const enviar = useEnviarCcga();
  const toast = useToast();
  const hoje = hojeEmBrasilia();
  const atas = atasParaEnviar(pedido, notas);
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(() => new Set(atas.map((a) => a.ataKey)));
  const [seis, setSeis] = useState<Record<string, string>>(() =>
    Object.fromEntries(atas.map((a) => [a.ataKey, a.linhas.find((l) => l.ccgaSituacao === 'DEVOLVIDA') ? '' : (a.linhas[0]?.despachoDocumentoSei ?? '')]))
  );
  const [data, setData] = useState(hoje);
  const [tentou, setTentou] = useState(false);

  const escolhidas = atas.filter((a) => marcadas.has(a.ataKey));
  const pendencias: string[] = [];
  if (escolhidas.length === 0) pendencias.push('pelo menos uma ata');
  if (escolhidas.some((a) => !documentoSeiDaEtapaValido(seis[a.ataKey] ?? ''))) pendencias.push('o despacho SEI de cada ata escolhida (só números, 7 a 10 dígitos)');
  if (!data || data > hoje) pendencias.push('a data do envio (hoje ou antes)');

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    try {
      await enviar.mutateAsync({
        id: pedido.id,
        versao: pedido.versao,
        data,
        envios: escolhidas.map((a) => ({ ataKey: a.ataKey, documentoSei: (seis[a.ataKey] ?? '').replace(/\D/g, '') }))
      });
      toast.success(`${nomeDoAutor}: ${escolhidas.length === 1 ? '1 ata enviada' : `${escolhidas.length} atas enviadas`} à CCGA. O gestor de cada ata recebe o alerta no Início.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!enviar.isPending}
      size="md"
      testId="emendas-ccga-enviar-modal"
      title={`Enviar à CCGA para contratação · ${nomeDoPedido(pedido)}`}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={enviar.isPending} />
          <AppButton type="submit" form="emendas-ccga-enviar-form" variant="primary" disabled={enviar.isPending || atas.length === 0} isLoading={enviar.isPending} data-testid="emendas-ccga-enviar-salvar">
            {escolhidas.length > 1 ? `Enviar ${escolhidas.length} atas` : 'Enviar'}
          </AppButton>
        </>
      }
    >
      <form id="emendas-ccga-enviar-form" onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {nomeDoAutor} · {identificacaoDoPedido(pedido)}
        </div>
        {atas.length === 0 ? (
          <NoticeBar tone="info" testId="emendas-ccga-nada-a-enviar">
            Todos os itens já estão na CCGA ou contratados.
          </NoticeBar>
        ) : (
          <fieldset style={fieldset}>
            <legend style={legenda}>Atas que vão agora (cada uma vai para o seu gestor)</legend>
            {atas.map((a) => (
              <div key={a.ataKey} style={{ ...caixa, flexDirection: 'column', alignItems: 'stretch', background: marcadas.has(a.ataKey) ? 'var(--color-info-bg, #e6eefb)' : undefined }}>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={marcadas.has(a.ataKey)}
                    onChange={(e) =>
                      setMarcadas((m) => {
                        const prox = new Set(m);
                        if (e.target.checked) prox.add(a.ataKey);
                        else prox.delete(a.ataKey);
                        return prox;
                      })
                    }
                    data-testid={`emendas-ccga-ata-${a.numeroAta}`}
                  />
                  Ata {a.numeroAta} · {a.linhas.length === 1 ? '1 item' : `${a.linhas.length} itens`}
                </label>
                <ItensDaAta ata={a} itens={itens} notas={notas} />
                {marcadas.has(a.ataKey) && (
                  <AppInput
                    label="Despacho SEI desta ata"
                    inputMode="numeric"
                    placeholder="Ex.: 41234567"
                    value={seis[a.ataKey] ?? ''}
                    onChange={(e) => setSeis((x) => ({ ...x, [a.ataKey]: e.target.value }))}
                    error={tentou && !documentoSeiDaEtapaValido(seis[a.ataKey] ?? '') ? 'Informe o número do despacho (7 a 10 dígitos).' : undefined}
                    data-testid={`emendas-ccga-sei-${a.numeroAta}`}
                  />
                )}
              </div>
            ))}
          </fieldset>
        )}
        <AppDateInput label="Enviado em" max={hoje} value={data} onValueChange={setData} data-testid="emendas-ccga-data" />
        <NoticeBar tone="info" testId="emendas-ccga-explica">
          Ao enviar, o gestor de cada ata recebe no Início o alerta para contratar, só com os itens da ata dele. A CAEP continua vendo o pedido e pode desfazer o envio.
        </NoticeBar>
        {tentou && pendencias.length > 0 && (
          <NoticeBar tone="danger" testId="emendas-ccga-pendencias">
            Falta: {pendencias.join(', ')}.
          </NoticeBar>
        )}
      </form>
    </Modal>
  );
};

/**
 * A CAEP tira atas da CCGA sem esperar o gestor da ata (D6): o gestor é avisado e o alerta de contratar sai do Início
 * dele. Item devolvido também sai daqui (a CAEP encerra a devolução sem reenviar). Item contratado não volta.
 */
export const DesfazerEnvioCcgaModal: React.FC<Props> = ({ pedido, itens, notas, nomeDoAutor, onClose }) => {
  const desfazer = useDesfazerEnvioCcga();
  const toast = useToast();
  const atas = atasParaDesfazer(pedido, notas);
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(() => new Set(atas.length === 1 ? [atas[0].ataKey] : []));
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);

  const linhas = atas.filter((a) => marcadas.has(a.ataKey)).flatMap((a) => a.linhas);
  const pendencias: string[] = [];
  if (linhas.length === 0) pendencias.push('pelo menos uma ata');
  if (!motivo.trim()) pendencias.push('o motivo');
  const avisaGestor = linhas.some((l) => l.ccgaSituacao === 'ENVIADA');

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    try {
      await desfazer.mutateAsync({ id: pedido.id, versao: pedido.versao, linhas: linhas.map((l) => l.id), motivo: motivo.trim() });
      toast.success(`${nomeDoAutor}: envio à CCGA desfeito${avisaGestor ? '. O gestor da ata foi avisado' : ''}.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!desfazer.isPending}
      size="md"
      testId="emendas-ccga-desfazer-modal"
      title={`Desfazer o envio à CCGA · ${nomeDoPedido(pedido)}`}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={desfazer.isPending} />
          <AppButton type="submit" form="emendas-ccga-desfazer-form" variant="primary" disabled={desfazer.isPending || atas.length === 0} isLoading={desfazer.isPending} data-testid="emendas-ccga-desfazer-salvar">
            {marcadas.size > 1 ? `Desfazer ${marcadas.size} atas` : 'Desfazer'}
          </AppButton>
        </>
      }
    >
      <form id="emendas-ccga-desfazer-form" onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {nomeDoAutor} · {identificacaoDoPedido(pedido)} · os itens voltam para "{ROTULO_ETAPA.EMPENHADO}"
        </div>
        {atas.length === 0 ? (
          <NoticeBar tone="info" testId="emendas-ccga-nada-a-desfazer">
            Nada a desfazer: os itens enviados já estão contratados.
          </NoticeBar>
        ) : (
          <fieldset style={fieldset}>
            <legend style={legenda}>Atas que saem da CCGA</legend>
            {atas.map((a) => (
              <label key={a.ataKey} style={{ ...caixa, cursor: 'pointer', background: marcadas.has(a.ataKey) ? 'var(--color-info-bg, #e6eefb)' : undefined }}>
                <input
                  type="checkbox"
                  checked={marcadas.has(a.ataKey)}
                  onChange={(e) =>
                    setMarcadas((m) => {
                      const prox = new Set(m);
                      if (e.target.checked) prox.add(a.ataKey);
                      else prox.delete(a.ataKey);
                      return prox;
                    })
                  }
                  style={{ marginTop: 3 }}
                  data-testid={`emendas-ccga-desfazer-ata-${a.numeroAta}`}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>Ata {a.numeroAta}</b>
                  <ItensDaAta ata={a} itens={itens} notas={notas} />
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <AppTextarea
          label="Motivo"
          rows={2}
          placeholder="Ex.: enviado por engano; a nota ainda vai ser reforçada"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          error={tentou && !motivo.trim() ? 'Informe o motivo.' : undefined}
          data-testid="emendas-ccga-desfazer-motivo"
        />
        {avisaGestor && (
          <NoticeBar tone="warning" testId="emendas-ccga-desfazer-aviso">
            O gestor da ata recebe o aviso "Envio desfeito pela CAEP" e o alerta de contratar sai do Início dele. O despacho SEI apagado fica no histórico do pedido.
          </NoticeBar>
        )}
        {tentou && pendencias.length > 0 && (
          <NoticeBar tone="danger" testId="emendas-ccga-desfazer-pendencias">
            Falta: {pendencias.join(', ')}.
          </NoticeBar>
        )}
      </form>
    </Modal>
  );
};

/** Voltar etapa (D7): desfaz o último passo registrado, com motivo; o que é apagado fica no histórico do pedido. */
export const VoltarEtapaModal: React.FC<Omit<Props, 'itens' | 'notas'>> = ({ pedido, nomeDoAutor, onClose }) => {
  const voltar = useVoltarEtapa();
  const toast = useToast();
  const volta = voltaDaEtapa(pedido);
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (!motivo.trim() || !volta) return;
    try {
      await voltar.mutateAsync({ id: pedido.id, versao: pedido.versao, motivo: motivo.trim() });
      toast.success(`${nomeDoAutor}: o pedido voltou para "${ROTULO_ETAPA[volta.para]}".`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!voltar.isPending}
      size="md"
      testId="emendas-voltar-etapa-modal"
      title={volta ? `Voltar para "${ROTULO_ETAPA[volta.para]}"` : 'Voltar etapa'}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={voltar.isPending} />
          <AppButton type="submit" form="emendas-voltar-etapa-form" variant="primary" disabled={voltar.isPending || !volta} isLoading={voltar.isPending} data-testid="emendas-voltar-etapa-salvar">
            Voltar etapa
          </AppButton>
        </>
      }
    >
      <form id="emendas-voltar-etapa-form" onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {nomeDoAutor} · {identificacaoDoPedido(pedido)} · hoje em "{ROTULO_ETAPA[pedido.etapa]}"
        </div>
        {volta ? (
          <NoticeBar tone="warning" testId="emendas-voltar-etapa-apaga">
            Desfaz só o último passo. Será apagado: {volta.apaga}. O registro fica no histórico do pedido.
          </NoticeBar>
        ) : (
          <NoticeBar tone="info" testId="emendas-voltar-etapa-nao">
            Esta etapa não volta por aqui.
          </NoticeBar>
        )}
        <AppTextarea
          label="Motivo"
          rows={2}
          placeholder="Ex.: a DGFNSP ainda não assinou; marquei por engano"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          error={tentou && !motivo.trim() ? 'Informe o motivo.' : undefined}
          data-testid="emendas-voltar-etapa-motivo"
        />
      </form>
    </Modal>
  );
};
