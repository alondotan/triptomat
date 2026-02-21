import { useState } from 'react';
import { useTrip } from '@/context/TripContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plane, Building2, MapPin, DollarSign, Wrench, Trash2, Pencil, X, Check } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { CreateExpenseForm } from '@/components/forms/CreateExpenseForm';
import type { Expense } from '@/types/trip';

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  food: 'אוכל', transport: 'תחבורה', accommodation: 'לינה', attraction: 'אטרקציה',
  shopping: 'קניות', communication: 'תקשורת', insurance: 'ביטוח', tips: 'טיפים', other: 'אחר',
};

const BudgetPage = () => {
  const { getCostBreakdown, formatCurrency, formatDualCurrency, convertToPreferredCurrency, state, updateExpense, deleteExpense } = useTrip();
  const breakdown = getCostBreakdown();
  const preferred = state.activeTrip?.currency || 'ILS';

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('');

  const categories = [
    { label: 'תחבורה', value: breakdown.transport, icon: Plane, color: 'bg-transport-flight' },
    { label: 'לינה', value: breakdown.lodging, icon: Building2, color: 'bg-primary' },
    { label: 'פעילויות', value: breakdown.activities, icon: MapPin, color: 'bg-accent' },
    { label: 'שירותים', value: breakdown.services, icon: Wrench, color: 'bg-muted-foreground' },
  ].map(c => ({ ...c, percentage: breakdown.total > 0 ? (c.value / breakdown.total) * 100 : 0 }));

  // Build all expense lines
  const poiExpenses = state.pois
    .filter(p => p.details.cost && p.details.cost.amount > 0)
    .map(p => ({
      id: p.id,
      type: 'poi' as const,
      description: p.name,
      category: p.category,
      amount: p.details.cost!.amount,
      currency: p.details.cost!.currency || preferred,
    }));

  const transportExpenses = state.transportation
    .filter(t => t.cost.total_amount > 0)
    .map(t => ({
      id: t.id,
      type: 'transport' as const,
      description: t.segments.length > 0 ? `${t.segments[0].from.name} → ${t.segments[t.segments.length - 1].to.name}` : t.category,
      category: t.category,
      amount: t.cost.total_amount,
      currency: t.cost.currency || preferred,
    }));

  const manualExpenses = state.expenses.map(e => ({
    id: e.id,
    type: 'manual' as const,
    description: e.description,
    category: e.category,
    amount: e.amount,
    currency: e.currency,
    date: e.date,
  }));

  const allExpenses = [...poiExpenses, ...transportExpenses, ...manualExpenses];

  // Manual expenses total in preferred currency
  const manualTotal = state.expenses.reduce((sum, e) => {
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

  if (!state.activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">סקירה פיננסית</h2>
          <div className="flex items-center gap-2">
            {state.exchangeRates && (
              <span className="text-xs text-muted-foreground">
                שערי המרה ל-{preferred} • עודכן {new Date(state.exchangeRates.fetchedAt).toLocaleDateString('he-IL')}
              </span>
            )}
            <CreateExpenseForm />
          </div>
        </div>

        <Card className="bg-hero-gradient text-primary-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary-foreground/80">
              <DollarSign size={20} /> סה״כ עלות משוערת ({preferred})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{formatCurrency(Math.round(breakdown.total), preferred)}</p>
            <p className="text-primary-foreground/70 mt-1">{state.activeTrip.name}</p>
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
                  <p className="text-xs text-muted-foreground mt-2">{cat.percentage.toFixed(1)}% מהסכום</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Separator />

        {/* Detailed expense list */}
        <div>
          <h3 className="text-lg font-bold mb-4">פירוט הוצאות ({allExpenses.length})</h3>
          {allExpenses.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">אין הוצאות עדיין</p>
          ) : (
            <Card>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>מקור</TableHead>
                      <TableHead>תיאור</TableHead>
                      <TableHead>קטגוריה</TableHead>
                      <TableHead className="text-left">סכום</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allExpenses.map(exp => (
                      <TableRow key={`${exp.type}-${exp.id}`}>
                        <TableCell>
                          <Badge variant={exp.type === 'manual' ? 'default' : 'secondary'} className="text-xs">
                            {exp.type === 'poi' ? 'POI' : exp.type === 'transport' ? 'תחבורה' : 'ידני'}
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
                          {EXPENSE_CATEGORY_LABELS[exp.category] || exp.category}
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
                          {exp.type === 'manual' && (
                            <div className="flex gap-1">
                              {editingId === exp.id ? (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}><Check size={14} /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}><X size={14} /></Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(state.expenses.find(e => e.id === exp.id)!)}><Pencil size={14} /></Button>
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
