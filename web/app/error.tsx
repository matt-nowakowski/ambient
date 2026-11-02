"use client";

import { StatusPage } from "@/components/status-page";
import { ButtonLink, buttonClass } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <meta name="robots" content="noindex" />
      <StatusPage
        orb="B2"
        label="Something went wrong"
        title="That didn’t work."
        body="An unexpected error interrupted this page. Trying again usually fixes it."
        actions={
          <>
            <button type="button" onClick={reset} className={buttonClass("primary", "lg")}>
              Try again
            </button>
            <ButtonLink href="/" variant="glass" size="lg">
              Home
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
