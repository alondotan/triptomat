import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Users as UsersIcon, Search, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatDate } from '@/utils/adminUtils';
import { useUsers } from '@/hooks/useAdminQueries';
import type { UserInfo } from '@/services/adminService';

// ── Helpers ────────────────────────────────────────────────────

function formatLastActive(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(iso);
}

// ── Component ──────────────────────────────────────────────────

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: usersData,
    isLoading,
    error,
    refetch,
  } = useUsers(50, 0, searchQuery || undefined);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">{error.message}</p>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw size={14} />
          Retry
        </Button>
      </div>
    );
  }

  const users = usersData?.users ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Users</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UsersIcon size={16} />
          <span>{usersData?.count ?? 0} total users</span>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by email..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon size={18} />
            Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No users match the current search.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Trips</TableHead>
                  <TableHead>POIs</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user: UserInfo) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {user.created_at ? formatDate(user.created_at) : '--'}
                    </TableCell>
                    <TableCell className="font-medium">{user.trips_count}</TableCell>
                    <TableCell className="font-medium">{user.pois_count}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatLastActive(user.last_sign_in_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
