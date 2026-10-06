# Bangladesh Tours & Travels — Bill Book

Simple private travel-agency billing, customer ledger, bookings and payments.

## Stack
Next.js + TypeScript + Tailwind CSS + Supabase + Vercel.

## MVP
- Private email/password login
- Customer management
- New booking bill with multiple passengers
- Flight/travel date and service
- Automatic previous due + today's bill + payment + remaining due
- Running customer balance
- Payment entry
- Bill history
- Responsive blue/orange UI

## Supabase
Project: `btntbillbook`

Environment variables:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Initial schema and transaction RPCs are already applied to Supabase.

## Next
- Full customer ledger
- Branded A4 PDF bill and payment receipt
- PDF WhatsApp sharing
- Company settings and exact uploaded logo
- Vercel deployment
- Optional automated WhatsApp Cloud API


Build validation workflow enabled for the feature branch.
