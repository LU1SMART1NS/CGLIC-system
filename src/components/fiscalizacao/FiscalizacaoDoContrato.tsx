import React, { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { InstrumentSection } from '../instrument360/InstrumentSection';
import { AppButton } from '../../design-system/components/AppButton';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { ErrorState } from '../../design-system/components/ErrorState';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { carteiraDetalhe, carteiraValor } from '../carteira/carteiraStyles';
import { useAuth } from '../../context/AuthContext';
import { useFiscalizacaoDoContrato } from '../../hooks/useFiscalizacao';
import { NOME_SFC, autuado, comSfc, dataBR, ehDoFiscal } from '../../utils/fiscalizacao';
import { CelulaSituacao } from './ContratosFiscalizacaoTabela';
import { DefinirFiscalizacaoModal, RegistrarProcessoModal } from './FiscalizacaoModais';
import { MesaDaFiscalizacao } from './MesaDaFiscalizacao';

const grade: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem 1.5rem' };
const Campo: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
    <CarteiraDetailLabel>{rotulo}</CarteiraDetailLabel>
    <div>{children}</div>
  </div>
);

/** Contrato 360 › Fiscalização: quem fiscaliza, fiscal da SFC/CGLIC, portaria e processo (migration 259). */
export const FiscalizacaoDoContrato: React.FC<{ contractKey: string }> = ({ contractKey }) => {
  const { user, role } = useAuth();
  const { consulta, contrato } = useFiscalizacaoDoContrato(contractKey);
  const [definindo, setDefinindo] = useState(false);
  const [autuando, setAutuando] = useState(false);
  const coordenador = role === 'admin';
  const podeAutuar = Boolean(contrato && comSfc(contrato) && (coordenador || (role === 'gestor_fiscalizacao' && ehDoFiscal(contrato, user?.id))));

  // Com a SFC/CGLIC (ou mista), a aba é a mesa de trabalho (protótipo aprovado em 11/11/2026): quem fiscaliza numa
  // faixa, Com você, Com outros e Onde está cada item. "A definir" e área requisitante seguem com o quadro abaixo.
  if (contrato && comSfc(contrato)) {
    return (
      <InstrumentSection id="contract-fiscalizacao-section" title="Fiscalização" subtitle={`O que fazer agora e onde está cada item, para cada beneficiário`} icon={ClipboardCheck}>
        <MesaDaFiscalizacao contractKey={contractKey} />
      </InstrumentSection>
    );
  }

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
              <AppButton variant={autuado(contrato) ? 'outline' : 'primary'} size="sm" onClick={() => setAutuando(true)} data-testid="fisc-contrato-processo">
                {autuado(contrato) ? 'Corrigir a autuação' : 'Registrar a autuação'}
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
          {podeAutuar && !autuado(contrato) && (
            <NoticeBar tone="info" testId="fisc-contrato-autuar">Falta registrar a autuação: o NUP do processo de acompanhamento contratual.</NoticeBar>
          )}
          <div style={grade}>
            <Campo rotulo="Fiscalização"><CelulaSituacao c={contrato} /></Campo>
            {comSfc(contrato) && (
              <Campo rotulo={`Fiscal ${NOME_SFC}`}>
                <span style={carteiraValor}>{contrato.fiscalNome}</span>
              </Campo>
            )}
            {comSfc(contrato) && (
              <Campo rotulo="Portaria de designação">
                {contrato.portariaSei ? <NumeroSeiEtiqueta numero={contrato.portariaSei} testId="fisc-contrato-portaria" /> : <span style={carteiraDetalhe}>Não registrada</span>}
              </Campo>
            )}
            {comSfc(contrato) && (
              <Campo rotulo="Processo (NUP)">
                {contrato.processoNup ? (
                  <>
                    <NumeroSeiEtiqueta numero={contrato.processoNup} testId="fisc-contrato-processo-sei" />
                    <div style={carteiraDetalhe}>autuado em {dataBR(contrato.processoAutuadoEm)}</div>
                    {contrato.processoSei && <div style={carteiraDetalhe}>SEI do contrato {contrato.processoSei}</div>}
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
    </div>
  );
};
