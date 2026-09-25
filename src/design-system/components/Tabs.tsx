import React, { useRef } from 'react';
import { colors, shapes, typography, spacing } from '../tokens';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  ariaLabel?: string;
  testId?: string;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTabId,
  onTabChange,
  ariaLabel = 'Abas de navegação',
  testId = 'accessible-tabs',
  className = ''
}) => {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const enabledTabs = tabs.filter(t => !t.disabled);
    const currentIndex = enabledTabs.findIndex(t => t.id === tabs[index].id);

    let targetTab: TabItem | null = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % enabledTabs.length;
      targetTab = enabledTabs[nextIndex];
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
      targetTab = enabledTabs[prevIndex];
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetTab = enabledTabs[0];
    } else if (e.key === 'End') {
      e.preventDefault();
      targetTab = enabledTabs[enabledTabs.length - 1];
    }

    if (targetTab) {
      onTabChange(targetTab.id);
      tabRefs.current[targetTab.id]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
      className={`tabs-nav-container ${className}`.trim()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        borderBottom: `2px solid ${colors.border.default}`,
        overflowX: 'auto',
        paddingBottom: '2px'
      }}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        const isDisabled = Boolean(tab.disabled);

        return (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[tab.id] = el; }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={isDisabled}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            data-testid={`${testId}-tab-${tab.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing.xs,
              padding: `${spacing.sm} ${spacing.md}`,
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? `3px solid ${colors.brand.primary}` : '3px solid transparent',
              marginBottom: '-2px',
              color: isActive ? colors.brand.primary : (isDisabled ? colors.text.subtle : colors.text.secondary),
              fontSize: typography.fontSize.bodySm,
              fontWeight: isActive ? typography.fontWeight.bold : typography.fontWeight.medium,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              outline: 'none',
              transition: shapes.transition.fast
            }}
          >
            {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                style={{
                  fontSize: typography.fontSize.caption,
                  fontWeight: typography.fontWeight.bold,
                  padding: `0 ${spacing.xs}`,
                  borderRadius: shapes.radius.full,
                  background: isActive ? colors.brand.primaryLight : colors.background.subtle,
                  color: isActive ? colors.brand.primaryDark : colors.text.muted
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
