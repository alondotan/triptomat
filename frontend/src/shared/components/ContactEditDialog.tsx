import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { Contact, ContactRole } from '@/types/trip';

const ROLE_VALUES: ContactRole[] = ['guide', 'host', 'rental', 'restaurant', 'driver', 'agency', 'emergency', 'other'];

export function ContactEditDialog({ contact, open, onOpenChange, onSave, onDelete }: {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { name: string; role: ContactRole; phone?: string; email?: string; website?: string; address?: string; notes?: string }) => void;
  onDelete?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [role, setRole] = useState<ContactRole>('other');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Reset form when contact changes
  const [prevContactId, setPrevContactId] = useState<string | null>(null);
  if (contact && contact.id !== prevContactId) {
    setPrevContactId(contact.id);
    setName(contact.name);
    setRole(contact.role);
    setPhone(contact.phone || '');
    setEmail(contact.email || '');
    setWebsite(contact.website || '');
    setAddress(contact.address || '');
    setNotes(contact.notes || '');
  }
  if (!contact && prevContactId) {
    setPrevContactId(null);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onSave({
      name,
      role,
      phone: phone || undefined,
      email: email || undefined,
      website: website || undefined,
      address: address || undefined,
      notes: notes || undefined,
    });
  };

  if (!contact) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between pe-2">
            <DialogTitle>{t('contactsPage.editContact')}</DialogTitle>
            {onDelete && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { onDelete(contact.id); onOpenChange(false); }}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </DialogHeader>
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
            <Button type="submit" className="flex-1">{t('common.save')}</Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
