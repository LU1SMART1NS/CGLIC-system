import React from 'react';

/** Valor que a fonte oficial não informou: aparece na linha em vez de a linha sumir. */
export const MissingValue: React.FC<{ children?: React.ReactNode }> = ({ children = 'não informada' }) => (
  <span className="i360-dr-missing">{children}</span>
);
