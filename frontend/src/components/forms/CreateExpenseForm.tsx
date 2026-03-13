import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useFinance } from '@/context/FinanceContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createExpenseSchema } from '@/schemas/expense.schema';

const EXPENSE_CATEGORY_KEYS = [
  'food', 'transport', 'accommodation', 'attraction',
  'shopping', 'communication', 'insurance', 'tips', 'other',
] as const;

export function CreateExpenseForm() {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { addExpense } = useFinance();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(activeTrip?.currency || 'ILS');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isPaid, setIsPaid] = useState(false);

  const resetForm = () => {
    setDescription('');
    setCategory('other');
    setAmount('');
    setCurrency(activeTrip?.currency || 'ILS');
    setDate('');
    setNotes('');
    setIsPaid(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;

    const validation = createExpenseSchema.safeParse({
      description: description.trim(),
      category,
      amount: amount ? parseFloat(amount) : undefined,
      currency,
      date: date || undefined,
      notes: notes || undefined,
    });
    if (!validation.success) {
      toast({ title: "Validation error", description: validation.error.issues[0].message, variant: "destructive" });
      return;
    }

    await addExpense({
      tripId: activeTrip.id,
      description: description.trim(),
      category,
      amount: parseFloat(amount),
      currency,
      date: date || undefined,
      notes: notes || undefined,
      isPaid,
    });

    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1"><Plus size={16} /> {t('createExpense.title')}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('createExpense.addExpense')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expense-description">{t('createExpense.description')}</Label>
            <Input id="expense-description" name="description" value={description} onChange={e => setDescription(e.target.value)} required placeholder={t('createExpense.descriptionPlaceholder')} autoComplete="off" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-category">{t('createExpense.category')}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORY_KEYS.map(key => (
                  <SelectItem key={key} value={key}>{t(`expenseCategory.${key}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expense-amount">{t('createExpense.amount')}</Label>
              <Input id="expense-amount" name="amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-currency">{t('createExpense.currency')}</Label>
              <Input id="expense-currency" name="currency" value={currency} onChange={e => setCurrency(e.target.value)} placeholder="ILS" autoComplete="off" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-date">{t('createExpense.date')}</Label>
            <Input id="expense-date" name="date" type="date" value={date} onChange={e => setDate(e.target.value)} autoComplete="off" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-notes">{t('createExpense.notes')}</Label>
            <Textarea id="expense-notes" name="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('createExpense.notesPlaceholder')} autoComplete="off" />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is-paid-switch">{t('createExpense.paid')}</Label>
            <Switch id="is-paid-switch" checked={isPaid} onCheckedChange={setIsPaid} />
          </div>

          <Button type="submit" className="w-full">{t('createExpense.addExpense')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
