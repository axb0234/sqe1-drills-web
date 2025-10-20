import 'bootstrap/dist/css/bootstrap.min.css';
import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { ReactNode } from 'react';

import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import Providers from '../components/Providers';

export const metadata: Metadata = {
  title: 'SQE1 Drills',
  description: 'Self-hosted SQE1 MCQ drills'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Font Awesome v7 (CDN) */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css"
          referrerPolicy="no-referrer"
        />
      </head>
      <body className="bg-light">
        {/* Bootstrap JS */}
        <Script
          src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
          strategy="afterInteractive"
        />
        {/* Auth context provider wraps the whole app */}
        <Providers>
          <NavBar />
          <main className="container my-4">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
