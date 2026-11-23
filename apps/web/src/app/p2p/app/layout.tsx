import { ReactNode } from 'react';
import { CustomerShell } from '@/components/shells';

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
