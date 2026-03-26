import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Link2,
  Mail,
  Globe,
  MapPin,
  Bus,
  CalendarDays,
  ArrowRight,
} from 'lucide-react';
import { useFunnel } from '@/features/admin/useAdminQueries';
import type { FunnelData, LinkageData } from '@/features/admin/adminService';

// -- Helpers ----------------------------------------------------------------

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function fmtPct(numerator: number, denominator: number): string {
  return denominator > 0 ? `${pct(numerator, denominator)}%` : '--';
}

// -- Sub-components ---------------------------------------------------------

/** A single stage in the funnel visualization — a coloured bar whose width is proportional to its value. */
function FunnelBar({
  label,
  value,
  maxValue,
  color,
  subLabel,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  subLabel?: string;
}) {
  const widthPct = maxValue > 0 ? Math.max((value / maxValue) * 100, 8) : 8;

  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 text-right">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {subLabel && (
          <p className="text-xs text-muted-foreground">{subLabel}</p>
        )}
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div
          className={`h-8 rounded ${color} transition-all duration-500 flex items-center justify-end pr-2`}
          style={{ width: `${widthPct}%`, minWidth: '2.5rem' }}
        >
          <span className="text-xs font-bold text-white">{value}</span>
        </div>
      </div>
    </div>
  );
}

/** Conversion arrow between two funnel stages. */
function ConversionArrow({
  from,
  to,
  fromLabel,
  toLabel,
}: {
  from: number;
  to: number;
  fromLabel: string;
  toLabel: string;
}) {
  const rate = fmtPct(to, from);
  return (
    <div className="flex items-center gap-2 pl-44 text-xs text-muted-foreground">
      <ArrowRight size={14} className="text-muted-foreground/50" />
      <span>
        {fromLabel} → {toLabel}: <span className="font-semibold text-foreground">{rate}</span>
      </span>
    </div>
  );
}

/** Card showing POI status breakdown as a horizontal stacked bar. */
function POIStatusBreakdown({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  const statusConfig: Record<string, { color: string; bg: string }> = {
    candidate: { color: 'bg-amber-400', bg: 'bg-amber-400/15 text-amber-700' },
    in_plan: { color: 'bg-blue-500', bg: 'bg-blue-500/15 text-blue-700' },
    booked: { color: 'bg-emerald-500', bg: 'bg-emerald-500/15 text-emerald-700' },
    visited: { color: 'bg-violet-500', bg: 'bg-violet-500/15 text-violet-700' },
    matched: { color: 'bg-pink-500', bg: 'bg-pink-500/15 text-pink-700' },
  };

  const entries = Object.entries(byStatus).filter(([, count]) => count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin size={18} />
          POI Status Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked bar */}
        {total > 0 ? (
          <div className="flex h-6 rounded overflow-hidden">
            {entries.map(([status, count]) => {
              const cfg = statusConfig[status] ?? { color: 'bg-gray-400', bg: '' };
              const w = pct(count, total);
              return (
                <div
                  key={status}
                  className={`${cfg.color} transition-all duration-500`}
                  style={{ width: `${w}%`, minWidth: w > 0 ? '1rem' : 0 }}
                  title={`${status}: ${count} (${w}%)`}
                />
              );
            })}
          </div>
        ) : (
          <div className="h-6 rounded bg-muted" />
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {entries.map(([status, count]) => {
            const cfg = statusConfig[status] ?? { color: 'bg-gray-400', bg: 'bg-gray-100 text-gray-700' };
            return (
              <div key={status} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${cfg.color}`} />
                <span className="text-sm capitalize">{status.replace('_', ' ')}</span>
                <Badge variant="secondary" className="text-xs ml-0.5">
                  {count}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Linkage statistics card. */
function LinkageStats({ linkage, totalPois }: { linkage: LinkageData; totalPois: number }) {
  const manual =
    totalPois - linkage.pois_from_emails - linkage.pois_from_recommendations;
  const manualCount = Math.max(manual, 0);

  const sources = [
    { label: 'From Emails', value: linkage.pois_from_emails, color: 'bg-blue-500' },
    { label: 'From Recommendations', value: linkage.pois_from_recommendations, color: 'bg-emerald-500' },
    { label: 'Manual / Other', value: manualCount, color: 'bg-gray-400' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 size={18} />
          Entity Linkage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* POI origin breakdown */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">POI Sources</p>
          {sources.map((src) => (
            <div key={src.label} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{src.label}</span>
                <span className="font-medium">
                  {src.value} ({fmtPct(src.value, totalPois)})
                </span>
              </div>
              <Progress value={pct(src.value, totalPois)} className="h-2" />
            </div>
          ))}
        </div>

        {/* Avg entities per source */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">
              {linkage.avg_entities_per_email}
            </p>
            <p className="text-xs text-muted-foreground">Avg entities per email</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">
              {linkage.avg_entities_per_recommendation}
            </p>
            <p className="text-xs text-muted-foreground">Avg entities per recommendation</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Itinerary days card. */
function ItineraryDaysCard({
  total,
  withActivities,
  empty,
}: {
  total: number;
  withActivities: number;
  empty: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays size={18} />
          Itinerary Days
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-center flex-1">
            <p className="text-3xl font-bold text-foreground">{total}</p>
            <p className="text-xs text-muted-foreground">Total Days</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-3xl font-bold text-emerald-600">{withActivities}</p>
            <p className="text-xs text-muted-foreground">With Activities</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-3xl font-bold text-amber-500">{empty}</p>
            <p className="text-xs text-muted-foreground">Empty</p>
          </div>
        </div>
        {total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Fill rate</span>
              <span className="font-medium text-foreground">{fmtPct(withActivities, total)}</span>
            </div>
            <Progress value={pct(withActivities, total)} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -- Main page component ----------------------------------------------------

export default function FunnelPage() {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useFunnel();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">{error.message}</p>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw size={14} />
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { funnel, linkage } = data;

  // Compute max value for funnel bar proportions
  const allTotals = [
    funnel.urls_submitted.total,
    funnel.emails_received.total,
    funnel.recommendations_created.total,
    funnel.pois_created.total,
    funnel.transportation_created.total,
    funnel.itinerary_days.total,
  ];
  const maxTotal = Math.max(...allTotals, 1);

  // POIs in itinerary = in_plan + booked + visited
  const poisInItinerary =
    (funnel.pois_created.by_status.in_plan ?? 0) +
    (funnel.pois_created.by_status.booked ?? 0) +
    (funnel.pois_created.by_status.visited ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Pipeline Funnel</h2>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {/* ---- URL / Recommendation Pipeline ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe size={18} />
            URL & Recommendation Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <FunnelBar
            label="URLs Submitted"
            value={funnel.urls_submitted.total}
            maxValue={maxTotal}
            color="bg-sky-500"
            subLabel={`${funnel.urls_submitted.completed} completed, ${funnel.urls_submitted.failed} failed`}
          />
          <ConversionArrow
            from={funnel.urls_submitted.total}
            to={funnel.recommendations_created.total}
            fromLabel="URLs"
            toLabel="Recommendations"
          />
          <FunnelBar
            label="Recommendations"
            value={funnel.recommendations_created.total}
            maxValue={maxTotal}
            color="bg-indigo-500"
            subLabel={`${funnel.recommendations_created.linked} linked, ${funnel.recommendations_created.pending} pending`}
          />
          <ConversionArrow
            from={funnel.recommendations_created.total}
            to={funnel.pois_created.total}
            fromLabel="Recommendations"
            toLabel="POIs"
          />
          <FunnelBar
            label="POIs Created"
            value={funnel.pois_created.total}
            maxValue={maxTotal}
            color="bg-emerald-500"
          />
          <ConversionArrow
            from={funnel.pois_created.total}
            to={poisInItinerary}
            fromLabel="POIs"
            toLabel="In Itinerary"
          />
          <FunnelBar
            label="In Itinerary"
            value={poisInItinerary}
            maxValue={maxTotal}
            color="bg-violet-500"
            subLabel="in_plan + booked + visited"
          />
        </CardContent>
      </Card>

      {/* ---- Email Pipeline ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail size={18} />
            Email Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <FunnelBar
            label="Emails Received"
            value={funnel.emails_received.total}
            maxValue={maxTotal}
            color="bg-sky-500"
            subLabel={`${funnel.emails_received.pending} pending, ${funnel.emails_received.cancelled} cancelled`}
          />
          <ConversionArrow
            from={funnel.emails_received.total}
            to={funnel.emails_received.linked}
            fromLabel="Emails"
            toLabel="Linked"
          />
          <FunnelBar
            label="Emails Linked"
            value={funnel.emails_received.linked}
            maxValue={maxTotal}
            color="bg-emerald-500"
          />
        </CardContent>
      </Card>

      {/* ---- Summary cards row ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600">
                <Globe size={20} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">URLs Submitted</p>
                <p className="text-2xl font-bold text-foreground">
                  {funnel.urls_submitted.total}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                <Mail size={20} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Emails Received</p>
                <p className="text-2xl font-bold text-foreground">
                  {funnel.emails_received.total}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                <MapPin size={20} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">POIs Created</p>
                <p className="text-2xl font-bold text-foreground">
                  {funnel.pois_created.total}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600">
                <Bus size={20} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Transportation</p>
                <p className="text-2xl font-bold text-foreground">
                  {funnel.transportation_created.total}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- Breakdown cards ---- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <POIStatusBreakdown
          byStatus={funnel.pois_created.by_status}
          total={funnel.pois_created.total}
        />
        <LinkageStats linkage={linkage} totalPois={funnel.pois_created.total} />
      </div>

      {/* ---- Itinerary days ---- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ItineraryDaysCard
          total={funnel.itinerary_days.total}
          withActivities={funnel.itinerary_days.with_activities}
          empty={funnel.itinerary_days.empty}
        />
      </div>
    </div>
  );
}
