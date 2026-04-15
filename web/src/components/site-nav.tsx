import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/feature", label: "Core feature" },
] as const;

export function SiteNav() {
  return (
    <header className="border-b border-foreground/10 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          Wave
        </Link>
        <nav className="flex gap-6 text-sm" aria-label="Primary">
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
