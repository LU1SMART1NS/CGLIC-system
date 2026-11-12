import React, { useState } from 'react';
import { useItensDaAtaDoContrato } from '../../hooks/useFiscalizacao';
import { MapPin } from 'lucide-react';
import { enderecoDeEntrega } from '../../utils/fiscalizacaoResumo';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { carteiraDetalhe, carteiraIdentificacao, carteiraValor } from '../carteira/carteiraStyles';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { useAuth } from '../../context/AuthContext';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC, dataBR, rotaDoContrato } from '../../utils/fiscalizacao';
import { ataEItemDaChave, nomeDoItem, rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { IdentificacaoDoContrato } from './ContratosFiscalizacaoTabela';
import { CarteiraIdLink } from '../carteira/CarteiraRowLink';
import { buildAtaItemPath } from '../../hooks/useAta';
import { CelulaPrazo, HistoricoDaEntrega } from './EntregasTabela';
import { CorrigirEtapaModal, DividirEntregaModal, PrevistaModal, ResponsavelModal } from './EntregasModais';
import { AvancarEtapaModal, VoltarEtapaItemModal } from './EtapaModais';
import { RowActionsMenu } from '../../design-system/components/RowActionsMenu';
import { proximasEtapas, rotuloDoAvanco } from '../../utils/fiscalizacaoPassos';
import { ReguaDoItem } from './ReguaDoItem';
import { LigarItemDaAtaModal } from './LigarItemDaAtaModal';
import { LigarBeneficiarioModal } from './LigarBeneficiarioModal';

type Acao = 'avancar' | 'voltar' | 'corrigir' | 'parcial' | 'prevista' | 'responsavel';

const Campo: React.FC<{ rotulo: string; largo?: boolean; children: React.ReactNode }> = ({ rotulo, largo, children }) => (
  <div style={{ minWidth: 0, gridColumn: largo ? '1 / -1' : undefined }}>
    <CarteiraDetailLabel>{rotulo}</CarteiraDetailLabel>
    <div style={{ marginTop: '0.2rem' }}>{children}</div>
  </div>
);

/**
 * Janela do item (contrato × item × beneficiário): a mesma em toda lista da Fiscalização (Programa 360, Beneficiário
 * 360, aba Itens e Contrato 360). Mostra onde o item está, o histórico e as ações, sem tirar o usuário da tela; o
 * contrato abre pelo link. Não é uma tela 360: o item é uma linha do contrato, não tem abas próprias.
 */
export const JanelaDoItem: React.FC<{ e: EntregaFiscalizacao; onClose: () => void; noContrato?: boolean; noItem?: boolean }> = ({ e, onClose, noContrato, noItem }) => {
  const { user, role } = useAuth();
  const navigate = useNavigateWithOrigin();
  const [acao, setAcao] = useState<Acao | null>(null);
  const [ligando, setLigando] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const podeAgir = role === 'admin' || (role === 'gestor_fiscalizacao' && e.fiscalUserId === user?.id);
  const b = rotuloDoBeneficiario(e);
  const endereco = enderecoDeEntrega(e);
  const area = e.responsavel === 'AREA';
  const avanco = rotuloDoAvanco(proximasEtapas(e));
  const k = ataEItemDaChave(e.itemKey);
  // O link só aparece quando o contrato já tem item da ata para escolher (sem ata, a mesa aponta para a Vinculação).
  const itensDaAta = useItensDaAtaDoContrato(podeAgir && !e.itemKey ? e.contractKey : null);
  const podeLigar = podeAgir && !e.itemKey && (itensDaAta.data?.length ?? 0) > 0;
  const fechar = () => { setAcao(null); onClose(); };
  if (cadastrando) return <LigarBeneficiarioModal foco={e.id} onClose={fechar} />;
  if (ligando) return <LigarItemDaAtaModal contractKey={e.contractKey} contratoNumero={e.contratoNumero} foco={e.id} onClose={fechar} />;
  if (acao === 'avancar') return <AvancarEtapaModal entregas={[e]} onClose={fechar} />;
  if (acao === 'voltar') return <VoltarEtapaItemModal entrega={e} onClose={fechar} />;
  if (acao === 'corrigir') return <CorrigirEtapaModal entregas={[e]} onClose={fechar} />;
  if (acao === 'parcial') return <DividirEntregaModal entrega={e} onClose={fechar} />;
  if (acao === 'prevista') return <PrevistaModal entregas={[e]} onClose={fechar} />;
  if (acao === 'responsavel') return <ResponsavelModal entregas={[e]} onClose={fechar} />;
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`${e.quantidade.toLocaleString('pt-BR')}× ${nomeDoItem(e)}`}
      subtitle={`para ${e.beneficiarioNome ?? b.principal}${e.beneficiarioSigla ? ` · ${e.beneficiarioSigla}` : ''}${e.municipio ? ` · ${e.municipio}/${e.uf}` : ''}`}
      testId="fisc-janela-item"
      footer={
        podeAgir ? (
          <>
            {!area && (
              <RowActionsMenu
                label="Mais ações do item"
                testId="fisc-janela-mais"
                actions={[
                  { label: 'Voltar etapa', onClick: () => setAcao('voltar') },
                  ...(role === 'admin' ? [{ label: 'Corrigir a etapa', onClick: () => setAcao('corrigir') }] : [])
                ]}
              />
            )}
            <span style={{ flex: 1 }} />
            {!area && <AppButton variant="outline" size="sm" disabled={e.quantidade < 2} onClick={() => setAcao('parcial')} data-testid="fisc-janela-parcial">Entrega parcial</AppButton>}
            {!area && <AppButton variant="outline" size="sm" onClick={() => setAcao('prevista')} data-testid="fisc-janela-prevista">Data prevista</AppButton>}
            {e.fiscalizacao === 'MISTA' && <AppButton variant="outline" size="sm" onClick={() => setAcao('responsavel')} data-testid="fisc-janela-responsavel">Quem fiscaliza</AppButton>}
            {!area && avanco && <AppButton variant="primary" size="sm" onClick={() => setAcao('avancar')} data-testid="fisc-janela-avancar">{avanco}</AppButton>}
          </>
        ) : (
          <ActionButton action="fechar" size="sm" onClick={onClose} />
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ fontSize: '0.85rem' }}><ReguaDoItem e={e} testId="fisc-janela-regua" /></div>
          {!area && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem 1rem', alignItems: 'baseline' }}>
              <span style={{ ...carteiraDetalhe, marginTop: 0 }}>{e.etapaEm ? `nesta etapa desde ${dataBR(e.etapaEm)}` : ''}</span>
              <span style={{ marginLeft: 'auto', textAlign: 'right' }}><CelulaPrazo e={e} /></span>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '0.75rem 1rem' }}>
          <Campo rotulo="Contrato">
            <IdentificacaoDoContrato
              numero={e.contratoNumero}
              fornecedor={e.fornecedor}
              onAbrir={noContrato ? undefined : () => { onClose(); navigate(rotaDoContrato(e)); }}
              testId="fisc-janela-contrato"
            />
          </Campo>
          <Campo rotulo="Item da ata">
            {k ? (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {e.itemKey && !noItem ? (
                    <CarteiraIdLink onClick={() => { onClose(); navigate(`${buildAtaItemPath(k.ata, k.uasg, k.item)}?aba=emendas`); }} label={`Abrir o item ${k.item} da ata ${k.ata}`} testId="fisc-janela-item-ata">
                      {k.item}
                    </CarteiraIdLink>
                  ) : (
                    <span style={carteiraIdentificacao}>{k.item}</span>
                  )}
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>· Ata {k.ata}</span>
                </span>
                {e.itemDescricao && <div style={carteiraDetalhe} title={e.itemDescricao}>{e.itemDescricao.length > 60 ? `${e.itemDescricao.slice(0, 60)}…` : e.itemDescricao}</div>}
              </>
            ) : (
              <>
                <span style={carteiraDetalhe}>da planilha · sem item da ata</span>
                {podeLigar && (
                  <div>
                    <AppButton size="xs" variant="link" onClick={() => setLigando(true)} data-testid="fisc-janela-ligar">Ligar ao item da ata</AppButton>
                  </div>
                )}
              </>
            )}
          </Campo>
          <Campo rotulo="Origem">
            <span style={carteiraValor}>{e.emenda ? `Emenda ${e.emenda}` : e.programaTexto ?? 'Sem emenda'}</span>
            {e.emenda && e.programaTexto && <div style={carteiraDetalhe}>{e.programaTexto}</div>}
            {e.origem === 'CARGA' && <div style={carteiraDetalhe}>da planilha da {NOME_SFC}</div>}
          </Campo>
          <Campo rotulo="Fiscal">
            <span style={carteiraValor}>{area ? 'Área requisitante' : e.fiscalNome ?? '—'}</span>
            {!area && <div style={carteiraDetalhe}>{NOME_SFC}</div>}
          </Campo>
          <Campo rotulo="Endereço de entrega" largo>
            {e.beneficiarioId ? (
              <div data-testid="fisc-janela-endereco">
                <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600 }}>
                  <MapPin size={13} aria-hidden="true" /> {endereco.rua ?? endereco.detalhe}
                </span>
                <div style={carteiraDetalhe}>{endereco.rua ? `${endereco.detalhe} · ` : ''}do cadastro do beneficiário</div>
              </div>
            ) : (
              <div>
                <span style={carteiraDetalhe}>beneficiário escrito na planilha, sem cadastro: o endereço vem do cadastro</span>
                {podeAgir && e.beneficiarioTexto && (
                  <div>
                    <AppButton size="xs" variant="link" onClick={() => setCadastrando(true)} data-testid="fisc-janela-cadastro">Ligar ao cadastro</AppButton>
                  </div>
                )}
              </div>
            )}
          </Campo>
        </div>
        <div>
          <CarteiraDetailLabel>Histórico</CarteiraDetailLabel>
          <div style={{ marginTop: '0.35rem' }}><HistoricoDaEntrega entregaId={e.id} /></div>
        </div>
      </div>
    </Modal>
  );
};
