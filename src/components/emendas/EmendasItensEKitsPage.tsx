import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { useItensCaep, useKitsEmendas } from '../../hooks/useEmendas';
import { EmendasPorItemPage } from './EmendasPorItemPage';
import { EmendasKitsPage } from './EmendasKitsPage';
import { ExportarItensEKits } from './ExportarItensEKits';

type Ver = 'item' | 'kit';

/**
 * Emendas › Itens (antes "Itens e kits"): as antigas abas Itens da CAEP e Kits numa só, com Por item · Por kit no cabeçalho (como Por ata · Por item
 * da Alocação). A visão fica em ?ver=kit e a linha que chega aberta em ?abrir=; o item dentro do kit leva ao item e o
 * item abre o Item 360 na aba Emendas (que lista os kits em que ele entra).
 */
export const EmendasItensEKitsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const ver: Ver = searchParams.get('ver') === 'kit' ? 'kit' : 'item';
  const abrir = searchParams.get('abrir');
  const { data: itens = [] } = useItensCaep();
  const { data: kits = [] } = useKitsEmendas();

  const ir = (destino: Ver, chave?: string) =>
    setSearchParams(() => {
      const p = new URLSearchParams();
      if (destino === 'kit') p.set('ver', 'kit');
      if (chave) p.set('abrir', chave);
      return p;
    });

  const seletor = (
    <CarteiraSegmentTabs<Ver>
      testIdPrefix="emendas-itens-ver"
      ariaLabel="Ver por"
      active={ver}
      onSelect={(v) => v !== ver && ir(v)}
      segments={[
        { id: 'item', label: 'Por item', count: itens.length, title: 'Um item por linha: alocado à CAEP, reservado e saldo' },
        { id: 'kit', label: 'Por kit', count: kits.filter((k) => k.ativo).length, title: 'Um kit por linha: quantos ainda cabem no saldo' }
      ]}
    />
  );

  // key: a linha aberta muda sem trocar de visão (ex.: dois itens do mesmo kit) e a tela recomeça aberta nela.
  return ver === 'kit' ? (
    <EmendasKitsPage key={`kit-${abrir ?? ''}`} seletor={seletor} exportar={<ExportarItensEKits />} abrir={abrir} onAbrirItem={(k) => ir('item', k)} />
  ) : (
    <EmendasPorItemPage key={`item-${abrir ?? ''}`} seletor={seletor} exportar={<ExportarItensEKits />} abrir={abrir} />
  );
};
