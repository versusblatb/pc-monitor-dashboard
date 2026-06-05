import { useLocation, Outlet } from 'react-router-dom';

export function AnimatedOutlet() {
  const location = useLocation();

  return (
    <div key={location.pathname} className="page-transition">
      <Outlet />
    </div>
  );
}
