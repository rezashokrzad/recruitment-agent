import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "سامانه استخدام",
  description: "ارسال رزومه و مدیریت فرایند استخدام",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full antialiased`} style={{ colorScheme: "light" }}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" dir="rtl" richColors theme="light" toastOptions={{ style: { fontFamily: "inherit" } }} />
      </body>
    </html>
  );
}
