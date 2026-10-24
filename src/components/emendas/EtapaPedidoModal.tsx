import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useAutoresEmendas, useAvancarPedido, useCancelarPedido } from '../../hooks/useEmendas';
import { formatCurrency } from '../../utils/format';
import { documentoSeiDaEtapaValido, identificacaoDoPedido, itensDaLinha, linhasAtivas, numerosSei, rodadaDoPedido, valorDoPedido } from '../../utils/emendasPedidos';
import { corteIndicacaoDias, dataBR, diasEntre, passouDoCorte } from '../../utils/emendasKits';
import { QuadroGabinete } from './QuadroGabinete';
import type { AcaoPedido, ItemCaep, PedidoEmenda } from '../../services/emendasService';

/** MAIS_*: acrescentar o número SEI de uma nota nova ao empenho ou ao envio para contratação, sem mudar de etapa. */
export type AcaoDaJanela = Exclude<AcaoPedido, 'ACRESCENTAR_SEI'> | 'MAIS_EMPENHADO' | 'MAIS_CONTRATACAO' | 'CANCELAR';

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
  DIVERGENCIA: 'Ofício com divergência',
  CONFERIDO: 'Conferir com o SIOP',
  SOLICITADO: 'Registrar a solicitação de empenho',
  AUTORIZADO: 'Registrar a autorização de empenho',
  CGOFI: 'Registrar o envio à CGOFI',
  EMPENHADO: 'Registrar o empenho',
  CONTRATACAO: 'Registrar o envio para contratação',
  MAIS_EMPENHADO: 'Acrescentar número SEI do empenho',
  MAIS_CONTRATACAO: 'Acrescentar número SEI do despacho para contratação',
  CANCELAR: 'Cancelar o pedido'
};

/** Rótulo do campo SEI de cada etapa com documento (migration 174). */
const ROTULO_SEI: Partial<Record<AcaoDaJanela, string>> = {
  OFICIO: 'Documento SEI do ofício *',
  SOLICITADO: 'Documento SEI da solicitação de empenho *',
  AUTORIZADO: 'Documento SEI da autorização *',
  CGOFI: 'Documento SEI do envio à CGOFI *',
  EMPENHADO: 'Documento(s) SEI do empenho *',
  CONTRATACAO: 'Documento(s) SEI do despacho para contratação *',
  MAIS_EMPENHADO: 'Documento(s) SEI do empenho *',
  MAIS_CONTRATACAO: 'Documento(s) SEI do despacho para contratação *'
};
/** Etapas com vários números: um por nota (uma emenda tem uma nota por fornecedor). */
const VARIOS: ReadonlySet<AcaoDaJanela> = new Set(['EMPENHADO', 'CONTRATACAO', 'MAIS_EMPENHADO', 'MAIS_CONTRATACAO']);

const ROTULO_DATA: Partial<Record<AcaoDaJanela, string>> = {
  MINUTA: 'Enviada em',
  OFICIO: 'Chegou em',
  DIVERGENCIA: 'Devolvido em',
  CONFERIDO: 'Conferido em',
  SOLICITADO: 'Enviada à DGFNSP em',
  AUTORIZADO: 'Autorizado em',
  CGOFI: 'Enviado em',
  EMPENHADO: 'Empenhado em',
  CONTRATACAO: 'Enviado em'
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

/** Uma janela para cada passo do pedido, da minuta ao envio para contratação, e para o cancelamento. */
export const EtapaPedidoModal: React.FC<Props> = ({ pedido, acao, itens, nomeDoAutor, onClose }) => {
  const avancar = useAvancarPedido();
  const cancelar = useCancelarPedido();
  const toast = useToast();
  const { data: autores = [] } = useAutoresEmendas();
  const [modo, setModo] = useState<AcaoDaJanela>(acao);
  const [data, setData] = useState(hojeEmBrasilia());
  const [documentoSei, setDocumentoSei] = useState('');
  const [processoSei, setProcessoSei] = useState(pedido.oficioProcessoSei ?? '');
  const [emenda, setEmenda] = useState(pedido.siopEmenda ?? '');
  const [valor, setValor] = useState(pedido.siopValor != null ? String(pedido.siopValor) : '');
  const [gnd, setGnd] = useState(pedido.siopGnd ?? 'GND-4');
  const [pontos, setPontos] = useState<Record<string, boolean>>({});
  const [divergencia, setDivergencia] = useState(pedido.divergencia ?? '');
  const [motivo, setMotivo] = useState(MOTIVOS_CANCELAMENTO[0]);
  const [outroMotivo, setOutroMotivo] = useState('');
  const [tentou, setTentou] = useState(false);

  const linhas = linhasAtivas(pedido);
  const rodada = rodadaDoPedido(pedido);
  const numeros = numerosSei(documentoSei);
  const pedeSei = Boolean(ROTULO_SEI[modo]);
  const semBeneficiario = linhas.filter((l) => !l.beneficiarioId).length;
  const todosPontos = PONTOS_SIOP.every(([k]) => pontos[k]);
  const ocupado = avancar.isPending || cancelar.isPending;

  // Ofício de reserva com item em ata a menos do corte do fim: o banco recusa (migration 162).
  const ataForaDoPrazo =
    modo === 'OFICIO' && (pedido.etapa === 'RESERVADO' || pedido.etapa === 'MINUTA')
      ? linhas
          .flatMap((l) => itensDaLinha(l))
          .map((x) => itens.get(x.itemKey))
          .find((i): i is ItemCaep => Boolean(i?.vigenciaFinal) && passouDoCorte(diasEntre(hojeEmBrasilia(), i!.vigenciaFinal!)))
      : undefined;

  const pendencias: string[] = [];
  if (pedeSei && (numeros.length === 0 || numeros.some((n) => !documentoSeiDaEtapaValido(n)) || (!VARIOS.has(modo) && numeros.length > 1))) {
    pendencias.push(VARIOS.has(modo) ? 'documento SEI (só números, 7 a 10 dígitos; vários: separe por vírgula)' : 'documento SEI (um número, só números, 7 a 10 dígitos)');
  }
  if (modo === 'OFICIO' && !processoSei.trim()) pendencias.push('processo SEI');
  if (modo === 'CONFERIDO') {
    if (!emenda.trim()) pendencias.push('número da emenda');
    if (!todosPontos) pendencias.push('marcar os 6 pontos que batem (se algo não bate, use "Ofício com divergência")');
    if (semBeneficiario) pendencias.push(`beneficiário em ${semBeneficiario === 1 ? 'uma linha' : `${semBeneficiario} linhas`} (use "Alterar linhas")`);
  }
  if (modo === 'DIVERGENCIA' && !divergencia.trim()) pendencias.push('o que não bate');
  if (modo === 'CANCELAR' && motivo === 'Outro' && !outroMotivo.trim()) pendencias.push('o motivo');

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length || ataForaDoPrazo) return;
    try {
      if (modo === 'CANCELAR') {
        await cancelar.mutateAsync({ id: pedido.id, versao: pedido.versao, motivo: motivo === 'Outro' ? outroMotivo.trim() : motivo });
        toast.success(`Pedido de ${nomeDoAutor} cancelado. A quantidade voltou ao saldo da CAEP.`);
      } else {
        const mais = modo === 'MAIS_EMPENHADO' || modo === 'MAIS_CONTRATACAO';
        const acao: AcaoPedido = mais ? 'ACRESCENTAR_SEI' : (modo as AcaoPedido);
        const dados: Record<string, unknown> =
          mais
            ? { etapa: modo === 'MAIS_EMPENHADO' ? 'EMPENHADO' : 'CONTRATACAO', documentos_sei: numeros }
            : modo === 'MINUTA'
              ? { data }
              : modo === 'OFICIO'
                ? { data, documento_sei: numeros[0], processo_sei: processoSei.trim() }
                : modo === 'DIVERGENCIA'
                  ? { data, texto: divergencia.trim() }
                  : modo === 'CONFERIDO'
                    ? { data, emenda: emenda.trim(), valor: valor ? Number(valor.replace(/\./g, '').replace(',', '.')) : null, gnd, conferencia: pontos }
                    : VARIOS.has(modo)
                      ? { data, documentos_sei: numeros }
                      : { data, documento_sei: numeros[0] };
        await avancar.mutateAsync({ id: pedido.id, versao: pedido.versao, acao, dados });
        toast.success(
          modo === 'DIVERGENCIA'
            ? `Ofício devolvido. O pedido voltou para a minuta (${rodada + 1}ª). A reserva continua.`
            : mais
              ? 'Número SEI acrescentado.'
              : `${nomeDoAutor}: ${TITULO[modo].replace('Registrar ', '').replace('Conferir com o SIOP', 'conferido no SIOP')}.`
        );
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
      size={modo === 'CONFERIDO' ? 'lg' : 'md'}
      testId="emendas-etapa-modal"
      title={TITULO[modo] + (rodada > 1 && (modo === 'MINUTA' || modo === 'OFICIO') ? ` (${rodada}ª rodada)` : '')}
      footer={
        <>
          <ActionButton action="cancelar" label={modo === 'CANCELAR' ? 'Voltar' : 'Cancelar'} type="button" onClick={onClose} disabled={ocupado} />
          {modo === 'CONFERIDO' && (
            <AppButton type="button" variant="ghostDanger" onClick={() => setModo('DIVERGENCIA')} disabled={ocupado}>
              Ofício com divergência
            </AppButton>
          )}
          <AppButton type="submit" form="emendas-etapa-form" variant={modo === 'CANCELAR' || modo === 'DIVERGENCIA' ? 'danger' : 'primary'} disabled={ocupado} isLoading={ocupado} data-testid="emendas-etapa-salvar">
            {modo === 'CANCELAR' ? 'Cancelar o pedido' : modo === 'CONFERIDO' ? 'Tudo confere' : modo === 'DIVERGENCIA' ? 'Devolver para a minuta' : modo.startsWith('MAIS_') ? 'Acrescentar' : 'Registrar'}
          </AppButton>
        </>
      }
    >
      <form id="emendas-etapa-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {nomeDoAutor} · {identificacaoDoPedido(pedido)}
          {pedido.oficioProcessoSei ? ` · SEI ${pedido.oficioProcessoSei}` : ''}
        </div>

        {ataForaDoPrazo && (
          <div style={aviso('erro')} role="alert" data-testid="emendas-etapa-fora-do-prazo">
            A ata {ataForaDoPrazo.numeroAta} termina em {dataBR(ataForaDoPrazo.vigenciaFinal)} e passou do prazo de indicação ({corteIndicacaoDias()} dias antes do fim), para dar tempo
            de empenhar e assinar o contrato. Troque o item em "Alterar linhas" ou cancele o pedido.
          </div>
        )}

        {(pedeSei || ROTULO_DATA[modo]) && modo !== 'CONFERIDO' && modo !== 'DIVERGENCIA' && (
          <div style={grade}>
            {pedeSei && (
              <AppInput
                label={ROTULO_SEI[modo]}
                placeholder={VARIOS.has(modo) ? 'Ex.: 41234567, 41234568' : 'Ex.: 41234567'}
                hint={VARIOS.has(modo) ? 'Um por nota. Vários números: separe por vírgula.' : 'Só números, 7 a 10 dígitos.'}
                value={documentoSei}
                onChange={(e) => setDocumentoSei(e.target.value)}
                data-testid="emendas-etapa-sei"
              />
            )}
            {modo === 'OFICIO' && (
              <AppInput
                label="Processo SEI *"
                placeholder="08020.000000/2026-00"
                hint={rodada > 1 ? 'Mesmo processo do ofício devolvido; troque se mudou.' : undefined}
                value={processoSei}
                onChange={(e) => setProcessoSei(e.target.value)}
                data-testid="emendas-etapa-processo"
              />
            )}
            {ROTULO_DATA[modo] && <AppInput label={ROTULO_DATA[modo]!} type="date" value={data} onChange={(e) => setData(e.target.value)} />}
          </div>
        )}

        {modo === 'MINUTA' && (
          <QuadroGabinete autor={autores.find((a) => a.id === pedido.autorId)} linhas={linhasAtivas(pedido)} data={pedido.reservadoEm} testId="emendas-etapa-quadro" />
        )}

        {modo === 'EMPENHADO' && <div style={aviso('info')}>As notas de empenho não são digitadas: o sistema acha cada nota pelo contrato e pela emenda.</div>}
        {modo === 'CONTRATACAO' && <div style={aviso('info')}>Ao registrar, o processo segue com a CCGA para a contratação e a CAEP passa a só acompanhar.</div>}

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
            <AppInput label="Devolvido em" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <div style={aviso('info')}>
              O pedido volta para "Minuta": a CAEP faz a {rodada + 1}ª minuta e manda ao gabinete. A minuta e o ofício devolvidos ficam no histórico do pedido.
              A reserva continua.
            </div>
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
