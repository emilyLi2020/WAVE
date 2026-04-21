"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  seedId: string;
  loraId: string;
}

export function SeedActions({ seedId, loraId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!confirm("Delete this seed example? This cannot be undone.")) return;
    setError(null);
    const response = await fetch(`/api/training/seeds/${seedId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      setError(body.message ?? body.error ?? "Delete failed.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={`/training/${loraId}/${seedId}`}
        className="text-xs text-accent hover:underline"
      >
        Edit
      </a>
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        className="text-xs text-danger hover:underline disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
