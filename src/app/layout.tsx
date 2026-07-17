import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ghostwriter Intern',
  description: 'Say your day out loud. Wake up to a done inbox.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
