import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from 'next/script';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: "Live Translation App - Real-time Speech Translation",
    template: "%s | Live Translation App"
  },
  description: "Free real-time speech-to-text translation application. Instantly translate between English, Hindi, and Khasi with high accuracy. Perfect for meetings, presentations, and cross-cultural communication.",
  keywords: [
    "live translation",
    "speech to text",
    "real-time translation",
    "English translation",
    "Hindi translation",
    "Khasi translation",
    "voice translation",
    "language translation app",
    "instant translation",
    "multilingual translation"
  ],
  authors: [{ name: "Your Name" }],
  creator: "Your Name",
  publisher: "Your Name",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/en-US',
    },
  },
  openGraph: {
    title: "Live Translation App - Real-time Speech Translation",
    description: "Free real-time speech-to-text translation application. Instantly translate between English, Hindi, and Khasi with high accuracy. Perfect for meetings, presentations, and cross-cultural communication.",
    type: "website",
    url: '/',
    siteName: "Live Translation App",
    locale: "en_US",
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: "Live Translation App - Real-time Speech Translation Preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Translation App - Real-time Speech Translation",
    description: "Free real-time speech-to-text translation application. Instantly translate between English, Hindi, and Khasi with high accuracy.",
    creator: "@yourtwitterhandle",
    images: ['/og-image.png'],
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'technology',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/Kaption.png', sizes: 'any' },
      { url: '/Kaption.png', sizes: '192x192', type: 'image/png' },
      { url: '/Kaption.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/Kaption.png' }
    ]
  },
  themeColor: '#121212'
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning>
        {children}
        
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Live Translation App',
              description: 'Real-time speech-to-text translation application supporting multiple languages including English, Hindi, and Khasi.',
              url: process.env.NEXT_PUBLIC_APP_URL,
              applicationCategory: 'UtilityApplication',
              operatingSystem: 'Any',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD'
              },
              featureList: [
                'Real-time speech-to-text transcription',
                'Instant translation to multiple languages',
                'Mobile-responsive design',
                'Live mode and history viewing'
              ],
              browserRequirements: 'Requires a modern browser with Web Speech API support',
              author: {
                '@type': 'Person',
                name: 'Your Name'
              }
            })
          }}
        />
      </body>
    </html>
  );
}
