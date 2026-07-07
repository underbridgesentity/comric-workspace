import type { Metadata } from "next";
import { Archivo, Raleway } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-archivo",
});

const raleway = Raleway({
  subsets: ["latin"],
  variable: "--font-raleway",
});

export const metadata: Metadata = {
  title: "COMRiC Workspace",
  description: "COMRiC internal risk-intelligence and operations platform",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("comric-theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="en" className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <body className={`${archivo.variable} ${raleway.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
