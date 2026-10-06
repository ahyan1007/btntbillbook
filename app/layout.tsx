import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata={title:'Bangladesh Tours & Travels — Bill Book',description:'Simple travel agency billing and due ledger.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang='en'><body>{children}</body></html>}