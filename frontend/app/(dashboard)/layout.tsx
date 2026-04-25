export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <section>
      <header className="container">
        <h2>Dashboard</h2>
      </header>
      {children}
    </section>
  );
}
