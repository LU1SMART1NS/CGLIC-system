import React from 'react';
import { ActionButton, AppButton, AppInput, Modal, NoticeBar, useToast } from '../../../design-system';
import { useAcoesReajuste } from '../../../hooks/useReajusteAtas';
import type { ItemReajuste, PrecoApostilado, ReajustePublicado } from '../../../services/reajusteAtasService';
import { ehConflitoEdicao, MENSAGEM_CONFLITO_EDICAO } from '../../../utils/conflitoEdicao';
import { lerValorBR, mascaraValorBR } from '../../../utils/mascaras';
import { formatCurrency } from '../../../utils/format';
import { formatDateBR } from '../../../services/temporalEngineService';
import { percentual } from './reajusteRotulos';

interface Props {
  aberto: boolean;
  ataId: string;
  numeroAta: string;
  uasg: string;
  /** Itens com o preço sem o reajuste e os que já têm o preço informado (para corrigir). */
  itens: ItemReajuste[];
  apostilados: PrecoApostilado[];
  publicado: ReajustePublicado | null;
  descricao: (numeroItem: string) => string;
  versao: number | null;
  onFechar: () => void;
}

const centavos = (v: number) => Math.round(v * 100) / 100;
const valorBR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Preço do apostilamento (protótipo aprovado em 29/10/2026, migration 247): o Compras.gov.br continua com o preço
 * homologado depois do apostilamento e o item fica bloqueado nas Emendas. O gestor da ata copia o preço unitário do
 * documento; a janela já vem com o preço calculado pelo percentual, arredondado ao centavo. Gestor da ata ou coordenador.
 */
export const InformarPrecoApostilamentoModal: React.FC<Props> = ({ aberto, ataId, numeroAta, uasg, itens, apostilados, publicado, descricao, versao, onFechar }) => {
  const toast = useToast();
  const { informarPreco } = useAcoesReajuste(numeroAta, uasg);
  const [valores, setValores] = React.useState<Record<string, string>>({});
  const [sei, setSei] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  const calculado = React.useCallback((i: ItemReajuste) => centavos(i.precoAplicado > i.precoAtual + 0.005 ? i.precoAplicado : i.precoDevido), []);

  React.useEffect(() => {
    if (!aberto) return;
    const informado = new Map(apostilados.map((a) => [Number(a.numeroItem), a]));
    setValores(Object.fromEntries(itens.map((i) => [i.numeroItem, valorBR(informado.get(Number(i.numeroItem))?.preco ?? calculado(i))])));
    setSei(apostilados[0]?.seiApostilamento ?? publicado?.seiApostilamento ?? '');
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const gravar = async () => {
    setErro(null);
    const precos: Record<string, number> = {};
    for (const i of itens) {
      const v = lerValorBR(valores[i.numeroItem] ?? '');
      if (!(v != null && v > 0)) return setErro(`Informe o preço do item ${Number(i.numeroItem)}.`);
      precos[i.numeroItem] = v;
    }
    if (!/^\d{7,10}$/.test(sei.trim())) return setErro('Informe o número do documento SEI do apostilamento, com 7 a 10 dígitos.');
    try {
      await informarPreco.mutateAsync({ ataId, reajusteId: publicado?.id ?? null, precos, sei, versao });
      toast.success('Preço do apostilamento gravado. Os itens voltam às Emendas com o preço novo.');
      onFechar();
    } catch (err) {
      setErro(ehConflitoEdicao(err) ? MENSAGEM_CONFLITO_EDICAO : (err as Error)?.message || 'Não foi possível gravar o preço.');
    }
  };

  const contexto = publicado
    ? `${publicado.documentoTitulo ?? 'Apostilamento'}${publicado.percentual != null ? ` de ${percentual(publicado.percentual)}` : ''}, efeitos desde ${formatDateBR(publicado.efeitoInicio)}. Copie o preço unitário de cada item como está no documento.`
    : 'Copie o preço unitário de cada item como está no apostilamento.';

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      dismissible={!informarPreco.isPending}
      title="Preço do apostilamento"
      subtitle={`Ata ${numeroAta}`}
      testId="informar-preco-apostilamento"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={informarPreco.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={informarPreco.isPending} data-testid="informar-preco-gravar">
            {informarPreco.isPending ? 'Gravando…' : 'Gravar preço'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{contexto}</div>
        <div className="table-scroll">
          <table className="ds-table" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: 'right' }}>Antes</th>
                <th style={{ textAlign: 'right' }}>Calculado</th>
                <th style={{ textAlign: 'right' }}>Preço no apostilamento</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const v = lerValorBR(valores[i.numeroItem] ?? '');
                const diferente = v != null && Math.abs(v - calculado(i)) > 0.004;
                const antes = apostilados.find((a) => Number(a.numeroItem) === Number(i.numeroItem))?.precoAntes ?? i.precoAtual;
                return (
                  <tr key={i.numeroItem}>
                    <td>
                      {Number(i.numeroItem)} · {descricao(i.numeroItem)}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(antes)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(calculado(i))}</td>
                    <td style={{ textAlign: 'right' }}>
                      <AppInput
                        inputMode="decimal"
                        aria-label={`Preço do item ${Number(i.numeroItem)} no apostilamento`}
                        value={valores[i.numeroItem] ?? ''}
                        style={{ width: 150, textAlign: 'right', ...(diferente ? { borderColor: 'var(--color-warning-border)', background: 'var(--color-warning-bg)' } : {}) }}
                        onChange={(e) => {
                          const novo = mascaraValorBR(e.target.value, valores[i.numeroItem] ?? '');
                          setValores((x) => ({ ...x, [i.numeroItem]: novo }));
                        }}
                        data-testid={`informar-preco-item-${Number(i.numeroItem)}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>
          Número do documento SEI do apostilamento
          <AppInput id="reajuste-preco-sei" inputMode="numeric" maxLength={10} placeholder="34985144" value={sei} style={{ width: 180 }}
            onChange={(e) => setSei(e.target.value.replace(/\D/g, ''))} data-testid="informar-preco-sei" />
        </label>
        <NoticeBar tone="info" testId="informar-preco-explica">
          O preço informado passa a valer em todo o sistema, no lugar do preço do Compras.gov.br. Diferença do calculado aparece em amarelo e fica registrada no histórico da ata.
        </NoticeBar>
        {erro && <NoticeBar tone="danger" testId="informar-preco-erro">{erro}</NoticeBar>}
      </div>
    </Modal>
  );
};
