import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Copper Control Tower — RBD Production, Traceability & Costing System',
  description:
    'Copper rod breakdown (RBD), downstream drawing, multi-stage genealogy, and copper costing system for Atlanta Tele Cables, Notofire, and Valuecon.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-copper-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
