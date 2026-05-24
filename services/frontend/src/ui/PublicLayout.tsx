import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import SiteFooter from './SiteFooter';

const ROUTES_WITHOUT_FOOTER = new Set(['/login', '/register']);

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const hideFooter = ROUTES_WITHOUT_FOOTER.has(pathname);

  return (
    <div className="public-layout">
      <main>{children}</main>
      {!hideFooter && <SiteFooter />}
    </div>
  );
}
