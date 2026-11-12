import React from 'react';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { ROTULO_MOTIVO_AUSENCIA, type TransferenciaTemporaria } from '../../../services/transferenciaTemporariaService';
import { DesfazerTransferenciaModal, MudarRetornoModal } from './DesfazerTransferenciaModal';
import { dataBR, diasEntre, hojeISO, resumoPorDestino, textoQuantidade } from './transferenciaTemporaria';

const sub: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginTop: '0.15rem' };
const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' };

const quandoVolta = (t: TransferenciaTemporaria, hoje: string) => {
  const dias = diasEntre(hoje, t.retornoPrevisto);
  if (dias > 1) return `retorno em ${dias} dias`;
  if (dias === 1) return 'retorno amanhã';
  if (dias === 0) return 'retorno hoje';
  return `retorno era há ${-dias} ${dias === -1 ? 'dia' : 'dias'}`;
};

const ComQuem: React.FC<{ t: TransferenciaTemporaria }> = ({ t }) => (
  <>
    {resumoPorDestino(t.itens).map((r) => (
      <div key={r.nome}>
        {r.nome}: {textoQuantidade(r.atas, r.contratos)}
      </div>
    ))}
  </>
);

/**
 * Aba Ausências da Central: transferências temporárias em curso (com Mudar retorno e Desfazer, só o coordenador)
 * e o histórico das já desfeitas.
 */
export const AusenciasFila: React.FC<{ transferencias: TransferenciaTemporaria[]; podeAlterar: boolean }> = ({ transferencias, podeAlterar }) => {
  const [desfazendo, setDesfazendo] = React.useState<TransferenciaTemporaria | null>(null);
  const [mudando, setMudando] = React.useState<TransferenciaTemporaria | null>(null);
  const hoje = hojeISO();
  const emCurso = transferencias.filter((t) => t.desfeitaEm === null).sort((a, b) => a.retornoPrevisto.localeCompare(b.retornoPrevisto));
  const historico = transferencias.filter((t) => t.desfeitaEm !== null);

  return (
    <section data-testid="distribuicao-ausencias" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <span style={rotulo}>Em curso</span>
      {emCurso.length === 0 ? (
        <div style={{ ...carteiraTableShell, padding: '1.25rem', fontSize: '0.85rem', color: '#64748b' }}>
          Ninguém ausente. Para transferir, use "Transferir temporariamente" na aba Equipe.
        </div>
      ) : (
        <div style={carteiraTableShell}>
          <div style={{ overflowX: 'auto', containerType: 'inline-size' }}>
            <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={carteiraTh}>Servidor</th>
                  <th style={carteiraTh}>Período</th>
                  <th style={carteiraTh}>Motivo</th>
                  <th style={carteiraTh}>Com quem</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {emCurso.map((t) => {
                  const atrasado = t.retornoPrevisto <= hoje;
                  return (
                    <tr key={t.id} data-testid={`ausencia-${t.ausenteNome}`}>
                      <td style={{ ...carteiraTd, minWidth: '150px' }}>
                        <div style={{ fontWeight: 800 }}>{t.ausenteNome}</div>
                        {t.criadoPorNome && <div style={sub}>por {t.criadoPorNome}, em {new Date(t.criadoEm).toLocaleDateString('pt-BR')}</div>}
                      </td>
                      <td data-label="Período" style={carteiraTd}>
                        {dataBR(t.inicio)} a {dataBR(t.retornoPrevisto)}
                        <div style={{ ...sub, color: atrasado ? 'var(--color-warning-text)' : sub.color, fontWeight: atrasado ? 700 : 600 }}>{quandoVolta(t, hoje)}</div>
                      </td>
                      <td data-label="Motivo" style={carteiraTd}>
                        {ROTULO_MOTIVO_AUSENCIA[t.motivo]}
                        {t.seiNumero && <div style={sub}>SEI {t.seiNumero}</div>}
                      </td>
                      <td data-label="Com quem" style={carteiraTd}>
                        <ComQuem t={t} />
                      </td>
                      <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {podeAlterar && (
                          <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <ActionButton action="editar" label="Mudar retorno" type="button" size="sm" onClick={() => setMudando(t)} data-testid={`ausencia-retorno-${t.ausenteNome}`} />
                            <ActionButton action="desfazer" type="button" size="sm" onClick={() => setDesfazendo(t)} data-testid={`ausencia-desfazer-${t.ausenteNome}`} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {historico.length > 0 && (
        <>
          <span style={rotulo}>Histórico</span>
          <div style={carteiraTableShell}>
            <div style={{ overflowX: 'auto', containerType: 'inline-size' }}>
              <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={carteiraTh}>Servidor</th>
                    <th style={carteiraTh}>Período</th>
                    <th style={carteiraTh}>Motivo</th>
                    <th style={carteiraTh}>Com quem</th>
                    <th style={carteiraTh}>Desfeita</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((t) => {
                    const ficaram = t.itens.filter((i) => i.devolvido === false);
                    return (
                      <tr key={t.id}>
                        <td style={carteiraTd}>
                          <span style={{ fontWeight: 800 }}>{t.ausenteNome}</span>
                        </td>
                        <td data-label="Período" style={carteiraTd}>{dataBR(t.inicio)} a {dataBR(t.retornoPrevisto)}</td>
                        <td data-label="Motivo" style={carteiraTd}>
                          {ROTULO_MOTIVO_AUSENCIA[t.motivo]}
                          {t.seiNumero && <div style={sub}>SEI {t.seiNumero}</div>}
                        </td>
                        <td data-label="Com quem" style={carteiraTd}>
                          <ComQuem t={t} />
                        </td>
                        <td data-label="Desfeita" style={carteiraTd}>
                          {new Date(t.desfeitaEm as string).toLocaleDateString('pt-BR')}
                          {t.desfeitaPorNome ? ` por ${t.desfeitaPorNome}` : ''}
                          <div style={sub}>
                            {t.itens.length - ficaram.length} devolvidos{ficaram.length > 0 ? ` · ${ficaram.length} ${ficaram.length === 1 ? 'ficou' : 'ficaram'} com outra pessoa` : ''}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {desfazendo && <DesfazerTransferenciaModal transferencia={desfazendo} onClose={() => setDesfazendo(null)} />}
      {mudando && <MudarRetornoModal transferencia={mudando} onClose={() => setMudando(null)} />}
    </section>
  );
};
