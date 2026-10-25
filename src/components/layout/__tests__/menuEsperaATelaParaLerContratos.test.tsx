/**
 * Passo 3 da auditoria das telas: os números do menu (Financeiro e Vínculos), que aparecem em toda tela, só leem a
 * carteira de contratos depois que a tela aberta enche. Medido ao vivo em 17/10/2026: numa tela 360 aberta pelo
 * endereço, a carteira inteira de contratos (6 páginas) saía a 0,8–1,7 s, antes de a tela ficar pronta.
 * Aqui: com a tela enchendo, nenhuma consulta da carteira (contratos, gestores, vínculos) fica ligada; depois, todas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { estado } = vi.hoisted(() => ({
  estado: {
    role: 'admin' as string,
    telaCarregada: false,
    consultas: [] as Array<{ chave: unknown[]; enabled: boolean }>
  }
}));

vi.mock('@tanstack/react-query', async (orig) => {
  const real = await orig<typeof import('@tanstack/react-query')>();
  return {
    ...real,
    useQuery: (opcoes: { queryKey: unknown[]; enabled?: boolean }) => {
      estado.consultas.push({ chave: [...opcoes.queryKey], enabled: opcoes.enabled !== false });
      return { data: undefined, isLoading: false, isPending: true, isError: false, isSuccess: false, isFetching: false, error: null, dataUpdatedAt: 0, refetch: vi.fn() };
    }
  };
});
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ role: estado.role, user: { id: 'u1' } }) }));
vi.mock('../useTelaCarregada', () => ({ useTelaCarregada: () => estado.telaCarregada }));

import { useContagemFinanceiro } from '../../financeiro/useContagemFinanceiro';
import { useContagemVinculacao } from '../../vinculacao/useContagemVinculacao';

/** Consultas da carteira de contratos que o menu lia ao abrir qualquer tela. */
const DA_CARTEIRA = ['contracts-dashboard', 'all-contract-managers', 'all-ata-managers', 'all-arp-item-contract-links', 'management-dashboard'];

function abrirMenu() {
  estado.consultas = [];
  const Menu = () => {
    useContagemVinculacao();
    useContagemFinanceiro();
    return null;
  };
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <Menu />
    </QueryClientProvider>
  );
  return estado.consultas.filter((c) => DA_CARTEIRA.includes(String(c.chave[0])));
}

describe('números do menu: a carteira de contratos espera a tela encher', () => {
  beforeEach(() => {
    estado.telaCarregada = false;
  });

  for (const role of ['admin', 'gestor']) {
    it(`${role}: com a tela enchendo, nenhuma leitura da carteira de contratos fica ligada`, () => {
      estado.role = role;
      const consultas = abrirMenu();
      expect(consultas.filter((c) => c.chave[0] === 'contracts-dashboard').map((c) => c.chave[1])).toEqual(
        expect.arrayContaining(['200330', '200331'])
      );
      expect(consultas.filter((c) => c.enabled)).toEqual([]);
    });

    it(`${role}: com a tela cheia, lê os contratos e os gestores das duas UASGs (sem o painel do Início)`, () => {
      estado.role = role;
      estado.telaCarregada = true;
      const ligadas = abrirMenu().filter((c) => c.enabled).map((c) => c.chave.join('|'));
      expect(ligadas).toEqual(expect.arrayContaining(['contracts-dashboard|200330', 'contracts-dashboard|200331', 'all-contract-managers|200330', 'all-contract-managers|200331']));
      expect(ligadas.some((k) => k.startsWith('management-dashboard'))).toBe(false);
    });
  }
});
