import { useMemo } from 'react';
import { useBeneficiariosEmendas, useGruposBeneficiarios, usePodeGerirEmendas } from '../../hooks/useEmendas';
import { contarBeneficiariosSemGrupo } from '../../config/captacaoEmendas';
import { useTelaCarregada } from '../layout/useTelaCarregada';

/**
 * Parte do número no ícone de Ajustes: beneficiários de emenda ainda sem grupo confirmado, com ou sem sugestão. Quem
 * confirma é o coordenador e o gestor de emendas, então só eles recebem número. As leituras esperam a tela aberta
 * encher, como as outras contagens do menu; sem a migration 218 ou com a leitura falhando, essa parte fica sem número.
 */
export function useContagemGruposBeneficiarios(): { aConfirmar: number; semSugestao: number } | null {
  const ativo = usePodeGerirEmendas();
  const telaCarregada = useTelaCarregada();
  const enabled = ativo && telaCarregada;
  const beneficiarios = useBeneficiariosEmendas({ enabled });
  const grupos = useGruposBeneficiarios({ enabled });
  return useMemo(() => {
    if (!enabled || !beneficiarios.data || !grupos.data) return null;
    return contarBeneficiariosSemGrupo(beneficiarios.data, grupos.data);
  }, [enabled, beneficiarios.data, grupos.data]);
}
