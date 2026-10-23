import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useAvancarPedido, useCancelarPedido } from '../../hooks/useEmendas';
import { formatCurrency } from '../../utils/format';
import { identificacaoDoPedido, linhasAtivas, valorDoPedido } from '../../utils/emendasPedidos';
import { LinhaDoPedido } from './emendasPartes';
import type { AcaoPedido, ItemCaep, PedidoEmenda } from '../../services/emendasService';

export type AcaoDaJanela = AcaoPedido | 'CANCELAR';

interface Props {
  pedido: PedidoEmenda;
  acao: AcaoDaJanela;
  itens: Map<string, ItemCaep>;
  nomeDoAutor: string;
  onClose: () => void;
}

const PONTOS_SIOP: ReadonlyArray<[string, string]> = [
  ['numero_emenda', 'Nº da emenda'],
  ['autor', 'Autor'],
  ['valor', 'Valor'],
  ['gnd', 'GND'],
  ['beneficiario', 'Beneficiário'],
  ['objeto', 'Objeto']
];

const MOTIVOS_CANCELAMENTO = ['Parlamentar desistiu', 'Divergência não resolvida', 'Passou do prazo sem ofício', 'Ata vencida sem substituto', 'Outro'];

const TITULO: Record<AcaoDaJanela, string> = {
  MINUTA: 'Registrar a minuta',
  OFICIO: 'Registrar o ofício',
  DIVERGENCIA: 'Registrar divergência',
  CONFERIDO: 'Conferir com o SIOP',
  AUTORIZADO: 'Registrar a autorização de empenho',
  EMPENHADO: 'Registrar o empenho',
  CANCELAR: 'Cancelar o pedido'
};

const grade: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.8rem' };
const aviso = (tom: 'erro' | 'info'): React.CSSProperties => ({
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.5rem 0.7rem',
  borderRadius: 6,
  background: tom === 'erro' ? 'var(--color-danger-bg, #fdecea)' : 'var(--color-info-bg, #e6eefb)',
  color: tom === 'erro' ? 'var(--color-danger, #b11b05)' : 'var(--color-info-text, #155bcb)'
});
const NE = /^\d{4}NE\d{6}$/;

/** Uma janela para cada passo do pedido: minuta, ofício, conferência com o SIOP, autorização, empenho e cancelamento. */
export const EtapaPedidoModal: React.FC<Props> = ({ pedido, acao, itens, nomeDoAutor, onClose }) => {
  const avancar = useAvancarPedido();
  const cancelar = useCancelarPedido();
  const toast = useToast();
  const [modo, setModo] = useState<AcaoDaJanela>(acao);
  const [data, setData] = useState(hojeEmBrasilia());
  const [documentoSei, setDocumentoSei] = useState('');
  const [oficio, setOficio] = useState(pedido.oficioNumero ?? 'Ofício nº ');
  const [processoSei, setProcessoSei] = useState(pedido.oficioProcessoSei ?? '');
  const [emenda, setEmenda] = useState(pedido.siopEmenda ?? '');
  const [valor, setValor] = useState(pedido.siopValor != null ? String(pedido.siopValor) : '');
  const [gnd, setGnd] = useState(pedido.siopGnd ?? 'GND-4');
  const [pontos, setPontos] = useState<Record<string, boolean>>({});
  const [divergencia, setDivergencia] = useState(pedido.divergencia ?? '');
  const [notas, setNotas] = useState<Record<string, string>>(() => Object.fromEntries(linhasAtivas(pedido).map((l) => [l.id, l.notaEmpenho ?? ''])));
  const [motivo, setMotivo] = useState(MOTIVOS_CANCELAMENTO[0]);
  const [outroMotivo, setOutroMotivo] = useState('');
  const [tentou, setTentou] = useState(false);

  const linhas = linhasAtivas(pedido);
  const semBeneficiario = linhas.filter((l) => !l.beneficiarioId).length;
  const todosPontos = PONTOS_SIOP.every(([k]) => pontos[k]);
  const ocupado = avancar.isPending || cancelar.isPending;

  const pendencias: string[] = [];
  if (modo === 'OFICIO' && (!oficio.trim() || oficio.trim() === 'Ofício nº' || !processoSei.trim())) pendencias.push('número do ofício e processo SEI');
  if (modo === 'CONFERIDO') {
    if (!emenda.trim()) pendencias.push('número da emenda');
    if (!todosPontos) pendencias.push('marcar os 6 pontos que batem (se algo não bate, registre a divergência)');
    if (semBeneficiario) pendencias.push(`beneficiário em ${semBeneficiario === 1 ? 'uma linha' : `${semBeneficiario} linhas`} (use "Alterar linhas")`);
  }
  if (modo === 'DIVERGENCIA' && !divergencia.trim()) pendencias.push('o que não bate');
  if (modo === 'EMPENHADO' && linhas.some((l) => !NE.test((notas[l.id] ?? '').trim().toUpperCase()))) pendencias.push('nota de empenho de cada linha no formato 2026NE000123');
  if (modo === 'CANCELAR' && motivo === 'Outro' && !outroMotivo.trim()) pendencias.push('o motivo');

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    try {
      if (modo === 'CANCELAR') {
        await cancelar.mutateAsync({ id: pedido.id, versao: pedido.versao, motivo: motivo === 'Outro' ? outroMotivo.trim() : motivo });
        toast.success(`Pedido de ${nomeDoAutor} cancelado. A quantidade voltou ao saldo da CAEP.`);
      } else {
        const dados: Record<string, unknown> =
          modo === 'MINUTA' || modo === 'AUTORIZADO'
            ? { data, documento_sei: documentoSei.trim() || null }
            : modo === 'OFICIO'
              ? { data, numero: oficio.trim(), processo_sei: processoSei.trim() }
              : modo === 'DIVERGENCIA'
                ? { texto: divergencia.trim() }
                : modo === 'CONFERIDO'
                  ? { data, emenda: emenda.trim(), valor: valor ? Number(valor.replace(/\./g, '').replace(',', '.')) : null, gnd, conferencia: pontos }
                  : { data, notas: linhas.map((l) => ({ linha_id: l.id, nota_empenho: (notas[l.id] ?? '').trim().toUpperCase() })) };
        await avancar.mutateAsync({ id: pedido.id, versao: pedido.versao, acao: modo, dados });
        toast.success(modo === 'DIVERGENCIA' ? 'Divergência registrada. O ofício volta ao gabinete; a reserva continua.' : `${nomeDoAutor}: ${TITULO[modo].replace('Registrar ', '').replace('Conferir com o SIOP', 'conferido no SIOP')}.`);
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!ocupado}
      size={modo === 'CONFERIDO' || modo === 'EMPENHADO' ? 'lg' : 'md'}
      testId="emendas-etapa-modal"
      title={TITULO[modo]}
      footer={
        <>
          <ActionButton action="cancelar" label={modo === 'CANCELAR' ? 'Voltar' : 'Cancelar'} type="button" onClick={onClose} disabled={ocupado} />
          {modo === 'CONFERIDO' && (
            <AppButton type="button" variant="ghostDanger" onClick={() => setModo('DIVERGENCIA')} disabled={ocupado}>
              Algo não bate
            </AppButton>
          )}
          <AppButton type="submit" form="emendas-etapa-form" variant={modo === 'CANCELAR' ? 'danger' : 'primary'} disabled={ocupado} isLoading={ocupado} data-testid="emendas-etapa-salvar">
            {modo === 'CANCELAR' ? 'Cancelar o pedido' : modo === 'CONFERIDO' ? 'Tudo confere' : modo === 'DIVERGENCIA' ? 'Registrar divergência' : 'Registrar'}
          </AppButton>
        </>
      }
    >
      <form id="emendas-etapa-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {nomeDoAutor} · {identificacaoDoPedido(pedido)}
          {pedido.oficioProcessoSei ? ` · SEI ${pedido.oficioProcessoSei}` : ''}
        </div>

        {(modo === 'MINUTA' || modo === 'AUTORIZADO') && (
          <div style={grade}>
            <AppInput label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <AppInput label={modo === 'MINUTA' ? 'Documento SEI da minuta' : 'Documento SEI da autorização'} placeholder="Opcional" value={documentoSei} onChange={(e) => setDocumentoSei(e.target.value)} />
          </div>
        )}

        {modo === 'OFICIO' && (
          <div style={grade}>
            <AppInput label="Nº do ofício *" value={oficio} onChange={(e) => setOficio(e.target.value)} data-testid="emendas-etapa-oficio" />
            <AppInput label="Processo SEI *" placeholder="08020.000000/2026-00" value={processoSei} onChange={(e) => setProcessoSei(e.target.value)} data-testid="emendas-etapa-processo" />
            <AppInput label="Chegou em" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        )}

        {modo === 'CONFERIDO' && (
          <>
            <div style={grade}>
              <AppInput label="Nº da emenda *" placeholder="Ex.: 2026 4095 0004" value={emenda} onChange={(e) => setEmenda(e.target.value)} data-testid="emendas-etapa-emenda" />
              <AppInput label="Valor no SIOP (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
              <AppSelect label="GND" value={gnd} onChange={(e) => setGnd(e.target.value)}>
                <option value="GND-4">GND-4 Investimento</option>
                <option value="GND-3">GND-3 Custeio</option>
              </AppSelect>
              <AppInput label="Conferido em" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div style={aviso('info')}>Valor dos itens do pedido pelo preço das atas: {formatCurrency(valorDoPedido(pedido, itens))}.</div>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <legend style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>O que bate entre o ofício e o SIOP</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.45rem' }}>
                {PONTOS_SIOP.map(([k, r]) => (
                  <label key={k} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600, padding: '0.45rem 0.6rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={Boolean(pontos[k])} onChange={(e) => setPontos((p) => ({ ...p, [k]: e.target.checked }))} data-testid={`emendas-etapa-ponto-${k}`} />
                    {r}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {modo === 'DIVERGENCIA' && (
          <>
            <AppTextarea label="O que não bate *" rows={3} value={divergencia} onChange={(e) => setDivergencia(e.target.value)} placeholder="Ex.: valor do ofício (R$ 120.000) diferente do SIOP (R$ 98.000)" data-testid="emendas-etapa-divergencia" />
            <div style={aviso('info')}>O pedido fica em "Ofício recebido" com o aviso de divergência e a reserva continua. Quando o gabinete mandar o ofício corrigido, registre-o de novo e confira.</div>
          </>
        )}

        {modo === 'EMPENHADO' && (
          <>
            <AppInput label="Empenhado em" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            {linhas.map((l) => (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 190px', gap: '0.75rem', alignItems: 'end' }}>
                <div style={{ minWidth: 0 }}>
                  <LinhaDoPedido linha={l} itens={itens} />
                </div>
                <AppInput label="Nota de empenho" placeholder="2026NE000000" value={notas[l.id] ?? ''} onChange={(e) => setNotas((n) => ({ ...n, [l.id]: e.target.value }))} data-testid={`emendas-etapa-ne-${l.id}`} />
              </div>
            ))}
            <div style={aviso('info')}>Ao registrar, o processo segue para a CCGA e a CAEP passa a só acompanhar.</div>
          </>
        )}

        {modo === 'CANCELAR' && (
          <>
            <div style={aviso('info')}>A quantidade de todas as linhas volta ao saldo da CAEP. O pedido continua na lista, em Cancelados.</div>
            <AppSelect label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_CANCELAMENTO.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </AppSelect>
            {motivo === 'Outro' && <AppInput label="Qual?" value={outroMotivo} onChange={(e) => setOutroMotivo(e.target.value)} />}
          </>
        )}

        {tentou && pendencias.length > 0 && (
          <div style={aviso('erro')} role="alert" data-testid="emendas-etapa-pendencias">
            Falta: {pendencias.join('; ')}.
          </div>
        )}
      </form>
    </Modal>
  );
};
