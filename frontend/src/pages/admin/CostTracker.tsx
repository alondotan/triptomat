import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Mail,
  MapPin,
  Server,
  Video,
  FileText,
  Map,
  Globe,
} from 'lucide-react';
import { useCosts } from '@/features/admin/useAdminQueries';
import type { CostResponse } from '@/features/admin/adminService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERIODS = ['7d', '30d', '90d'] as const;
type Period = (typeof PERIODS)[number];

function formatCost(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function periodLabel(period: string): string {
  const map: Record<string, string> = {
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
  };
  return map[period] ?? period;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CostBreakdownCard({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof DollarSign;
  items: Array<{ label: string; count?: number; unitPrice?: string; cost: number }>;
}) {
  const subtotal = items.reduce((sum, item) => sum + item.cost, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon size={18} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                {item.label}
                {item.count !== undefined && item.unitPrice && (
                  <span className="text-xs ml-1">
                    ({item.count} x {item.unitPrice})
                  </span>
                )}
              </div>
              <span className="font-medium text-foreground">{formatCost(item.cost)}</span>
            </div>
          ))}
          <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
            <span>Subtotal</span>
            <span>{formatCost(subtotal)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Video;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Icon size={20} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CostTrackerPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const { data, isLoading, error, refetch } = useCosts(period);

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

  const costs = data as CostResponse;
  const { usage, estimated_costs } = costs;
  const totalAnalyses =
    usage.video_analyses + usage.text_analyses + usage.maps_analyses + usage.web_analyses;
  const totalLambdaInvocations = Object.values(usage.lambda_invocations).reduce(
    (sum, n) => sum + n,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Cost Tracker</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Estimated API and infrastructure costs &mdash; {periodLabel(period)}
          </p>
        </div>

        {/* Period selector */}
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Estimate disclaimer */}
      <Badge variant="secondary" className="text-xs font-normal">
        All costs shown are rough estimates based on per-call pricing assumptions
      </Badge>

      {/* Total cost card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <DollarSign size={28} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estimated Total Cost</p>
              <p className="text-4xl font-bold text-foreground">
                {formatCost(estimated_costs.total)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {costs.start_date} &mdash; {costs.end_date}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost breakdown cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <CostBreakdownCard
          title="Gemini AI"
          icon={Sparkles}
          items={[
            {
              label: 'Video analysis (2.5-flash)',
              count: usage.video_analyses,
              unitPrice: '$0.003',
              cost: estimated_costs.gemini.video,
            },
            {
              label: 'Text/Maps/Web (2.0-flash)',
              count: usage.text_analyses + usage.maps_analyses + usage.web_analyses,
              unitPrice: '$0.001',
              cost: estimated_costs.gemini.text_maps_web,
            },
          ]}
        />

        <CostBreakdownCard
          title="OpenAI"
          icon={Mail}
          items={[
            {
              label: 'Email parsing (GPT-4o-mini)',
              count: usage.email_analyses,
              unitPrice: '$0.002',
              cost: estimated_costs.openai.email,
            },
          ]}
        />

        <CostBreakdownCard
          title="Google Maps"
          icon={MapPin}
          items={[
            {
              label: 'Geocoding API',
              count: totalAnalyses * 2,
              unitPrice: '$0.005',
              cost: estimated_costs.google_maps.geocoding,
            },
            {
              label: 'Static Maps API',
              count: totalAnalyses,
              unitPrice: '$0.002',
              cost: estimated_costs.google_maps.static_maps,
            },
          ]}
        />

        <CostBreakdownCard
          title="AWS Infrastructure"
          icon={Server}
          items={[
            {
              label: 'Lambda invocations',
              count: totalLambdaInvocations,
              unitPrice: '$0.0000002',
              cost: estimated_costs.aws_lambda,
            },
            {
              label: 'S3 storage',
              cost: estimated_costs.aws_s3,
            },
            {
              label: 'DynamoDB (on-demand)',
              cost: estimated_costs.aws_dynamodb,
            },
          ]}
        />
      </div>

      {/* Usage metrics */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Usage Metrics</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <UsageStatCard
            label="Video Analyses"
            value={usage.video_analyses}
            icon={Video}
          />
          <UsageStatCard
            label="Text Analyses"
            value={usage.text_analyses}
            icon={FileText}
          />
          <UsageStatCard
            label="Maps Analyses"
            value={usage.maps_analyses}
            icon={Map}
          />
          <UsageStatCard
            label="Web Analyses"
            value={usage.web_analyses}
            icon={Globe}
          />
          <UsageStatCard
            label="Email Analyses"
            value={usage.email_analyses}
            icon={Mail}
          />
          <UsageStatCard
            label="S3 Storage"
            value={`${usage.s3_storage_gb.toFixed(3)} GB`}
            icon={Server}
          />
        </div>
      </div>

      {/* Lambda invocations breakdown */}
      {Object.keys(usage.lambda_invocations).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Lambda Invocations
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(usage.lambda_invocations).map(([name, count]) => (
              <Card key={name}>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground capitalize">{name}</p>
                  <p className="text-2xl font-bold text-foreground">
                    {count.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
