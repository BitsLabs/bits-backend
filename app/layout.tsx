import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bits Backend",
  description: "API backend for the Bits iOS app",
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
