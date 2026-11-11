import React, { useMemo, useState } from 'react';
import { ClipboardCheck, PackageCheck } from 'lucide-react';
import { InstrumentSection } from '../instrument360/InstrumentSection';
import { AppButton } from '../../design-system/components/AppButton';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { ErrorState } from '../../design-system/components/ErrorState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { carteiraDetalhe, carteiraValor } from '../carteira/carteiraStyles';
import { useAuth } from '../../context/AuthContext';
import { useEntregasFiscalizacao, useFiscalizacaoDoContrato } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { EntregasTabela } from './EntregasTabela';
import { DividirEntregaModal, MudarEtapaModal, PrevistaModal, ResponsavelModal } from './EntregasModais';
import { rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { NOME_SFC, comSfc, dataBR, ehDoFiscal } from '../../utils/fiscalizacao';
import { CelulaSituacao } from './ContratosFiscalizacaoTabela';
import { DefinirFiscalizacaoModal, RegistrarProcessoModal } from './FiscalizacaoModais';

const grade: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem 1.5rem' };
const Campo: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
    <CarteiraDetailLabel>{rotulo}</CarteiraDetailLabel>
    <div>{children}</div>
  </div>
);

/** Contrato 360 › Fiscalização: quem fiscaliza, fiscal e substituto da SFC/CGLIC, portaria e processo (migration 259). */
export const FiscalizacaoDoContrato: React.FC<{ contractKey: string }> = ({ contractKey }) => {
  const { user, role } = useAuth();
  const { consulta, contrato } = useFiscalizacaoDoContrato(contractKey);
  const [definindo, setDefinindo] = useState(false);
  const [autuando, setAutuando] = useState(false);
  const coordenador = role === 'admin';
  const podeAutuar = Boolean(contrato && comSfc(contrato) && (coordenador || (role === 'gestor_fiscalizacao' && ehDoFiscal(contrato, user?.id))));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
    <InstrumentSection
      id="contract-fiscalizacao-section"
      title="Fiscalização"
      subtitle={`Quem fiscaliza a execução: a ${NOME_SFC}, a área requisitante ou os dois`}
      icon={ClipboardCheck}
      actions={
        contrato ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {coordenador && (
              <AppButton variant="outline" size="sm" onClick={() => setDefinindo(true)} data-testid="fisc-contrato-definir">
                {contrato.situacao === 'A_DEFINIR' || contrato.situacao === 'AREA_PADRAO' ? 'Definir quem fiscaliza' : 'Alterar quem fiscaliza'}
              </AppButton>
            )}
            {podeAutuar && (
              <AppButton variant={contrato.processoSei ? 'outline' : 'primary'} size="sm" onClick={() => setAutuando(true)} data-testid="fisc-contrato-processo">
                {contrato.processoSei ? 'Corrigir processo' : 'Registrar processo'}
              </AppButton>
            )}
          </div>
        ) : undefined
      }
    >
      {consulta.isLoading ? (
        <SkeletonLoader variant="text" count={3} testId="fisc-contrato-carregando" />
      ) : consulta.isError ? (
        <ErrorState title="Não foi possível carregar a fiscalização" message={consulta.error?.message} onRetry={() => consulta.refetch()} testId="fisc-contrato-erro" />
      ) : !contrato ? (
        <span style={carteiraDetalhe}>Contrato encerrado sem decisão de fiscalização: fica com a área requisitante.</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {contrato.situacao === 'A_DEFINIR' && (
            <NoticeBar tone="warning" testId="fisc-contrato-a-definir">
              Contrato de emenda ({contrato.emendas.join(', ')}) sem decisão. {coordenador ? `Defina quem fiscaliza; a sugestão é a ${NOME_SFC}.` : 'O coordenador decide quem fiscaliza.'}
            </NoticeBar>
          )}
          {podeAutuar && !contrato.processoSei && (
            <NoticeBar tone="info" testId="fisc-contrato-autuar">Falta registrar o processo de fiscalização (número SEI e data da autuação).</NoticeBar>
          )}
          <div style={grade}>
            <Campo rotulo="Fiscalização"><CelulaSituacao c={contrato} /></Campo>
            {comSfc(contrato) && (
              <Campo rotulo={`Fiscal ${NOME_SFC}`}>
                <span style={carteiraValor}>{contrato.fiscalNome}</span>
                <div style={carteiraDetalhe}>{contrato.substitutoNome ? `substituto: ${contrato.substitutoNome}` : 'sem substituto'}</div>
              </Campo>
            )}
            {comSfc(contrato) && (
              <Campo rotulo="Portaria de designação">
                {contrato.portariaSei ? <NumeroSeiEtiqueta numero={contrato.portariaSei} testId="fisc-contrato-portaria" /> : <span style={carteiraDetalhe}>Não registrada</span>}
              </Campo>
            )}
            {comSfc(contrato) && (
              <Campo rotulo="Processo de fiscalização">
                {contrato.processoSei ? (
                  <>
                    <NumeroSeiEtiqueta numero={contrato.processoSei} testId="fisc-contrato-processo-sei" />
                    <div style={carteiraDetalhe}>autuado em {dataBR(contrato.autuadoEm)}</div>
                  </>
                ) : (
                  <span style={carteiraDetalhe}>A autuar</span>
                )}
              </Campo>
            )}
            <Campo rotulo="Origem">
              <span style={carteiraValor}>{contrato.emendas.length ? `Emenda ${contrato.emendas.join(', ')}` : 'Sem emenda'}</span>
              {contrato.definidoPorNome && <div style={carteiraDetalhe}>decisão de {contrato.definidoPorNome}</div>}
            </Campo>
          </div>
        </div>
      )}
      {definindo && contrato && <DefinirFiscalizacaoModal contrato={contrato} onClose={() => setDefinindo(false)} />}
      {autuando && contrato && <RegistrarProcessoModal contrato={contrato} onClose={() => setAutuando(false)} />}
    </InstrumentSection>
    {contrato && comSfc(contrato) && <EntregasDoContrato contractKey={contractKey} mista={contrato.situacao === 'MISTA'} podeAgir={podeAutuar} coordenador={coordenador} />}
    </div>
  );
};

type Janela = { tipo: 'etapa' | 'prevista' | 'responsavel'; entregas: EntregaFiscalizacao[] } | { tipo: 'dividir'; entrega: EntregaFiscalizacao } | null;

/** Entregas do contrato (item × beneficiário): marcar várias para mudar a etapa, a data prevista ou quem fiscaliza. */
const EntregasDoContrato: React.FC<{ contractKey: string; mista: boolean; podeAgir: boolean; coordenador: boolean }> = ({ contractKey, mista, podeAgir, coordenador }) => {
  const consulta = useEntregasFiscalizacao(contractKey);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [janela, setJanela] = useState<Janela>(null);
  const entregas = useMemo(
    () => [...(consulta.data ?? [])].sort((a, b) => (a.itemNome ?? '').localeCompare(b.itemNome ?? '', 'pt-BR') || rotuloDoBeneficiario(a).principal.localeCompare(rotuloDoBeneficiario(b).principal, 'pt-BR')),
    [consulta.data]
  );
  const escolhidas = entregas.filter((e) => marcadas.has(e.id));
  const alternar = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
    set((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const fechar = (feito: boolean) => {
    setJanela(null);
    if (feito) setMarcadas(new Set());
  };
  const noExercito = entregas.filter((e) => e.responsavel === 'SFC' && e.etapa === 'CONTROLADO');
  const daArea = entregas.filter((e) => e.responsavel === 'AREA');
  const todasMarcadas = entregas.length > 0 && marcadas.size === entregas.length;

  return (
    <InstrumentSection
      id="contract-fiscalizacao-entregas"
      title="Entregas"
      subtitle={podeAgir ? 'Uma linha por item e beneficiário. Marque várias para agir de uma vez.' : 'Uma linha por item e beneficiário.'}
      icon={PackageCheck}
      count={entregas.length}
      actions={
        podeAgir && entregas.length > 0 ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <AppButton variant="link" size="sm" onClick={() => setMarcadas(todasMarcadas ? new Set() : new Set(entregas.map((e) => e.id)))} data-testid="fisc-entregas-marcar-todas">
              {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
            </AppButton>
            {marcadas.size > 0 && <span style={{ ...carteiraDetalhe, marginTop: 0, fontWeight: 700 }}>{marcadas.size} marcadas</span>}
            <AppButton variant="outline" size="sm" disabled={escolhidas.length !== 1 || escolhidas[0].quantidade < 2} onClick={() => setJanela({ tipo: 'dividir', entrega: escolhidas[0] })} data-testid="fisc-entregas-dividir">
              Dividir entrega
            </AppButton>
            <AppButton variant="outline" size="sm" disabled={escolhidas.length === 0} onClick={() => setJanela({ tipo: 'prevista', entregas: escolhidas })} data-testid="fisc-entregas-prevista">
              Data prevista
            </AppButton>
            {coordenador && mista && (
              <AppButton variant="outline" size="sm" disabled={escolhidas.length === 0} onClick={() => setJanela({ tipo: 'responsavel', entregas: escolhidas })} data-testid="fisc-entregas-responsavel">
                Quem fiscaliza
              </AppButton>
            )}
            <AppButton variant="primary" size="sm" disabled={escolhidas.length === 0 || escolhidas.some((e) => e.responsavel === 'AREA')} title={escolhidas.some((e) => e.responsavel === 'AREA') ? 'Entrega da área requisitante não tem etapa na SFC/CGLIC' : undefined} onClick={() => setJanela({ tipo: 'etapa', entregas: escolhidas })} data-testid="fisc-entregas-etapa">
              Mudar etapa
            </AppButton>
          </div>
        ) : undefined
      }
    >
      {consulta.isLoading ? (
        <SkeletonLoader variant="text" count={3} testId="fisc-entregas-carregando" />
      ) : consulta.isError ? (
        <ErrorState title="Não foi possível carregar as entregas" message={consulta.error?.message} onRetry={() => consulta.refetch()} testId="fisc-entregas-erro" />
      ) : entregas.length === 0 ? (
        <span style={carteiraDetalhe}>Nenhuma entrega ainda. As entregas de emenda aparecem quando a nota de empenho do pedido é ligada a este contrato.</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {noExercito.length > 0 && (
            <NoticeBar tone="danger" testId="fisc-entregas-exercito">
              {noExercito.length === 1 ? '1 entrega aguarda' : `${noExercito.length} entregas aguardam`} a autorização do Exército (DFPC), que pede o termo de doação; a doação só sai depois de entregue, recebido e pago.
            </NoticeBar>
          )}
          {mista && daArea.length > 0 && (
            <NoticeBar tone="info" testId="fisc-entregas-mista">
              Fiscalização mista: {daArea.length === 1 ? '1 entrega fica' : `${daArea.length} entregas ficam`} com a área requisitante, sem etapa na {NOME_SFC}.
            </NoticeBar>
          )}
          <EntregasTabela
            entregas={entregas}
            testId="fisc-contrato-entregas"
            selecao={podeAgir ? { marcadas, alternar: alternar(setMarcadas) } : undefined}
            abertas={abertas}
            alternarAberta={alternar(setAbertas)}
          />
        </div>
      )}
      {janela?.tipo === 'etapa' && <MudarEtapaModal entregas={janela.entregas} onClose={fechar} />}
      {janela?.tipo === 'prevista' && <PrevistaModal entregas={janela.entregas} onClose={fechar} />}
      {janela?.tipo === 'responsavel' && <ResponsavelModal entregas={janela.entregas} onClose={fechar} />}
      {janela?.tipo === 'dividir' && <DividirEntregaModal entrega={janela.entrega} onClose={fechar} />}
    </InstrumentSection>
  );
};
