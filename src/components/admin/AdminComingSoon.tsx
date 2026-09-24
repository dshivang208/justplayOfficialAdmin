import { Construction } from "lucide-react";
import type { NavItem } from "@/lib/nav";

export function AdminComingSoon({ item, blurb }: { item: NavItem; blurb: string }) {
  const Icon = item.icon;
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <span className="mt-4 inline-block text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Phase {item.phase}
        </span>
        <h1 className="mt-2 font-display text-3xl font-semibold text-foreground">
          {item.label}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{blurb}</p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-muted-foreground">
          <Construction className="h-3.5 w-3.5" />
          Building this in Phase {item.phase}
        </div>
      </div>
    </div>
  );
}
