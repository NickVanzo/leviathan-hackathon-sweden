import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Archivo_Black } from 'next/font/google';
import './globals.css';

const sans = Inter({
    subsets: ['latin'],
    variable: '--font-sans',
    display: 'swap',
});

const mono = JetBrains_Mono({
    subsets: ['latin'],
    variable: '--font-mono',
    display: 'swap',
});

const display = Archivo_Black({
    subsets: ['latin'],
    weight: '400',
    variable: '--font-display',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'Leviathan — maritime shadow-fleet intelligence',
    description: 'Resilient peer-to-peer surveillance of sanctioned shadow-fleet vessels.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
            <body>{children}</body>
        </html>
    );
}
