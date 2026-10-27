import React, { useState } from 'react';
import { StatusBadge } from '../../../design-system/components/StatusBadge';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { InfoHint } from '../../../design-system/components/InfoHint';
import { AppButton } from '../../../design-system/components/AppButton';
import { NoticeBar } from '../../../design-system/components/NoticeBar';
import { ConfirmDialog } from '../../../design-system/components/ConfirmDialog';
import { useToast } from '../../../design-system/components/Toast';
import { carteiraDetalhe, carteiraNumero, carteiraSubtitle } from '../../carteira/carteiraStyles';
import { useApagarEmendaSiop } from '../../../hooks/useEmendas';
import { dataBR } from '../../../utils/emendasKits';
import { ROTULO_ETAPA } from '../../../utils/emendasPedidos';
import { NOME_ORGAO_ASPAR, numeroDaEmenda, orgaoDoBeneficiario, orgaosNaOrdem, ROTULO_MEIO, semPedido, type EmendaNaLista } from '../../../utils/emendasSemPedido';
import { formatarTelefone, nomeESigla, type AsparDoOrgao, type AutorEmenda, type BeneficiarioEmenda, type EmendaSiop, type OrgaoAspar, type PedidoEmenda } from '../../../services/emendasService';
import { ContatoDoResponsavel } from '../ContatoDoResponsavel';
import { ContatoEmendaModal } from '../ContatoEmendaModal';
import { AsparModal } from '../AsparModal';
import { nomeDoPedido } from '../../../utils/emendasNomeDoPedido';

/** Um contato (assessoria ou ASPAR) em cartão: nome, telefone e e-mail para copiar, e os ícones de WhatsApp e e-mail. */
export const CartaoDeContato: React.FC<{
  titulo: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  destaque?: string;
  vazio?: string;
  acao?: React.ReactNode;
  testId: string;
}> = ({ titulo, nome, telefone, email, destaque, vazio, acao, testId }) => (
  <div
    style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', padding: '0.5rem 0.65rem', borderRadius: 8, background: destaque ? 'var(--color-info-bg, #e3ecfa)' : 'var(--color-background, #f8fafc)' }}
    data-testid={testId}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
      <b style={{ fontSize: '0.85rem' }}>{titulo}</b>
      {destaque && <StatusBadge label={destaque} variant="info" size="sm" dot={false} />}
      <span style={{ flex: 1 }} />
      {acao}
    </div>
    {nome || telefone || email ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
        {nome && <span>{nome}</span>}
        {telefone && <span style={{ ...carteiraNumero, userSelect: 'all' }}>{formatarTelefone(telefone)}</span>}
        {email && <span style={{ userSelect: 'all' }}>{email}</span>}
        <ContatoDoResponsavel nome={nome ?? titulo} telefone={telefone} email={email} />
      </div>
    ) : (
      <span style={carteiraDetalhe}>{vazio ?? 'a cadastrar'}</span>
    )}
  </div>
);

interface DetalheProps {
  l: EmendaNaLista;
  autor: AutorEmenda | undefined;
  beneficiarios: Map<string, BeneficiarioEmenda>;
  aspar: Map<string, AsparDoOrgao>;
  contatoDoAutor: Pick<PedidoEmenda, 'contatoNome' | 'contatoTelefone' | 'contatoEmail'> | undefined;
  podeGerir: boolean;
  onCriarPedido: (e: EmendaSiop) => void;
  onAlterar: (e: EmendaSiop) => void;
  onAbrirPedido: (id: string) => void;
}

export const DetalheDaEmenda: React.FC<DetalheProps> = ({ l, autor, beneficiarios, aspar, contatoDoAutor, podeGerir, onCriarPedido, onAlterar, onAbrirPedido }) => {
  const toast = useToast();
  const apagar = useApagarEmendaSiop();
  const [registrando, setRegistrando] = useState(false);
  const [editandoAspar, setEditandoAspar] = useState<OrgaoAspar | null>(null);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const e = l.emenda;
  const beneficiario = e?.beneficiarioId ? beneficiarios.get(e.beneficiarioId) : undefined;
  // As ASPAR do estado do beneficiário indicado; sem ele, do estado do parlamentar ou da bancada.
  const uf = beneficiario?.entregaUf ?? autor?.uf ?? null;
  const doBeneficiario = orgaoDoBeneficiario(beneficiario);
  const orgaos = orgaosNaOrdem(doBeneficiario);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.4rem 0' }} data-testid={`emendas-emenda-detalhe-${l.chave}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={carteiraSubtitle}>
          {e?.objeto ? `Objeto no SIOP: ${e.objeto}` : e ? 'Sem objeto informado.' : 'Nº conferido no SIOP pelo pedido; a emenda não foi registrada.'}
          {beneficiario ? ` · Beneficiário: ${nomeESigla(beneficiario)}` : ''}
        </span>
        {e?.observacao && <InfoHint label="Ver a observação da emenda" content={e.observacao} testId={`emendas-emenda-observacao-${l.chave}`} />}
        <span style={{ flex: 1 }} />
        {podeGerir && e && semPedido(l) && (
          <AppButton size="sm" variant="outline" onClick={() => setRegistrando(true)} data-testid={`emendas-emenda-registrar-contato-${l.chave}`}>
            Registrar contato
          </AppButton>
        )}
        {podeGerir && e && (
          <AppButton size="sm" onClick={() => onCriarPedido(e)} data-testid={`emendas-emenda-criar-pedido-${l.chave}`}>
            {semPedido(l) ? 'Criar pedido com esta emenda' : 'Outro pedido com esta emenda'}
          </AppButton>
        )}
        {podeGerir && e && <ActionButton action="editar" size="sm" label="Alterar" onClick={() => onAlterar(e)} data-testid={`emendas-emenda-alterar-${l.chave}`} />}
        {podeGerir && e && semPedido(l) && (
          <ActionButton action="excluir" size="sm" label="Apagar" onClick={() => setConfirmarApagar(true)} data-testid={`emendas-emenda-apagar-${l.chave}`} />
        )}
      </div>

      {e && (
        <ConfirmDialog
          isOpen={confirmarApagar}
          title={`Apagar a emenda ${numeroDaEmenda(e.numero)}?`}
          message="Use só se ela foi registrada por engano. As conversas registradas vão junto."
          confirmLabel="Apagar"
          tone="danger"
          isLoading={apagar.isPending}
          onCancel={() => setConfirmarApagar(false)}
          onConfirm={async () => {
            try {
              await apagar.mutateAsync({ id: e.id, versao: e.versao });
              toast.success('Emenda apagada.');
              setConfirmarApagar(false);
            } catch (err) {
              toast.error((err as Error).message);
            }
          }}
        />
      )}

      {semPedido(l) ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '0.75rem' }}>
          {podeGerir ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
                <span style={carteiraDetalhe}>Assessoria do parlamentar</span>
                <CartaoDeContato
                  titulo={autor?.nome ?? 'Parlamentar'}
                  nome={contatoDoAutor?.contatoNome ?? null}
                  telefone={contatoDoAutor?.contatoTelefone ?? null}
                  email={contatoDoAutor?.contatoEmail ?? null}
                  vazio="sem contato nos pedidos anteriores"
                  testId={`emendas-emenda-assessoria-${l.chave}`}
                />
                <span style={carteiraDetalhe}>Do último pedido do parlamentar.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
                <span style={carteiraDetalhe}>ASPAR dos órgãos{uf ? ` · ${uf}` : ''}</span>
                {uf ? (
                  orgaos.map((o) => {
                    const a = aspar.get(`${uf}:${o}`);
                    return (
                      <CartaoDeContato
                        key={o}
                        titulo={`${NOME_ORGAO_ASPAR[o]} · ${o}`}
                        nome={a?.nome ?? null}
                        telefone={a?.telefone ?? null}
                        email={a?.email ?? null}
                        destaque={o === doBeneficiario && beneficiario ? 'beneficiário no SIOP' : undefined}
                        acao={
                          <AppButton size="xs" variant="link" onClick={() => setEditandoAspar(o)} data-testid={`emendas-emenda-aspar-${o}-${l.chave}`}>
                            {a ? 'alterar' : 'cadastrar'}
                          </AppButton>
                        }
                        testId={`emendas-emenda-aspar-cartao-${o}-${l.chave}`}
                      />
                    );
                  })
                ) : (
                  <span style={carteiraDetalhe}>Sem UF do parlamentar: informe o beneficiário na emenda para ver as ASPAR do estado.</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }} data-testid={`emendas-emenda-contatos-${l.chave}`}>
                <span style={carteiraDetalhe}>Contatos registrados</span>
                {l.contatos.length === 0 ? (
                  <NoticeBar tone={l.urgente ? 'danger' : 'warning'} testId={`emendas-emenda-sem-contato-${l.chave}`}>
                    Nenhum contato ainda. Fale com a assessoria ou com a ASPAR e registre aqui.
                  </NoticeBar>
                ) : (
                  <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {l.contatos.map((c) => (
                      <li key={c.id} style={{ fontSize: '0.85rem' }}>
                        <b>{dataBR(c.contatoEm)}</b> · {c.comQuem} · {ROTULO_MEIO[c.meio]}
                        <div>{c.resumo}</div>
                        {c.criadoPorNome && <div style={carteiraDetalhe}>registrado por {c.criadoPorNome}</div>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          ) : (
            <span style={carteiraDetalhe}>Os contatos ficam com a CAEP e o coordenador.</span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }} data-testid={`emendas-emenda-pedidos-${l.chave}`}>
          <span style={carteiraDetalhe}>{l.pedidos.length === 1 ? 'Pedido da emenda' : `${l.pedidos.length} pedidos da emenda`}</span>
          {l.pedidos.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <AppButton size="xs" variant="link" onClick={() => onAbrirPedido(p.id)} data-testid={`emendas-emenda-abrir-pedido-${p.id}`}>
                {nomeDoPedido(p)}
                {p.oficioProcessoSei ? ` · Processo ${p.oficioProcessoSei}` : ''}
              </AppButton>
              <StatusBadge label={ROTULO_ETAPA[p.etapa]} variant="info" size="sm" dot={false} />
            </div>
          ))}
        </div>
      )}

      {registrando && e && <ContatoEmendaModal emenda={e} nomeDoAutor={autor?.nome ?? ''} uf={uf} orgaos={orgaos} onClose={() => setRegistrando(false)} />}
      {editandoAspar && uf && <AsparModal uf={uf} orgao={editandoAspar} atual={aspar.get(`${uf}:${editandoAspar}`) ?? null} onClose={() => setEditandoAspar(null)} />}
    </div>
  );
};
