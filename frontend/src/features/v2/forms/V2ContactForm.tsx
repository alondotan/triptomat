/**
 * V2 Contact Add/Edit form — Midnight Cartographer design
 * Uses useContacts() (backed by ItineraryContext → contactService)
 */
import { useState } from 'react';
import { useContacts } from '@/features/itinerary/ItineraryContext';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import type { Contact, ContactRole } from '@/types/trip';

const ROLE_OPTIONS: { key: ContactRole; label: string; icon: string }[] = [
  { key: 'guide',      label: 'Guide',       icon: 'explore' },
  { key: 'host',       label: 'Host',        icon: 'home' },
  { key: 'rental',     label: 'Rental',      icon: 'car_rental' },
  { key: 'restaurant', label: 'Restaurant',  icon: 'restaurant' },
  { key: 'driver',     label: 'Driver',      icon: 'directions_car' },
  { key: 'agency',     label: 'Agency',      icon: 'business' },
  { key: 'emergency',  label: 'Emergency',   icon: 'emergency' },
  { key: 'other',      label: 'Other',       icon: 'person' },
];

interface V2ContactFormProps {
  contact?: Contact;
  onClose: () => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-widest text-v2-on-surface-variant mb-1.5">
      {children}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl px-5 py-3.5 text-sm text-v2-on-surface placeholder:text-v2-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-v2-primary/30 transition"
    />
  );
}

export function V2ContactForm({ contact, onClose }: V2ContactFormProps) {
  const { addContact, updateContact, deleteContact } = useContacts();
  const { activeTrip } = useActiveTrip();
  const isEdit = !!contact;

  const [name, setName] = useState(contact?.name || '');
  const [role, setRole] = useState<ContactRole>(contact?.role || 'other');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [email, setEmail] = useState(contact?.email || '');
  const [website, setWebsite] = useState(contact?.website || '');
  const [address, setAddress] = useState(contact?.address || '');
  const [notes, setNotes] = useState(contact?.notes || '');

  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const handleSave = async () => {
    if (!activeTrip || !name.trim()) return;
    setSaving(true);
    try {
      if (!isEdit) {
        await addContact({
          tripId: activeTrip.id,
          name: name.trim(),
          role,
          phone: phone || undefined,
          email: email || undefined,
          website: website || undefined,
          address: address || undefined,
          notes: notes || undefined,
        });
      } else {
        await updateContact(contact.id, {
          name: name.trim(),
          role,
          phone: phone || undefined,
          email: email || undefined,
          website: website || undefined,
          address: address || undefined,
          notes: notes || undefined,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contact) return;
    setSaving(true);
    try {
      await deleteContact(contact.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-v2-background text-v2-on-surface font-plus-jakarta">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-v2-surface-container-lowest/80 backdrop-blur-xl border-b border-v2-outline-variant/20">
        <div className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-v2-on-surface-variant hover:text-v2-on-surface transition-colors text-sm font-bold"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Cancel
          </button>

          <h1 className="text-base font-black tracking-tight">
            {isEdit ? 'Edit Contact' : 'New Contact'}
          </h1>

          <div className="flex items-center gap-2">
            {isEdit && (
              <button
                onClick={() => setShowDelete(true)}
                className="p-2 rounded-xl text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <span className="material-symbols-outlined text-base">delete</span>
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-5 py-2 rounded-xl bg-v2-primary text-v2-on-primary text-sm font-bold disabled:opacity-40 transition-all hover:opacity-90 active:scale-95"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8">

          {/* ── Left: avatar + role ── */}
          <div className="space-y-6">
            {/* Avatar placeholder */}
            <div className="w-full aspect-square rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 flex items-center justify-center">
              <span className="material-symbols-outlined text-white/20" style={{ fontSize: 80 }}>person</span>
            </div>

            {/* Role chips */}
            <div>
              <FieldLabel>Expedition Role</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setRole(opt.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      role === opt.key
                        ? 'bg-v2-primary text-v2-on-primary border-transparent shadow-md'
                        : 'bg-v2-surface-container-high text-v2-on-surface-variant border-v2-outline-variant/20 hover:bg-v2-surface-container-highest'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: form fields ── */}
          <div className="space-y-6">
            <div>
              <FieldLabel>Full Name *</FieldLabel>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Ahmed Hassan"
                className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl px-5 py-4 text-lg font-bold text-v2-on-surface placeholder:text-v2-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-v2-primary/30 transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Phone</FieldLabel>
                <TextInput value={phone} onChange={setPhone} placeholder="+1 555 000 0000" type="tel" />
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <TextInput value={email} onChange={setEmail} placeholder="email@example.com" type="email" />
              </div>
            </div>

            <div>
              <FieldLabel>Website</FieldLabel>
              <TextInput value={website} onChange={setWebsite} placeholder="https://…" type="url" />
            </div>

            <div>
              <FieldLabel>Address</FieldLabel>
              <TextInput value={address} onChange={setAddress} placeholder="Street, City, Country" />
            </div>

            <div>
              <FieldLabel>Notes</FieldLabel>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Additional notes about this contact…"
                rows={4}
                className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl px-5 py-3.5 text-sm text-v2-on-surface placeholder:text-v2-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-v2-primary/30 transition resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete confirm overlay ── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="bg-v2-surface-container-high rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-black text-v2-on-surface mb-2">Delete this contact?</h3>
            <p className="text-v2-on-surface-variant text-sm mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDelete(false)}
                className="flex-1 py-3 rounded-2xl bg-v2-surface-container text-v2-on-surface-variant text-sm font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
