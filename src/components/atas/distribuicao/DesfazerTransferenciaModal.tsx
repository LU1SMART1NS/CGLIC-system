import React from 'react';
import { Modal } from '../../../design-system/components/Modal';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { AppDateInput } from '../../../design-system/components/FormFields';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { useAllAtaManagers } from '../../../hooks/useAtaManagers';
import { useAllContractManagers } from '../../../hooks/useAllContractManagers';
import { useDesfazerTransferencia, useMudarRetorno } from '../../../hooks/useTransferenciasTemporarias';
import { UASGS_CGLIC } from '../../../config/unidadesGestoras';
import { ROTULO_MOTIVO_AUSENCIA, type TransferenciaTemporaria } from '../../../services/transferenciaTemporariaService';
import { dataBR, previaDoDesfazer, rotuloDoItem } from './transferenciaTemporaria';

/** Gestor de hoje de cada ata e contrato (para a prévia do Desfazer). */
function useGestorAtual() {
  const { data: atas } = useAllAtaManagers();
  const c0 = useAllContractManagers(UASGS_CGLIC[0]);
  const c1 = useAllContractManagers(UASGS_CGLIC[1]);
  return React.useCallback(
    (tipo: 'ATA' | 'CONTRATO', chave: string) => {
      const m = tipo === 'ATA' ? atas?.[chave] : (c0.data?.[chave] ?? c1.data?.[chave]);
      return m ? { userId: m.gestorUserId ?? null, nome: m.gestorNome ?? null } : undefined;
    },
    [atas, c0.data, c1.data]
  );
}

const grupoStyle: React.CSSProperties = {
  ...carteiraTd,
  background: '#f8fafc',
  fontSize: '0.75rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: '#64748b',
  padding: '0.5rem 0.6rem 0.3rem'
};

/** Prévia e confirmação do Desfazer: o que volta a quem saiu e o que fica por ter mudado de mãos no período. */
export const DesfazerTransferenciaModal: React.FC<{ transferencia: TransferenciaTemporaria; onClose: () => void }> = ({ transferencia: t, onClose }) => {
  const gestorAtual = useGestorAtual();
  const desfazer = useDesfazerTransferencia();
  const { voltam, ficam } = React.useMemo(() => previaDoDesfazer(t, gestorAtual), [t, gestorAtual]);
  const atasVoltam = voltam.filter((i) => i.tipo === 'ATA').length;

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!desfazer.isPending}
      size="lg"
      title={`Desfazer transferência · ${t.ausenteNome}`}
      subtitle={`${ROTULO_MOTIVO_AUSENCIA[t.motivo]} de ${dataBR(t.inicio)} a ${dataBR(t.retornoPrevisto)}${t.criadoPorNome ? ` · transferida por ${t.criadoPorNome}` : ''}`}
      testId="desfazer-transferencia-modal"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={desfazer.isPending} />
          <ActionButton
            action="desfazer"
            type="button"
            onClick={() => desfazer.mutate(t.id, { onSuccess: onClose })}
            disabled={desfazer.isPending}
            isLoading={desfazer.isPending}
            data-testid="desfazer-transferencia-confirmar"
          >
            Devolver a {t.ausenteNome}
          </ActionButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={carteiraTableShell}>
          <div style={{ overflowX: 'auto', containerType: 'inline-size' }}>
            <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={carteiraTh}>Ata ou contrato</th>
                  <th style={carteiraTh}>Está com</th>
                  <th style={carteiraTh}>Fica com</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3} style={grupoStyle}>Voltam para {t.ausenteNome} · {voltam.length}</td>
                </tr>
                {voltam.map((i) => (
                  <tr key={`${i.tipo}:${i.chave}`} data-testid={`desfazer-volta-${i.chave}`}>
                    <td data-label="Item" style={carteiraTd}>
                      <span style={{ color: 'var(--color-success-text)', fontWeight: 900, marginRight: '0.4rem' }} aria-hidden="true">↩</span>
                      {rotuloDoItem(i)}
                    </td>
                    <td data-label="Está com" style={carteiraTd}>{i.destinoNome}</td>
                    <td data-label="Fica com" style={{ ...carteiraTd, fontWeight: 800 }}>{i.origemNome}</td>
                  </tr>
                ))}
                {ficam.length > 0 && (
                  <tr>
                    <td colSpan={3} style={grupoStyle}>Não voltam · mudaram de mãos durante a ausência</td>
                  </tr>
                )}
                {ficam.map((i) => (
                  <tr key={`${i.tipo}:${i.chave}`} data-testid={`desfazer-fica-${i.chave}`}>
                    <td data-label="Item" style={carteiraTd}>{rotuloDoItem(i)}</td>
                    <td data-label="Está com" style={carteiraTd}>{i.atualNome ?? 'Sem gestor'}</td>
                    <td data-label="Fica com" style={carteiraTd}>{i.atualNome ?? 'Sem gestor'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 0.9rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
          {atasVoltam > 0 && <div>Os contratos ligados às atas voltam junto, inclusive os ligados durante a ausência.</div>}
          <div style={{ color: '#64748b' }}>Atas e contratos novos dados a quem assumiu no período ficam com essa pessoa. Tarefas e pagamentos seguem a ata e o contrato.</div>
        </div>
        {desfazer.isError && (
          <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--color-danger-text)', fontWeight: 600 }}>
            Erro ao desfazer: {desfazer.error.message}
          </div>
        )}
      </div>
    </Modal>
  );
};

/** Férias prorrogadas ou antecipadas: só a data de retorno muda; as atas e contratos ficam onde estão. */
export const MudarRetornoModal: React.FC<{ transferencia: TransferenciaTemporaria; onClose: () => void }> = ({ transferencia: t, onClose }) => {
  const mudar = useMudarRetorno();
  const [retorno, setRetorno] = React.useState(t.retornoPrevisto);
  const valido = !!retorno && retorno >= t.inicio && retorno !== t.retornoPrevisto;
  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!mudar.isPending}
      size="sm"
      title={`Mudar retorno · ${t.ausenteNome}`}
      subtitle="As atas e os contratos continuam onde estão."
      testId="mudar-retorno-modal"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={mudar.isPending} />
          <ActionButton
            action="salvar"
            type="button"
            onClick={() => mudar.mutate({ id: t.id, retornoPrevisto: retorno }, { onSuccess: onClose })}
            disabled={!valido || mudar.isPending}
            isLoading={mudar.isPending}
            data-testid="mudar-retorno-salvar"
          />
        </>
      }
    >
      <AppDateInput
        label="Novo retorno previsto"
        value={retorno}
        onValueChange={setRetorno}
        min={t.inicio}
        error={retorno && retorno < t.inicio ? 'Antes da saída' : undefined}
        data-testid="mudar-retorno-data"
      />
      {mudar.isError && (
        <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--color-danger-text)', fontWeight: 600, marginTop: '0.5rem' }}>
          Erro ao salvar: {mudar.error.message}
        </div>
      )}
    </Modal>
  );
};
