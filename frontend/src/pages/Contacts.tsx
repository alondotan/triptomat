import { useState } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useContacts } from '@/context/ContactsContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Trash2, Phone, Mail, Globe, Search, Smartphone, Pencil } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Contact, ContactRole } from '@/types/trip';

const ROLE_OPTIONS: { value: ContactRole; label: string }[] = [
  { value: 'guide', label: 'Guide' },
  { value: 'host', label: 'Host' },
  { value: 'rental', label: 'Rental' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'driver', label: 'Driver' },
  { value: 'agency', label: 'Agency' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'other', label: 'Other' },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map(r => [r.value, r.label]));

const supportsContactPicker = typeof window !== 'undefined'
  && 'contacts' in navigator
  && 'ContactsManager' in window;

function ContactForm({ contact, onSubmit, onCancel }: {
  contact?: Contact;
  onSubmit: (data: { name: string; role: ContactRole; phone?: string; email?: string; website?: string; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(contact?.name || '');
  const [role, setRole] = useState<ContactRole>(contact?.role || 'other');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [email, setEmail] = useState(contact?.email || '');
  const [website, setWebsite] = useState(contact?.website || '');
  const [notes, setNotes] = useState(contact?.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onSubmit({
      name,
      role,
      phone: phone || undefined,
      email: email || undefined,
      website: website || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={v => setRole(v as ContactRole)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Phone</Label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} type="tel" />
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
      </div>
      <div className="space-y-2">
        <Label>Website</Label>
        <Input value={website} onChange={e => setWebsite(e.target.value)} type="url" placeholder="https://" />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">{contact ? 'Save' : 'Add Contact'}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

const ContactsPage = () => {
  const { activeTrip } = useActiveTrip();
  const { contacts, addContact, updateContact, deleteContact } = useContacts();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');

  const handleCreate = async (data: { name: string; role: ContactRole; phone?: string; email?: string; website?: string; notes?: string }) => {
    if (!activeTrip) return;
    await addContact({ tripId: activeTrip.id, ...data });
    setCreateOpen(false);
  };

  const handleUpdate = async (data: { name: string; role: ContactRole; phone?: string; email?: string; website?: string; notes?: string }) => {
    if (!editingContact) return;
    await updateContact(editingContact.id, data);
    setEditingContact(null);
  };

  const handleImportFromPhone = async () => {
    if (!activeTrip) return;
    try {
      const props = ['name', 'tel', 'email'];
      const contacts = await navigator.contacts!.select(props, { multiple: true });
      if (contacts && contacts.length > 0) {
        for (const c of contacts) {
          await addContact({
            tripId: activeTrip.id,
            name: c.name?.[0] || 'Unknown',
            role: 'other',
            phone: c.tel?.[0] || undefined,
            email: c.email?.[0] || undefined,
          });
        }
        toast({ title: `${contacts.length} contact${contacts.length > 1 ? 's' : ''} imported` });
      }
    } catch (err) {
      if ((err as Error).name !== 'TypeError') {
        console.error('Contact Picker error:', err);
      }
    }
  };

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q)
      || (ROLE_LABELS[c.role] || c.role).toLowerCase().includes(q)
      || c.phone?.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q)
      || c.notes?.toLowerCase().includes(q);
  });

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Contacts</h2>
          <div className="flex gap-2">
            {supportsContactPicker && (
              <Button variant="outline" className="gap-1" onClick={handleImportFromPhone}>
                <Smartphone size={16} /> Import
              </Button>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1"><Plus size={16} /> Add</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
                <ContactForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {contacts.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {contacts.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Users className="mx-auto mb-2 h-12 w-12 opacity-40" />
              <p>No contacts yet</p>
            </CardContent>
          </Card>
        )}

        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map(c => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{c.name}</p>
                        <Badge variant="secondary" className="text-xs shrink-0">{ROLE_LABELS[c.role] || c.role}</Badge>
                      </div>
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                          <Phone size={14} className="shrink-0" /> {c.phone}
                        </a>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                          <Mail size={14} className="shrink-0" /> <span className="truncate">{c.email}</span>
                        </a>
                      )}
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                          <Globe size={14} className="shrink-0" /> <span className="truncate">{(() => { try { return new URL(c.website).hostname; } catch { return c.website; } })()}</span>
                        </a>
                      )}
                      {c.notes && <p className="text-xs text-muted-foreground italic">{c.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingContact(c)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteContact(c.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {search && filtered.length === 0 && contacts.length > 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">No contacts match "{search}"</p>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingContact} onOpenChange={open => { if (!open) setEditingContact(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
          {editingContact && (
            <ContactForm
              contact={editingContact}
              onSubmit={handleUpdate}
              onCancel={() => setEditingContact(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default ContactsPage;
