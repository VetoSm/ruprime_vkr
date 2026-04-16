import { ReactNode } from 'react';
import SiteFooter from './SiteFooter';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-layout">
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
