import "./globals.css";

export const metadata = {
  title: "House Treasurer",
  description: "One fund, one treasurer.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
