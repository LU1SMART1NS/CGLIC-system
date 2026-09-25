import re

with open('src/components/home/HomeHeaderAndFilters.tsx', 'r') as f:
    content = f.read()

# Add imports
content = content.replace("import { RefreshCw, Filter, X } from 'lucide-react';", "import { RefreshCw, Filter, X } from 'lucide-react';\nimport { PageHeader } from '../../design-system/components/PageHeader';\nimport { AppButton } from '../../design-system/components/AppButton';")

header_replacement = '''    <header style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <PageHeader 
        title="Visão Geral"
        subtitle="Acompanhe a situação da sua unidade e os principais pontos de atenção."
        actions={
          <AppButton
            variant="outline"
            icon={<RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />}
            onClick={onRefresh}
            disabled={isRefreshing}
            data-testid="home-refresh-btn"
          >
            {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </AppButton>
        }
      />'''

content = re.sub(r'<header[^>]*>.*?{/\* Linha Inferior: Barra de Contexto / Filtros Compactos e Alinhados \*/}', header_replacement + '\n\n      {/* Linha Inferior: Barra de Contexto / Filtros Compactos e Alinhados */}', content, flags=re.DOTALL)

with open('src/components/home/HomeHeaderAndFilters.tsx', 'w') as f:
    f.write(content)

