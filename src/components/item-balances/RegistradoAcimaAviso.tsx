import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ActionButton, AppButton, AppInput, AppTextarea, Modal, NoticeBar, StatusBadge, useToast } from '../../design-system';
import { useResolverAviso } from '../avisos/ResolverAviso';
import { useDecisoesRegistradoAcima } from '../../hooks/useDecisoesRegistradoAcima';
import type { DecisaoDoAviso, DecisaoRegistradoAcima } from '../../services/registradoAcimaDecisaoService';
import { formatNumber } from './itemBalanceUtils';
import { formatDataHoraBR } from '../../utils/format';
import type { QuantitativosDoItem } from '../../services/quantitativosService';
import { orgaosAcimaDaAtaAssinada, type RegistradoAcima } from '../../utils/registradoAcima';
import { useTermosDeProrrogacao } from '../../hooks/useTermosDeProrrogacao';
import type { TermoDeProrrogacao } from '../../services/termosProrrogacaoService';

export interface RegistradoAcimaAvisoProps {
  aviso: RegistradoAcima;
  quantitativos: QuantitativosDoItem;
  /** "Pregão 90023/2024 · item 5". */
  pregaoItem: string;
  tituloItem: string;
  pdfDaAta: string;
  /** Gestor da ata e coordenador: resolvem e reexibem (migration 142). O gestor de saldo só lê. */
  podeResolver: boolean;
  /** Cota própria (ou quantidade SENASP) antes e depois do desconto, e o contratado: para a frase do efeito. */
  baseSemDesconto: number;
  contratado: number;
  nomeDe: (uasg: string) => string;
  /** Ata do item, para achar o termo aditivo de prorrogação no PNCP (migration 222). */
  numeroAta?: string;
  uasg?: string;
  /** Ata prorrogada: só nela dá para aceitar o registrado (com termo que renove os quantitativos, migration 223). */
  ataProrrogada?: boolean;
}

/** Condições do Parecer 75/2024/DECOR/CGU/AGU para renovar os quantitativos na prorrogação. */
export const CONDICOES_DO_PARECER = [
  'Previsão expressa de renovação no edital e na ata',
  'Tema tratado no planejamento (ETP e Termo de Referência)',
  'Preço vantajoso comprovado por pesquisa atualizada',
  'Termo aditivo assinado dentro da vigência da ata'
] as const;

const linhaDiscreta: React.CSSProperties = { fontSize: '0.82rem', color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem', fontVariantNumeric: 'tabular-nums', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' };

const rotuloManter = (prorrogada: boolean) => (prorrogada ? 'Manter o saldo remanescente' : 'Manter fora do saldo');

/** Linha do aviso decidido (migration 223), com Desfazer para quem decide. */
const LinhaDaDecisao: React.FC<{ d: DecisaoDoAviso; a: RegistradoAcima; prorrogada: boolean; podeDesfazer: boolean; desfazendo: boolean; onDesfazer: () => void }> = ({ d, a, prorrogada, podeDesfazer, desfazendo, onDesfazer }) => (
  <div style={linhaDiscreta} data-testid={`registrado-acima-${d.decisao.toLowerCase()}`}>
    <span style={{ flex: '1 1 300px', minWidth: 0 }}>
      <StatusBadge label={d.decisao === 'ACEITAR' ? 'Registrado aceito' : prorrogada ? 'Saldo remanescente mantido' : 'Mantido fora do saldo'} variant={d.decisao === 'ACEITAR' ? 'success' : 'neutral'} size="sm" dot={false} />{' '}
      Registrado acima do homologado (excedente {formatNumber(a.excedente)}){d.decididoPorNome ? <> · decidido por <b>{d.decididoPorNome}</b></> : ''} em {formatDataHoraBR(d.decididoEm)}
      {d.documentoSei ? ` · termo aditivo SEI ${d.documentoSei}` : ''}{d.protocoloMgi ? ` · chamado no MGI ${d.protocoloMgi}` : ''}: “{d.justificativa}”.{' '}
      {d.decisao === 'ACEITAR'
        ? 'O excedente da SENASP voltou a contar como saldo.'
        : a.desconto > 0 ? `${formatNumber(a.desconto)} da SENASP ${a.desconto === 1 ? 'continua' : 'continuam'} fora do saldo.` : 'O saldo da SENASP não muda.'}
    </span>
    {podeDesfazer && <ActionButton action="desfazer" size="sm" onClick={onDesfazer} disabled={desfazendo} data-testid="registrado-acima-desfazer" />}
  </div>
);

/** Janela da decisão: manter (justificativa, SEI opcional) ou aceitar (SEI do termo e as condições do parecer). */
const JanelaDaDecisao: React.FC<{ tipo: DecisaoRegistradoAcima | null; a: RegistradoAcima; prorrogada: boolean; baseSemDesconto: number; contratado: number; titulo: string; gravando: boolean; onFechar: () => void; onGravar: (sei: string | null, justificativa: string) => Promise<void> }> = (p) => {
  const [sei, setSei] = React.useState('');
  const [just, setJust] = React.useState('');
  const [marcadas, setMarcadas] = React.useState<boolean[]>(CONDICOES_DO_PARECER.map(() => false));
  const [erro, setErro] = React.useState<string | null>(null);
  React.useEffect(() => { setSei(''); setJust(''); setMarcadas(CONDICOES_DO_PARECER.map(() => false)); setErro(null); }, [p.tipo]);
  const aceitar = p.tipo === 'ACEITAR';
  const baseCom = p.baseSemDesconto - p.a.desconto;
  const gravar = async () => {
    setErro(null);
    const s = aceitar ? sei.replace(/\D/g, '') : sei.trim();
    if (aceitar && !/^\d{8}$/.test(s)) return setErro('Informe o número SEI do termo aditivo (8 dígitos).');
    if (aceitar && !marcadas.every(Boolean)) return setErro(`Marque as quatro condições do parecer. Sem elas, o excedente não tem lastro: use “${rotuloManter(p.prorrogada)}”.`);
    if (!aceitar && s.length > 40) return setErro('O protocolo do MGI pode ter no máximo 40 caracteres.');
    if (just.trim().length < 15) return setErro('Escreva a justificativa (mínimo de 15 caracteres).');
    try {
      await p.onGravar(s || null, just.trim());
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível gravar a decisão.');
    }
  };
  return (
    <Modal
      isOpen={Boolean(p.tipo)}
      onClose={p.onFechar}
      dismissible={!p.gravando}
      size="md"
      title={aceitar ? 'Aceitar o registrado' : rotuloManter(p.prorrogada)}
      subtitle={p.titulo}
      testId="registrado-acima-decisao"
      footer={
        <>
          <ActionButton action="cancelar" onClick={p.onFechar} disabled={p.gravando} />
          <AppButton variant="primary" onClick={() => void gravar()} disabled={p.gravando} data-testid="registrado-acima-decisao-gravar">
            {p.gravando ? 'Gravando…' : aceitar ? 'Aceitar o registrado' : 'Manter'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.86rem' }}>
        {aceitar ? (
          <>
            <NoticeBar tone="info">O excedente passa a contar como saldo da SENASP. Só com termo aditivo que renove os quantitativos (Parecer 75/2024/DECOR).</NoticeBar>
            <AppInput label="Número SEI do termo aditivo que renova os quantitativos (8 dígitos)" inputMode="numeric" maxLength={8} placeholder="12345678" value={sei} onChange={(e) => setSei(e.target.value.replace(/\D/g, '').slice(0, 8))} data-testid="registrado-acima-decisao-sei" />
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <legend style={{ fontWeight: 700, marginBottom: '0.3rem' }}>As quatro condições do parecer foram atendidas</legend>
              {CONDICOES_DO_PARECER.map((c, i) => (
                <label key={c} style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={marcadas[i]} onChange={(e) => setMarcadas((m) => m.map((v, j) => (j === i ? e.target.checked : v)))} data-testid={`registrado-acima-condicao-${i}`} />
                  <span>{c}</span>
                </label>
              ))}
            </fieldset>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '0.2rem 1rem', fontVariantNumeric: 'tabular-nums' }}>
              <span>Cota própria da SENASP</span><b>{formatNumber(baseCom)} → {formatNumber(p.baseSemDesconto)}</b>
              <span>Saldo</span><b>{formatNumber(baseCom - p.contratado)} → {formatNumber(p.baseSemDesconto - p.contratado)}</b>
            </div>
          </>
        ) : (
          <>
            <NoticeBar tone="info">O excedente continua fora do saldo (cota própria {formatNumber(baseCom)}). O aviso sai da fila do Painel e vira uma linha aqui.</NoticeBar>
            <AppInput label="Protocolo do chamado de correção no suporte do MGI (opcional)" maxLength={40} value={sei} onChange={(e) => setSei(e.target.value.slice(0, 40))} data-testid="registrado-acima-decisao-protocolo" />
          </>
        )}
        <AppTextarea label="Justificativa (obrigatória)" rows={3} value={just} onChange={(e) => setJust(e.target.value)} placeholder={aceitar ? 'Ex.: o 1º termo aditivo renova os quantitativos originalmente registrados.' : 'Ex.: o termo aditivo cobre só o saldo remanescente; pedida a correção do cadastro ao MGI.'} data-testid="registrado-acima-decisao-justificativa" />
        {erro && <NoticeBar tone="danger" testId="registrado-acima-decisao-erro">{erro}</NoticeBar>}
      </div>
    </Modal>
  );
};

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/**
 * O que o termo de prorrogação publicado no PNCP diz sobre o saldo, no quadro do aviso (termo que renova ou que não deu
 * para ler). Com o termo "só o saldo" o aviso vira uma linha discreta (decisão do usuário em 27/10/2026).
 */
export const TermoDaProrrogacao: React.FC<{ termo: TermoDeProrrogacao }> = ({ termo: t }) => (
  <div data-testid="registrado-acima-termo" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 0.7rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
    <span>
      <b>Ata prorrogada.</b> Termo aditivo publicado no PNCP{t.publicadoEm ? ` em ${dataBR(t.publicadoEm)}` : ''}
      {t.url && <> · <a href={t.url} target="_blank" rel="noopener noreferrer" data-testid="registrado-acima-termo-link">abrir o termo ↗</a></>}
    </span>
    {t.trecho && <span style={{ fontStyle: 'italic' }}>“{t.trecho}”</span>}
    <span>
      {t.cobertura === 'SALDO'
        ? 'A prorrogação cobre só o saldo não contratado. O aumento que o Compras.gov.br mostra depois da prorrogação não tem lastro: peça ao MGI a correção do cadastro.'
        : t.cobertura === 'RENOVA'
          ? 'O termo renova os quantitativos. Se o aumento no Compras.gov.br for essa renovação, resolva o aviso com a justificativa.'
          : 'Não deu para ler o que o termo diz sobre o saldo. Abra o termo para conferir.'}
    </span>
  </div>
);

const caixa: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.8rem 0.95rem', borderRadius: '8px',
  border: '1px solid var(--color-danger-border)', borderLeft: '4px solid var(--color-danger-solid)', background: 'var(--surface)', fontSize: '0.85rem'
};
const celula: React.CSSProperties = { padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)' };
const numero: React.CSSProperties = { ...celula, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const cabecalho: React.CSSProperties = { ...celula, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 700 };

/**
 * Aviso "Registrado acima do homologado" na aba Órgãos e quantitativos (migration 142): a soma do registrado no
 * Compras.gov.br passa do homologado. Enquanto aberto, a parte da SENASP fica fora do saldo; resolvido (com
 * justificativa), volta a contar.
 */
export const RegistradoAcimaAviso: React.FC<RegistradoAcimaAvisoProps> = (p) => {
  const { aviso: a, quantitativos: q } = p;
  const toast = useToast();
  const resolucao = useResolverAviso();
  const info = resolucao.porChave.get(a.chave);
  const resolvido = a.resolvido || Boolean(info);
  const termos = useTermosDeProrrogacao(p.numeroAta ?? '', p.uasg ?? '', !resolvido);
  const decisoes = useDecisoesRegistradoAcima();
  const decisao = decisoes.porChave.get(a.chave);
  const prorrogada = Boolean(p.ataProrrogada);
  const [decidindo, setDecidindo] = React.useState<DecisaoRegistradoAcima | null>(null);

  // Decisão do gestor da ata (migration 223): uma linha, com Desfazer.
  if (decisao) {
    const desfazer = async () => {
      try {
        await decisoes.desfazer.mutateAsync(a.chave);
        toast.success('Decisão desfeita.');
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : 'Não foi possível desfazer.');
      }
    };
    return <LinhaDaDecisao d={decisao} a={a} prorrogada={prorrogada} podeDesfazer={p.podeResolver} desfazendo={decisoes.desfazer.isPending} onDesfazer={() => void desfazer()} />;
  }

  if (resolvido) {
    const reexibir = async () => {
      try {
        await resolucao.reexibir.mutateAsync({ chave: a.chave });
        toast.success('Aviso reexibido.');
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : 'Não foi possível reexibir.');
      }
    };
    return (
      <div data-testid="registrado-acima-resolvido" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
        <StatusBadge label="Resolvido" variant="success" size="sm" dot={false} />
        <span style={{ flex: '1 1 260px', minWidth: 0 }}>
          Aviso “Registrado acima do homologado” resolvido{info?.resolvidoPorNome ? <> por <b>{info.resolvidoPorNome}</b></> : ''}
          {info ? ` em ${formatDataHoraBR(info.resolvidoEm)}` : ''}{info ? <>: “{info.justificativa}”</> : ''}. O excedente de {formatNumber(a.excedente)} continua no Compras.gov.br;
          a parte da SENASP voltou a contar como saldo.
        </span>
        {p.podeResolver && <ActionButton action="reexibir" size="sm" onClick={() => void reexibir()} disabled={resolucao.reexibir.isPending} data-testid="registrado-acima-reexibir" />}
      </div>
    );
  }

  // Enquanto lê os termos, não pisca o quadro vermelho de um aviso que vai virar linha discreta.
  if (termos.isLoading) return null;
  const termo = termos.data?.[0] ?? null;
  // Ata prorrogada com termo "só o saldo" (migration 222): o termo explica o excedente; só uma linha, o desconto continua.
  if (termo?.cobertura === 'SALDO') {
    return (
      <div data-testid="registrado-acima-explicado" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem', fontVariantNumeric: 'tabular-nums' }}>
        <b>Registrado acima do homologado por causa da prorrogação.</b> O Compras.gov.br registra {formatNumber(a.excedente)} acima do homologado
        ({formatNumber(a.somaRegistrado)} × {formatNumber(a.homologado)}). O termo aditivo{termo.publicadoEm ? ` de ${dataBR(termo.publicadoEm)}` : ''} cobre só o saldo não contratado:{' '}
        {a.desconto > 0 ? `${formatNumber(a.desconto)} da SENASP ${a.desconto === 1 ? 'fica' : 'ficam'} fora do saldo.` : 'o saldo da SENASP não muda.'}
        {termo.url && <> <a href={termo.url} target="_blank" rel="noopener noreferrer" data-testid="registrado-acima-explicado-link">Abrir o termo ↗</a></>}
      </div>
    );
  }
  // Gestor de saldo (e quem só lê): sem quadro vermelho nem botões; só o que fica fora do saldo (27/10/2026).
  if (!p.podeResolver) {
    return (
      <div style={linhaDiscreta} data-testid="registrado-acima-so-leitura">
        <span>
          <b>Registrado acima do homologado:</b> o Compras.gov.br registra {formatNumber(a.excedente)} acima do homologado.{' '}
          {a.desconto > 0 ? `${formatNumber(a.desconto)} da SENASP ${a.desconto === 1 ? 'fica' : 'ficam'} fora do saldo.` : 'O saldo da SENASP não muda.'} Quem confere é o gestor da ata.
        </span>
      </div>
    );
  }
  const acima = a.ataAssinadaInformada ? orgaosAcimaDaAtaAssinada(q.orgaos, q.gerenciadoParticipantes) : [];
  const participantes = a.excedente - a.excedenteSenasp;
  const baseComDesconto = p.baseSemDesconto - a.desconto;

  return (
    <div style={caixa} role="region" aria-label="Aviso: registrado acima do homologado" data-testid="registrado-acima-aviso">
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, color: 'var(--color-danger-text-strong)' }}>
            <AlertTriangle size={16} aria-hidden="true" /> Registrado acima do homologado
          </div>
          <p style={{ margin: '0.3rem 0 0', fontVariantNumeric: 'tabular-nums' }}>
            {p.pregaoItem}. Homologado <b>{formatNumber(a.homologado)}</b> × soma do registrado no Compras.gov.br <b>{formatNumber(a.somaRegistrado)}</b>:
            excedente de <b style={{ color: 'var(--color-danger-text)' }}>{formatNumber(a.excedente)}</b> sem lastro na licitação. Remanejamento não muda essa soma.
          </p>
        </div>
      </div>

      {a.ataAssinadaInformada ? (
        acima.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Órgãos acima da ata assinada</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }} data-testid="registrado-acima-orgaos">
              <thead><tr><th style={{ ...cabecalho, textAlign: 'left' }}>Órgão</th><th style={{ ...cabecalho, textAlign: 'right' }}>Ata assinada</th><th style={{ ...cabecalho, textAlign: 'right' }}>Registrado</th><th style={{ ...cabecalho, textAlign: 'right' }}>Acima</th></tr></thead>
              <tbody>
                {acima.map((o) => (
                  <tr key={o.uasg}>
                    <td style={celula}>
                      {o.ehSenasp ? 'SENASP' : p.nomeDe(o.uasg)}
                      {(o.ehSenasp || !p.nomeDe(o.uasg).includes(o.uasg)) && <span style={{ color: 'var(--text-muted)' }}> · {o.uasg}</span>}
                    </td>
                    <td style={numero}>{formatNumber(o.assinada)}</td>
                    <td style={numero}>{formatNumber(o.registrado)}</td>
                    <td style={{ ...numero, color: 'var(--color-danger-text)', fontWeight: 700 }}>+{formatNumber(o.acima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <p style={{ margin: 0 }}>
          A ata assinada ainda não foi informada, então não dá para saber em quais órgãos está o excedente. Até ela ser informada,
          o saldo da SENASP desconta todo o excedente (no máximo, o registrado da SENASP).
        </p>
      )}

      <div data-testid="registrado-acima-efeito" style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: '8px', padding: '0.5rem 0.7rem', color: 'var(--text-primary)' }}>
        {a.excedenteSenasp > 0 ? (
          <>
            Enquanto o aviso estiver aberto, <b>{formatNumber(a.desconto)}</b> da SENASP {a.desconto === 1 ? 'não conta' : 'não contam'} como saldo
            {!a.ataAssinadaInformada && ' (provisório)'}: {a.ataAssinadaInformada ? 'cota própria' : 'quantidade SENASP'} <b>{formatNumber(baseComDesconto)}</b> em vez de {formatNumber(p.baseSemDesconto)};
            saldo <b>{formatNumber(baseComDesconto - p.contratado)}</b> em vez de {formatNumber(p.baseSemDesconto - p.contratado)}.
            {participantes > 0 && ` O excedente dos participantes (${formatNumber(participantes)}) não mexe no saldo da SENASP.`}
          </>
        ) : (
          'O excedente está só nos participantes: o saldo da SENASP não muda.'
        )}
      </div>

      {termo && <TermoDaProrrogacao termo={termo} />}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <AppButton variant="primary" size="sm" onClick={() => setDecidindo('MANTER')} data-testid="registrado-acima-manter">{rotuloManter(prorrogada)}</AppButton>
        <AppButton variant="secondary" size="sm" onClick={() => setDecidindo('ACEITAR')} disabled={!prorrogada} data-testid="registrado-acima-aceitar">Aceitar o registrado</AppButton>
        {!prorrogada && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sem prorrogação não há termo que renove os quantitativos: não dá para aceitar.</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', alignItems: 'center' }}>
        <b>Confira a IRP e o cadastro da ata no Compras.gov.br.</b>
        {p.pdfDaAta && <a href={p.pdfDaAta} target="_blank" rel="noopener noreferrer" data-testid="registrado-acima-pdf">PDF da ata no PNCP ↗</a>}
      </div>
      {resolucao.dialog}
      <JanelaDaDecisao
        tipo={decidindo}
        a={a}
        prorrogada={prorrogada}
        baseSemDesconto={p.baseSemDesconto}
        contratado={p.contratado}
        titulo={`${p.pregaoItem} · ${p.tituloItem}`}
        gravando={decisoes.decidir.isPending}
        onFechar={() => setDecidindo(null)}
        onGravar={async (sei, justificativa) => {
          await decisoes.decidir.mutateAsync({ chave: a.chave, decisao: decidindo!, documento: sei, justificativa, condicoesParecer: decidindo === 'ACEITAR' });
          toast.success(decidindo === 'ACEITAR' ? 'Registrado aceito.' : 'Decisão gravada: o excedente continua fora do saldo.');
          setDecidindo(null);
        }}
      />
    </div>
  );
};
