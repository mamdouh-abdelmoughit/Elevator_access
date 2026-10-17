import './globals.css';

export const metadata = { title: 'BioSwitch Admin', description: 'Elevator management dashboard' };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="bg-slate-100 text-slate-800 antialiased">{children}</body>
    </html>
  );
}
