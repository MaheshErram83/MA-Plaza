import "./globals.css";

export const metadata = {
  title: "MA Plaza",
  description: "One app for all things home.",
  manifest: "/manifest.json",
  themeColor: "#0d0d12",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MA Plaza",
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

function SWRegister() {
  return (
    <script dangerouslySetInnerHTML={{ __html: `
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    `}} />
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/app-icon-192.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0d0d12" />
      </head>
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
