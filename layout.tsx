import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEXAINDO | Internet Management',
  description: 'Manajemen pelanggan, tagihan, dan pembayaran NEXAINDO.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
