import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { DisputeProvider } from "@/context/DisputeContext";
import { MarketplaceProvider } from "@/context/MarketplaceContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "TrustPay Escrow | Secure Milestone Marketplace",
  description:
    "An autonomous milestone escrow marketplace bridging companies with verified freelancers. Funds are held safely in escrow upfront and released step-by-step with intelligent advisory verification.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-screen flex flex-col bg-white text-gray-900 antialiased">
        <AuthProvider>
          <NotificationProvider>
            <DisputeProvider>
              <MarketplaceProvider>
                <Navbar />
                <main className="flex-1 w-full">{children}</main>
                <Footer />
              </MarketplaceProvider>
            </DisputeProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
