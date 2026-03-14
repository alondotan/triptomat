import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, MapPin, Plane, Hotel, LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreatePOIForm } from '@/components/forms/CreatePOIForm';
import { CreateTransportForm } from '@/components/forms/CreateTransportForm';
import { CreateExternalRecommendationForm } from '@/components/forms/CreateExternalRecommendationForm';
import type { POICategory } from '@/types/trip';

type FormType = 'poi' | 'transport' | 'accommodation' | 'external' | null;

export function MobileFAB() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<FormType>(null);

  const openForm = (form: FormType) => {
    setMenuOpen(false);
    setActiveForm(form);
  };

  const menuItems = [
    { key: 'external' as const, icon: LinkIcon, label: t('fab.external'), color: 'text-purple-500' },
    { key: 'poi' as const, icon: MapPin, label: t('fab.poi'), color: 'text-blue-500' },
    { key: 'transport' as const, icon: Plane, label: t('fab.transport'), color: 'text-orange-500' },
    { key: 'accommodation' as const, icon: Hotel, label: t('fab.accommodation'), color: 'text-teal-500' },
  ];

  return (
    <>
      {/* Backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Menu items — positioned above the FAB */}
      <div className="fixed bottom-[calc(8.5rem+env(safe-area-inset-bottom))] end-4 z-40 md:hidden flex flex-col-reverse items-end gap-2">
        {menuItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={cn(
                'flex items-center gap-2 rounded-full bg-card shadow-lg border px-4 py-2.5 transition-all',
                menuOpen
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-4 pointer-events-none'
              )}
              style={{ transitionDelay: menuOpen ? `${i * 40}ms` : '0ms' }}
              onClick={() => openForm(item.key)}
            >
              <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
              <Icon size={18} className={item.color} />
            </button>
          );
        })}
      </div>

      {/* FAB button */}
      <button
        className={cn(
          'fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] end-4 z-50 md:hidden',
          'w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-xl',
          'flex items-center justify-center transition-transform duration-200',
          menuOpen && 'rotate-45'
        )}
        onClick={() => setMenuOpen(v => !v)}
        aria-label={menuOpen ? t('common.close') : t('fab.add')}
      >
        {menuOpen ? <X size={24} /> : <Plus size={24} />}
      </button>

      {/* Forms */}
      <CreatePOIForm
        open={activeForm === 'poi'}
        onOpenChange={(v) => { if (!v) setActiveForm(null); }}
      />
      <CreatePOIForm
        open={activeForm === 'accommodation'}
        onOpenChange={(v) => { if (!v) setActiveForm(null); }}
        initialCategory="accommodation"
      />
      <CreateTransportForm
        open={activeForm === 'transport'}
        onOpenChange={(v) => { if (!v) setActiveForm(null); }}
      />
      <CreateExternalRecommendationForm
        open={activeForm === 'external'}
        onOpenChange={(v) => { if (!v) setActiveForm(null); }}
      />
    </>
  );
}
