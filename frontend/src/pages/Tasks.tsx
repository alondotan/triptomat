import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useItinerary } from '@/context/ItineraryContext';
import { Mission } from '@/types/trip';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Plus, Trash2, AlertCircle, Pencil } from 'lucide-react';
import { AppLayout } from '@/components/layout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** Convert an ISO/UTC date string to `datetime-local` input value (YYYY-MM-DDTHH:mm) */
function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TasksPage = () => {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { missions, addMission, updateMission, deleteMission } = useItinerary();

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Edit dialog
  const [editMission, setEditMission] = useState<Mission | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');

  const isOverdue = (m: { dueDate?: string; status: string }) =>
    m.status === 'pending' && m.dueDate && new Date(m.dueDate) < new Date();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !title) return;
    await addMission({
      tripId: activeTrip.id,
      title,
      description: description || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      status: 'pending',
      contextLinks: [],
      reminders: [],
    });
    setTitle('');
    setDescription('');
    setDueDate('');
    setCreateOpen(false);
  };

  const openEdit = (m: Mission) => {
    setEditMission(m);
    setEditTitle(m.title);
    setEditDescription(m.description || '');
    setEditDueDate(toLocalInput(m.dueDate));
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMission || !editTitle) return;
    await updateMission(editMission.id, {
      title: editTitle,
      description: editDescription || undefined,
      dueDate: editDueDate ? new Date(editDueDate).toISOString() : undefined,
    });
    setEditMission(null);
  };

  const pendingMissions = missions.filter(m => m.status === 'pending');
  const completedMissions = missions.filter(m => m.status === 'completed');

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{t('tasksPage.title')}</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1"><Plus size={16} /> {t('tasksPage.newMission')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('tasksPage.createMission')}</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('tasksPage.titleLabel')}</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>{t('tasksPage.descriptionLabel')}</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('tasksPage.dueDateLabel')}</Label>
                  <Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <Button type="submit">{t('common.create')}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit dialog */}
        <Dialog open={!!editMission} onOpenChange={open => { if (!open) setEditMission(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('tasksPage.editMission')}</DialogTitle></DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('tasksPage.titleLabel')}</Label>
                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('tasksPage.descriptionLabel')}</Label>
                <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('tasksPage.dueDateLabel')}</Label>
                <Input type="datetime-local" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
              </div>
              <Button type="submit">{t('common.save')}</Button>
            </form>
          </DialogContent>
        </Dialog>

        {pendingMissions.length === 0 && completedMissions.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-12 w-12 opacity-40" />
              <p>{t('tasksPage.noMissions')}</p>
            </CardContent>
          </Card>
        )}

        {pendingMissions.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">{t('tasksPage.pendingLabel', { count: pendingMissions.length })}</h3>
            {pendingMissions.map(m => (
              <Card key={m.id} className={`cursor-pointer transition-colors hover:bg-accent/50 ${isOverdue(m) ? 'border-destructive bg-destructive/5' : ''}`} onClick={() => openEdit(m)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${isOverdue(m) ? 'text-destructive' : ''}`}>{m.title}</p>
                    {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                    {m.dueDate && (
                      <p className={`text-xs mt-1 flex items-center gap-1 ${isOverdue(m) ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {isOverdue(m) && <AlertCircle size={12} />}
                        {t('tasksPage.dueAt')}: {new Date(m.dueDate).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => updateMission(m.id, { status: 'completed' })}>
                      <CheckCircle2 size={14} className="mr-1" /> {t('tasksPage.done')}
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
            <h3 className="text-sm font-medium text-muted-foreground">{t('tasksPage.completedLabel', { count: completedMissions.length })}</h3>
            {completedMissions.map(m => (
              <Card key={m.id} className="opacity-60">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold line-through">{m.title}</p>
                  </div>
                  <Badge variant="secondary">{t('tasksPage.done')}</Badge>
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
