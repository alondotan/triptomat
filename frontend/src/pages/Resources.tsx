import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { AppLayout } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Youtube, Globe, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  loadCountryResources,
  triggerResourceSearch,
  isStale,
  mergeResources,
  invalidateResourceCache,
  type CountryResource,
  type ResourceCategory,
} from '@/services/resourceService';
import { useToast } from '@/hooks/use-toast';

// Platform icon + color mapping
const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: 'bg-red-100 text-red-700 border-red-200' },
  facebook: { label: 'Facebook', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  instagram: { label: 'Instagram', color: 'bg-pink-100 text-pink-700 border-pink-200' },
  tiktok: { label: 'TikTok', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  article: { label: 'Article', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const SOURCE_TYPES = ['all', 'youtube', 'article', 'facebook', 'instagram', 'tiktok'] as const;

const CATEGORIES: { key: ResourceCategory | 'all'; labelKey: string; color: string }[] = [
  { key: 'all', labelKey: 'resourcesPage.allCategories', color: '' },
  { key: 'attractions', labelKey: 'resourcesPage.catAttractions', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'food', labelKey: 'resourcesPage.catFood', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { key: 'hotels', labelKey: 'resourcesPage.catHotels', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { key: 'nightlife', labelKey: 'resourcesPage.catNightlife', color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
  { key: 'general', labelKey: 'resourcesPage.catGeneral', color: 'bg-sky-100 text-sky-700 border-sky-200' },
];

function ResourceCard({ resource }: { resource: CountryResource }) {
  const platform = PLATFORM_CONFIG[resource.source_type] || PLATFORM_CONFIG.other;
  const category = CATEGORIES.find(c => c.key === resource.category);
  const isVideo = ['youtube', 'tiktok', 'facebook', 'instagram'].includes(resource.source_type);

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Video-style card: large thumbnail on top */}
      {isVideo && resource.thumbnail ? (
        <div className="relative w-full aspect-video bg-muted overflow-hidden">
          <img
            src={resource.thumbnail}
            alt={resource.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {resource.source_type === 'youtube' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-red-600/90 rounded-full p-3">
                <Youtube size={24} className="text-white" />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Article-style: horizontal layout with small thumbnail */}
      {!isVideo || !resource.thumbnail ? (
        <div className="flex gap-3 p-3">
          {resource.thumbnail && (
            <div className="shrink-0 w-24 h-24 rounded overflow-hidden bg-muted">
              <img
                src={resource.thumbnail}
                alt={resource.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
              {resource.title}
            </h3>
            {resource.snippet && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{resource.snippet}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${platform.color}`}>
                {platform.label}
              </Badge>
              {category && category.key !== 'all' && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${category.color}`}>
                  {category.labelKey.split('.').pop()}
                </Badge>
              )}
              {resource.channel && (
                <span className="text-[10px] text-muted-foreground truncate">{resource.channel}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Video card bottom info */
        <div className="p-3">
          <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {resource.title}
          </h3>
          {resource.snippet && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{resource.snippet}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${platform.color}`}>
              {platform.label}
            </Badge>
            {category && category.key !== 'all' && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${category.color}`}>
                {category.labelKey.split('.').pop()}
              </Badge>
            )}
            {resource.channel && (
              <span className="text-[10px] text-muted-foreground truncate">{resource.channel}</span>
            )}
            <ExternalLink size={10} className="text-muted-foreground ms-auto shrink-0" />
          </div>
        </div>
      )}
    </a>
  );
}

function SkeletonCards() {
  return (
    <>
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-lg border bg-card overflow-hidden">
          <Skeleton className="w-full aspect-video" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

const Resources = () => {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { toast } = useToast();

  const [resources, setResources] = useState<CountryResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchingCountries, setSearchingCountries] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  const countries = activeTrip?.countries || [];

  // Load resources from S3 for all trip countries
  const loadAll = useCallback(async () => {
    if (countries.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const allResources: CountryResource[] = [];
    const staleCountries: string[] = [];
    const missingCountries: string[] = [];

    const results = await Promise.all(
      countries.map(async (country) => {
        const file = await loadCountryResources(country);
        return { country, file };
      })
    );

    for (const { country, file } of results) {
      if (!file) {
        missingCountries.push(country);
      } else {
        allResources.push(...file.resources);
        if (isStale(file)) {
          staleCountries.push(country);
        }
      }
    }

    setResources(allResources);
    setLoading(false);

    // For missing countries: show loading and trigger search
    if (missingCountries.length > 0) {
      setSearchingCountries(prev => new Set([...prev, ...missingCountries]));
      for (const country of missingCountries) {
        triggerSearch(country);
      }
    }

    // For stale countries: trigger background search (data already shown)
    if (staleCountries.length > 0) {
      setSearchingCountries(prev => new Set([...prev, ...staleCountries]));
      for (const country of staleCountries) {
        triggerSearch(country);
      }
    }
  }, [countries.join(',')]);

  const triggerSearch = async (country: string) => {
    try {
      const newResources = await triggerResourceSearch(country);
      if (newResources.length > 0) {
        setResources(prev => mergeResources(prev, newResources));
      }
    } catch (err: any) {
      console.error(`[resources] Search failed for ${country}:`, err);
      toast({
        title: t('resourcesPage.searchFailed', { country }),
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSearchingCountries(prev => {
        const next = new Set(prev);
        next.delete(country);
        return next;
      });
    }
  };

  const handleRefresh = async () => {
    for (const country of countries) {
      invalidateResourceCache(country);
    }
    setSearchingCountries(new Set(countries));
    setResources([]);

    for (const country of countries) {
      triggerSearch(country);
    }
  };

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Filter resources by category + source type
  const filteredResources = useMemo(() => {
    let filtered = resources;
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(r => r.category === selectedCategory);
    }
    if (selectedType !== 'all') {
      filtered = filtered.filter(r => r.source_type === selectedType);
    }
    return filtered;
  }, [resources, selectedCategory, selectedType]);

  if (!activeTrip) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div>
      </AppLayout>
    );
  }

  if (loading && resources.length === 0) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SkeletonCards />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t('resourcesPage.title')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('resourcesPage.subtitle')}
              {searchingCountries.size > 0 && (
                <span className="inline-flex items-center gap-1 ms-2 text-primary">
                  <Loader2 size={12} className="animate-spin" />
                  {t('resourcesPage.updating')}
                </span>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={searchingCountries.size > 0}
          >
            <RefreshCw size={16} className={searchingCountries.size > 0 ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => {
            const isActive = selectedCategory === cat.key;
            return (
              <Badge
                key={cat.key}
                variant={isActive ? 'default' : 'outline'}
                className={`cursor-pointer text-xs ${isActive ? '' : 'hover:bg-muted'} ${!isActive ? cat.color : ''}`}
                onClick={() => setSelectedCategory(cat.key)}
              >
                {t(cat.labelKey)}
              </Badge>
            );
          })}
        </div>

        {/* Source type filters */}
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_TYPES.map(type => {
            const isActive = selectedType === type;
            const platform = type === 'all' ? null : PLATFORM_CONFIG[type];
            return (
              <Badge
                key={type}
                variant={isActive ? 'default' : 'outline'}
                className={`cursor-pointer text-xs ${isActive ? '' : 'hover:bg-muted'} ${!isActive && platform ? platform.color : ''}`}
                onClick={() => setSelectedType(type)}
              >
                {type === 'all' ? t('resourcesPage.allTypes') : platform?.label || type}
              </Badge>
            );
          })}
        </div>

        {/* Feed */}
        {filteredResources.length === 0 && searchingCountries.size === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Globe size={48} className="mx-auto mb-4 opacity-30" />
            <p>{t('resourcesPage.noResources')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredResources.map((resource, i) => (
              <ResourceCard key={`${resource.url}-${i}`} resource={resource} />
            ))}
            {searchingCountries.size > 0 && resources.length === 0 && <SkeletonCards />}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Resources;
