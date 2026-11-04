import React from 'react';
import { ActionButton, AppButton, NoticeBar } from '../../../design-system';
import { useAuth } from '../../../context/AuthContext';
import { ROTULO_MOTIVO_AUSENCIA, type TransferenciaTemporaria } from '../../../services/transferenciaTemporariaService';
import { DesfazerTransferenciaModal, MudarRetornoModal } from './DesfazerTransferenciaModal';
import { dataBR, diaMes, diasEntre, emCurso, hojeISO, resumoPorDestino, retornoChegou } from './transferenciaTemporaria';

const nomes = (t: TransferenciaTemporaria) => {
  const n = resumoPorDestino(t.itens).map((r) => r.nome);
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
};

/**
 * Avisos das ausências em curso. No dia do retorno (e depois), um aviso por pessoa com Mudar retorno e Desfazer
 * (só o coordenador): nada volta sozinho. Antes disso, uma linha só com quem está fora. Na Central e no Início.
 */
export const AvisoAusencias: React.FC<{ transferencias: TransferenciaTemporaria[]; onVer?: () => void }> = ({ transferencias, onVer }) => {
  const { role } = useAuth();
  const podeAlterar = role === 'admin';
  const [desfazendo, setDesfazendo] = React.useState<TransferenciaTemporaria | null>(null);
  const [mudando, setMudando] = React.useState<TransferenciaTemporaria | null>(null);
  const hoje = hojeISO();
  const ativas = emCurso(transferencias);
  const voltando = ativas.filter((t) => retornoChegou(t, hoje));
  const fora = ativas.filter((t) => !retornoChegou(t, hoje));
  if (ativas.length === 0) return null;

  return (
    <>
      {voltando.map((t) => {
        const dias = diasEntre(t.retornoPrevisto, hoje);
        const quando = dias === 0 ? 'volta hoje' : `voltaria em ${dataBR(t.retornoPrevisto)}`;
        return (
          <NoticeBar
            key={t.id}
            tone="warning"
            testId={`aviso-retorno-${t.ausenteNome}`}
            action={
              podeAlterar ? (
                <span style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <ActionButton action="editar" label="Mudar retorno" type="button" size="sm" onClick={() => setMudando(t)} />
                  <ActionButton action="desfazer" label="Desfazer agora" type="button" size="sm" onClick={() => setDesfazendo(t)} data-testid={`aviso-retorno-desfazer-${t.ausenteNome}`} />
                </span>
              ) : undefined
            }
          >
            <strong>{t.ausenteNome}</strong> {quando} ({ROTULO_MOTIVO_AUSENCIA[t.motivo].toLowerCase()}). A carteira ainda está com {nomes(t)}.
          </NoticeBar>
        );
      })}
      {fora.length > 0 && (
        <NoticeBar
          tone="info"
          testId="aviso-ausentes"
          action={
            onVer ? (
              <AppButton variant="outline" size="sm" onClick={onVer}>
                Ver ausências
              </AppButton>
            ) : undefined
          }
        >
          {fora.map((t, i) => (
            <React.Fragment key={t.id}>
              {i > 0 && ' · '}
              <strong>{t.ausenteNome}</strong> fora até {diaMes(t.retornoPrevisto)}, carteira com {nomes(t)}
            </React.Fragment>
          ))}
        </NoticeBar>
      )}
      {desfazendo && <DesfazerTransferenciaModal transferencia={desfazendo} onClose={() => setDesfazendo(null)} />}
      {mudando && <MudarRetornoModal transferencia={mudando} onClose={() => setMudando(null)} />}
    </>
  );
};
