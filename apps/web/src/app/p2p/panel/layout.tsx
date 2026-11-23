import { ReactNode } from 'react';
import { LocationSwitcher, OpsShell, StaffLocationProvider } from '@/components/shells';

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <StaffLocationProvider>
      <OpsShell area="panel" toolbar={<LocationSwitcher />}>
        {children}
      </OpsShell>
    </StaffLocationProvider>
  );
}
