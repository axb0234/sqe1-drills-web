import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { ReactNode } from 'react';

import NavBar from '../components/NavBar';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'SQE1 Drills',
  description: 'Self-hosted SQE1 MCQ drills'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-light">
        {/* Load Bootstrap JS after hydration */}
        <Script
          src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
          strategy="afterInteractive"
        />
        <NavBar />
        <main className="container my-4">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
