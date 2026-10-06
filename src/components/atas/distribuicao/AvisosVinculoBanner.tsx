import React from 'react';
import { Check, Info } from 'lucide-react';
import { carteiraButton } from '../../carteira/carteiraStyles';
import { useAvisosDistribuicao, useMarcarAvisosLidos } from '../../../hooks/useAvisosDistribuicao';
import { useToast } from '../../../design-system/components/Toast';
import type { DistribuicaoAviso } from '../../../services/distribuicaoAvisosService';
import { formatDateBR } from '../../../utils/format';

const MOSTRAR = 5;

/** Contrato "200331-00160-2026" → "00160/2026" (o número que o usuário conhece). */
const numeroDoContrato = (key?: string) => {
  const m = key?.match(/^\d{6}-(.+)-(\d{4})$/);
  return m ? `${m[1]}/${m[2]}` : key || '';
};

/** Uma frase por aviso, em linguagem do coordenador. */
export function textoAviso(a: DistribuicaoAviso): string {
  const quem = a.feitoPorNome ? `${a.feitoPorNome} vinculou` : 'Foi vinculado';
  if (a.tipo === 'ATA_ASSUMIU_GESTOR') {
    return `${quem} o contrato ${numeroDoContrato(a.contractKey)} à ata ${a.ataKey}, que estava sem gestor: a ata passou a ser de ${a.gestorNovo}, gestor do contrato.`;
  }
  return `${quem} o contrato ${numeroDoContrato(a.contractKey)} à ata ${a.ataKey}: o contrato passou de ${a.gestorAnterior ?? 'sem gestor'} para ${a.gestorNovo}, gestor da ata.`;
}

/**
 * Avisa o coordenador dos vínculos que mudaram o gestor de uma ata ou contrato. Não bloqueia nada: o servidor já vinculou;
 * se o resultado não for o desejado, o coordenador corrige em "Gestor diferente da ata" ou atribuindo a ata de novo.
 */
export const AvisosVinculoBanner: React.FC<{ podeVer: boolean }> = ({ podeVer }) => {
  const { data: avisos = [] } = useAvisosDistribuicao(podeVer);
  const marcar = useMarcarAvisosLidos();
  const toast = useToast();
  const [todos, setTodos] = React.useState(false);

  if (!podeVer || avisos.length === 0) return null;
  const mostrados = todos ? avisos : avisos.slice(0, MOSTRAR);

  return (
    <section
      role="status"
      data-testid="distribuicao-avisos-vinculo"
      style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem 0.9rem', color: '#1e3a8a', fontSize: '0.82rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Info size={15} aria-hidden="true" />
        <strong>
          {avisos.length === 1 ? '1 vínculo mudou o gestor' : `${avisos.length} vínculos mudaram o gestor`} desde a última leitura
        </strong>
        <button
          type="button"
          onClick={() =>
            marcar.mutate(undefined, { onError: (err: any) => toast.error(`Não foi possível marcar como lido: ${err?.message || 'erro desconhecido'}`) })
          }
          disabled={marcar.isPending}
          data-testid="distribuicao-avisos-lidos"
          style={{ ...carteiraButton, marginLeft: 'auto' }}
        >
          <Check size={13} /> Marcar como lido
        </button>
      </div>
      <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {mostrados.map((a) => (
          <li key={a.id}>
            {textoAviso(a)} <span style={{ color: '#64748b' }}>({formatDateBR(a.criadoEm)})</span>
          </li>
        ))}
      </ul>
      {avisos.length > MOSTRAR && (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          style={{ marginTop: '0.4rem', background: 'none', border: 'none', padding: 0, color: '#0c326f', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' }}
        >
          {todos ? 'Mostrar menos' : `Mostrar todos (${avisos.length})`}
        </button>
      )}
    </section>
  );
};
