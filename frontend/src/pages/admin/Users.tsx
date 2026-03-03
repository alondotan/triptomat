import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Users as UsersIcon, Search } from 'lucide-react';
import { formatDate } from '@/utils/adminUtils';

// ── Types ──────────────────────────────────────────────────────

interface UserEntry {
  id: string;
  email: string;
  createdAt: string;
  tripsCount: number;
  poisCount: number;
  emailsProcessed: number;
  lastActive: string;
}

// ── Mock Data ──────────────────────────────────────────────────

const mockUsers: UserEntry[] = [
  { id: 'u-001', email: 'alice@example.com', createdAt: '2025-11-15T08:00:00Z', tripsCount: 5, poisCount: 142, emailsProcessed: 23, lastActive: '2026-03-03T10:30:00Z' },
  { id: 'u-002', email: 'bob@example.com', createdAt: '2025-12-01T14:30:00Z', tripsCount: 3, poisCount: 87, emailsProcessed: 12, lastActive: '2026-03-03T09:15:00Z' },
  { id: 'u-003', email: 'carol@example.com', createdAt: '2026-01-10T09:00:00Z', tripsCount: 2, poisCount: 45, emailsProcessed: 8, lastActive: '2026-03-02T22:00:00Z' },
  { id: 'u-004', email: 'dave@traveler.io', createdAt: '2026-01-22T16:45:00Z', tripsCount: 7, poisCount: 231, emailsProcessed: 45, lastActive: '2026-03-03T11:00:00Z' },
  { id: 'u-005', email: 'eve@globetrotter.com', createdAt: '2026-02-05T11:20:00Z', tripsCount: 1, poisCount: 18, emailsProcessed: 3, lastActive: '2026-03-01T18:30:00Z' },
  { id: 'u-006', email: 'frank@example.org', createdAt: '2026-02-14T08:15:00Z', tripsCount: 4, poisCount: 96, emailsProcessed: 15, lastActive: '2026-03-03T08:45:00Z' },
  { id: 'u-007', email: 'grace@wanderlust.net', createdAt: '2026-02-20T13:00:00Z', tripsCount: 2, poisCount: 34, emailsProcessed: 6, lastActive: '2026-02-28T20:15:00Z' },
  { id: 'u-008', email: 'henry@trips.co', createdAt: '2026-02-28T10:30:00Z', tripsCount: 1, poisCount: 12, emailsProcessed: 2, lastActive: '2026-03-02T14:00:00Z' },
];

// ── Helpers ────────────────────────────────────────────────────

function formatLastActive(iso: string): string {
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

  // TODO: Replace with real API call
  const { data: users } = useQuery<UserEntry[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => mockUsers,
  });

  const filteredUsers = (users ?? []).filter((user) => {
    if (searchQuery && !user.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Users</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UsersIcon size={16} />
            <span>{users?.length ?? 0} total users</span>
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
                onChange={(e) => setSearchQuery(e.target.value)}
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
              Users ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredUsers.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No users match the current search.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Trips</TableHead>
                    <TableHead>POIs</TableHead>
                    <TableHead>Emails</TableHead>
                    <TableHead>Last Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(user.createdAt)}</TableCell>
                      <TableCell className="font-medium">{user.tripsCount}</TableCell>
                      <TableCell className="font-medium">{user.poisCount}</TableCell>
                      <TableCell className="font-medium">{user.emailsProcessed}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatLastActive(user.lastActive)}</TableCell>
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
