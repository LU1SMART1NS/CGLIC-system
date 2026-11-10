import React, { useMemo, useState } from 'react';
import { ClipboardCheck, FileSignature, FolderOpen, Users, ScrollText } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { SectionHeader } from '../../design-system/components/SectionHeader';
import { AppButton } from '../../design-system/components/AppButton';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { PainelCartao, PainelCartoes } from '../instrumentos/PainelCartao';
import { ErrorState } from '../../design-system/components/ErrorState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useContratosFiscalizacao } from '../../hooks/useFiscalizacao';
import type { ContratoFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, comSfc, ehDoFiscal, numeroDoContrato, pendenciasDoContrato, type PendenciaFiscalizacao } from '../../utils/fiscalizacao';
import { ContratosFiscalizacaoTabela } from './ContratosFiscalizacaoTabela';
import { RegistrarProcessoModal } from './FiscalizacaoModais';

const lista: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' };
const linhaDaLista: React.CSSProperties = { display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr)', gap: '0.2rem 0.7rem', padding: '0.65rem 0.75rem', borderTop: '1px solid var(--border)', alignItems: 'start' };
const marca: React.CSSProperties = { width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', marginTop: '0.3rem' };
const LIMITE = 5;

/** Linha de "Com você", no desenho do Pedido 360 › Andamento. */
const LinhaComVoce: React.FC<{ titulo: string; detalhe: string; acao: string; onAcao: () => void; testId: string }> = ({ titulo, detalhe, acao, onAcao, testId }) => (
  <div style={linhaDaLista} data-testid={testId}>
    <span style={marca} aria-hidden="true" />
    <div style={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.4rem 0.8rem' }}>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{titulo}</div>
        <div style={{ ...carteiraDetalhe, fontSize: '0.8rem' }}>{detalhe}</div>
      </div>
      <div style={{ marginLeft: 'auto' }}>
        <AppButton size="sm" variant="primary" onClick={onAcao}>{acao}</AppButton>
      </div>
    </div>
  </div>
);

/**
 * Início › Painel da fiscalização (migration 259). O gestor de fiscalização vê os contratos em que é fiscal ou substituto
 * e o que falta em cada um; o coordenador e a consulta veem todos os contratos com a SFC/CGLIC. "Com você" só para quem
 * age: o fiscal (autuar o processo) e o coordenador (contratos de emenda a definir).
 */
export const FiscalizacaoInicioPage: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigateWithOrigin();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useContratosFiscalizacao();
  const [autuando, setAutuando] = useState<ContratoFiscalizacao | null>(null);
  const [todas, setTodas] = useState(false);
  const coordenador = role === 'admin';
  const fiscal = role === 'gestor_fiscalizacao';
  const contratos = useMemo(() => data ?? [], [data]);

  const daSfc = useMemo(() => contratos.filter((c) => comSfc(c) && (!fiscal || ehDoFiscal(c, user?.id))), [contratos, fiscal, user?.id]);
  const titular = daSfc.filter((c) => !fiscal || c.fiscalUserId === user?.id);
  const aDefinir = contratos.filter((c) => c.situacao === 'A_DEFINIR');
  const pendencias = useMemo(() => daSfc.flatMap(pendenciasDoContrato), [daSfc]);
  const aAutuar = pendencias.filter((p) => p.tipo === 'AUTUAR');
  const semPortaria = pendencias.filter((p) => p.tipo === 'PORTARIA');
  const mistas = daSfc.filter((c) => c.situacao === 'MISTA').length;

  const comVoce: Array<{ chave: string; titulo: string; detalhe: string; acao: string; onAcao: () => void }> = [];
  if (coordenador && aDefinir.length > 0) {
    comVoce.push({ chave: 'definir', titulo: `Definir quem fiscaliza ${aDefinir.length} ${aDefinir.length === 1 ? 'contrato' : 'contratos'} de emenda`, detalhe: `Chegaram do Contratos.gov.br sem decisão. A sugestão é a ${NOME_SFC}.`, acao: 'Distribuir', onAcao: () => navigate('/fiscalizacao/distribuicao') });
  }
  if (fiscal || coordenador) {
    aAutuar
      .filter((p: PendenciaFiscalizacao) => coordenador || ehDoFiscal(p.contrato, user?.id))
      .forEach((p) => comVoce.push({ chave: p.chave, titulo: `Autuar o processo de fiscalização do contrato ${numeroDoContrato(p.contrato)}`, detalhe: `${p.contrato.fornecedor ?? ''}${p.contrato.fiscalNome ? ` · fiscal ${p.contrato.fiscalNome}` : ''}`, acao: 'Registrar', onAcao: () => setAutuando(p.contrato) }));
  }
  const visiveis = todas ? comVoce : comVoce.slice(0, LIMITE);

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Início"
        subtitle={fiscal ? 'Os contratos que você fiscaliza e o que falta em cada um.' : `Resumo da fiscalização dos contratos pela ${NOME_SFC} e o que exige sua atenção.`}
        icon={<ClipboardCheck size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="fisc-inicio-atualizar" tooltipTitle="Recarregar a fiscalização" />}
      />
      {isLoading ? (
        <SkeletonLoader variant="card" count={3} testId="fisc-inicio-carregando" />
      ) : isError ? (
        <ErrorState title="Não foi possível carregar a fiscalização" message={error?.message || 'Falha ao consultar a fiscalização dos contratos.'} onRetry={() => refetch()} testId="fisc-inicio-erro" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <PainelCartoes testId="fisc-inicio-cartoes">
            <PainelCartao
              rotulo={fiscal ? 'Meus contratos' : `Com a ${NOME_SFC}`}
              icone={<FolderOpen size={16} />}
              tom="primary"
              valor={String(fiscal ? titular.length : daSfc.length)}
              unidade={(fiscal ? titular.length : daSfc.length) === 1 ? 'contrato' : 'contratos'}
              linhas={fiscal ? [{ rotulo: 'Como substituto', valor: String(daSfc.length - titular.length) }] : [{ rotulo: 'Fiscalização mista', valor: String(mistas) }]}
              onClick={() => document.getElementById('fisc-inicio-contratos')?.scrollIntoView({ behavior: 'smooth' })}
              testId="fisc-cartao-contratos"
            />
            <PainelCartao
              rotulo="Processo a autuar"
              icone={<FileSignature size={16} />}
              tom={aAutuar.length ? 'amber' : 'success'}
              valor={aAutuar.length ? String(aAutuar.length) : 'Em dia'}
              unidade={aAutuar.length ? (aAutuar.length === 1 ? 'contrato' : 'contratos') : undefined}
              linhas={[{ rotulo: 'Sem portaria registrada', valor: String(semPortaria.length), tom: semPortaria.length ? 'warning' : undefined }]}
              onClick={() => document.getElementById('fisc-inicio-com-voce')?.scrollIntoView({ behavior: 'smooth' })}
              testId="fisc-cartao-autuar"
            />
            {!fiscal && (
              <PainelCartao
                rotulo="Contratos de emenda a definir"
                icone={<ScrollText size={16} />}
                tom={aDefinir.length ? 'danger' : 'success'}
                valor={aDefinir.length ? String(aDefinir.length) : 'Em dia'}
                unidade={aDefinir.length ? (aDefinir.length === 1 ? 'contrato' : 'contratos') : undefined}
                linhas={[{ rotulo: 'Sugestão', valor: NOME_SFC }]}
                onClick={() => navigate(coordenador ? '/fiscalizacao/distribuicao' : '/fiscalizacao/inicio')}
                testId="fisc-cartao-a-definir"
              />
            )}
            {!fiscal && (
              <PainelCartao
                rotulo="Fiscais"
                icone={<Users size={16} />}
                tom="primary"
                valor={String(new Set(daSfc.map((c) => c.fiscalUserId).filter(Boolean)).size)}
                unidade="com contratos"
                linhas={[]}
                onClick={() => navigate(coordenador ? '/fiscalizacao/distribuicao?segmento=SFC' : '/fiscalizacao/inicio')}
                testId="fisc-cartao-fiscais"
              />
            )}
          </PainelCartoes>

          {(fiscal || coordenador) && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }} id="fisc-inicio-com-voce" data-testid="fisc-com-voce">
              <CarteiraDetailLabel>Com você{comVoce.length ? ` · ${comVoce.length}` : ''}</CarteiraDetailLabel>
              <div style={{ ...lista, borderLeft: '4px solid var(--primary)' }}>
                <div style={{ marginTop: '-1px' }}>
                  {comVoce.length === 0 ? (
                    <div style={{ ...linhaDaLista, gridTemplateColumns: '1fr' }}><span style={{ fontWeight: 600 }}>Nada com você agora.</span></div>
                  ) : (
                    visiveis.map((l) => <LinhaComVoce key={l.chave} titulo={l.titulo} detalhe={l.detalhe} acao={l.acao} onAcao={l.onAcao} testId={`fisc-com-voce-${l.chave}`} />)
                  )}
                  {!todas && comVoce.length > LIMITE && (
                    <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)' }}>
                      <AppButton size="xs" variant="link" onClick={() => setTodas(true)}>e mais {comVoce.length - LIMITE}</AppButton>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }} id="fisc-inicio-contratos">
            <SectionHeader title={fiscal ? 'Meus contratos' : `Contratos com a ${NOME_SFC}`} subtitle="A linha abre o Contrato 360 na aba Fiscalização" />
            <ContratosFiscalizacaoTabela contratos={daSfc} testId="fisc-inicio-tabela" />
          </div>
        </div>
      )}
      {autuando && <RegistrarProcessoModal key={autuando.contractKey} contrato={autuando} onClose={() => setAutuando(null)} />}
    </PageContainer>
  );
};

