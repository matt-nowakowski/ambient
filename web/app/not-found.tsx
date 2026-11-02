import type { Metadata } from "next";
import { StatusPage } from "@/components/status-page";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <StatusPage
      orb="S4"
      label="Error 404"
      title="This page drifted off."
      body="We looked everywhere it could be. It isn’t here — maybe it moved, or the link is out of date."
      actions={
        <>
          <ButtonLink href="/" size="lg">
            Home
          </ButtonLink>
          <ButtonLink href="/download" variant="glass" size="lg">
            Download
          </ButtonLink>
        </>
      }
    />
  );
}
