import React from 'react';
import { ActionButton, AppButton, AppInput, Modal, NoticeBar, useToast } from '../../../design-system';
import { useAcoesReajuste } from '../../../hooks/useReajusteAtas';
import type { ParametrosReajuste } from '../../../services/reajusteAtasService';
import { ehConflitoEdicao, MENSAGEM_CONFLITO_EDICAO } from '../../../utils/conflitoEdicao';
import { formatDateBR } from '../../../services/temporalEngineService';
import { mesPorExtenso } from './reajusteRotulos';

interface Props {
  aberto: boolean;
  ataId: string;
  numeroAta: string;
  uasg: string;
  inicioVigencia: string;
  parametros: ParametrosReajuste | null;
  onFechar: () => void;
}

/** O termo fica no SEI (não é público): o gestor da ata ou o coordenador informa a data e o número do documento. */
export const InformarTermoModal: React.FC<Props> = ({ aberto, ataId, numeroAta, uasg, inicioVigencia, parametros, onFechar }) => {
  const toast = useToast();
  const { informarTermo } = useAcoesReajuste(numeroAta, uasg);
  const sugestao = parametros?.termoData ?? parametros?.dataOrcamentoEdital ?? parametros?.termoMesApostilamento ?? '';
  const [data, setData] = React.useState(sugestao);
  const [sei, setSei] = React.useState(parametros?.termoSei ?? parametros?.termoSeiApostilamento ?? '');
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    setData(sugestao);
    setSei(parametros?.termoSei ?? parametros?.termoSeiApostilamento ?? '');
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const dica = parametros?.termoMesApostilamento
    ? `O apostilamento publicado confirma o mês: ${mesPorExtenso(parametros.termoMesApostilamento)}${parametros.termoSeiApostilamento ? `, documento SEI ${parametros.termoSeiApostilamento}` : ''}. Falta só o dia.`
    : parametros?.dataOrcamentoEdital
      ? `Sugestão lida no edital: ${formatDateBR(parametros.dataOrcamentoEdital)} (data do orçamento estimado). Confira no processo SEI.`
      : 'O edital não trouxe a data. Confira no processo SEI.';

  const gravar = async () => {
    setErro(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return setErro('Informe a data do Termo de Conformidade.');
    if (inicioVigencia && data > inicioVigencia) return setErro(`A data do termo precisa ser anterior ao início da ata (${formatDateBR(inicioVigencia)}).`);
    if (!/^\d{7,10}$/.test(sei.trim())) return setErro('Informe o número do documento SEI do termo, com 7 a 10 dígitos.');
    try {
      await informarTermo.mutateAsync({ ataId, data, sei, versao: parametros?.versao ?? null });
      toast.success('Termo de Conformidade gravado. A projeção foi refeita.');
      onFechar();
    } catch (err) {
      setErro(ehConflitoEdicao(err) ? MENSAGEM_CONFLITO_EDICAO : (err as Error)?.message || 'Não foi possível gravar o termo.');
    }
  };

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      dismissible={!informarTermo.isPending}
      title="Informar o Termo de Conformidade"
      subtitle={`Ata ${numeroAta}`}
      testId="informar-termo-conformidade"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={informarTermo.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={informarTermo.isPending} data-testid="informar-termo-gravar">
            {informarTermo.isPending ? 'Gravando…' : 'Gravar termo'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          O setor competente emite o Termo de Conformidade depois da pesquisa de preços. A contagem do reajuste começa na data dele.
        </div>
        <NoticeBar tone="info" testId="informar-termo-dica">{dica}</NoticeBar>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
          Data do Termo de Conformidade
          <AppInput id="reajuste-termo-data" type="date" value={data} max={inicioVigencia || undefined} style={{ width: 180 }}
            onChange={(e) => setData(e.target.value)} data-testid="informar-termo-data" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
          Número do documento SEI do termo
          <AppInput id="reajuste-termo-sei" inputMode="numeric" maxLength={10} placeholder="29255776" value={sei} style={{ width: 180 }}
            onChange={(e) => setSei(e.target.value.replace(/\D/g, ''))} data-testid="informar-termo-sei" />
        </label>
        {erro && <NoticeBar tone="danger" testId="informar-termo-erro">{erro}</NoticeBar>}
      </div>
    </Modal>
  );
};
