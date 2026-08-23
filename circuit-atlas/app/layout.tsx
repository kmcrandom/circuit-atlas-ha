import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { RuntimeBasePathProvider } from "@/lib/client/runtime-path";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Document every breaker, box, device, cable, conductor, and smart-home upgrade in one private electrical atlas.";

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    requestHeaders.get("host")?.split(",")[0]?.trim();
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

export async function generateMetadata(): Promise<Metadata> {
  const origin = await requestOrigin();
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Circuit Atlas",
      template: "%s · Circuit Atlas",
    },
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title: "Circuit Atlas",
      description,
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "Circuit Atlas — map the house behind the walls",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Circuit Atlas",
      description,
      images: [socialImage],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const candidate = requestHeaders.get("x-circuit-atlas-base-path") ?? "";
  const basePath = /^\/api\/hassio_ingress\/[A-Za-z0-9_-]{1,256}$/.test(candidate)
    ? candidate
    : "";
  return (
    <html data-circuit-atlas-base-path={basePath} lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <RuntimeBasePathProvider basePath={basePath}>
          {children}
        </RuntimeBasePathProvider>
      </body>
    </html>
  );
}
