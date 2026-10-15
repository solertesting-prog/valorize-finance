import { ReactNode } from 'react';
import { OpsShell } from '@/components/shells';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <OpsShell area="admin">{children}</OpsShell>;
}
