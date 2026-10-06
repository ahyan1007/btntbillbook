import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata={title:'Bangladesh Tours & Travels — Bill Book',description:'Simple travel agency billing and due ledger.',manifest:'/manifest.webmanifest',icons:{icon:'/logo.svg',apple:'/logo.svg'}};
export const viewport={themeColor:'#1487c9'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang='en'><body>{children}</body></html>}