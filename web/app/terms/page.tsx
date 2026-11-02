import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal";
import { brand, company, emails, mailto, upstream } from "@/lib/brand";
import { LEGAL_EFFECTIVE } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description: `The terms for using ${brand.name} and its paid plans, provided by ${company.legalName}.`,
  path: "/terms",
});

const email = <a href={mailto("Terms question", emails.legal)}>{emails.legal}</a>;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      effective={LEGAL_EFFECTIVE}
      intro={
        <p>
          These terms are an agreement between you and <strong>{company.legalName}</strong> (“we”, “us”) for the{" "}
          {brand.name} desktop app, the website and any paid plan. By downloading the app or buying a plan you agree to
          them. If you use {brand.name} for an organisation, you agree on its behalf.
        </p>
      }
      sections={[
        {
          id: "licence",
          title: "Your licence to use the software",
          body: (
            <>
              <p>
                We grant you a personal, non-exclusive, non-transferable licence to install and use {brand.name} on
                computers you own or control, under the plan you are on. Paid features are unlocked by signing in with an account that
                is personal to the buyer (or, for Team plans, to the organisation and its named seats). Do not share,
                resell or publish your sign-in or license tokens.
              </p>
              <p>
                <strong>Speech models</strong> are made by third parties (such as NVIDIA, OpenAI, Mistral, Alibaba and
                others), are downloaded separately when you choose them, and come under their own licence terms, shown
                on each model’s page. Most allow commercial use; some do not. You are responsible for following the
                licence of any model you choose to use.
              </p>
              <p>
                {brand.name} is built on <a href={upstream.url}>{upstream.name}</a> by {upstream.author}, which is released
                under the {upstream.license} licence. Open-source components remain under their own licences, and nothing
                in these terms limits your rights under them. See the third-party notices included with the app.
              </p>
            </>
          ),
        },
        {
          id: "plans",
          title: "Plans and subscriptions",
          body: (
            <>
              <ul>
                <li>
                  <strong>Free</strong> is free to use, subject to any usage limits shown on the{" "}
                  <Link href="/pricing">pricing page</Link>. It includes 25 AI uses a week, shared across polish,
                  answers, actions, Ask and meeting summaries, which resets each Monday (UTC); unused uses don’t carry
                  over. Free also includes 2 meetings a month.
                </li>
                <li>
                  <strong>Free trial:</strong> new installs get Pro features free for 7 days, with no card required. One
                  trial per computer. When it ends you move to Free automatically and are never charged.
                </li>
                <li>
                  <strong>Pro</strong> and <strong>Team</strong> are subscriptions billed monthly or annually. Purchases
                  are processed by <strong>Polar</strong> (polar.sh), our merchant of record, which is the seller for
                  your order and handles payment, invoices and applicable sales tax or VAT. Polar’s own terms also apply
                  to the purchase. Prices are shown on the pricing page.
                </li>
                <li>
                  Subscriptions <strong>renew automatically</strong> at the end of each billing period until cancelled.
                </li>
                <li>
                  You can <strong>cancel at any time</strong> from the billing portal (in the app: Account → Manage
                  billing). Paid features stay on until the end of the period you have paid for.
                </li>
                <li>
                  <strong>Refunds:</strong> if {brand.name} isn’t right for you, email us within 14 days of your first
                  payment for a full refund of that payment. Renewals are not refunded once a new period has started,
                  but cancelling stops all future charges. Where consumer law gives you a right to a refund, that right
                  applies. Refunds are issued through Polar to your original payment method.
                </li>
                <li>
                  We may change prices for future billing periods. We will tell you in advance, and you can cancel before
                  the change takes effect.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "your-content",
          title: "Your content",
          body: (
            <p>
              What you dictate, and what {brand.name} reads or writes for you, is yours. Transcription happens on your
              device and we never receive your audio. AI features run on your Mac where they can; when they need our
              server, the text involved is processed by our servers and our model provider only to return the result,
              and is not stored. Web searches send only the search query to our search provider. If you use your own API
              key with another provider, you are responsible for your agreement with that provider. See the{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          ),
        },
        {
          id: "assistant",
          title: "The assistant, actions and meetings",
          body: (
            <>
              <p>
                <strong>Actions are yours.</strong> When you ask {brand.name} to do something, such as create a calendar
                event or reminder, open an app or link, run one of your Shortcuts or paste a draft, it does so on your
                instruction, on your computer. Please review what it creates or writes, because it can misunderstand a
                request. {brand.name} does not yet operate other apps on your behalf (computer use); if we add that, we
                will update these terms first.
              </p>
              <p>
                <strong>Answers can be wrong.</strong> AI answers, summaries and drafts can be inaccurate or incomplete.
                Answers that use the web are based on third-party sites, which we do not control or endorse.
              </p>
              <p>
                <strong>Meetings.</strong> If you use {brand.name} to take notes on a meeting or call, you are responsible
                for telling the other participants and getting their consent where the law requires it. Recording laws
                differ between countries and states, and some require everyone’s consent. The app reminds you and offers a
                message you can send, but it cannot do this for you.
              </p>
            </>
          ),
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          body: (
            <>
              <p>Please don’t:</p>
              <ul>
                <li>use {brand.name} to break the law or infringe anyone’s rights, including recording people without the consent the law requires;</li>
                <li>bypass, forge or share license tokens or account access, or interfere with licensing or billing;</li>
                <li>
                  start repeat trials or get extra free AI uses by faking or resetting device identifiers;
                </li>
                <li>
                  use our hosted AI or web search other than through {brand.name}’s features (for example, by calling our
                  server directly or using it as a general language-model or search API);
                </li>
                <li>attack, overload or try to gain unauthorised access to our servers;</li>
                <li>resell {brand.name} or offer it as a service without our written agreement.</li>
              </ul>
              <p>We may suspend or revoke a license that is used in breach of these terms.</p>
            </>
          ),
        },
        {
          id: "warranty",
          title: "No warranty",
          body: (
            <p>
              {brand.name} is provided “as is” and “as available”. Speech recognition and AI features are not perfect: AI
              polish can change wording or meaning, and answers, summaries and actions can be wrong. Always review text
              before you send it, especially in medical, legal
              or other high-stakes settings. We may apply fair-use rate limits to hosted features to keep them available
              for everyone. To the extent the law
              allows, we disclaim all warranties, express or implied, including fitness for a particular purpose and
              non-infringement.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Limitation of liability",
          body: (
            <p>
              To the extent the law allows, we are not liable for indirect, incidental, special or consequential losses,
              or for lost profits, data or goodwill. Our total liability for any claim relating to {brand.name} is limited
              to the amount you paid us in the 12 months before the claim (or USD 50 if you use the free plan). Nothing
              in these terms limits liability that cannot be limited by law.
            </p>
          ),
        },
        {
          id: "termination",
          title: "Ending these terms",
          body: (
            <p>
              You can stop using {brand.name} at any time and cancel your subscription. We may end these terms or a
              license if you materially breach them. Sections on warranty, liability and governing law survive.
            </p>
          ),
        },
        {
          id: "law",
          title: "Governing law and disputes",
          body: (
            <>
              <p>
                These terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai. The
                courts of Dubai have jurisdiction over any dispute arising from them.
              </p>
              <p>
                Before going to court, please contact us at {email}; we will try in good faith to resolve any dispute
                within 30 days. If you are a consumer, you also keep any rights you have under the mandatory laws of the
                country where you live.
              </p>
            </>
          ),
        },
        {
          id: "changes",
          title: "Changes to these terms",
          body: (
            <p>
              We may update these terms. We will post the new version here with a new effective date, and give notice of
              material changes before they apply. Continuing to use {brand.name} after that means you accept them.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              {company.legalName}, a free zone company registered with the {company.freeZoneAuthority}, Dubai, United
              Arab Emirates. Email {email}.
            </p>
          ),
        },
      ]}
    />
  );
}
