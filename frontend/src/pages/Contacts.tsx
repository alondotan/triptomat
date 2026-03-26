import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { useContacts } from '@/features/itinerary/ItineraryContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Trash2, Phone, Mail, Globe, Search, Smartphone, Pencil, MapPin } from 'lucide-react';
import { AppLayout } from '@/shared/components/layout';
import { ContactEditDialog } from '@/shared/components/ContactEditDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/shared/hooks/use-toast';
import type { Contact, ContactRole } from '@/types/trip';

const ROLE_VALUES: ContactRole[] = ['guide', 'host', 'rental', 'restaurant', 'driver', 'agency', 'emergency', 'other'];

const supportsContactPicker = typeof window !== 'undefined'
  && 'contacts' in navigator
  && 'ContactsManager' in window;

function ContactForm({ contact, onSubmit, onCancel }: {
  contact?: Contact;
  onSubmit: (data: { name: string; role: ContactRole; phone?: string; email?: string; website?: string; address?: string; notes?: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(contact?.name || '');
  const [role, setRole] = useState<ContactRole>(contact?.role || 'other');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [email, setEmail] = useState(contact?.email || '');
  const [website, setWebsite] = useState(contact?.website || '');
  const [address, setAddress] = useState(contact?.address || '');
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
      address: address || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl bg-secondary/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('contactsPage.nameLabel')}</Label>
          <Input value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('contactsPage.roleLabel')}</Label>
          <Select value={role} onValueChange={v => setRole(v as ContactRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_VALUES.map(r => (
                <SelectItem key={r} value={r}>{t(`contactRole.${r}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded-xl bg-secondary/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('contactsPage.phoneLabel')}</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} type="tel" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('contactsPage.emailLabel')}</Label>
          <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('contactsPage.websiteLabel')}</Label>
          <Input value={website} onChange={e => setWebsite(e.target.value)} type="url" placeholder="https://" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('contactsPage.addressLabel')}</Label>
          <Input value={address} onChange={e => setAddress(e.target.value)} />
        </div>
      </div>
      <div className="rounded-xl bg-secondary/40 p-3 space-y-1">
        <Label className="text-xs text-muted-foreground">{t('contactsPage.notesLabel')}</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">{contact ? t('common.save') : t('contactsPage.addContact')}</Button>
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

const ContactsPage = () => {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { contacts, addContact, updateContact, deleteContact } = useContacts();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');

  const handleCreate = async (data: { name: string; role: ContactRole; phone?: string; email?: string; website?: string; address?: string; notes?: string }) => {
    if (!activeTrip) return;
    await addContact({ tripId: activeTrip.id, ...data });
    setCreateOpen(false);
  };

  const handleUpdate = async (data: { name: string; role: ContactRole; phone?: string; email?: string; website?: string; address?: string; notes?: string }) => {
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
        toast({ title: t('contactsPage.contactsImported', { count: contacts.length }) });
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
      || t(`contactRole.${c.role}`, c.role).toLowerCase().includes(q)
      || c.phone?.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q)
      || c.address?.toLowerCase().includes(q)
      || c.notes?.toLowerCase().includes(q);
  });

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{t('contactsPage.title')}</h2>
          <div className="flex gap-2">
            {supportsContactPicker && (
              <Button variant="outline" className="gap-1" onClick={handleImportFromPhone}>
                <Smartphone size={16} /> {t('contactsPage.importContacts')}
              </Button>
            )}
            {/* Create via global FAB */}
          </div>
        </div>

        {contacts.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('contactsPage.searchPlaceholder')}
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
              <p>{t('contactsPage.noContacts')}</p>
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
                        <Badge variant="secondary" className="text-xs shrink-0">{t(`contactRole.${c.role}`, c.role)}</Badge>
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
                      {c.address && (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin size={14} className="shrink-0" /> <span className="truncate">{c.address}</span>
                        </p>
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
          <p className="text-center text-sm text-muted-foreground py-4">{t('contactsPage.noSearchResults', { query: search })}</p>
        )}
      </div>

      {/* Edit dialog */}
      <ContactEditDialog
        contact={editingContact}
        open={!!editingContact}
        onOpenChange={(open) => { if (!open) setEditingContact(null); }}
        onSave={(data) => { handleUpdate(data); }}
        onDelete={(id) => { deleteContact(id); setEditingContact(null); }}
      />
    </AppLayout>
  );
};

export default ContactsPage;
