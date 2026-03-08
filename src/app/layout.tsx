import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { WalletProvider } from '@/context/WalletContext';

export const metadata: Metadata = {
  title: "Satoshi's Market — Trustless Bitcoin Trading",
  description: 'Trustless peer-to-peer trading on Bitcoin. Buy and sell OP-721 NFTs and OP-20 tokens directly for BTC via OPNet.',
  icons: {
    icon: '/satoshilogo.png',
    apple: '/satoshilogo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <WalletProvider>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-10">
              {children}
            </main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
