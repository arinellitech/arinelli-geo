import type { ReactNode } from 'react';
import { Document } from '../../components/document';
import { profileMetadata } from '../../lib/metadata';
import '../globals.css';

export function generateMetadata() {
  return profileMetadata('en');
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return <Document locale="en">{children}</Document>;
}
