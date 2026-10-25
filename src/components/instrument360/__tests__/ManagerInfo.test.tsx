import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagerInfo } from '../ManagerInfo';

describe('ManagerInfo (gestor no topo das telas 360)', () => {
  it('sem gestor e leitura certa: "Não atribuído"', () => {
    expect(renderToStaticMarkup(<ManagerInfo label="Gestor da ata" testId="g" />)).toContain('Não atribuído');
  });

  it('a leitura do gestor falhou (3j): "Não carregou", e não "Não atribuído"', () => {
    const html = renderToStaticMarkup(<ManagerInfo label="Gestor da ata" naoCarregou testId="g" />);
    expect(html).toContain('data-testid="g-nao-carregou"');
    expect(html).toContain('Não carregou');
    expect(html).not.toContain('Não atribuído');
  });

  it('com gestor, mostra o nome mesmo se uma releitura falhou', () => {
    expect(renderToStaticMarkup(<ManagerInfo label="Gestor da ata" gestorNome="Maria" naoCarregou testId="g" />)).toContain('Maria');
  });
});
