import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ActionButton, StatusBadge, useToast } from '../../design-system';
import { BotaoResolvido, useResolverAviso } from '../avisos/ResolverAviso';
import { formatNumber } from './itemBalanceUtils';
import { formatDataHoraBR } from '../../utils/format';
import type { QuantitativosDoItem } from '../../services/quantitativosService';
import { orgaosAcimaDaAtaAssinada, type RegistradoAcima } from '../../utils/registradoAcima';

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
}

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
        {p.podeResolver && (
          <BotaoResolvido
            testId="registrado-acima-resolver"
            onClick={() => resolucao.abrir({ tipo: 'AVISO', chave: a.chave, titulo: `Registrado acima do homologado · ${p.pregaoItem}`, contexto: p.tituloItem })}
          />
        )}
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', alignItems: 'center' }}>
        <b>Confira a IRP e o cadastro da ata no Compras.gov.br.</b>
        {p.pdfDaAta && <a href={p.pdfDaAta} target="_blank" rel="noopener noreferrer" data-testid="registrado-acima-pdf">PDF da ata no PNCP ↗</a>}
      </div>
      {!p.podeResolver && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Quem confere, corrige e resolve este aviso é o gestor da ata.</p>
      )}
      {resolucao.dialog}
    </div>
  );
};
