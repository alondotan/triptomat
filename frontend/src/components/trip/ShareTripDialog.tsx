import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useToast } from '@/hooks/use-toast';
import { fetchTripMembers, addTripMember, removeTripMember, TripMember } from '@/services/tripMemberService';
import { UserPlus, Trash2, Crown, Loader2 } from 'lucide-react';

interface ShareTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareTripDialog({ open, onOpenChange }: ShareTripDialogProps) {
  const { activeTrip, myRole } = useActiveTrip();
  const { toast } = useToast();
  const [members, setMembers] = useState<TripMember[]>([]);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!activeTrip) return;
    setIsLoading(true);
    try {
      const data = await fetchTripMembers(activeTrip.id);
      setMembers(data);
    } catch (e) {
      console.error('Failed to load members:', e);
    } finally {
      setIsLoading(false);
    }
  }, [activeTrip]);

  useEffect(() => {
    if (open) loadMembers();
  }, [open, loadMembers]);

  const handleAdd = async () => {
    if (!activeTrip || !email.trim()) return;
    setIsAdding(true);
    try {
      const member = await addTripMember(activeTrip.id, email.trim());
      setMembers(prev => [...prev, member]);
      setEmail('');
      toast({ title: 'Member added', description: `${email.trim()} can now access this trip.` });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to add member.', variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (member: TripMember) => {
    try {
      await removeTripMember(member.id);
      setMembers(prev => prev.filter(m => m.id !== member.id));
      toast({ title: 'Member removed', description: `${member.email || 'User'} has been removed.` });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to remove member.', variant: 'destructive' });
    }
  };

  const isOwner = myRole === 'owner';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>Share Trip</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add member form - only for owners */}
          {isOwner && (
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                dir="ltr"
                className="flex-1"
              />
              <Button onClick={handleAdd} disabled={isAdding || !email.trim()} size="sm">
                {isAdding ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              </Button>
            </div>
          )}

          {/* Members list */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Members</p>
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      {member.role === 'owner' && <Crown size={14} className="text-amber-500 shrink-0" />}
                      <span className="text-sm truncate" dir="ltr">
                        {member.email || member.userId.slice(0, 8) + '...'}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {member.role === 'owner' ? 'Owner' : 'Editor'}
                      </span>
                    </div>
                    {isOwner && member.role !== 'owner' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleRemove(member)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
