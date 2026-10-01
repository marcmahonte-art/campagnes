import React from 'react';

export function Label({ htmlFor, children, className }: { htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium text-gray-700 ${className ?? ''}`}>
      {children}
    </label>
  );
}
