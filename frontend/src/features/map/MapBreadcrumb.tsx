import type { Breadcrumb } from '@/features/geodata/useCountryMapData';

interface MapBreadcrumbProps {
  breadcrumbs: Breadcrumb[];
  onJumpTo: (index: number) => void;
  onBack: () => void;
  canGoBack: boolean;
}

export function MapBreadcrumb({ breadcrumbs, onJumpTo, onBack, canGoBack }: MapBreadcrumbProps) {
  if (breadcrumbs.length === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2 max-w-[calc(100%-80px)]">
      <button
        onClick={onBack}
        disabled={!canGoBack}
        className="bg-zinc-800/90 text-zinc-100 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow text-sm font-medium border-0 cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-zinc-700 transition-colors flex-shrink-0"
      >
        ←
      </button>
      <div className="bg-zinc-800/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow text-sm text-zinc-100 flex items-center gap-1.5 flex-wrap">
        {breadcrumbs.map((crumb, i) => {
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
              {i > 0 && <span className="text-zinc-500">/</span>}
              {isLast ? (
                <span className="font-semibold text-zinc-100">{crumb.name}</span>
              ) : (
                <button
                  onClick={() => onJumpTo(i)}
                  className="text-blue-400 hover:underline bg-transparent border-0 p-0 cursor-pointer text-sm"
                >
                  {crumb.name}
                </button>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
