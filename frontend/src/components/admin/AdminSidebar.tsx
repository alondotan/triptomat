import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  GitBranch,
  HardDrive,
  Database,
  Users,
  AlertTriangle,
  Mail,
  DollarSign,
  Filter,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
  { path: '/admin', label: 'Overview', icon: LayoutDashboard },
  { path: '/admin/pipeline', label: 'Pipeline', icon: GitBranch },
  { path: '/admin/s3', label: 'S3 Explorer', icon: HardDrive },
  { path: '/admin/cache', label: 'Cache', icon: Database },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/dlq', label: 'Dead Letters', icon: AlertTriangle },
  { path: '/admin/emails', label: 'Email Analysis', icon: Mail },
  { path: '/admin/costs', label: 'Cost Tracker', icon: DollarSign },
  { path: '/admin/funnel', label: 'Pipeline Funnel', icon: Filter },
];

export function AdminSidebar() {
  const location = useLocation();

  return (
    <aside className="w-60 border-r border-border bg-card flex flex-col">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-bold text-foreground">Admin</h2>
        <p className="text-xs text-muted-foreground mt-0.5">System Dashboard</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/admin'
              ? location.pathname === '/admin'
              : location.pathname.startsWith(item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon size={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <NavLink
          to="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Back to App
        </NavLink>
      </div>
    </aside>
  );
}
