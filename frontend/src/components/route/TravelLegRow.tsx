import { Car, Footprints, Bus, Plane, TrainFront, Ship, Cable } from 'lucide-react';
import { type RouteLeg, type TravelMode, formatDuration, formatDistance } from '@/services/routeService';
import type { LucideIcon } from 'lucide-react';

const MODE_ICONS: Record<TravelMode, { icon: LucideIcon; className: string }> = {
  car:             { icon: Car,        className: 'text-indigo-600' },
  walk:            { icon: Footprints, className: 'text-green-600' },
  bus:             { icon: Bus,        className: 'text-cyan-600' },
  flight:          { icon: Plane,      className: 'text-red-600' },
  train:           { icon: TrainFront, className: 'text-violet-600' },
  ferry:           { icon: Ship,       className: 'text-sky-600' },
  other_transport: { icon: Cable,      className: 'text-amber-600' },
};

const NON_ROUTABLE: TravelMode[] = ['flight', 'train', 'ferry', 'other_transport'];

interface TravelLegRowProps {
  leg: RouteLeg;
  onHighlight?: () => void;
  onSetDuration?: (fromStopId: string) => void;
}

export function TravelLegRow({ leg, onHighlight, onSetDuration }: TravelLegRowProps) {
  const isNonRoutable = NON_ROUTABLE.includes(leg.mode);
  const modeInfo = MODE_ICONS[leg.mode] ?? MODE_ICONS.car;
  const Icon = modeInfo.icon;

  return (
    <div
      className="flex items-center gap-2 px-2 py-0.5 text-[11px] text-muted-foreground cursor-pointer hover:bg-muted/40 rounded transition-colors"
      onClick={onHighlight}
    >
      <div className="flex-1 h-px bg-border" />
      {leg.transportLabel ? (
        <span className={`shrink-0 font-medium whitespace-nowrap truncate max-w-[160px] ${modeInfo.className}`}>
          {leg.transportLabel}
        </span>
      ) : (
        <Icon size={11} className={`shrink-0 ${modeInfo.className}`} />
      )}
      {leg.isUnknown ? (
        <button
          className="text-[10px] text-amber-500 hover:text-amber-700 font-medium underline underline-offset-2"
          onClick={(e) => { e.stopPropagation(); onSetDuration?.(leg.fromStopId); }}
        >
          ? set duration
        </button>
      ) : (
        <span className="font-semibold text-primary whitespace-nowrap">
          {formatDuration(leg.durationMin)}
        </span>
      )}
      {!isNonRoutable && !leg.isUnknown && (
        <span className="whitespace-nowrap">{formatDistance(leg.distanceKm)}</span>
      )}
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
