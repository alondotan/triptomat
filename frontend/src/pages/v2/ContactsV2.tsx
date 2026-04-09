/**
 * V2 Contacts page — contacts list with Midnight Cartographer design
 */
import { useState } from 'react';
import { useContacts } from '@/features/itinerary/ItineraryContext';
import { V2ContactForm } from '@/features/v2/forms/V2ContactForm';
import type { Contact } from '@/types/trip';

const ROLE_ICONS: Record<string, string> = {
  guide:      'explore',
  host:       'home',
  rental:     'car_rental',
  restaurant: 'restaurant',
  driver:     'directions_car',
  agency:     'business',
  emergency:  'emergency',
  other:      'person',
};

const ROLE_COLORS: Record<string, string> = {
  guide:      'bg-v2-primary/10 text-v2-primary border-v2-primary/20',
  host:       'bg-v2-tertiary/10 text-v2-tertiary border-v2-tertiary/20',
  rental:     'bg-blue-900/20 text-blue-300 border-blue-700/20',
  restaurant: 'bg-amber-900/20 text-amber-300 border-amber-700/20',
  driver:     'bg-indigo-900/20 text-indigo-300 border-indigo-700/20',
  agency:     'bg-purple-900/20 text-purple-300 border-purple-700/20',
  emergency:  'bg-red-900/20 text-red-300 border-red-700/20',
  other:      'bg-v2-surface-container-high text-v2-on-surface-variant border-v2-outline-variant/20',
};

function ContactCard({ contact, onOpen }: { contact: Contact; onOpen: () => void }) {
  const roleColor = ROLE_COLORS[contact.role] ?? ROLE_COLORS.other;
  const roleIcon = ROLE_ICONS[contact.role] ?? 'person';

  return (
    <div
      className="group cursor-pointer rounded-3xl bg-v2-surface-container-high p-5 hover:-translate-y-1 transition-all duration-300 shadow-lg"
      onClick={onOpen}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 via-indigo-900 to-violet-900 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-white/40" style={{ fontSize: 28 }}>person</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-bold text-v2-on-surface truncate font-plus-jakarta">{contact.name}</h3>
          </div>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${roleColor}`}>
            <span className="material-symbols-outlined text-[12px]">{roleIcon}</span>
            {contact.role}
          </span>
          {(contact.phone || contact.email) && (
            <div className="mt-2 space-y-0.5">
              {contact.phone && (
                <p className="text-v2-on-surface-variant text-xs flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">phone</span>
                  {contact.phone}
                </p>
              )}
              {contact.email && (
                <p className="text-v2-on-surface-variant text-xs flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">email</span>
                  {contact.email}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Arrow */}
        <span className="material-symbols-outlined text-v2-on-surface-variant/30 group-hover:text-v2-on-surface-variant transition-colors">chevron_right</span>
      </div>

      {contact.notes && (
        <p className="mt-3 text-v2-on-surface-variant/60 text-xs line-clamp-2 leading-relaxed">
          {contact.notes}
        </p>
      )}
    </div>
  );
}

export default function ContactsV2() {
  const { contacts } = useContacts();
  const [formContact, setFormContact] = useState<Contact | null | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Show form overlay
  if (formContact !== undefined) {
    return (
      <V2ContactForm
        contact={formContact ?? undefined}
        onClose={() => setFormContact(undefined)}
      />
    );
  }

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = !search.trim() ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || c.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roleOptions = ['all', 'guide', 'host', 'rental', 'restaurant', 'driver', 'agency', 'emergency', 'other'];

  return (
    <div className="min-h-screen bg-v2-background text-v2-on-surface font-plus-jakarta">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-v2-secondary font-bold mb-1 block">Trip Network</span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-v2-on-surface leading-none">
              Contacts
            </h1>
          </div>
          <button
            onClick={() => setFormContact(null)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-v2-primary text-v2-on-primary text-sm font-bold shadow-lg hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            Add Contact
          </button>
        </div>

        {/* ── Search ── */}
        <div className="mb-6">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-v2-on-surface-variant text-[18px]">search</span>
            <input
              type="text"
              placeholder="Search contacts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-v2-surface-container-lowest border border-v2-outline-variant/20 rounded-2xl pl-11 pr-4 py-3 text-sm text-v2-on-surface placeholder:text-v2-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-v2-primary/30"
            />
          </div>
        </div>

        {/* ── Role filter chips ── */}
        <div className="flex gap-2 overflow-x-auto v2-hide-scrollbar pb-2 mb-8">
          {roleOptions.map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                roleFilter === r
                  ? 'bg-v2-primary text-v2-on-primary shadow-md'
                  : 'bg-v2-surface-container-high text-v2-on-surface-variant hover:bg-v2-surface-container-highest'
              }`}
            >
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>

        {/* ── List ── */}
        {filteredContacts.length === 0 ? (
          <div className="text-center py-24">
            <span className="material-symbols-outlined text-6xl text-v2-on-surface-variant/20 mb-4 block">contacts</span>
            <p className="text-v2-on-surface-variant font-medium">
              {contacts.length === 0 ? 'No contacts yet — add one!' : 'No results'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredContacts.map(c => (
              <ContactCard key={c.id} contact={c} onOpen={() => setFormContact(c)} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
