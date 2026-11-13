import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useConfirmarPrazoDaAta } from '../../hooks/useAtaPrazoEntrega';
import type { PrazoDaAta } from '../../services/ataPrazoEntregaService';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { textoDaRegraDeRecebimento, type RegraDoRecebimento } from '../../utils/fiscalizacaoRecebimento';
import { CamposDoRecebimento, regraValida, type CamposDaRegra } from '../fiscalizacao/PrazoDeRecebimentoModal';
import { INICIOS, textoDaRegra, type ContagemPrazo, type InicioPrazo } from '../../utils/fiscalizacaoPrazo';

const erroDe = (err: unknown) => (err as { message?: string } | null)?.message || 'erro desconhecido';
const MOTIVO_MINIMO = 10;
const diasValidos = (n: number) => Number.isInteger(n) && n >= 1 && n <= 730;

/**
 * Prazo de entrega da ata (Ata 360 › Ações): o gestor da ata confere a sugestão lida do TR e confirma. Os contratos
 * da ata herdam o prazo; o fiscal só muda no contrato com motivo (aditivo, por exemplo).
 */
export const PrazoDaAtaModal: React.FC<{
  ataKey: string;
  ata: string;
  compra: string | null;
  /** Sugestão do TR e, se já houver, o prazo confirmado. Sem linha (ata fora da leitura): o gestor informa. */
  prazo: PrazoDaAta | null;
  itens: Array<{ numero: string; descricao: string }>;
  onClose: () => void;
}> = ({ ataKey, ata, compra, prazo: p, itens, onClose }) => {
  const toast = useToast();
  const salvar = useConfirmarPrazoDaAta();
  const confirmado = Boolean(p?.confirmadoEm);
  const s = {
    situacao: p?.leitura ?? 'SEM_CLAUSULA',
    motivo: p?.leituraMotivo ?? null,
    trechos: p?.trechos ?? [],
    documento: p?.documento ?? null,
    url: p?.url ?? null,
    contagemDita: p?.contagemDita ?? false
  };
  const [semPrazo, setSemPrazo] = useState(Boolean(p?.semPrazo));
  const [dias, setDias] = useState<number>((confirmado ? p?.dias : p?.sugeridoDias) ?? NaN);
  const [contagem, setContagem] = useState<ContagemPrazo>((confirmado ? p?.contagem : p?.sugeridoContagem) ?? 'CORRIDOS');
  const [inicio, setInicio] = useState<InicioPrazo>((confirmado ? p?.inicio : p?.sugeridoInicio) ?? 'OF_RECEBIMENTO');
  const [porItemAberto, setPorItemAberto] = useState(Object.keys(p?.porItem ?? {}).length > 0);
  const [porItem, setPorItem] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(p?.porItem ?? {}).map(([k, v]) => [k, String(v)])));
  const [motivo, setMotivo] = useState('');
  // Recebimento (TRP e TRD): o mesmo TR, na mesma janela. Sem nada no TR: "O TR não diz" (os itens ficam sem aviso).
  const recebimentoConfirmado = Boolean(p?.recebimentoConfirmadoEm);
  const recebimentoInicial = (recebimentoConfirmado ? p?.recebimento : p?.recebimentoSugerido) ?? null;
  const [temRecebimento, setTemRecebimento] = useState(Boolean(recebimentoInicial));
  const [recebimento, setRecebimento] = useState<CamposDaRegra>(recebimentoInicial ?? { trpDias: 0, trpContagem: 'CORRIDOS', trdDias: 10, trdContagem: 'UTEIS', trdInicio: 'ENTREGA' });
  const recebimentoFinal = temRecebimento ? recebimento : null;
  const recebimentoMudou = recebimentoConfirmado && JSON.stringify(recebimentoFinal) !== JSON.stringify(p?.recebimento ?? null);
  // Prazo de entrega já confirmado e recebimento ainda não: confirma só o recebimento, sem motivo.
  const soRecebimento = confirmado && !recebimentoConfirmado;
  const excecoes = Object.fromEntries(Object.entries(porItem).filter(([, v]) => diasValidos(Number(v))).map(([k, v]) => [k, Number(v)]));
  const mudouEntrega =
    confirmado &&
    (semPrazo !== Boolean(p?.semPrazo) ||
      (!semPrazo && (dias !== p?.dias || contagem !== p?.contagem || inicio !== p?.inicio || JSON.stringify(excecoes) !== JSON.stringify(p?.porItem ?? {}))));
  const mudou = mudouEntrega || recebimentoMudou;
  // Leitura automática do TR (migration 309): a primeira correção não pede motivo, e confirmar sem mudar vale.
  const entregaAuto = Boolean(p?.confirmadoAutomatico);
  const recebimentoAuto = Boolean(p?.recebimentoAutomatico);
  const precisaMotivo = (mudouEntrega && !entregaAuto) || (recebimentoMudou && !recebimentoAuto);
  const ok =
    (semPrazo || diasValidos(dias)) &&
    (!temRecebimento || regraValida(recebimento)) &&
    (!confirmado || mudou || soRecebimento || entregaAuto || recebimentoAuto) &&
    (!precisaMotivo || motivo.trim().length >= MOTIVO_MINIMO);
  const confirmar = () =>
    salvar.mutate(
      { ataKey, semPrazo, dias: semPrazo ? null : dias, contagem, inicio, porItem: semPrazo ? {} : excecoes, motivo: precisaMotivo || mudou ? motivo || null : null, recebimento: recebimentoFinal },
      {
        onSuccess: (r) => {
          toast.success(
            soRecebimento && !mudou
              ? recebimentoFinal
                ? `Recebimento confirmado: ${textoDaRegraDeRecebimento(recebimentoFinal as RegraDoRecebimento)}`
                : 'Confirmado: o TR não traz o prazo de recebimento'
              : semPrazo
              ? 'Ata marcada sem prazo de entrega'
              : `Prazo ${confirmado ? 'corrigido' : 'confirmado'}: ${textoDaRegra({ dias, contagem, inicio })}${r.itensComData ? `; ${r.itensComData} ${r.itensComData === 1 ? 'item recebeu' : 'itens receberam'} a data` : ''}`
          );
          onClose();
        },
        onError: (err) => toast.error(`Não foi possível salvar: ${erroDe(err)}`)
      }
    );
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Prazos da ata"
      subtitle={`Ata ${ata}${compra ? ` · Compra ${compra}` : ''}`}
      dismissible={!salvar.isPending}
      size="lg"
      testId="ata-prazo-modal"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onClose} disabled={salvar.isPending} />
          <AppButton variant="primary" disabled={!ok} isLoading={salvar.isPending} onClick={confirmar} data-testid="ata-prazo-confirmar">
            {(entregaAuto || recebimentoAuto) && !mudou ? 'Confirmar a leitura do TR' : soRecebimento && !mudou ? 'Confirmar o recebimento' : confirmado ? 'Corrigir os prazos' : semPrazo ? 'Confirmar: sem prazo de entrega' : 'Confirmar os prazos'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div>
          <CarteiraDetailLabel>No Termo de Referência</CarteiraDetailLabel>
          {s.trechos.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.35rem' }}>
              {s.trechos.map((t, i) => (
                <blockquote key={i} style={{ margin: 0, padding: '0.5rem 0.75rem', borderLeft: '3px solid var(--primary)', background: 'var(--bg-subtle, #f8fafc)', fontSize: '0.85rem', borderRadius: 4 }}>
                  “{t}”
                </blockquote>
              ))}
            </div>
          ) : (
            <div style={{ ...carteiraDetalhe }}>{p?.leitura ? 'Não achamos a cláusula de entrega no texto do edital publicado no PNCP.' : 'Esta ata não estava na leitura dos editais do PNCP: informe o prazo como está no TR.'}</div>
          )}
          <div style={{ ...carteiraDetalhe, display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {s.documento && <span>{s.documento}</span>}
            {s.url && (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="pncp-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <ExternalLink size={13} /> Abrir no PNCP
              </a>
            )}
          </div>
        </div>

        {entregaAuto && (
          <NoticeBar tone="info" testId="ata-prazo-automatico">
            Prazo de entrega lido do TR automaticamente (leitura clara) em {p?.confirmadoEm ? new Date(p.confirmadoEm).toLocaleDateString('pt-BR') : '—'}: já vale para os contratos. Confira; para corrigir agora não precisa de motivo.
          </NoticeBar>
        )}
        {confirmado && !entregaAuto && (
          <NoticeBar tone="success" testId="ata-prazo-confirmado">
            Prazo de entrega confirmado por {p?.confirmadoPorNome ?? '—'} em {p?.confirmadoEm ? new Date(p.confirmadoEm).toLocaleDateString('pt-BR') : '—'}. Para mudar, diga o motivo.
          </NoticeBar>
        )}
        {!confirmado && s.situacao === 'CONFERIR' && <NoticeBar tone="warning" testId="ata-prazo-conferir">Confira no TR: {s.motivo}. A sugestão abaixo usa o trecho mais repetido.</NoticeBar>}
        {!confirmado && s.situacao === 'SEM_CLAUSULA' && <NoticeBar tone="info" testId="ata-prazo-sem">Informe o prazo como está no TR, ou marque que esta ata não tem prazo de entrega (serviço contínuo, por exemplo).</NoticeBar>}

        <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.88rem' }}>
          <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="radio" name="ata-prazo-tem" checked={!semPrazo} onChange={() => setSemPrazo(false)} style={{ accentColor: 'var(--primary)' }} /> Tem prazo de entrega
          </label>
          <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="radio" name="ata-prazo-tem" checked={semPrazo} onChange={() => setSemPrazo(true)} style={{ accentColor: 'var(--primary)' }} data-testid="ata-prazo-sem-prazo" /> Sem prazo de entrega (serviço contínuo)
          </label>
        </fieldset>

        {!semPrazo && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '0.75rem' }}>
              <AppInput label="Dias" type="number" min={1} value={Number.isFinite(dias) && dias > 0 ? dias : ''} onChange={(ev) => setDias(Number(ev.target.value))} data-testid="ata-prazo-dias" />
              <AppSelect label="Contagem" value={contagem} onChange={(ev) => setContagem(ev.target.value as ContagemPrazo)} hint={s.contagemDita ? undefined : 'O TR não diz: vale dias corridos.'}>
                <option value="CORRIDOS">Dias corridos</option>
                <option value="UTEIS">Dias úteis</option>
              </AppSelect>
              <AppSelect label="A partir de" value={inicio} onChange={(ev) => setInicio(ev.target.value as InicioPrazo)} data-testid="ata-prazo-inicio">
                {INICIOS.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </AppSelect>
            </div>
            {diasValidos(dias) && <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Fica: <b>{textoDaRegra({ dias, contagem, inicio })}</b>. Vale para todos os contratos desta ata.</span>}

            <div>
              <AppButton variant="link" size="sm" onClick={() => setPorItemAberto((v) => !v)} data-testid="ata-prazo-por-item">
                {porItemAberto ? 'Fechar prazos por item' : 'O TR dá prazo diferente para algum item'}
              </AppButton>
              {porItemAberto && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                  <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Deixe em branco os itens que seguem o prazo da ata.</span>
                  {itens.map((it) => (
                    <div key={it.numero} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 7rem', gap: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', minWidth: 0 }}>
                        <b style={{ color: 'var(--primary)' }}>{it.numero}</b> · {it.descricao}
                      </span>
                      <AppInput aria-label={`Dias do item ${it.numero}`} type="number" min={1} placeholder={Number.isFinite(dias) ? String(dias) : 'dias'} value={porItem[it.numero] ?? ''} onChange={(ev) => setPorItem((x) => ({ ...x, [it.numero]: ev.target.value }))} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <div data-testid="ata-prazo-recebimento" style={{ borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <CarteiraDetailLabel>Recebimento (TRP e TRD)</CarteiraDetailLabel>
          {recebimentoAuto && <NoticeBar tone="info" testId="ata-receb-automatico">Lido do TR automaticamente (leitura clara): já vale para os contratos. Para corrigir agora não precisa de motivo.</NoticeBar>}
          {soRecebimento && <NoticeBar tone="warning" testId="ata-receb-a-confirmar">O prazo de recebimento ainda não foi confirmado. Confira os trechos do TR e confirme.</NoticeBar>}
          {p?.recebimentoTrechos?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {p.recebimentoTrechos.map((t, i) => (
                <blockquote key={i} style={{ margin: 0, padding: '0.5rem 0.75rem', borderLeft: '3px solid var(--primary)', background: 'var(--bg-subtle, #f8fafc)', fontSize: '0.85rem', borderRadius: 4 }}>
                  “{t}”
                </blockquote>
              ))}
            </div>
          ) : (
            <div style={{ ...carteiraDetalhe, marginTop: 0 }}>Não achamos a cláusula do recebimento no TR. Informe como está no TR ou marque que ele não diz.</div>
          )}
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.88rem' }}>
            <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="radio" name="ata-receb-tem" checked={temRecebimento} onChange={() => setTemRecebimento(true)} style={{ accentColor: 'var(--primary)' }} /> O TR traz o prazo
            </label>
            <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="radio" name="ata-receb-tem" checked={!temRecebimento} onChange={() => setTemRecebimento(false)} style={{ accentColor: 'var(--primary)' }} data-testid="ata-receb-nao-diz" /> O TR não diz
            </label>
          </fieldset>
          {temRecebimento ? (
            <CamposDoRecebimento valor={recebimento} muda={setRecebimento} testId="ata-receb" />
          ) : (
            <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Os itens entregues ficam com "prazo de recebimento a informar", sem aviso. O fiscal pode informar o prazo no contrato.</span>
          )}
        </div>

        {precisaMotivo && (
          <AppTextarea label="Por que o prazo muda?" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} rows={2} placeholder="ex.: conferi o TR e o prazo é contado da assinatura" hint={`Fica no registro da ata (mínimo de ${MOTIVO_MINIMO} letras).`} data-testid="ata-prazo-motivo" />
        )}
        <span style={{ ...carteiraDetalhe, marginTop: 0 }}>Os contratos desta ata passam a usar estes prazos. Se um contrato tiver prazo próprio (aditivo), o fiscal muda no contrato, com o motivo.</span>
      </div>
    </Modal>
  );
};
