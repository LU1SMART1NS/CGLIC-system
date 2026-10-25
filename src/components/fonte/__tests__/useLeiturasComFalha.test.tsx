import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { falhasDasLeituras, naoCarregou, useLeiturasComFalha, type LeituraDaTela } from '../useLeiturasComFalha';
import { aplicarConferenciaTesouro, type FaturaCarteira } from '../../../services/financeiroCarteiraService';

const ok = (data: unknown = []) => ({ data, isError: false, error: null, refetch: vi.fn() });
const falhou = (mensagem: string, data?: unknown) => ({ data, isError: true, error: new Error(mensagem), refetch: vi.fn() });

describe('falhasDasLeituras', () => {
  it('nada falhou: nenhuma falha', () => {
    expect(falhasDasLeituras([{ rotulo: 'faturas', query: ok() }])).toEqual([]);
  });

  it('sem leitura anterior "não carregou"; com leitura anterior (o React Query guarda) "não atualizou"', () => {
    expect(
      falhasDasLeituras([
        { rotulo: 'faturas', query: falhou('timeout') },
        { rotulo: 'ciclos de pagamento', query: falhou('timeout', []) }
      ])
    ).toEqual([
      { rotulo: 'faturas', situacao: 'NAO_CARREGOU', mensagem: 'timeout' },
      { rotulo: 'ciclos de pagamento', situacao: 'DESATUALIZADA', mensagem: 'timeout' }
    ]);
  });

  it('a mesma fonte em duas UASGs aparece uma vez, e "não carregou" vence', () => {
    const falhas = falhasDasLeituras([
      { rotulo: 'gestores dos contratos', query: falhou('a', {}) },
      { rotulo: 'gestores dos contratos', query: falhou('b') }
    ]);
    expect(falhas).toEqual([{ rotulo: 'gestores dos contratos', situacao: 'NAO_CARREGOU', mensagem: 'b' }]);
  });

  it('erro do PostgREST (objeto com message) vira a mensagem', () => {
    const query = { data: undefined, isError: true, error: { message: 'permission denied', code: '42501' }, refetch: vi.fn() };
    expect(falhasDasLeituras([{ rotulo: 'atas', query }])[0].mensagem).toBe('permission denied');
  });

  it('naoCarregou: só a falha sem nenhuma leitura boa', () => {
    expect(naoCarregou(falhou('x'))).toBe(true);
    expect(naoCarregou(falhou('x', []))).toBe(false);
    expect(naoCarregou(ok())).toBe(false);
  });
});

describe('useLeiturasComFalha', () => {
  const Faixa: React.FC<{ leituras: LeituraDaTela[] }> = ({ leituras }) => {
    const r = useLeiturasComFalha(leituras);
    return <span>{`${r.falhas.map((f) => f.rotulo).join(',')}|${r.algumaNaoCarregou}|${r.tentando}`}</span>;
  };

  it('devolve as falhas e diz se alguma não carregou', () => {
    const html = renderToStaticMarkup(<Faixa leituras={[{ rotulo: 'faturas', query: falhou('x') }, { rotulo: 'empenhos', query: ok() }]} />);
    expect(html).toContain('faturas|true|false');
  });

  it('"Tentar novamente" relê só as que falharam', async () => {
    const quebrada = falhou('x');
    const boa = ok();
    let tentar: (() => Promise<void>) | undefined;
    const Captura: React.FC = () => {
      tentar = useLeiturasComFalha([{ rotulo: 'faturas', query: quebrada }, { rotulo: 'empenhos', query: boa }]).tentarDeNovo;
      return null;
    };
    renderToStaticMarkup(<Captura />);
    await tentar?.();
    expect(quebrada.refetch).toHaveBeenCalledTimes(1);
    expect(boa.refetch).not.toHaveBeenCalled();
  });
});

describe('aplicarConferenciaTesouro', () => {
  const fatura = (idFatura: number) => ({ idFatura, situacaoTesouro: null }) as unknown as FaturaCarteira;

  it('põe o aviso do Tesouro nas faturas que ele conhece e deixa as outras', () => {
    const [a, b] = aplicarConferenciaTesouro([fatura(1), fatura(2)], new Map([[1, 'PAGO' as const]]));
    expect(a.situacaoTesouro).toBe('PAGO');
    expect(b.situacaoTesouro).toBeNull();
  });

  it('sem a leitura do Tesouro (falhou ou carregando): as faturas saem como vieram', () => {
    const faturas = [fatura(1)];
    expect(aplicarConferenciaTesouro(faturas, undefined)).toBe(faturas);
  });
});
