import React from 'react';
import { mascaraPercentual } from '../../../utils/mascaras';
import { ActionButton, AppButton, AppInput, Modal, NoticeBar, useToast } from '../../../design-system';
import { useAcoesReajuste } from '../../../hooks/useReajusteAtas';
import type { CicloReajuste, ReajustePublicado } from '../../../services/reajusteAtasService';
import { ehConflitoEdicao, MENSAGEM_CONFLITO_EDICAO } from '../../../utils/conflitoEdicao';
import { formatDateBR } from '../../../services/temporalEngineService';
import { percentual } from './reajusteRotulos';

interface Props {
  aberto: boolean;
  ataId: string;
  numeroAta: string;
  uasg: string;
  /** Ciclo a completar ou corrigir; sem ciclo, registra um reajuste que não está no PNCP. */
  ciclo: CicloReajuste | null;
  publicado: ReajustePublicado | null;
  versao: number | null;
  onFechar: () => void;
}

const mes = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : '');

/** Percentual do apostilamento (PDF sem número legível, correção, ou reajuste fora do PNCP): gestor da ata ou coordenador. */
export const InformarPercentualModal: React.FC<Props> = ({ aberto, ataId, numeroAta, uasg, ciclo, publicado, versao, onFechar }) => {
  const toast = useToast();
  const { informarPercentual } = useAcoesReajuste(numeroAta, uasg);
  const [valor, setValor] = React.useState('');
  const [de, setDe] = React.useState('');
  const [ate, setAte] = React.useState('');
  const [efeito, setEfeito] = React.useState('');
  const [sei, setSei] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    setValor(publicado?.percentual != null ? String(publicado.percentual).replace('.', ',') : '');
    setDe(mes(publicado?.periodoInicio ?? ciclo?.periodoInicio));
    setAte(mes(publicado?.periodoFim ?? ciclo?.periodoFim));
    setEfeito(publicado?.efeitoInicio ?? ciclo?.efeitoInicio ?? '');
    setSei(publicado?.seiApostilamento ?? '');
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const contexto = publicado?.documentoTitulo
    ? `${publicado.documentoTitulo}${publicado.documentoPublicadoEm ? `, publicado no PNCP em ${formatDateBR(publicado.documentoPublicadoEm)}` : ''}. Copie o percentual do documento.`
    : 'Reajuste que não está publicado no PNCP: informe o que foi apostilado.';

  const gravar = async () => {
    setErro(null);
    const p = Number(valor.replace(/\./g, '').replace(',', '.'));
    if (!(p > 0 && p < 100)) return setErro('Informe o percentual aplicado, por exemplo 4,44.');
    if (!/^\d{4}-\d{2}$/.test(de) || !/^\d{4}-\d{2}$/.test(ate) || ate < de) return setErro('Informe o primeiro e o último mês do índice usados no apostilamento.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(efeito)) return setErro('Informe a data de início dos efeitos.');
    if (!/^\d{7,10}$/.test(sei.trim())) return setErro('Informe o número do documento SEI do apostilamento, com 7 a 10 dígitos.');
    try {
      await informarPercentual.mutateAsync({
        ataId,
        reajusteId: publicado?.id ?? null,
        percentual: p,
        periodoInicio: `${de}-01`,
        periodoFim: `${ate}-01`,
        efeitoInicio: efeito,
        sei,
        versao
      });
      toast.success('Percentual gravado. A projeção foi refeita.');
      onFechar();
    } catch (err) {
      setErro(ehConflitoEdicao(err) ? MENSAGEM_CONFLITO_EDICAO : (err as Error)?.message || 'Não foi possível gravar o percentual.');
    }
  };

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      dismissible={!informarPercentual.isPending}
      title="Informar o percentual do reajuste"
      subtitle={`Ata ${numeroAta}${ciclo ? ` · ${ciclo.ciclo}º reajuste` : ''}`}
      testId="informar-percentual-reajuste"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={informarPercentual.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={informarPercentual.isPending} data-testid="informar-percentual-gravar">
            {informarPercentual.isPending ? 'Gravando…' : 'Gravar percentual'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{contexto}</div>
        {ciclo?.percentualCalculado != null && (
          <NoticeBar tone="info" testId="informar-percentual-conta">
            Pela conta do sistema, o percentual deste ciclo é {percentual(ciclo.percentualCalculado)}.
          </NoticeBar>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
            Percentual aplicado
            <AppInput id="reajuste-percentual" inputMode="decimal" placeholder="4,44" value={valor} style={{ width: 140 }}
              onChange={(e) => setValor(mascaraPercentual(e.target.value))} data-testid="informar-percentual-valor" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
            Início dos efeitos
            <AppInput id="reajuste-efeito" type="date" value={efeito} style={{ width: 180 }} onChange={(e) => setEfeito(e.target.value)} data-testid="informar-percentual-efeito" />
          </label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
            Índice de
            <AppInput id="reajuste-periodo-de" type="month" value={de} style={{ width: 180 }} onChange={(e) => setDe(e.target.value)} data-testid="informar-percentual-de" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
            até
            <AppInput id="reajuste-periodo-ate" type="month" value={ate} style={{ width: 180 }} onChange={(e) => setAte(e.target.value)} data-testid="informar-percentual-ate" />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
          Número do documento SEI do apostilamento
          <AppInput id="reajuste-percentual-sei" inputMode="numeric" maxLength={10} placeholder="34985144" value={sei} style={{ width: 180 }}
            onChange={(e) => setSei(e.target.value.replace(/\D/g, ''))} data-testid="informar-percentual-sei" />
        </label>
        {erro && <NoticeBar tone="danger" testId="informar-percentual-erro">{erro}</NoticeBar>}
      </div>
    </Modal>
  );
};
