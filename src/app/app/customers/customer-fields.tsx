import { Field, Input, Select, Textarea } from '@/components/ui/input'
import type { Customer } from '@/lib/types'

export function CustomerFields({ customer }: { customer?: Customer }) {
  return (
    <div className="space-y-4">
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" required defaultValue={customer?.name ?? ''} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone / WhatsApp" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={customer?.phone ?? ''} placeholder="+234…" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ''} />
        </Field>
        <Field label="Instagram" htmlFor="instagram_handle">
          <Input id="instagram_handle" name="instagram_handle" defaultValue={customer?.instagram_handle ?? ''} placeholder="@handle" />
        </Field>
        <Field label="Sentiment" htmlFor="sentiment" hint="Negative customers are always routed to a human.">
          <Select id="sentiment" name="sentiment" defaultValue={customer?.sentiment ?? 'neutral'}>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </Select>
        </Field>
      </div>
      <Field label="Delivery address" htmlFor="address">
        <Textarea id="address" name="address" rows={2} defaultValue={customer?.address ?? ''} />
      </Field>
      <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. vip, wholesale">
        <Input id="tags" name="tags" defaultValue={(customer?.tags ?? []).join(', ')} />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={customer?.notes ?? ''} />
      </Field>
    </div>
  )
}
