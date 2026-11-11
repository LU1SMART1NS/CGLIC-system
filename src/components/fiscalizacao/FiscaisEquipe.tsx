import React, { useMemo, useState } from 'react';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraNoResults } from '../carteira/CarteiraNoResults';
import { CARTEIRA_EXPANDED_CELL_STYLE } from '../carteira/CarteiraDetailLabel';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../carteira/carteiraStyles';
import { ActionButton } from '../../design-system/components/ActionButton';
import type { ContratoFiscalizacao, TransferenciaFiscal } from '../../services/fiscalizacaoService';
import { comSfc, dataBR, hojeEmBrasilia, type CargaDoFiscal } from '../../utils/fiscalizacao';
import { DesfazerTransferenciaFiscalModal, TransferirFiscalModal, TransferirFiscalTemporariamenteModal } from './FiscalizacaoModais';
import { ContratosFiscalizacaoTabela } from './ContratosFiscalizacaoTabela';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Carteira do fiscal: contratos em que é titular, os que substitui e a ausência (saiu ou recebeu de colega). */
const CarteiraCell: React.FC<{ f: CargaDoFiscal; ausencia: TransferenciaFiscal | null; recebidas: TransferenciaFiscal[] }> = ({ f, ausencia, recebidas }) => (
  <div>
    <span style={{ fontWeight: 700 }}>{plural(f.contratos, 'contrato', 'contratos')}</span>
    {f.comoSubstituto > 0 && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{plural(f.comoSubstituto, 'como substituto', 'como substituto')}</div>}
    {ausencia && (
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-warning-text)' }} data-testid={`fisc-equipe-ausente-${f.userId}`}>
        {ausencia.retornoPrevisto <= hojeEmBrasilia() ? `retorno em ${dataBR(ausencia.retornoPrevisto)}: devolver os contratos` : `ausente até ${dataBR(ausencia.retornoPrevisto)}`} · com {ausencia.destinoNome}
      </div>
    )}
    {recebidas.map((t) => (
      <div key={t.id} style={{ fontSize: '0.75rem', color: 'var(--color-info-text-strong)' }}>
        {plural(t.contratos, 'contrato', 'contratos')} de {t.ausenteNome} até {dataBR(t.retornoPrevisto)}
      </div>
    ))}
  </div>
);

/** Pressão do momento, no desenho da Equipe de Atas e Contratos: o que falta fazer agora. */
const PressaoCell: React.FC<{ f: CargaDoFiscal }> = ({ f }) => {
  const partes: Array<{ texto: string; cor: string }> = [];
  if (f.aAutuar > 0) partes.push({ texto: `${f.aAutuar} a autuar`, cor: 'var(--color-warning-text)' });
  if (f.semPortaria > 0) partes.push({ texto: `${f.semPortaria} sem portaria`, cor: 'var(--color-warning-text)' });
  if (partes.length === 0) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', fontSize: '0.75rem', fontWeight: 700 }}>
      {partes.map((p) => (
        <span key={p.texto} style={{ color: p.cor, whiteSpace: 'nowrap' }}>{p.texto}</span>
      ))}
    </div>
  );
};

interface FiscaisEquipeProps {
  carga: CargaDoFiscal[];
  contratos: ContratoFiscalizacao[];
  /** Ausências em curso (migration 261). */
  transferencias: TransferenciaFiscal[];
}

type Janela = { tipo: 'TRANSFERIR' | 'TEMPORARIA'; carga: CargaDoFiscal } | { tipo: 'DESFAZER'; transferencia: TransferenciaFiscal };

/**
 * Início › Fiscalização › Distribuição › Equipe: a carga de cada fiscal da SFC/CGLIC, como a Equipe de Atas e Contratos
 * (decisão de 11/11/2026). A seta abre os contratos do fiscal; a linha do contrato abre o Contrato 360.
 */
export const FiscaisEquipe: React.FC<FiscaisEquipeProps> = ({ carga, contratos, transferencias }) => {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [janela, setJanela] = useState<Janela | null>(null);
  const ausenciaDe = (userId: string) => transferencias.find((t) => t.ausenteUserId === userId) ?? null;
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? carga.filter((f) => f.nome.toLowerCase().includes(q)) : carga;
  }, [carga, busca]);
  const doFiscal = (userId: string) => contratos.filter((c) => comSfc(c) && (c.fiscalUserId === userId || c.substitutoUserId === userId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} data-testid="fisc-equipe">
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar fiscal..."
        onChangeBusca={setBusca}
        hasActiveFilters={Boolean(busca)}
        onResetFilters={() => setBusca('')}
        counter={carteiraCounter(filtradas.length, carga.length, Boolean(busca), 'fiscal', 'fiscais')}
        testIdPrefix="fisc-equipe"
      />
      {carga.length === 0 ? (
        <div style={{ ...carteiraTableShell, padding: '1.25rem', fontSize: '0.85rem', color: '#64748b' }}>
          Nenhum servidor com o perfil Gestor de Fiscalização. O perfil é dado em Ajustes › Usuários e Servidores.
        </div>
      ) : filtradas.length === 0 ? (
        <CarteiraNoResults title="Nenhum fiscal encontrado" description="Nenhum fiscal atende à busca." onResetFilters={() => setBusca('')} />
      ) : (
        <div data-testid="fisc-equipe-tabela" style={carteiraTableShell}>
          <div style={{ overflowX: 'auto', containerType: 'inline-size' }}>
            <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...carteiraTh, width: '32px', padding: '0.65rem 0.4rem' }} aria-label="Expandir" />
                  <th style={carteiraTh}>Fiscal</th>
                  <th style={carteiraTh}>Carteira</th>
                  <th style={carteiraTh}>Pressão agora</th>
                  <th style={{ ...carteiraTh, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((f) => {
                  const expandido = aberto === f.userId;
                  const temContratos = f.contratos + f.comoSubstituto > 0;
                  const ausencia = ausenciaDe(f.userId);
                  return (
                    <React.Fragment key={f.userId}>
                      <tr data-testid={`fisc-equipe-linha-${f.userId}`}>
                        <td data-role="expand" style={{ ...carteiraTd, padding: '0.7rem 0.4rem', textAlign: 'center' }}>
                          {temContratos && (
                            <ActionButton
                              action={expandido ? 'recolher' : 'expandir'}
                              iconOnly
                              type="button"
                              size="xs"
                              onClick={() => setAberto(expandido ? null : f.userId)}
                              expanded={expandido}
                              label={expandido ? 'Recolher contratos' : 'Ver contratos'}
                              data-testid={`fisc-equipe-expandir-${f.userId}`}
                            />
                          )}
                        </td>
                        <td style={{ ...carteiraTd, minWidth: '160px' }}>
                          <span style={{ fontWeight: 800 }}>{f.nome}</span>
                        </td>
                        <td data-label="Carteira" style={{ ...carteiraTd, whiteSpace: 'nowrap' }}>
                          <CarteiraCell f={f} ausencia={ausencia} recebidas={transferencias.filter((t) => t.destinoUserId === f.userId)} />
                        </td>
                        <td data-label="Pressão agora" style={carteiraTd}>
                          <PressaoCell f={f} />
                        </td>
                        <td data-role="action" style={{ ...carteiraTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            {ausencia ? (
                              <ActionButton
                                action="desfazer"
                                type="button"
                                size="sm"
                                onClick={() => setJanela({ tipo: 'DESFAZER', transferencia: ausencia })}
                                data-testid={`fisc-equipe-desfazer-${f.userId}`}
                                title="Devolver os contratos a quem voltou"
                              />
                            ) : (
                              temContratos && (
                                <>
                                  <ActionButton
                                    action="transferir"
                                    type="button"
                                    size="sm"
                                    onClick={() => setJanela({ tipo: 'TRANSFERIR', carga: f })}
                                    data-testid={`fisc-equipe-transferir-${f.userId}`}
                                    title="Passar de vez os contratos deste fiscal para outra pessoa"
                                  />
                                  {f.contratos > 0 && (
                                    <ActionButton
                                      action="transferirTemporariamente"
                                      label="Temporariamente"
                                      type="button"
                                      size="sm"
                                      onClick={() => setJanela({ tipo: 'TEMPORARIA', carga: f })}
                                      data-testid={`fisc-equipe-temporaria-${f.userId}`}
                                      title="Férias, licença…: passar os contratos até o retorno e desfazer depois"
                                    />
                                  )}
                                </>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandido && (
                        <tr>
                          <td colSpan={5} style={CARTEIRA_EXPANDED_CELL_STYLE}>
                            <ContratosFiscalizacaoTabela contratos={doFiscal(f.userId)} testId={`fisc-equipe-contratos-${f.userId}`} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {janela?.tipo === 'TRANSFERIR' && <TransferirFiscalModal carga={janela.carga} ausentes={transferencias} onClose={() => setJanela(null)} />}
      {janela?.tipo === 'TEMPORARIA' && <TransferirFiscalTemporariamenteModal carga={janela.carga} ausentes={transferencias} onClose={() => setJanela(null)} />}
      {janela?.tipo === 'DESFAZER' && <DesfazerTransferenciaFiscalModal transferencia={janela.transferencia} onClose={() => setJanela(null)} />}
    </div>
  );
};
