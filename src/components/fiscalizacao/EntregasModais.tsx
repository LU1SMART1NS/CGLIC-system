import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppDateInput, AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { useDefinirPrevistaEntregas, useDefinirResponsavelEntregas, useDividirEntrega, useMudarEtapaEntregas } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao, EtapaEntrega, ResponsavelEntrega } from '../../services/fiscalizacaoService';
import { MOTIVO_MINIMO, NOME_SFC, hojeEmBrasilia } from '../../utils/fiscalizacao';
import { ETAPAS_ENTREGA, FASES_ENTREGA, bloqueioDaEtapa, etapaDef, nomeDoItem, ordemDaEtapa, rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';

const erroDe = (err: unknown) => (err as { message?: string } | null)?.message || 'erro desconhecido';
const seiValido = (s: string) => /^\d{7,10}$/.test(s);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const quem = (entregas: EntregaFiscalizacao[]) => [...new Set(entregas.map((e) => rotuloDoBeneficiario(e).principal))].slice(0, 4).join(' · ') + (new Set(entregas.map((e) => rotuloDoBeneficiario(e).principal)).size > 4 ? ' …' : '');

/** Próxima etapa sugerida: a seguinte à mais atrasada das escolhidas. */
function etapaSugerida(entregas: EntregaFiscalizacao[]): EtapaEntrega {
  const menor = Math.min(...entregas.map((e) => ordemDaEtapa(e.etapa)));
  return ETAPAS_ENTREGA[Math.min(menor + 1, ETAPAS_ENTREGA.length - 1)].id;
}

export const MudarEtapaModal: React.FC<{ entregas: EntregaFiscalizacao[]; onClose: (feito: boolean) => void }> = ({ entregas, onClose }) => {
  const toast = useToast();
  const mudar = useMudarEtapaEntregas();
  const [etapa, setEtapa] = useState<EtapaEntrega>(() => etapaSugerida(entregas));
  const [data, setData] = useState(hojeEmBrasilia());
  const [sei, setSei] = useState('');
  const [observacao, setObservacao] = useState('');
  const def = etapaDef(etapa);
  const bloqueio = bloqueioDaEtapa(entregas, etapa);
  const hoje = hojeEmBrasilia();
  const ok = !bloqueio && Boolean(data) && data <= hoje && (!def.sei || seiValido(sei));
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title={`Mudar a etapa de ${plural(entregas.length, 'item', 'itens')}`}
      subtitle={quem(entregas)}
      size="md"
      dismissible={!mudar.isPending}
      testId="fisc-mudar-etapa-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={mudar.isPending} />
          <AppButton
            variant="primary"
            disabled={!ok}
            isLoading={mudar.isPending}
            data-testid="fisc-mudar-etapa-salvar"
            onClick={() =>
              mudar.mutate(
                { ids: entregas.map((e) => e.id), etapa, data, documentoSei: def.sei ? sei : null, observacao },
                {
                  onSuccess: () => {
                    toast.success(`${plural(entregas.length, 'item', 'itens')} em "${def.nome}"`);
                    onClose(true);
                  },
                  onError: (err) => toast.error(`Não foi possível mudar a etapa: ${erroDe(err)}`)
                }
              )
            }
          >
            Mudar etapa
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <AppSelect label="Nova etapa" value={etapa} onChange={(ev) => setEtapa(ev.target.value as EtapaEntrega)} data-testid="fisc-mudar-etapa-etapa">
          {FASES_ENTREGA.map((f) => (
            <optgroup key={f.id} label={f.nome}>
              {ETAPAS_ENTREGA.filter((e) => e.fase === f.id).map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </optgroup>
          ))}
          <option value="FINALIZADO">Finalizado</option>
        </AppSelect>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
          <AppDateInput label={etapa === 'ENTREGUE' ? 'Entregue em' : 'Data'} value={data} onValueChange={setData} max={hoje} />
          {def.sei && (
            <AppInput label="Documento SEI" value={sei} onChange={(ev) => setSei(ev.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 37530982" hint="Número do documento desta etapa." data-testid="fisc-mudar-etapa-sei" />
          )}
        </div>
        {bloqueio && <NoticeBar tone="danger" testId="fisc-mudar-etapa-bloqueio">{bloqueio}</NoticeBar>}
        {!bloqueio && etapa === 'ORDEM' && entregas.some((e) => e.pedidoId) && (
          <NoticeBar tone="info">A Ordem fica registrada também no pedido de emenda, para a CAEP ver no Pedido 360.</NoticeBar>
        )}
        {!bloqueio && etapa === 'SAL' && <NoticeBar tone="info">O Ofício à SAL informa o parlamentar da entrega.</NoticeBar>}
        <AppTextarea label="Observação (opcional)" value={observacao} onChange={(ev) => setObservacao(ev.target.value)} rows={2} placeholder="ex.: a contratada pediu prorrogação de 30 dias" />
      </div>
    </Modal>
  );
};

/** Entrega parcial: uma parte da quantidade vira outra entrega, na mesma etapa (a soma não muda). */
export const DividirEntregaModal: React.FC<{ entrega: EntregaFiscalizacao; onClose: (feito: boolean) => void }> = ({ entrega, onClose }) => {
  const toast = useToast();
  const dividir = useDividirEntrega();
  const [quantidade, setQuantidade] = useState(() => Math.max(1, Math.floor(entrega.quantidade / 2)));
  const ok = Number.isInteger(quantidade) && quantidade >= 1 && quantidade < entrega.quantidade;
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title="Entrega parcial"
      subtitle={`${nomeDoItem(entrega)} · ${rotuloDoBeneficiario(entrega).principal} · ${entrega.quantidade.toLocaleString('pt-BR')} unidades`}
      size="sm"
      dismissible={!dividir.isPending}
      testId="fisc-dividir-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={dividir.isPending} />
          <AppButton
            variant="primary"
            disabled={!ok}
            isLoading={dividir.isPending}
            data-testid="fisc-dividir-salvar"
            onClick={() =>
              dividir.mutate(
                { id: entrega.id, quantidade },
                { onSuccess: () => { toast.success(`Entrega parcial: ${quantidade} unidades separadas; ${entrega.quantidade - quantidade} seguem a entregar`); onClose(true); }, onError: (err) => toast.error(`Não foi possível dividir: ${erroDe(err)}`) }
              )
            }
          >
            Separar
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <AppInput
          label="Quantas unidades foram entregues?"
          type="number"
          min={1}
          max={entrega.quantidade - 1}
          value={quantidade}
          onChange={(ev) => setQuantidade(Number(ev.target.value))}
          error={ok ? undefined : `De 1 a ${entrega.quantidade - 1}.`}
          data-testid="fisc-dividir-quantidade"
        />
        <span style={{ ...carteiraDetalhe, marginTop: 0 }}>
          As {quantidade.toLocaleString('pt-BR')} entregues viram um item à parte, para você mudar a etapa para Entregue. As {Math.max(0, entrega.quantidade - quantidade).toLocaleString('pt-BR')} restantes seguem na etapa de hoje.
        </span>
      </div>
    </Modal>
  );
};

export const PrevistaModal: React.FC<{ entregas: EntregaFiscalizacao[]; onClose: (feito: boolean) => void }> = ({ entregas, onClose }) => {
  const toast = useToast();
  const salvar = useDefinirPrevistaEntregas();
  const iguais = new Set(entregas.map((e) => e.prevista ?? '')).size === 1;
  const [data, setData] = useState(iguais ? entregas[0]?.prevista ?? '' : '');
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title={`Data prevista de ${plural(entregas.length, 'item', 'itens')}`}
      subtitle={quem(entregas)}
      size="sm"
      dismissible={!salvar.isPending}
      testId="fisc-prevista-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={salvar.isPending} />
          <ActionButton
            action="salvar"
            disabled={!data}
            isLoading={salvar.isPending}
            data-testid="fisc-prevista-salvar"
            onClick={() =>
              salvar.mutate({ ids: entregas.map((e) => e.id), prevista: data }, { onSuccess: () => { toast.success('Data prevista registrada'); onClose(true); }, onError: (err) => toast.error(`Não foi possível salvar: ${erroDe(err)}`) })
            }
          />
        </>
      }
    >
      <AppDateInput label="Prevista para" value={data} onValueChange={setData} hint="O prazo do item conta por esta data; sem ela, o item fica sem prazo." />
    </Modal>
  );
};

/** Coordenador, em contrato de fiscalização mista: quais entregas ficam com a área requisitante. */
export const ResponsavelModal: React.FC<{ entregas: EntregaFiscalizacao[]; onClose: (feito: boolean) => void }> = ({ entregas, onClose }) => {
  const toast = useToast();
  const salvar = useDefinirResponsavelEntregas();
  const [responsavel, setResponsavel] = useState<ResponsavelEntrega>(() => (entregas.every((e) => e.responsavel === 'AREA') ? 'SFC' : 'AREA'));
  const [motivo, setMotivo] = useState('');
  const ok = motivo.trim().length >= MOTIVO_MINIMO;
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title={`Quem fiscaliza ${entregas.length === 1 ? 'este item' : `estes ${entregas.length} itens`}`}
      subtitle={quem(entregas)}
      size="md"
      dismissible={!salvar.isPending}
      testId="fisc-responsavel-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={salvar.isPending} />
          <ActionButton
            action="salvar"
            disabled={!ok}
            isLoading={salvar.isPending}
            data-testid="fisc-responsavel-salvar"
            onClick={() =>
              salvar.mutate(
                { ids: entregas.map((e) => e.id), responsavel, motivo },
                { onSuccess: () => { toast.success(`${plural(entregas.length, 'item', 'itens')} com ${responsavel === 'SFC' ? `a ${NOME_SFC}` : 'a área requisitante'}`); onClose(true); }, onError: (err) => toast.error(`Não foi possível salvar: ${erroDe(err)}`) }
              )
            }
          />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <AppSelect label="Fiscalizada por" value={responsavel} onChange={(ev) => setResponsavel(ev.target.value as ResponsavelEntrega)} data-testid="fisc-responsavel-quem">
          <option value="SFC">{NOME_SFC}</option>
          <option value="AREA">Área requisitante</option>
        </AppSelect>
        <AppTextarea label="Motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} rows={2} placeholder="ex.: a Força Nacional recebe e fiscaliza as próprias viaturas" hint="Fica no histórico de cada item." data-testid="fisc-responsavel-motivo" />
        <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Para passar só parte de um item, use Entrega parcial antes.</span>
      </div>
    </Modal>
  );
};
