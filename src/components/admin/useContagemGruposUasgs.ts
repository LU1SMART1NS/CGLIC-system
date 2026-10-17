import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useUasgsParticipantesGti } from '../../hooks/useGruposGti';
import { contarUasgsSemGrupo } from '../../config/gruposGti';
import { useTelaCarregada } from '../layout/useTelaCarregada';

/**
 * Número no ícone de Ajustes: UASGs ainda sem grupo (GTI) confirmado, com ou sem sugestão. Só o coordenador confirma,
 * então só ele vê o número. A lista é lida depois que a tela aberta enche, como as outras contagens do menu; sem a
 * migration 139 ou com a leitura falhando, o menu fica sem número.
 */
export function useContagemGruposUasgs(): { aConfirmar: number; semSugestao: number } | null {
  const { role } = useAuth();
  const telaCarregada = useTelaCarregada();
  const ativo = role === 'admin';
  const consulta = useUasgsParticipantesGti({ enabled: ativo && telaCarregada });
  return useMemo(() => {
    if (!ativo || !telaCarregada || !consulta.data) return null;
    return contarUasgsSemGrupo(consulta.data);
  }, [ativo, telaCarregada, consulta.data]);
}
