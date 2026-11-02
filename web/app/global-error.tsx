"use client";

import { GeistSans } from "geist/font/sans";
import { StatusPage } from "@/components/status-page";
import { buttonClass } from "@/components/ui";
import "./globals.css";

/** Replaces the root layout when it fails, so it brings its own <html>/<body>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className={`${GeistSans.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <meta name="robots" content="noindex" />
        <div className="ambient-backdrop" aria-hidden="true" />
        <main className="flex-1 pt-16">
          <StatusPage
            orb="B2"
            label="Something went wrong"
            title="That didn’t work."
            body="The site hit an unexpected error. Trying again usually fixes it."
            actions={
              <>
                <button type="button" onClick={reset} className={buttonClass("primary", "lg")}>
                  Try again
                </button>
                {/* Plain link: the router may be unavailable when the root layout fails. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" className={buttonClass("glass", "lg")}>
                  Home
                </a>
              </>
            }
          />
        </main>
      </body>
    </html>
  );
}
