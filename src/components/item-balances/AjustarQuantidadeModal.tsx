import React from 'react';
import { ActionButton, AlertCard, AppButton, AppInput, AppTextarea, Modal, NoticeBar, useToast } from '../../design-system';
import { useAcoesContratado, useAjustesDaQuantidade } from '../../hooks/useContratadoDoItem';
import { avaliarAjuste, JUSTIFICATIVA_MAX, JUSTIFICATIVA_MIN, nomeDaFonte } from '../../utils/contratadoPorUnidade';
import type { QuantidadeDoContrato } from '../../services/contratadoUnidadeService';
import { formatNumber } from './itemBalanceUtils';

export interface ContratoParaAjustar {
  contractKey: string;
  numeroContrato: string;
  quantidade: QuantidadeDoContrato;
  /** Página do contrato no portal oficial, quando houver. */
  linkPortal?: string;
}

interface AjustarQuantidadeModalProps {
  itemKey: string;
  /** "Ata 00059/2025 · item 1 · descrição". */
  tituloItem: string;
  contrato: ContratoParaAjustar | null;
  /** Quantitativo SENASP do item. */
  cota: number;
  /** Contratado no item pelos outros contratos. */
  consumoOutros: number;
  onFechar: () => void;
}

const CINZA = 'var(--text-muted)';
const secao: React.CSSProperties = { margin: '0 0 0.4rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: CINZA };
const td: React.CSSProperties = { padding: '0.45rem 0.5rem', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', fontSize: '0.84rem' };
const mono: React.CSSProperties = { fontFamily: 'monospace', fontSize: '0.75rem', color: CINZA, wordBreak: 'break-all' };

const dataHora = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const ENDERECO_FONTE = {
  CONTRATOS_GOV: { endereco: 'contratos.comprasnet.gov.br/api/contrato/{id}/itens', campo: 'quantidade' },
  COMPRAS_GOV: { endereco: 'dadosabertos.compras.gov.br/modulo-contratos/2.1_consultarContratosItem_Id', campo: 'quantidadeItem' }
} as const;

/**
 * Janela "Ajustar quantidade contratada" (migration 103): mostra a quantidade da fonte, de qual site e endpoint ela
 * veio e onde corrigir; grava a quantidade a usar no saldo com justificativa obrigatória, ou desfaz o ajuste.
 */
export const AjustarQuantidadeModal: React.FC<AjustarQuantidadeModalProps> = ({ contrato, ...rest }) =>
  contrato ? <JanelaAjuste key={contrato.contractKey} contrato={contrato} {...rest} /> : null;

const JanelaAjuste: React.FC<Omit<AjustarQuantidadeModalProps, 'contrato'> & { contrato: ContratoParaAjustar }> = ({
  itemKey,
  tituloItem,
  contrato,
  cota,
  consumoOutros,
  onFechar
}) => {
  const q = contrato.quantidade;
  const toast = useToast();
  const { ajustar, desfazerAjuste } = useAcoesContratado(itemKey);
  const { data: historico = [] } = useAjustesDaQuantidade(itemKey, contrato.contractKey);
  const [texto, setTexto] = React.useState(String(q.quantidadeAjustada ?? q.quantidadeFonte ?? ''));
  const [justificativa, setJustificativa] = React.useState('');
  const [tocouJust, setTocouJust] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const salvando = ajustar.isPending || desfazerAjuste.isPending;

  const aval = avaliarAjuste({
    texto,
    justificativa,
    ajustadaAtual: q.quantidadeAjustada,
    quantidadeFonte: q.quantidadeFonte,
    dividido: q.quantidadeDividida,
    consumoOutros,
    cota
  });
  const nome = nomeDaFonte(q.fonte);
  const endereco = q.fonte ? ENDERECO_FONTE[q.fonte] : null;

  const salvar = async () => {
    if (!aval.podeSalvar || aval.quantidade == null) return;
    setErro(null);
    try {
      await ajustar.mutateAsync({
        contractKey: contrato.contractKey,
        quantidade: aval.quantidade,
        justificativa,
        quantidadeVista: q.quantidadeContratada
      });
      toast.success(`Quantidade do contrato ${contrato.numeroContrato} ajustada para ${formatNumber(aval.quantidade)}.`);
      onFechar();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível gravar o ajuste.');
    }
  };

  const desfazer = async () => {
    if (!aval.podeDesfazer) return;
    setErro(null);
    try {
      await desfazerAjuste.mutateAsync({ contractKey: contrato.contractKey, justificativa });
      toast.success(`O contrato ${contrato.numeroContrato} voltou a usar a quantidade do ${nome}.`);
      onFechar();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível desfazer o ajuste.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onFechar}
      title="Ajustar quantidade contratada"
      subtitle={`Contrato ${contrato.numeroContrato} · ${tituloItem}`}
      size="lg"
      dismissible={!salvando}
      testId="ajustar-quantidade-modal"
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            {q.ajustada && (
              <ActionButton
                action="desfazer"
                size="sm"
                label={q.quantidadeFonte != null ? `Desfazer ajuste (usar ${formatNumber(q.quantidadeFonte)} do ${nome})` : 'Desfazer ajuste'}
                title="Volta a usar a quantidade da fonte. Também pede justificativa."
                onClick={() => void desfazer()}
                disabled={salvando || !aval.podeDesfazer}
                data-testid="ajustar-quantidade-desfazer"
              />
            )}
          </span>
          <span style={{ display: 'flex', gap: '0.5rem' }}>
            <ActionButton action="cancelar" size="sm" onClick={onFechar} disabled={salvando} />
            <AppButton variant="primary" size="sm" onClick={() => void salvar()} isLoading={ajustar.isPending} disabled={salvando || !aval.podeSalvar} data-testid="ajustar-quantidade-salvar">
              Salvar ajuste
            </AppButton>
          </span>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <p style={secao}>Quantidade na fonte</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="ajustar-quantidade-fonte">
              <tbody>
                <tr>
                  <td style={{ ...td, width: '38%', color: CINZA }}>Quantidade lida</td>
                  <td style={td}>
                    <strong>{q.quantidadeFonte != null ? formatNumber(q.quantidadeFonte) : 'sem o item'}</strong>
                    {q.fonteLidaEm && <span style={{ color: CINZA }}> · lida em {dataHora(q.fonteLidaEm)}</span>}
                  </td>
                </tr>
                <tr>
                  <td style={{ ...td, color: CINZA }}>De onde veio</td>
                  <td style={td}>
                    {endereco ? (
                      <>
                        <strong>{nome}</strong> · itens do contrato
                        <div style={mono}>
                          {endereco.endereco} · campo {endereco.campo}
                        </div>
                      </>
                    ) : (
                      'A leitura dos itens do contrato não trouxe itens, nem no Contratos.gov.br nem no Compras.gov.br.'
                    )}
                  </td>
                </tr>
                <tr>
                  <td style={{ ...td, color: CINZA }}>Onde corrigir na fonte</td>
                  <td style={td}>
                    No cadastro do contrato no Contratos.gov.br, aba Itens.{' '}
                    {contrato.linkPortal && (
                      <a href={contrato.linkPortal} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                        Abrir o contrato no portal
                      </a>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {q.ajustada && (
          <NoticeBar tone="warning" testId="ajustar-quantidade-atual">
            <strong>Ajuste atual: {formatNumber(q.quantidadeAjustada ?? 0)}</strong>
            {q.ajustadoPorNome ? `, por ${q.ajustadoPorNome}` : ''}
            {q.ajustadoEm ? ` em ${dataHora(q.ajustadoEm)}` : ''}. Justificativa: "{q.ajusteJustificativa}"
            {q.fonteMudouAposAjuste && (
              <div style={{ color: 'var(--danger)', marginTop: '0.25rem' }}>
                O {nome} mudou de {q.ajusteQuantidadeFonte != null ? formatNumber(q.ajusteQuantidadeFonte) : 'sem o item'} para{' '}
                {q.quantidadeFonte != null ? formatNumber(q.quantidadeFonte) : 'sem o item'} depois do ajuste. Confira se o ajuste ainda vale.
              </div>
            )}
          </NoticeBar>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem' }}>
          <AppInput
            label="Quantidade a usar no saldo"
            inputMode="numeric"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={salvando}
            error={texto.trim() !== '' ? aval.erroQuantidade ?? undefined : undefined}
            hint={q.quantidadeFonte != null ? `Fonte: ${formatNumber(q.quantidadeFonte)}` : 'A fonte não traz o item'}
            data-testid="ajustar-quantidade-campo"
            style={{ maxWidth: '160px', textAlign: 'right' }}
          />
          <AppTextarea
            label="Justificativa (obrigatória)"
            rows={3}
            maxLength={JUSTIFICATIVA_MAX}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            onBlur={() => setTocouJust(true)}
            disabled={salvando}
            placeholder="Ex.: termo aditivo 02/2025 acrescentou 20 unidades, ainda não lançado no Contratos.gov.br"
            error={tocouJust && aval.erroJustificativa ? aval.erroJustificativa : undefined}
            hint={`Mínimo de ${JUSTIFICATIVA_MIN} caracteres · ${justificativa.length}/${JUSTIFICATIVA_MAX}`}
            data-testid="ajustar-quantidade-justificativa"
          />
        </div>

        {(erro || aval.avisos.length > 0 || aval.igualAFonte) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {erro && <AlertCard severity="CRITICA" title={erro} testId="ajustar-quantidade-erro" />}
            {aval.avisos.map((a) => (
              <NoticeBar key={a} tone="warning" testId="ajustar-quantidade-aviso">
                {a}
              </NoticeBar>
            ))}
            {aval.igualAFonte && q.ajustada && (
              <NoticeBar tone="info" testId="ajustar-quantidade-igual-fonte">
                Igual à fonte. Para voltar a seguir o {nome}, use "Desfazer ajuste".
              </NoticeBar>
            )}
          </div>
        )}

        {historico.length > 0 && (
          <div>
            <p style={secao}>Histórico de ajustes</p>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }} data-testid="ajustar-quantidade-historico">
              {historico.map((h) => (
                <li key={h.id}>
                  <strong>{dataHora(h.feitoEm)}</strong> · {h.feitoPorNome}:{' '}
                  {h.acao === 'DESFAZER'
                    ? `desfez o ajuste de ${formatNumber(h.quantidadeAnterior ?? 0)}`
                    : `ajustou de ${h.quantidadeAnterior != null ? formatNumber(h.quantidadeAnterior) : 'sem quantidade'} para ${formatNumber(h.quantidadeAjustada ?? 0)}`}
                  . <span style={{ color: CINZA }}>"{h.justificativa}"</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p style={{ margin: 0, fontSize: '0.78rem', color: CINZA }}>
          A fonte continua sendo lida; o saldo usa a quantidade ajustada enquanto ela existir. Só o gestor e o coordenador ajustam.
        </p>
      </div>
    </Modal>
  );
};
