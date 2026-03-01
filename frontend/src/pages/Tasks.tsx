import { useState } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useItinerary } from '@/context/ItineraryContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const TasksPage = () => {
  const { activeTrip } = useActiveTrip();
  const { missions, addMission, updateMission, deleteMission } = useItinerary();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !title) return;
    await addMission({
      tripId: activeTrip.id,
      title,
      description: description || undefined,
      status: 'pending',
      contextLinks: [],
      reminders: [],
    });
    setTitle('');
    setDescription('');
    setOpen(false);
  };

  const pendingMissions = missions.filter(m => m.status === 'pending');
  const completedMissions = missions.filter(m => m.status === 'completed');

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Missions</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1"><Plus size={16} /> New Mission</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Mission</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <Button type="submit">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {pendingMissions.length === 0 && completedMissions.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-12 w-12 opacity-40" />
              <p>No missions yet</p>
            </CardContent>
          </Card>
        )}

        {pendingMissions.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Pending ({pendingMissions.length})</h3>
            {pendingMissions.map(m => (
              <Card key={m.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{m.title}</p>
                    {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateMission(m.id, { status: 'completed' })}>
                      <CheckCircle2 size={14} className="mr-1" /> Done
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMission(m.id)}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {completedMissions.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Completed ({completedMissions.length})</h3>
            {completedMissions.map(m => (
              <Card key={m.id} className="opacity-60">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold line-through">{m.title}</p>
                  </div>
                  <Badge variant="secondary">Done</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TasksPage;
