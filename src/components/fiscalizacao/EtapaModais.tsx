import React, { useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppDateInput, AppInput, AppTextarea } from '../../design-system/components/FormFields';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { useToast } from '../../design-system/components/Toast';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { VoltarEtapaJanela } from '../mesa/VoltarEtapaJanela';
import { useMovimentosDaEntrega, useMudarEtapaEntregas, useVoltarEtapaEntrega } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao, EtapaEntrega } from '../../services/fiscalizacaoService';
import { bloqueioDaEtapa, etapaDef, nomeDoItem, rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { EXPLICA, VERBO, proximasDoGrupo, rotuloDoAvanco, voltaDoItem } from '../../utils/fiscalizacaoPassos';
import { MOTIVO_MINIMO, dataBR, hojeEmBrasilia } from '../../utils/fiscalizacao';

const erroDe = (err: unknown) => (err as { message?: string } | null)?.message || 'erro desconhecido';
const seiValido = (s: string) => /^\d{7,10}$/.test(s);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const quem = (es: EntregaFiscalizacao[]) => {
  const nomes = [...new Set(es.map((e) => rotuloDoBeneficiario(e).principal))];
  return nomes.slice(0, 4).join(' · ') + (nomes.length > 4 ? ' …' : '');
};

/**
 * Avançar: registra o próximo passo dos itens (os da mesa andam juntos). Com uma saída só, a janela já vem com ela;
 * depois da produção, mostra só as saídas possíveis. Data, SEI quando a etapa tem documento, e observação opcional.
 */
export const AvancarEtapaModal: React.FC<{ entregas: EntregaFiscalizacao[]; /** Saída já marcada (ex.: Entregue, pela linha do fornecedor). */ inicial?: EtapaEntrega; onClose: (feito: boolean) => void }> = ({ entregas, inicial, onClose }) => {
  const toast = useToast();
  const mudar = useMudarEtapaEntregas();
  const opcoes = proximasDoGrupo(entregas);
  const [etapa, setEtapa] = useState<EtapaEntrega | null>(opcoes.length === 1 ? opcoes[0] : inicial && opcoes.includes(inicial) ? inicial : null);
  const [data, setData] = useState(hojeEmBrasilia());
  const [sei, setSei] = useState('');
  const [observacao, setObservacao] = useState('');
  const hoje = hojeEmBrasilia();
  const def = etapa ? etapaDef(etapa) : null;
  const bloqueio = etapa ? bloqueioDaEtapa(entregas, etapa) : null;
  const ok = Boolean(etapa) && !bloqueio && Boolean(data) && data <= hoje && (!def?.sei || seiValido(sei));
  const atuais = [...new Set(entregas.map((e) => etapaDef(e.etapa).nome))];
  const titulo = (inicial && opcoes.includes(inicial) ? VERBO[inicial] : rotuloDoAvanco(opcoes)) ?? 'Registrar o andamento';
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title={titulo}
      subtitle={`${plural(entregas.length, 'item', 'itens')} · ${quem(entregas)}`}
      size="md"
      dismissible={!mudar.isPending}
      testId="fisc-avancar-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={() => onClose(false)} disabled={mudar.isPending} />
          <AppButton
            variant="primary"
            disabled={!ok}
            isLoading={mudar.isPending}
            data-testid="fisc-avancar-salvar"
            onClick={() =>
              etapa &&
              mudar.mutate(
                { ids: entregas.map((e) => e.id), etapa, data, documentoSei: def?.sei ? sei : null, observacao },
                {
                  onSuccess: () => {
                    toast.success(`${plural(entregas.length, 'item', 'itens')} em "${etapaDef(etapa).nome}"`);
                    onClose(true);
                  },
                  onError: (err) => toast.error(`Não foi possível registrar: ${erroDe(err)}`)
                }
              )
            }
          >
            Registrar
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.3rem 0.5rem', fontSize: '0.85rem' }} data-testid="fisc-avancar-de-para">
          <span style={{ color: '#64748b' }}>Hoje:</span>
          <b>{atuais.join(' · ')}</b>
          {def && (
            <>
              <span aria-hidden="true" style={{ color: '#94a3b8' }}>›</span>
              <b style={{ color: 'var(--primary)' }}>{def.nome}</b>
            </>
          )}
        </div>

        {opcoes.length === 0 && (
          <NoticeBar tone="info" testId="fisc-avancar-sem-passo">
            Estes itens não têm um próximo passo em comum. Registre um de cada vez, pela janela do item.
          </NoticeBar>
        )}

        {opcoes.length > 1 && (
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <legend style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem' }}>Como o item segue?</legend>
            {opcoes.map((o) => {
              const marcado = etapa === o;
              return (
                <label key={o} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.55rem 0.7rem', border: `1px solid ${marcado ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, background: marcado ? 'var(--primary-soft, #eef4ff)' : 'var(--bg-card)', cursor: 'pointer' }}>
                  <input type="radio" name="fisc-avancar-saida" checked={marcado} onChange={() => setEtapa(o)} style={{ accentColor: 'var(--primary)', marginTop: 3, width: 16, height: 16 }} data-testid={`fisc-avancar-${o}`} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem' }}>{etapaDef(o).nome}</span>
                    {EXPLICA[o] && <span style={{ ...carteiraDetalhe, display: 'block' }}>{EXPLICA[o]}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        {etapa && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
            <AppDateInput label={etapa === 'ENTREGUE' ? 'Entregue em' : 'Data'} value={data} onValueChange={setData} max={hoje} />
            {def?.sei && <AppInput label="Documento SEI" value={sei} onChange={(ev) => setSei(ev.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 37530982" hint="Número do documento desta etapa." data-testid="fisc-avancar-sei" />}
          </div>
        )}
        {bloqueio && <NoticeBar tone="danger" testId="fisc-avancar-bloqueio">{bloqueio}</NoticeBar>}
        {!bloqueio && etapa === 'ORDEM' && entregas.some((e) => e.pedidoId) && <NoticeBar tone="info">A Ordem fica registrada também no pedido de emenda, para a CAEP ver no Pedido 360.</NoticeBar>}
        {!bloqueio && etapa === 'SAL' && <NoticeBar tone="info">O Ofício à SAL informa o parlamentar da entrega.</NoticeBar>}
        {etapa && <AppTextarea label="Observação (opcional)" value={observacao} onChange={(ev) => setObservacao(ev.target.value)} rows={2} placeholder="ex.: chegou com a nota fiscal 1234" />}
      </div>
    </Modal>
  );
};

/**
 * Voltar etapa do item: desfaz o último passo registrado, com motivo (a mesma janela do pedido de emenda). A janela
 * mostra para onde volta pelo histórico; quem decide e grava é o servidor (voltar_etapa_entrega, migration 273).
 */
export const VoltarEtapaItemModal: React.FC<{ entrega: EntregaFiscalizacao; onClose: (feito: boolean) => void }> = ({ entrega: e, onClose }) => {
  const toast = useToast();
  const voltar = useVoltarEtapaEntrega();
  const { data: movimentos = [], isLoading } = useMovimentosDaEntrega(e.id);
  if (isLoading) return null;
  const v = voltaDoItem(e, movimentos);
  const apaga = v.apaga ? `o registro de "${etapaDef(v.apaga.etapa as EtapaEntrega).nome}"${v.apaga.data ? ` de ${dataBR(v.apaga.data)}` : ''}${v.apaga.documentoSei ? `, SEI ${v.apaga.documentoSei}` : ''}` : null;
  return (
    <VoltarEtapaJanela
      testId="fisc-voltar-modal"
      para={v.para ? etapaDef(v.para).nome : null}
      contexto={`${e.quantidade.toLocaleString('pt-BR')}× ${nomeDoItem(e)} · ${rotuloDoBeneficiario(e).principal} · hoje em "${etapaDef(e.etapa).nome}"`}
      apaga={apaga}
      impede={v.impede}
      ondeFica="histórico do item"
      exemplo="Ex.: registrei a entrega no item errado; o fornecedor ainda não entregou"
      minimo={MOTIVO_MINIMO}
      salvando={voltar.isPending}
      onClose={() => onClose(false)}
      onVoltar={(motivo) =>
        voltar.mutate(
          { id: e.id, motivo },
          {
            onSuccess: () => {
              toast.success(`O item voltou para "${etapaDef(v.para as EtapaEntrega).nome}".`);
              onClose(true);
            },
            onError: (err) => toast.error(`Não foi possível voltar: ${erroDe(err)}`)
          }
        )
      }
    />
  );
};
