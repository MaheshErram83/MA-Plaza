import "./globals.css";

export const metadata = {
  title: "MA Plaza",
  description: "One app for all things home.",
  manifest: "/manifest.json",
  themeColor: "#8b7cf6",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MA Plaza",
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
