import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Modal } from '../../../design-system/components/Modal';
import { AppButton } from '../../../design-system/components/AppButton';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { AppTextarea } from '../../../design-system/components/FormFields';
import { NoticeBar } from '../../../design-system/components/NoticeBar';
import { NumeroSeiEtiqueta } from '../../../design-system/components/NumeroSeiEtiqueta';
import { useToast } from '../../../design-system';
import { conferirExecucao, type ExecucaoDoContrato } from '../../../utils/contratoExecutado';
import { formatDateBR } from '../../../services/temporalEngineService';
import { useContratosExecucao } from '../../../hooks/useContratosExecucao';
import { fetchEntregasDaExecucao } from '../../../services/contratoExecucaoService';
import { etapaDef } from '../../../utils/fiscalizacaoEntregas';
import type { EtapaEntrega } from '../../../services/fiscalizacaoService';

interface ConfirmarExecucaoModalProps {
  isOpen: boolean;
  numero: string;
  fornecedor?: string;
  execucao?: ExecucaoDoContrato;
  onClose: () => void;
}

const ICONE = {
  ok: <CheckCircle2 size={18} color="var(--color-success)" aria-hidden="true" />,
  aviso: <AlertTriangle size={18} color="var(--color-warning-solid)" aria-hidden="true" />,
  bloqueia: <XCircle size={18} color="var(--color-danger)" aria-hidden="true" />
};

const TITULO_SECAO: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 800,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '0.4rem'
};

/** Entregas do contrato na Fiscalização, com o TRD que o fiscal registrou. Só lê o banco com a janela aberta. */
const EntregasNaFiscalizacao: React.FC<{ contractKey: string }> = ({ contractKey }) => {
  const entregas = useQuery({
    queryKey: ['execucao-entregas', contractKey],
    queryFn: () => fetchEntregasDaExecucao(contractKey),
    staleTime: 60 * 1000
  });
  const lista = entregas.data ?? [];
  const comTrd = lista.filter((e) => e.trdSei).length;
  return (
    <div data-testid="execucao-entregas">
      <div style={{ ...TITULO_SECAO, display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>Entregas na Fiscalização</span>
        {lista.length > 0 && (
          <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
            {comTrd} de {lista.length} com recebimento definitivo registrado
          </span>
        )}
      </div>
      {entregas.isLoading ? (
        <div style={{ fontSize: '0.86rem', color: '#64748b' }}>Carregando as entregas…</div>
      ) : entregas.isError ? (
        <NoticeBar tone="warning">Não foi possível ler as entregas da Fiscalização: {entregas.error instanceof Error ? entregas.error.message : ''}</NoticeBar>
      ) : lista.length === 0 ? (
        <div style={{ fontSize: '0.86rem', color: '#64748b' }}>Nenhuma entrega cadastrada na Fiscalização.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
          {lista.map((e, i) => (
            <li
              key={e.id}
              data-testid="execucao-entrega"
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderTop: i ? '1px solid #e2e8f0' : 'none', fontSize: '0.84rem', flexWrap: 'wrap' }}
            >
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  {e.quantidade > 0 ? `${e.quantidade.toLocaleString('pt-BR')} × ` : ''}
                  {e.item}
                </div>
                {(e.beneficiario || e.municipio) && (
                  <div style={{ color: '#475569' }}>
                    {[e.beneficiario, [e.municipio, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              {e.trdSei ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#475569' }}>TRD{e.trdEm ? ` em ${formatDateBR(e.trdEm)}` : ''}</span>
                  <NumeroSeiEtiqueta numero={e.trdSei} testId="execucao-entrega-trd" />
                </span>
              ) : (
                <span style={{ color: '#475569' }}>{etapaDef(e.etapa as EtapaEntrega).nome}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Escopo cumprido (migrations 314 e 320): o banco sugere pelos fatos das fontes e o gestor confere o que já está
 * registrado (faturas pagas e, se o contrato está na Fiscalização, as entregas com o TRD que o fiscal gravou) e confirma.
 * O TRD é da Fiscalização: a janela não pede SEI nem data. Confirmado, mostra quem confirmou e permite desfazer.
 */
export const ConfirmarExecucaoModal: React.FC<ConfirmarExecucaoModalProps> = ({ isOpen, numero, fornecedor, execucao, onClose }) => {
  const toast = useToast();
  const { confirmar, naoTerminou, desfazer } = useContratosExecucao({ enabled: false });
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen) {
      setObservacao('');
      setErro(null);
    }
  }, [isOpen]);
  if (!execucao) return null;
  const naFiscalizacao = execucao.fiscalizacao !== 'SEM';

  const contractKey = execucao.contractKey;
  const confirmado = execucao.estado === 'EXECUTADO' && execucao.confirmado;
  const conferencia = conferirExecucao(execucao);
  const avisos = conferencia.filter((c) => c.resultado === 'aviso');
  const gravando = confirmar.isPending || naoTerminou.isPending || desfazer.isPending;
  const podeConfirmar = !gravando;

  const executar = async (acao: () => Promise<unknown>, mensagem: string) => {
    setErro(null);
    try {
      await acao();
      toast.success(mensagem);
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!gravando}
      size="md"
      title={confirmado ? `Contrato ${numero} executado` : `Escopo cumprido do contrato ${numero}?`}
      subtitle={fornecedor}
      testId="confirmar-execucao-modal"
      footer={
        confirmado ? (
          <>
            <ActionButton
              action="desfazer"
              disabled={gravando}
              onClick={() => void executar(() => desfazer.mutateAsync(contractKey), 'Confirmação desfeita: o contrato voltou a Vigentes.')}
              data-testid="execucao-desfazer"
            />
            <ActionButton action="fechar" onClick={onClose} disabled={gravando} />
          </>
        ) : (
          <>
            <AppButton
              variant="ghost"
              disabled={gravando}
              onClick={() => void executar(() => naoTerminou.mutateAsync(contractKey), 'Sugestão retirada até chegar fatura, nota ou aditivo novos.')}
              data-testid="execucao-dispensar"
            >
              Ainda não terminou
            </AppButton>
            <AppButton
              variant="primary"
              disabled={!podeConfirmar}
              onClick={() =>
                void executar(
                  () => confirmar.mutateAsync({ contractKey, observacao }),
                  'Contrato marcado como executado: saiu de Vigentes e dos avisos de prorrogação.'
                )
              }
              data-testid="execucao-confirmar"
            >
              {confirmar.isPending ? 'Confirmando…' : 'Confirmar escopo cumprido'}
            </AppButton>
          </>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {erro && <NoticeBar tone="danger" testId="execucao-erro">{erro}</NoticeBar>}
        {execucao.decisaoSuperada && !confirmado && (
          <NoticeBar tone="info">Chegou fatura, nota de empenho ou aditivo depois da última decisão. Confira de novo.</NoticeBar>
        )}

        <div>
          <div style={TITULO_SECAO}>O que o sistema conferiu nas fontes</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid #e2e8f0', borderRadius: 8 }}>
            {conferencia.map((c, i) => (
              <li
                key={c.id}
                data-testid={`execucao-conferencia-${c.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', borderTop: i ? '1px solid #e2e8f0' : 'none', fontSize: '0.86rem', flexWrap: 'wrap' }}
              >
                {ICONE[c.resultado]}
                <span style={{ fontWeight: 700, minWidth: 130 }}>{c.rotulo}</span>
                <span style={{ color: '#475569', minWidth: 0 }}>{c.detalhe}</span>
              </li>
            ))}
          </ul>
        </div>

        {isOpen && naFiscalizacao && <EntregasNaFiscalizacao contractKey={contractKey} />}

        {confirmado ? (
          <div style={{ fontSize: '0.86rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div>
              Confirmado por <b>{confirmado.por}</b> em {formatDateBR(confirmado.em)}.
            </div>
            {(confirmado.sei || confirmado.dataRecebimento) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                Recebimento definitivo{confirmado.dataRecebimento ? ` em ${formatDateBR(confirmado.dataRecebimento)}` : ''}
                {confirmado.sei && <NumeroSeiEtiqueta numero={confirmado.sei} />}
              </div>
            )}
            {avisos.length > 0 && (
              <NoticeBar tone="warning">
                Falta para fechar: {avisos.map((a) => `${a.rotulo.toLowerCase()} (${a.detalhe})`).join('; ')}.
              </NoticeBar>
            )}
          </div>
        ) : (
          <>
            <AppTextarea label="Observação (opcional)" value={observacao} onChange={(ev) => setObservacao(ev.target.value)} rows={2} maxLength={500} />
            <NoticeBar tone="info">
              O contrato sai de Vigentes e dos avisos de prorrogação e vencimento e vai para Executados. Volta sozinho se chegar
              fatura, nota de empenho ou aditivo novos.
              {avisos.length > 0 && ` Fica como pendência de fechamento: ${avisos.map((a) => a.rotulo.toLowerCase()).join(' e ')}.`}
            </NoticeBar>
          </>
        )}
      </div>
    </Modal>
  );
};
