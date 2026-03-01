import { useState } from 'react';
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

const EXPENSE_CATEGORIES = [
  { value: 'food', label: 'אוכל' },
  { value: 'transport', label: 'תחבורה' },
  { value: 'accommodation', label: 'לינה' },
  { value: 'attraction', label: 'אטרקציה' },
  { value: 'shopping', label: 'קניות' },
  { value: 'communication', label: 'תקשורת' },
  { value: 'insurance', label: 'ביטוח' },
  { value: 'tips', label: 'טיפים' },
  { value: 'other', label: 'אחר' },
];

export function CreateExpenseForm() {
  const { activeTrip } = useActiveTrip();
  const { addExpense } = useFinance();
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
    if (!activeTrip || !description.trim() || !amount) return;

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
        <Button variant="outline" className="gap-1"><Plus size={16} /> הוצאה חדשה</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>הוספת הוצאה</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>תיאור *</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} required placeholder="על מה ההוצאה..." />
          </div>

          <div className="space-y-2">
            <Label>קטגוריה</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>סכום *</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>מטבע</Label>
              <Input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="ILS" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>תאריך</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>הערות</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="פרטים נוספים..." />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is-paid-switch">שולם?</Label>
            <Switch id="is-paid-switch" checked={isPaid} onCheckedChange={setIsPaid} />
          </div>

          <Button type="submit" className="w-full">הוסף הוצאה</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
