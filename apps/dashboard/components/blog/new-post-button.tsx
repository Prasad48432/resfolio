"use client";

import { Button, Spinner } from "@resfolio/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createPostAction } from "@/app/(dashboard)/blog/actions";
import { TEST_IDS } from "@/lib/testids";

/**
 * Create a post and go straight to it.
 *
 * No "name your post" dialog. A post's title is the first thing you type in the
 * editor anyway, so asking for it in a modal first is a form standing between
 * the user and writing — the exact friction this feature is meant to remove.
 * An untitled draft is a perfectly good thing to have.
 */
export function NewPostButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);

  function create() {
    setCreating(true);
    startTransition(async () => {
      const result = await createPostAction({ title: "" });
      if (result.ok) {
        router.push(`/blog/${result.data.id}`);
      } else {
        setCreating(false);
        toast.error(result.error);
      }
    });
  }

  const busy = pending || creating;

  return (
    <Button
      type="button"
      onClick={create}
      disabled={busy}
      data-testid={TEST_IDS.blogCreateButton}
    >
      {busy ? <Spinner className="size-4" /> : <Plus className="size-4" />}
      New post
    </Button>
  );
}
