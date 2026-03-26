import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { useFinance } from '@/features/finance/FinanceContext';
import { usePOI } from '@/features/poi/POIContext';
import { useTransport } from '@/features/transport/TransportContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plane, Building2, MapPin, DollarSign, Wrench, Trash2, Pencil, X, Check, CheckCircle2, Clock } from 'lucide-react';
import { AppLayout } from '@/shared/components/layout';
import { CreateExpenseForm } from '@/features/finance/CreateExpenseForm';
import type { Expense } from '@/types/trip';

type PaidFilter = 'all' | 'paid' | 'unpaid';

const BudgetPage = () => {
  const { t } = useTranslation();
  const { activeTrip, exchangeRates } = useActiveTrip();
  const { expenses, getCostBreakdown, formatCurrency, formatDualCurrency, convertToPreferredCurrency, updateExpense, deleteExpense, togglePaidStatus } = useFinance();
  const { pois } = usePOI();
  const { transportation } = useTransport();
  const breakdown = getCostBreakdown();
  const preferred = activeTrip?.currency || 'ILS';

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [paidFilter, setPaidFilter] = useState<PaidFilter>('all');

  const categories = [
    { label: t('budgetPage.categoryTransport'), value: breakdown.transport, icon: Plane, color: 'bg-transport-flight' },
    { label: t('budgetPage.categoryAccommodation'), value: breakdown.lodging, icon: Building2, color: 'bg-primary' },
    { label: t('budgetPage.categoryActivities'), value: breakdown.activities, icon: MapPin, color: 'bg-accent' },
    { label: t('budgetPage.categoryServices'), value: breakdown.services, icon: Wrench, color: 'bg-muted-foreground' },
  ].map(c => ({ ...c, percentage: breakdown.total > 0 ? (c.value / breakdown.total) * 100 : 0 }));

  // Build all expense lines
  const poiExpenses = pois
    .filter(p => p.details.cost && p.details.cost.amount > 0)
    .map(p => ({
      id: p.id,
      type: 'poi' as const,
      entityType: 'poi' as const,
      description: p.name,
      category: p.category,
      amount: p.details.cost!.amount,
      currency: p.details.cost!.currency || preferred,
      isPaid: p.isPaid,
    }));

  const transportExpenses = transportation
    .filter(t => t.cost.total_amount > 0)
    .map(t => ({
      id: t.id,
      type: 'transport' as const,
      entityType: 'transport' as const,
      description: t.segments.length > 0 ? `${t.segments[0].from.name} → ${t.segments[t.segments.length - 1].to.name}` : t.category,
      category: t.category,
      amount: t.cost.total_amount,
      currency: t.cost.currency || preferred,
      isPaid: t.isPaid,
    }));

  const manualExpenses = expenses.map(e => ({
    id: e.id,
    type: 'manual' as const,
    entityType: 'expense' as const,
    description: e.description,
    category: e.category,
    amount: e.amount,
    currency: e.currency,
    date: e.date,
    isPaid: e.isPaid,
  }));

  const allExpenses = [...poiExpenses, ...transportExpenses, ...manualExpenses];

  // Filtered expenses
  const filteredExpenses = allExpenses.filter(exp => {
    if (paidFilter === 'paid') return exp.isPaid;
    if (paidFilter === 'unpaid') return !exp.isPaid;
    return true;
  });

  // Paid / unpaid totals in preferred currency
  const paidTotal = allExpenses
    .filter(e => e.isPaid)
    .reduce((sum, e) => {
      const converted = convertToPreferredCurrency(e.amount, e.currency);
      return sum + (converted ?? e.amount);
    }, 0);

  const unpaidTotal = allExpenses
    .filter(e => !e.isPaid)
    .reduce((sum, e) => {
      const converted = convertToPreferredCurrency(e.amount, e.currency);
      return sum + (converted ?? e.amount);
    }, 0);

  const startEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setEditDesc(expense.description);
    setEditAmount(expense.amount.toString());
    setEditCurrency(expense.currency);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateExpense(editingId, {
      description: editDesc,
      amount: parseFloat(editAmount),
      currency: editCurrency,
    });
    setEditingId(null);
  };

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{t('budgetPage.title')}</h2>
          <div className="flex items-center gap-2">
            {exchangeRates && (
              <span className="text-xs text-muted-foreground">
                {t('budgetPage.exchangeRates', { currency: preferred, date: new Date(exchangeRates.fetchedAt).toLocaleDateString('he-IL') })}
              </span>
            )}
            <CreateExpenseForm />
          </div>
        </div>

        <Card className="bg-hero-gradient text-primary-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary-foreground/80">
              <DollarSign size={20} /> {t('budgetPage.totalEstimatedCost', { currency: preferred })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{formatCurrency(Math.round(breakdown.total), preferred)}</p>
            <p className="text-primary-foreground/70 mt-1">{activeTrip.name}</p>
            <div className="flex gap-4 mt-3">
              <span className="flex items-center gap-1 text-sm text-primary-foreground/80">
                <CheckCircle2 size={14} className="text-green-300" />
                {t('budgetPage.paidLabel')} {formatCurrency(Math.round(paidTotal), preferred)}
              </span>
              <span className="flex items-center gap-1 text-sm text-primary-foreground/80">
                <Clock size={14} className="text-yellow-300" />
                {t('budgetPage.unpaidLabel')} {formatCurrency(Math.round(unpaidTotal), preferred)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-4">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <Card key={cat.label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${cat.color} text-primary-foreground`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{cat.label}</p>
                      <p className="text-xl font-bold">{formatCurrency(Math.round(cat.value), preferred)}</p>
                    </div>
                  </div>
                  <Progress value={cat.percentage} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">{t('budgetPage.percentOfTotal', { percent: cat.percentage.toFixed(1) })}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Separator />

        {/* Detailed expense list */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">{t('budgetPage.expenseDetails', { count: filteredExpenses.length })}</h3>
            {/* Filter tabs */}
            <div className="flex gap-1 border rounded-lg p-1">
              {(['all', 'paid', 'unpaid'] as PaidFilter[]).map(f => (
                <Button
                  key={f}
                  variant={paidFilter === f ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setPaidFilter(f)}
                >
                  {f === 'all' ? t('common.all') : f === 'paid' ? t('common.paid') : t('common.unpaid')}
                </Button>
              ))}
            </div>
          </div>
          {filteredExpenses.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{t('budgetPage.noExpenses')}</p>
          ) : (
            <Card>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('budgetPage.sourceColumn')}</TableHead>
                      <TableHead>{t('budgetPage.descriptionColumn')}</TableHead>
                      <TableHead>{t('budgetPage.categoryColumn')}</TableHead>
                      <TableHead className="text-left">{t('budgetPage.amountColumn')}</TableHead>
                      <TableHead>{t('budgetPage.statusColumn')}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map(exp => (
                      <TableRow key={`${exp.type}-${exp.id}`}>
                        <TableCell>
                          <Badge variant={exp.type === 'manual' ? 'default' : 'secondary'} className="text-xs">
                            {exp.type === 'poi' ? t('budgetPage.sourcePOI') : exp.type === 'transport' ? t('budgetPage.sourceTransport') : t('budgetPage.sourceManual')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {editingId === exp.id ? (
                            <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="h-8" />
                          ) : (
                            exp.description
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t(`expenseCategory.${exp.category}`, exp.category)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {editingId === exp.id ? (
                            <div className="flex gap-1">
                              <Input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="h-8 w-20" />
                              <Input value={editCurrency} onChange={e => setEditCurrency(e.target.value)} className="h-8 w-16" />
                            </div>
                          ) : (
                            formatDualCurrency(exp.amount, exp.currency)
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 px-2 gap-1 text-xs ${exp.isPaid ? 'text-green-600' : 'text-muted-foreground'}`}
                            onClick={() => togglePaidStatus(exp.entityType, exp.id, !exp.isPaid)}
                          >
                            {exp.isPaid
                              ? <><CheckCircle2 size={13} /> {t('common.paid')}</>
                              : <><Clock size={13} /> {t('common.unpaid')}</>
                            }
                          </Button>
                        </TableCell>
                        <TableCell>
                          {exp.type === 'manual' && (
                            <div className="flex gap-1">
                              {editingId === exp.id ? (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}><Check size={14} /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}><X size={14} /></Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(expenses.find(e => e.id === exp.id)!)}><Pencil size={14} /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteExpense(exp.id)}><Trash2 size={14} /></Button>
                                </>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default BudgetPage;
