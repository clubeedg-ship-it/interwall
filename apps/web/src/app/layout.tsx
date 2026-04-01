import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppShellFrame } from '@interwall/ui';

import './globals.css';

export const metadata: Metadata = {
    title: 'interwall',
    description:
        'Tenant-safe inventory foundation for multi-organization warehouse operations.',
};

interface RootLayoutProps {
    children: ReactNode;
}

export default function RootLayout({
    children,
}: RootLayoutProps): JSX.Element {
    return (
        <html lang="en">
            <body className="min-h-screen bg-[var(--surface-canvas)] font-sans antialiased">
                <AppShellFrame>{children}</AppShellFrame>
            </body>
        </html>
    );
}
