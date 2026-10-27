import React from 'react';
import { AppButton, AppInput, AppSelect } from '../../design-system';
import { useCadastroUasgs } from '../../hooks/useCadastroUasgs';
import { useUasgsDaUf } from '../../hooks/useUasgsDaUf';
import { fetchNomeUasg } from '../../services/api';
import { localDaUasg } from '../../services/cadastroUasgsSyncService';
import { casaBusca, UFS } from '../../utils/emendasBeneficiarios';
import { formatNumber } from './itemBalanceUtils';

export type BuscaDoNome = 'vazia' | 'buscando' | 'achou' | 'nao-encontrada' | 'falhou';

export interface DestinoEscolhido {
  uasg: string;
  /** Nome do Compras.gov.br (vazio quando não veio: o gestor escreve). */
  nome: string;
  local: string | null;
  busca: BuscaDoNome;
}

export const DESTINO_VAZIO: DestinoEscolhido = { uasg: '', nome: '', local: null, busca: 'vazia' };

interface Props {
  destino: DestinoEscolhido;
  onMudar: (d: DestinoEscolhido) => void;
  uasgOrigem: string;
  /** UASGs do item (gerenciadora e participantes): aparecem riscadas e não podem ser escolhidas. */
  participantes: Set<string>;
  /** UF da busca ao abrir (a do órgão que cede, quando o cadastro tem). */
  ufInicial: string | null;
  /** Linha extra no cartão do órgão escolhido (ex.: adesões que ele já tem). */
  avisoDoEscolhido?: string | null;
}

const ORDEM_UFS = [...UFS].sort();
const MAXIMO_NA_LISTA = 30;
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 };
const grupo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '0.35rem 0.75rem', background: 'var(--surface)' };

/**
 * Órgão de destino pelo nome ou pelos 6 números da UASG. O Compras.gov.br não busca por nome: a lista vem da UF
 * inteira (useUasgsDaUf) e o filtro é feito aqui, por palavras, sem acento.
 */
export const EscolherOrgaoDestino: React.FC<Props> = ({ destino, onMudar, uasgOrigem, participantes, ufInicial, avisoDoEscolhido }) => {
  const [texto, setTexto] = React.useState('');
  const [ufEscolhida, setUf] = React.useState('');
  const uf = ufEscolhida || ufInicial || '';
  const porCodigo = /^\d+$/.test(texto.trim());
  const procurandoNome = !porCodigo && texto.trim().length >= 3;
  const daUf = useUasgsDaUf(procurandoNome ? uf : '');
  const cadastro = useCadastroUasgs(/^\d{6}$/.test(destino.uasg) ? [destino.uasg] : []).get(destino.uasg);
  // A UASG digitada por último: a busca de uma UASG antiga não sobrescreve a atual.
  const ultimaUasg = React.useRef('');

  const motivoDeFora = (uasg: string) => (uasg === uasgOrigem ? 'órgão que cede' : participantes.has(uasg) ? 'participante do item' : null);

  const digitar = (valor: string) => {
    setTexto(valor);
    const so = valor.trim();
    if (!/^\d+$/.test(so)) {
      ultimaUasg.current = '';
      if (destino.uasg) onMudar(DESTINO_VAZIO);
      return;
    }
    const u = so.slice(0, 6);
    ultimaUasg.current = u;
    if (u.length !== 6 || motivoDeFora(u)) return onMudar({ ...DESTINO_VAZIO, uasg: u });
    onMudar({ uasg: u, nome: '', local: null, busca: 'buscando' });
    void fetchNomeUasg(u).then((r) => {
      if (ultimaUasg.current !== u) return;
      onMudar(r.situacao === 'achou' ? { uasg: u, nome: r.nome, local: r.uf, busca: 'achou' } : { uasg: u, nome: '', local: null, busca: r.situacao });
    });
  };

  const escolher = (uasg: string, nome: string, local: string | null) => {
    if (motivoDeFora(uasg)) return;
    ultimaUasg.current = '';
    // O nome como o Compras.gov.br escreve, igual aos outros órgãos da tabela.
    onMudar({ uasg, nome, local, busca: 'achou' });
  };

  const trocar = () => {
    setTexto('');
    onMudar(DESTINO_VAZIO);
  };

  const escolhido = destino.busca === 'achou' && /^\d{6}$/.test(destino.uasg);
  if (escolhido) {
    const local = cadastro ? localDaUasg(cadastro) : destino.local;
    return (
      <div style={{ border: '1px solid var(--primary)', background: 'var(--primary-light)', borderRadius: 8, padding: '0.55rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }} data-testid="remanejar-np-orgao">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <b>{cadastro?.nome ?? destino.nome}</b>
          <span style={pequeno}>UASG {destino.uasg}{local ? ` · ${local}` : ''} · Compras.gov.br</span>
          {avisoDoEscolhido && <span style={{ ...pequeno, color: 'var(--color-warning-text)' }}>{avisoDoEscolhido}</span>}
        </div>
        <AppButton variant="link" size="sm" onClick={trocar} data-testid="remanejar-np-trocar">Trocar</AppButton>
      </div>
    );
  }

  const achados = procurandoNome && daUf.data ? daUf.data.filter((u) => casaBusca(`${u.nome} ${u.municipio ?? ''}`, texto)) : [];

  const linha = (uasg: string, nome: string, detalhe: string | null, local: string | null) => {
    const fora = motivoDeFora(uasg);
    return (
      <div
        key={uasg}
        role="option"
        aria-selected={false}
        aria-disabled={fora ? true : undefined}
        tabIndex={fora ? -1 : 0}
        onClick={() => escolher(uasg, nome, local)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(uasg, nome, local); } }}
        data-testid={`remanejar-np-opcao-${uasg}`}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 0.75rem', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)', cursor: fora ? 'not-allowed' : 'pointer', opacity: fora ? 0.55 : 1 }}
        className="remanejar-np-opcao"
      >
        <span style={{ minWidth: 0 }}>
          <b style={{ fontWeight: 600, textDecoration: fora ? 'line-through' : undefined }}>{nome}</b>
          <span style={{ ...pequeno, display: 'block' }}>{[local, detalhe, fora].filter(Boolean).join(' · ')}</span>
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{uasg}</span>
      </div>
    );
  };

  const localDaLista = (municipio: string | null, siglaUf: string) => localDaUasg({ municipio, siglaUf });
  const situacao =
    porCodigo ? (destino.uasg.length === 6 && motivoDeFora(destino.uasg) ? `Esta UASG é ${motivoDeFora(destino.uasg)}. Escolha outro órgão.` : destino.busca === 'buscando' ? 'Buscando o nome no Compras.gov.br…' : null)
    : !texto.trim() ? null
    : texto.trim().length < 3 ? 'Escreva pelo menos 3 letras do nome.'
    : !uf ? 'Escolha a UF para procurar pelo nome.'
    : daUf.isLoading ? `Lendo as UASGs de ${uf} no Compras.gov.br…`
    : daUf.isError ? (daUf.error as Error)?.message ?? 'O Compras.gov.br não respondeu agora.'
    : daUf.data ? `${formatNumber(daUf.data.length)} UASGs ativas de ${uf} · ${formatNumber(achados.length)} com “${texto.trim()}”`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 }} htmlFor="remanejar-np-busca">
        Órgão de destino
        <span style={pequeno}>Nome do órgão ou os 6 números da UASG</span>
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <AppInput id="remanejar-np-busca" type="search" autoComplete="off" value={texto} placeholder="Ex.: penitenciária de Guarulhos" onChange={(e) => digitar(e.target.value)} style={{ width: '100%' }} data-testid="remanejar-np-uasg" />
        </div>
        <AppSelect value={uf} onChange={(e) => setUf(e.target.value)} aria-label="UF do órgão" style={{ width: 90 }} data-testid="remanejar-np-uf">
          <option value="">UF</option>
          {ORDEM_UFS.map((s) => <option key={s} value={s}>{s}</option>)}
        </AppSelect>
        {daUf.isError && <AppButton variant="secondary" size="sm" onClick={() => void daUf.refetch()}>Tentar de novo</AppButton>}
      </div>
      {situacao && <span style={pequeno} aria-live="polite" data-testid="remanejar-np-situacao-busca">{situacao}</span>}
      {(achados.length > 0 || (porCodigo && destino.uasg.length === 6 && motivoDeFora(destino.uasg))) && (
        <div role="listbox" aria-label="Órgãos encontrados" style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 280, overflowY: 'auto' }} data-testid="remanejar-np-lista">
          {achados.length > 0 && (
            <>
              <div style={grupo}>Compras.gov.br · {uf}</div>
              {achados.slice(0, MAXIMO_NA_LISTA).map((u) => linha(u.uasg, u.nome, null, localDaLista(u.municipio, u.uf)))}
              {achados.length > MAXIMO_NA_LISTA && <div style={{ ...pequeno, padding: '0.5rem 0.75rem' }}>Mostrando {MAXIMO_NA_LISTA} de {formatNumber(achados.length)}. Escreva mais uma palavra para afinar.</div>}
            </>
          )}
          {porCodigo && destino.uasg.length === 6 && motivoDeFora(destino.uasg) && linha(destino.uasg, cadastro?.nome ?? `UASG ${destino.uasg}`, null, null)}
        </div>
      )}
      {procurandoNome && uf && daUf.data && achados.length === 0 && (
        <span style={pequeno}>Nenhum órgão ativo com esse nome em {uf}. Confira a UF ou procure pelos 6 números da UASG.</span>
      )}
    </div>
  );
};
