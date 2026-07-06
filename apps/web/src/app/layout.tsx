import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Augmentic — AI Workforce OS",
  description:
    "Hire AI employees for repetitive business work. Connect your tools, approve risky actions, and watch the work chart fill with completed work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
