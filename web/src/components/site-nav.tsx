import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/session", label: "Session" },
  { href: "/history", label: "History" },
] as const;

export function SiteNav() {
  return (
    <header className="border-b border-foreground/10 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          WAVE
        </Link>
        <nav
          className="flex flex-wrap justify-end gap-x-5 gap-y-1 text-sm"
          aria-label="Primary"
        >
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-foreground/70 transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
