import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { NoticeBar } from '../../design-system/components/NoticeBar';
import { ConfirmDialog } from '../../design-system/components/ConfirmDialog';
import { useToast } from '../../design-system/components/Toast';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { carteiraDetalhe, carteiraIdentificacao, carteiraNumero, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { useApagarEmendaSiop, useAsparDosOrgaos, useContatosDasEmendas, useEmendasSiop } from '../../hooks/useEmendas';
import { formatCurrency } from '../../utils/format';
import { dataBR } from '../../utils/emendasKits';
import { casaBusca } from '../../utils/emendasBeneficiarios';
import { ROTULO_ETAPA, ultimoContatoPorAutor } from '../../utils/emendasPedidos';
import {
  diasSemContatoParaUrgente,
  emendasNaLista,
  NOME_ORGAO_ASPAR,
  numeroDaEmenda,
  orgaoDoBeneficiario,
  orgaosNaOrdem,
  ROTULO_MEIO,
  ROTULO_SITUACAO_EMENDA,
  semPedido,
  type EmendaNaLista
} from '../../utils/emendasSemPedido';
import { formatarTelefone, nomeESigla, type AsparDoOrgao, type AutorEmenda, type BeneficiarioEmenda, type EmendaSiop, type OrgaoAspar, type PedidoEmenda } from '../../services/emendasService';
import { AutorDoPedido } from './emendasPartes';
import { ContatoDoResponsavel } from './ContatoDoResponsavel';
import { ContatoEmendaModal } from './ContatoEmendaModal';
import { AsparModal } from './AsparModal';

type Segmento = 'sem' | 'com' | 'todas';
const POR_PAGINA = 25;
const chave = (l: EmendaNaLista) => l.chave;

const VARIANTE: Record<EmendaNaLista['situacao'], StatusBadgeVariant> = { SEM_CONTATO: 'warning', EM_CONVERSA: 'warning', COM_PEDIDO: 'success' };
const PESO_SITUACAO: Record<EmendaNaLista['situacao'], number> = { SEM_CONTATO: 2, EM_CONVERSA: 1, COM_PEDIDO: 0 };

// Ordenação pelo cabeçalho, como nas carteiras (?ordem=); sem escolha, fica a ordem da lista (urgentes primeiro).
const ORDEM: Record<string, CarteiraSortColumn<EmendaNaLista>> = {
  emenda: { value: (l) => `${l.ano ?? 0}${l.numero}`, firstDir: 'desc' },
  valor: { value: (l) => l.valor, firstDir: 'desc' },
  contato: { value: (l) => l.contatos.at(-1)?.contatoEm ?? null },
  situacao: { value: (l) => PESO_SITUACAO[l.situacao] + (l.urgente ? 10 : 0), firstDir: 'desc' }
};

/** Um contato (assessoria ou ASPAR) em cartão: nome, telefone e e-mail para copiar, e os ícones de WhatsApp e e-mail. */
const CartaoDeContato: React.FC<{
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

const DetalheDaEmenda: React.FC<DetalheProps> = ({ l, autor, beneficiarios, aspar, contatoDoAutor, podeGerir, onCriarPedido, onAlterar, onAbrirPedido }) => {
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
          {e?.observacao ? ` · ${e.observacao}` : ''}
        </span>
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
                {p.oficioProcessoSei ? `Processo ${p.oficioProcessoSei}` : `Reserva de ${dataBR(p.reservadoEm)}`}
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

interface Props {
  pedidos: PedidoEmenda[];
  autores: AutorEmenda[];
  beneficiarios: BeneficiarioEmenda[];
  podeGerir: boolean;
  hoje: string;
  carregandoPedidos: boolean;
  erroPedidos: boolean;
  onRetry: () => void;
  onCriarPedido: (e: EmendaSiop) => void;
  onAlterar: (e: EmendaSiop) => void;
  onAbrirPedido: (id: string) => void;
}

/**
 * Pedidos › Ver: Por emenda (migration 205). Uma linha por emenda: as registradas pela CAEP no SIOP, com ou sem pedido,
 * e os números que só existem nos pedidos. A emenda sem pedido abre os contatos (assessoria do parlamentar e ASPAR dos
 * órgãos do estado), as conversas registradas e o botão que cria o pedido já com a emenda.
 */
export const PedidosPorEmenda: React.FC<Props> = ({ pedidos, autores, beneficiarios, podeGerir, hoje, carregandoPedidos, erroPedidos, onRetry, onCriarPedido, onAlterar, onAbrirPedido }) => {
  const emendas = useEmendasSiop();
  const contatos = useContatosDasEmendas();
  const asparQ = useAsparDosOrgaos();
  // Abre em Todas, como as outras telas; os avisos de emenda sem pedido levam direto a ?situacao=sem.
  const [searchParams, setSearchParams] = useSearchParams();
  const daUrl = searchParams.get('situacao');
  const segmento: Segmento = daUrl === 'sem' || daUrl === 'com' ? daUrl : 'todas';
  const setSegmento = (s: Segmento) =>
    setSearchParams((atual) => {
      const prox = new URLSearchParams(atual);
      if (s === 'todas') prox.delete('situacao');
      else prox.set('situacao', s);
      return prox;
    });
  const [busca, setBusca] = useState('');
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());

  const autorPorId = useMemo(() => new Map(autores.map((a) => [a.id, a])), [autores]);
  const benefPorId = useMemo(() => new Map(beneficiarios.map((b) => [b.id, b])), [beneficiarios]);
  const aspar = useMemo(() => new Map((asparQ.data ?? []).map((a) => [`${a.uf}:${a.orgao}`, a])), [asparQ.data]);
  const contatoDoAutor = useMemo(() => ultimoContatoPorAutor(pedidos), [pedidos]);
  const lista = useMemo(() => emendasNaLista(emendas.data ?? [], pedidos, contatos.data ?? [], hoje), [emendas.data, pedidos, contatos.data, hoje]);

  const conta = { sem: lista.filter(semPedido).length, com: lista.filter((l) => !semPedido(l)).length, todas: lista.length };
  const doSegmento = lista.filter((l) => segmento === 'todas' || (segmento === 'sem') === semPedido(l));
  const termo = busca.trim();
  const filtradas = termo
    ? doSegmento.filter((l) => {
        const a = l.autorId ? autorPorId.get(l.autorId) : undefined;
        return casaBusca(`${l.numero} ${numeroDaEmenda(l.numero)} ${a?.nome ?? ''} ${a?.uf ?? ''} ${l.emenda?.objeto ?? ''}`, termo);
      })
    : doSegmento;
  const ordem = useMemo<Record<string, CarteiraSortColumn<EmendaNaLista>>>(
    () => ({ ...ORDEM, autor: { value: (l) => (l.autorId ? autorPorId.get(l.autorId)?.nome ?? l.autorId : null) } }),
    [autorPorId]
  );
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ordem);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chave, POR_PAGINA);
  const limite = diasSemContatoParaUrgente();

  const colunas: Column<EmendaNaLista>[] = [
    {
      key: 'emenda',
      header: 'Emenda',
      priority: 'primary',
      nowrap: true,
      sortValue: ordem.emenda.value,
      sortFirstDir: 'desc',
      render: (l) => (
        <>
          <div style={carteiraIdentificacao}>{numeroDaEmenda(l.numero)}</div>
          <div style={{ ...carteiraSubtitle, marginTop: '0.15rem' }}>{l.ano ?? 'ano não informado'}</div>
        </>
      )
    },
    { key: 'autor', header: 'Parlamentar', minWidth: '200px', sortValue: ordem.autor.value, render: (l) => <AutorDoPedido autor={l.autorId ? autorPorId.get(l.autorId) : undefined} autorId={l.autorId} /> },
    {
      key: 'valor',
      header: 'Valor no SIOP',
      align: 'right',
      nowrap: true,
      sortValue: ordem.valor.value,
      sortFirstDir: 'desc',
      render: (l) => (l.valor != null ? <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(l.valor)}</span> : <span style={carteiraDetalhe}>—</span>)
    },
    { key: 'gnd', header: 'GND', nowrap: true, render: (l) => <span style={carteiraValor}>{l.gnd ?? '—'}</span> },
    // Com pedido, o que interessa é a etapa dos pedidos; o último contato só vale enquanto não há pedido.
    ...(podeGerir && segmento !== 'com'
      ? [
          {
            key: 'contato',
            header: 'Último contato',
            sortValue: ordem.contato.value,
            render: (l: EmendaNaLista) => {
              const u = l.contatos.at(-1);
              if (!semPedido(l)) return <span style={carteiraDetalhe}>—</span>;
              return u ? (
                <>
                  <div style={carteiraValor}>{dataBR(u.contatoEm)}</div>
                  <div style={carteiraDetalhe}>{u.comQuem}</div>
                </>
              ) : (
                <span style={carteiraDetalhe}>nenhum</span>
              );
            }
          } satisfies Column<EmendaNaLista>
        ]
      : []),
    ...(segmento !== 'sem'
      ? [
          {
            key: 'pedidos',
            header: 'Pedidos',
            render: (l: EmendaNaLista) => {
              if (l.pedidos.length === 0) return <span style={carteiraDetalhe}>—</span>;
              const etapas = l.pedidos.slice(0, 2).map((p) => `Pedido ${p.numero} · ${ROTULO_ETAPA[p.etapa]}`);
              return (
                <>
                  {etapas.map((t) => (
                    <div key={t} style={carteiraValor}>
                      {t}
                    </div>
                  ))}
                  {l.pedidos.length > 2 && <div style={carteiraDetalhe}>+{l.pedidos.length - 2} {l.pedidos.length - 2 === 1 ? 'pedido' : 'pedidos'}</div>}
                </>
              );
            }
          } satisfies Column<EmendaNaLista>
        ]
      : []),
    {
      key: 'situacao',
      header: 'Situação',
      nowrap: true,
      sortValue: ordem.situacao.value,
      sortFirstDir: 'desc',
      render: (l) => (
        <span title={l.urgente ? `${l.diasSemContato} dias sem contato registrado (urgente a partir de ${limite})` : undefined} data-testid={`emendas-emenda-situacao-${l.chave}`}>
          <StatusBadge
            label={l.situacao === 'COM_PEDIDO' ? (l.pedidos.length > 1 ? `${l.pedidos.length} pedidos` : ROTULO_SITUACAO_EMENDA.COM_PEDIDO) : ROTULO_SITUACAO_EMENDA[l.situacao]}
            variant={l.urgente ? 'danger' : VARIANTE[l.situacao]}
            size="sm"
            dot={false}
          />
          {l.urgente && <div style={{ ...carteiraDetalhe, color: 'var(--color-danger-text)' }}>{l.diasSemContato} dias sem contato</div>}
        </span>
      )
    }
  ];

  const carregando = carregandoPedidos || emendas.isLoading;
  return (
    <>
      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-por-emenda-situacao"
        ariaLabel="Situação das emendas"
        active={segmento}
        onSelect={(s) => {
          setSegmento(s);
          setAbertas(new Set());
        }}
        segments={[
          { id: 'sem', label: 'Sem pedido', count: conta.sem },
          { id: 'com', label: 'Com pedido', count: conta.com },
          { id: 'todas', label: 'Todas', count: conta.todas }
        ]}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pelo nº, parlamentar, UF ou objeto..."
        onChangeBusca={setBusca}
        hasActiveFilters={Boolean(termo)}
        onResetFilters={() => setBusca('')}
        counter={carteiraCounter(filtradas.length, doSegmento.length, Boolean(termo), 'emenda', 'emendas')}
        testIdPrefix="emendas-por-emenda"
      />
      <AdminListShell
        testId="emendas-por-emenda-lista"
        isLoading={carregando}
        isError={erroPedidos || emendas.isError}
        errorTitle="Não foi possível carregar as emendas"
        errorMessage={(emendas.error as Error | null)?.message || 'Falha ao consultar as emendas.'}
        onRetry={() => {
          onRetry();
          void emendas.refetch();
        }}
        isEmpty={!carregando && filtradas.length === 0}
        emptyTitle={segmento === 'sem' && !termo ? 'Nenhuma emenda sem pedido.' : 'Nenhuma emenda encontrada.'}
        emptyDescription={
          segmento === 'sem' && !termo
            ? podeGerir
              ? 'Quando vir no SIOP uma emenda que ainda não chegou à CAEP, use "Registrar emenda do SIOP".'
              : 'A CAEP registra as emendas que vê no SIOP antes do pedido.'
            : 'Ajuste a busca ou escolha outra situação.'
        }
      >
        <DataTable<EmendaNaLista>
          testId="emendas-por-emenda-tabela"
          className="data-table-container--flush"
          data={pageItems}
          keyExtractor={chave}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          expandedKeys={abertas}
          onToggleExpand={(id) =>
            setAbertas((atual) => {
              const prox = new Set(atual);
              if (prox.has(id)) prox.delete(id);
              else prox.add(id);
              return prox;
            })
          }
          columns={colunas}
          renderExpanded={(l) => (
            <DetalheDaEmenda
              l={l}
              autor={l.autorId ? autorPorId.get(l.autorId) : undefined}
              beneficiarios={benefPorId}
              aspar={aspar}
              contatoDoAutor={l.autorId ? contatoDoAutor.get(l.autorId) : undefined}
              podeGerir={podeGerir}
              onCriarPedido={onCriarPedido}
              onAlterar={onAlterar}
              onAbrirPedido={onAbrirPedido}
            />
          )}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={filtradas.length} onChange={setPage} testIdPrefix="emendas-por-emenda" />
      </AdminListShell>
    </>
  );
};
