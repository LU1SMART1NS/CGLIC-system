import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FontesComFalhaAviso } from '../FontesComFalhaAviso';

describe('FontesComFalhaAviso', () => {
  it('não aparece quando nenhuma fonte falhou', () => {
    expect(renderToStaticMarkup(<FontesComFalhaAviso falhas={[]} onTentar={() => undefined} tentando={false} />)).toBe('');
  });

  it('escreve a fonte como frase (só a primeira maiúscula) e traduz o tempo limite do banco', () => {
    const html = renderToStaticMarkup(
      <FontesComFalhaAviso
        falhas={[{ rotulo: 'empenhado acima do contratado', situacao: 'NAO_CARREGOU', mensagem: 'canceling statement due to statement timeout' }]}
        onTentar={() => undefined}
        tentando={false}
      />
    );
    expect(html).toContain('Parte do Início não carregou');
    expect(html).toContain('<strong>Empenhado acima do contratado</strong>');
    expect(html).toContain('a consulta demorou mais que o tempo limite do banco');
    expect(html).not.toContain('capitalize');
  });

  it('leitura antiga em uso: diz que não atualizou', () => {
    const html = renderToStaticMarkup(
      <FontesComFalhaAviso
        falhas={[{ rotulo: 'saldo dos itens', situacao: 'DESATUALIZADA', mensagem: 'erro qualquer' }]}
        onTentar={() => undefined}
        tentando
      />
    );
    expect(html).toContain('Parte do Início não atualizou');
    expect(html).toContain('mostrando a última leitura');
    expect(html).toContain('Tentando…');
  });
});
