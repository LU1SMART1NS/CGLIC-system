import React from 'react';
import { ActionButton, AppButton, AppInput, AppSelect, AppTextarea, Modal, NoticeBar, useToast } from '../../design-system';
import { useAcoesQuantitativos } from '../../hooks/useQuantitativosDoItem';
import type { OrgaoQuantitativo, QuantitativosDoItem } from '../../services/quantitativosService';
import { maximoParaConfirmar, mudaramNoMesmoSegundo } from '../../utils/quantitativos';
import { formatNumber } from './itemBalanceUtils';

const NAO_SEI = '?';

interface BaseProps {
  itemKey: string;
  orgao: OrgaoQuantitativo | null;
  quantitativos: QuantitativosDoItem;
  nomeDe: (uasg: string) => string;
  onFechar: () => void;
}

const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 };
const texto: React.CSSProperties = { fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 };

/**
 * Confirmar remanejamento (órgão com quantidade gerenciada pela SENASP) ou informar o destino de um
 * remanejamento a menos — gestor de saldo ou coordenador. O destino sugerido é o órgão que mudou no mesmo
 * segundo no Compras.gov.br e está acima da ata assinada.
 */
export const ConfirmarRemanejamentoModal: React.FC<BaseProps> = ({ itemKey, orgao, quantitativos, nomeDe, onFechar }) => {
  const toast = useToast();
  const { confirmar } = useAcoesQuantitativos(itemKey);
  const max = orgao ? maximoParaConfirmar(orgao) : 0;
  const informarDestino = orgao?.situacao === 'REMANEJADO_A_MENOS';
  const mesmoSegundo = orgao ? mudaramNoMesmoSegundo(quantitativos.orgaos, orgao.uasg).filter((o) => !o.ehSenasp) : [];
  const senasp = quantitativos.orgaos.find((o) => o.ehSenasp)?.uasg ?? '200331';
  const acimaDaAta = quantitativos.orgaos.filter((o) => !o.ehSenasp && o.acima > 0 && o.uasg !== orgao?.uasg && !mesmoSegundo.includes(o));
  const outros = quantitativos.orgaos.filter((o) => !o.ehSenasp && o.uasg !== orgao?.uasg && !mesmoSegundo.includes(o) && !acimaDaAta.includes(o));
  const [quantidade, setQuantidade] = React.useState('');
  const [destino, setDestino] = React.useState('');
  const [justificativa, setJustificativa] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgao) return;
    setQuantidade(String(maximoParaConfirmar(orgao)));
    setDestino(mudaramNoMesmoSegundo(quantitativos.orgaos, orgao.uasg).find((o) => !o.ehSenasp && o.acima > 0)?.uasg ?? '');
    setJustificativa('');
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgao?.uasg]);

  const opcao = (o: OrgaoQuantitativo) => (
    <option key={o.uasg} value={o.uasg}>
      {nomeDe(o.uasg)} · UASG {o.uasg}{o.acima > 0 ? ` · recebeu ${formatNumber(o.acima)} acima da ata` : ''}
    </option>
  );

  const gravar = async () => {
    if (!orgao) return;
    setErro(null);
    const q = Number(quantidade);
    if (!/^\d+$/.test(quantidade) || q < 1 || q > max) return setErro(`A quantidade vai de 1 a ${formatNumber(max)}.`);
    if (!destino) return setErro('Escolha para onde foi a quantidade.');
    if (justificativa.trim().length < 15) return setErro('Escreva a justificativa (mínimo de 15 caracteres).');
    try {
      await confirmar.mutateAsync({ uasgOrigem: orgao.uasg, quantidade: q, uasgDestino: destino === NAO_SEI ? null : destino, justificativa });
      toast.success(informarDestino ? 'Destino do remanejamento informado.' : 'Remanejamento confirmado.');
      onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível confirmar o remanejamento.');
    }
  };

  return (
    <Modal
      isOpen={Boolean(orgao)}
      onClose={onFechar}
      dismissible={!confirmar.isPending}
      size="md"
      title={informarDestino ? 'Informar destino do remanejamento' : 'Confirmar remanejamento'}
      subtitle={orgao ? `${nomeDe(orgao.uasg)} · UASG ${orgao.uasg} · ${formatNumber(max)} ${informarDestino ? 'remanejados a menos' : 'gerenciados pela SENASP'}` : undefined}
      testId="confirmar-remanejamento"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={confirmar.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={confirmar.isPending} data-testid="confirmar-remanejamento-gravar">
            {confirmar.isPending ? 'Gravando…' : 'Confirmar'}
          </AppButton>
        </>
      }
    >
      {orgao && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <label style={campo}>
            Quantidade remanejada (até {formatNumber(max)})
            <AppInput inputMode="numeric" value={quantidade} style={{ width: 130 }} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))} data-testid="remanejamento-quantidade" />
          </label>
          <label style={campo}>
            Para onde foi a quantidade
            <AppSelect value={destino} onChange={(e) => setDestino(e.target.value)} data-testid="remanejamento-destino">
              <option value="">Escolha</option>
              {mesmoSegundo.length > 0 && <optgroup label="Sugerido: mudou no mesmo segundo">{mesmoSegundo.map(opcao)}</optgroup>}
              <option value={senasp}>SENASP · o órgão abriu mão e a quantidade volta para a cota própria</option>
              {acimaDaAta.length > 0 && <optgroup label="Órgãos que receberam acima da ata assinada">{acimaDaAta.map(opcao)}</optgroup>}
              {outros.length > 0 && <optgroup label="Outros órgãos do item">{outros.map(opcao)}</optgroup>}
              <option value={NAO_SEI}>Não sei · conta como devolvido à SENASP</option>
            </AppSelect>
          </label>
          <p style={texto}>
            {mesmoSegundo.length > 0
              ? 'A sugestão vem da hora da última mudança no Compras.gov.br: os órgãos mudaram no mesmo segundo.'
              : orgao.mudou ? 'Nenhum outro órgão do item mudou no mesmo segundo, então não há sugestão.' : 'O registrado deste órgão nunca mudou, então não há sugestão.'}
          </p>
          <p style={texto}>
            {informarDestino ? '' : 'A quantidade deixa de ser gerenciada para este órgão. '}
            Se o destino for um órgão que recebeu acima da ata, a cota própria da SENASP não muda. Se for a SENASP ou "não sei", a quantidade entra na cota própria. Dá para desfazer.
          </p>
          <label style={campo}>
            Justificativa (obrigatória)
            <AppTextarea rows={3} placeholder="Ex.: ofício do órgão pedindo o remanejamento da quantidade" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} data-testid="remanejamento-justificativa" />
          </label>
          {erro && <NoticeBar tone="danger" testId="remanejamento-erro">{erro}</NoticeBar>}
        </div>
      )}
    </Modal>
  );
};

/** "Continua do órgão": parte da quantidade reduzida que ainda é do órgão volta a ser gerenciada pela SENASP. */
export const ContinuaDoOrgaoModal: React.FC<BaseProps> = ({ itemKey, orgao, nomeDe, onFechar }) => {
  const toast = useToast();
  const { marcarContinua } = useAcoesQuantitativos(itemKey);
  const max = orgao?.resto ?? 0;
  const reduzido = orgao?.situacao === 'REMANEJADO_A_MENOS';
  const [quantidade, setQuantidade] = React.useState('');
  const [justificativa, setJustificativa] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgao) return;
    setQuantidade(String(orgao.resto));
    setJustificativa('');
    setErro(null);
  }, [orgao?.uasg, orgao?.resto]);

  const gravar = async () => {
    if (!orgao) return;
    setErro(null);
    const q = Number(quantidade);
    if (!/^\d+$/.test(quantidade) || q < 1 || q > max) return setErro(`A quantidade vai de 1 a ${formatNumber(max)}.`);
    if (justificativa.trim().length < 15) return setErro('Escreva a justificativa (mínimo de 15 caracteres).');
    try {
      await marcarContinua.mutateAsync({ uasg: orgao.uasg, quantidade: q, justificativa });
      toast.success('Marcado que a quantidade continua do órgão.');
      onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível gravar.');
    }
  };

  return (
    <Modal
      isOpen={Boolean(orgao)}
      onClose={onFechar}
      dismissible={!marcarContinua.isPending}
      size="md"
      title="Continua do órgão"
      subtitle={orgao ? `${nomeDe(orgao.uasg)} · UASG ${orgao.uasg}` : undefined}
      testId="continua-do-orgao"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={marcarContinua.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={marcarContinua.isPending} data-testid="continua-do-orgao-gravar">
            {marcarContinua.isPending ? 'Gravando…' : 'Gravar'}
          </AppButton>
        </>
      }
    >
      {orgao && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <p style={texto}>
            {reduzido
              ? 'Informe quanto da redução ainda é do órgão. Essa parte volta a ser gerenciada pela SENASP e sai da cota própria; o resto continua como remanejamento definitivo.'
              : 'Registra que a quantidade gerenciada pela SENASP continua sendo do órgão. Os números não mudam: fica só o registro de quem confirmou e por quê.'}
          </p>
          <label style={campo}>
            Quantidade que continua do órgão (até {formatNumber(max)})
            <AppInput inputMode="numeric" value={quantidade} style={{ width: 130 }} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))} data-testid="continua-quantidade" />
          </label>
          <label style={campo}>
            Justificativa (obrigatória)
            <AppTextarea rows={3} placeholder="Ex.: a SENASP recolheu a quantidade para redistribuir, mas o órgão mantém o direito" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} data-testid="continua-justificativa" />
          </label>
          {erro && <NoticeBar tone="danger" testId="continua-erro">{erro}</NoticeBar>}
        </div>
      )}
    </Modal>
  );
};
