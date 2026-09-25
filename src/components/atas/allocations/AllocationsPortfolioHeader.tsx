import React from 'react';
import { Building2, FileSpreadsheet, Coins } from 'lucide-react';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { AppButton } from '../../../design-system/components/AppButton';

interface AllocationsPortfolioHeaderProps {
  onOpenManageUnits?: () => void;
  onOpenManageDepartments?: () => void;
  onOpenExportExcel: () => void;
}

export const AllocationsPortfolioHeader: React.FC<AllocationsPortfolioHeaderProps> = ({
  onOpenManageUnits,
  onOpenManageDepartments,
  onOpenExportExcel
}) => {
  const handleOpenUnits = onOpenManageUnits || onOpenManageDepartments || (() => {});

  return (
    <PageHeader
      title="Alocações por Unidade"
      subtitle="Distribuição interna de cotas e acompanhamento de saldos por diretoria e coordenação da SENASP."
      icon={<Coins size={26} color="#0c326f" aria-hidden="true" />}
      actions={
        <>
          <AppButton
            variant="outline"
            icon={<Building2 size={14} />}
            onClick={handleOpenUnits}
            data-testid="allocations-manage-units-btn"
          >
            Unidades Internas
          </AppButton>
          <AppButton
            variant="outline"
            icon={<FileSpreadsheet size={14} />}
            onClick={onOpenExportExcel}
            data-testid="allocations-export-btn"
          >
            Exportar Relatório
          </AppButton>
        </>
      }
    />
  );
};
