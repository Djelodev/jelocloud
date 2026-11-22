import { Link } from "@tanstack/react-router";
export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 font-mono text-lg font-semibold">
      <span className="rounded bg-primary px-1.5 text-primary-foreground">&gt;_</span>
      Jelo<span className="text-primary">Cloud</span>
    </Link>
  );
}
