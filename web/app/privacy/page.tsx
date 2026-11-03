import type { Metadata } from "next";
import { LegalPage } from "@/components/legal";
import { brand, company, emails, mailto, siteUrl } from "@/lib/brand";
import { LEGAL_EFFECTIVE } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description: `How ${company.legalName} handles data for ${brand.name}. Audio never leaves your device; AI runs on your device where it can, and text is sent to our server only when a feature needs it.`,
  path: "/privacy",
});

const email = <a href={mailto("Privacy request", emails.legal)}>{emails.legal}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effective={LEGAL_EFFECTIVE}
      intro={
        <p>
          {brand.name} is built so that your voice stays yours. This policy explains, in plain English, what data the{" "}
          {brand.name} desktop app and the website at {siteUrl.replace(/^https?:\/\//, "")} handle, why, and what you can
          do about it. The short version: <strong>your audio never leaves your device</strong>, and neither do your
          dictation transcripts. AI features use our server by default for the best quality, or your Mac’s Apple
          Intelligence if you choose. When a feature needs our server, only the text it needs is sent, it is not stored, and you can see every request in
          the app’s Privacy Center.
        </p>
      }
      sections={[
        {
          id: "who",
          title: "Who we are",
          body: (
            <p>
              {brand.name} is provided by <strong>{company.legalName}</strong>, a free zone company registered with the{" "}
              {company.freeZoneAuthority} in Dubai, United Arab Emirates (“we”, “us”). We are the controller of the
              limited personal data described below. Contact us at {email}.
            </p>
          ),
        },
        {
          id: "on-device",
          title: "Audio and transcripts stay on your device",
          body: (
            <>
              <p>
                Speech-to-text runs locally on your computer using models stored on your computer. Your recordings, your
                transcripts and your transcription history are saved only on your device. We never receive them, and
                nothing in the app uploads them to us or to anyone else.
              </p>
              <p>You can delete history from within the app at any time, or remove the app’s data folder entirely.</p>
            </>
          ),
        },
        {
          id: "ai",
          title: "AI features and where they run",
          body: (
            <>
              <p>
                {brand.name} uses a language model to polish dictation, answer questions, write drafts, summarise text and
                meetings, decide whether to offer a suggestion, and work out what you are asking it to do. Every feature
                works on macOS, Windows and Linux. The <strong>Intelligence</strong> setting chooses where the model runs:
                Automatic (the default), On this computer only, or Cloud.
              </p>
              <ul>
                <li>
                  <strong>On your device.</strong> On Macs with Apple Intelligence, suggestions are always decided on the
                  device, and you can choose to run other AI tasks there whenever they fit (polish, answers that don’t
                  need the web, drafts, summaries and meeting nudges); nothing is sent for them. Apple Intelligence is
                  Apple’s on-device model; {brand.name} sends nothing to Apple.
                </li>
                <li>
                  <strong>On our server.</strong> Otherwise, when text is too long for the on-device model, and for
                  questions that need the web, the app sends the{" "}
                  <strong>text</strong> of the request (never audio) to our server, identified by your signed license token or, on
                  Free, by the device hash described below. We pass it to our model provider, Baseten, which runs the
                  language model (a DeepSeek model) in the United States and returns the result. We do not store the text
                  or use it to train models, and our provider processes it only to answer the request.
                </li>
              </ul>
              <p>
                <strong>Voice requests.</strong> When you speak, the app decides whether your words are text to type or a
                request for the assistant. Ordinary dictation is typed (polished first if AI polish is on). Only if your words look like a request
                are they sent to our server to work out what you want and pick out details such as times or app names. What is sent is only what you
                said, never what is on your screen.
              </p>
              <p>
                <strong>AI polish.</strong> AI polish tidies the text you dictate and can write a message for you. It is
                on by default for new installs and can be turned off during setup or at any time in Account; turning it
                off keeps dictation on your computer. When it is on, the text you dictate (never audio) is processed as
                described above, and each request sent to our server is listed on the app’s Privacy page.
                </p>
                <p>
                <strong>Smart writing.</strong> With the Writing setting on Smart (the default), plain speech is typed as you
                said it without calling a model. When your words read as an instruction to write something, when they are
                unclear, or when you ask to rewrite text you have selected, what you said (and that selected text) is
                processed as described above to decide and write it. Choose “Always as I said” to have your exact words typed
                unless you ask {brand.name} by name. Your per-app writing preferences are stored on your device.
              </p>
              <p>
                <strong>Web search.</strong> For questions that need the web, our server sends only the search query to
                our search provider, Tavily, and the model writes an answer from the results. We cache search results on
                our server for up to 6 hours, stored against the query only and not linked to you or your device.
              </p>
              <p>
                <strong>On this computer only.</strong> With Intelligence set to “On this computer only”, no text is sent
                to us for AI processing and web search is off. On a computer without an on-device model, features that
                need one fall back to simple on-device rules, type your words unpolished, or tell you they need the
                cloud.
              </p>
              <p>
                <strong>Secrets are removed first.</strong> Before text from your screen leaves your device, the app
                redacts things that look like secrets, such as card numbers, API keys, passwords and one-time codes.
              </p>
            </>
          ),
        },
        {
          id: "screen",
          title: "Screen context and screen memory (optional)",
          body: (
            <>
              <p>
                <strong>Screen context</strong> is off until you turn it on, on every plan. When you ask about
                “this”, or ask {brand.name} to find something, the app reads the text of the front window and of your
                other open windows using the system’s accessibility interface (Accessibility on macOS, UI Automation
                on Windows, AT-SPI on Linux). It keeps a rolling buffer of the last 2 minutes of window
                text in memory only; that buffer is never written to disk. Screenshots are never stored or sent.
              </p>
              <p>
                Apps and sites on the <strong>never-watch list</strong> are never read. By default it includes password
                managers, crypto wallets, private and incognito browser windows and messaging apps, and you can add any app
                or site. Password fields are never read. Only the text a request needs is sent, after secrets are
                redacted as described above, and only when the request can’t be handled on your device.
              </p>
              <p>
                <strong>Screen memory</strong> is a separate opt-in. If you turn it on, window text is saved on your
                device, encrypted (AES-256-GCM, with the key kept in your macOS Keychain, or in a key file in the app’s
                own data folder on Windows and Linux), so you can find things you
                saw earlier. On Pro it is kept for 7 days by default (you can choose 1 to 90 days); on Free it keeps the
                last 24 hours. You can delete it for a single app or entirely at any time. Screen memory is never
                uploaded.
              </p>
            </>
          ),
        },
        {
          id: "your-data",
          title: "Your files, mail and calendar",
          body: (
            <>
              <p>
                When you ask {brand.name} to find something, it searches on your device only: your file index (the macOS
                Spotlight index, including Mail.app messages and notes; Windows Search; or Tracker or locate on Linux), your
                calendar events (through macOS EventKit, Outlook on Windows, or Evolution Data Server on Linux), and your
                dictation history. On a Mac, Calendar is read only after you grant {brand.name} Calendar access; it also reads upcoming
                events to help you prepare for meetings, but only if you have already granted that access. These sources
                are not uploaded or copied to us. If a request then needs our server (see above), only the text needed to
                answer it is sent.
              </p>
              <p>
                {brand.name} can also give you links that search your Google Drive or Gmail. Those open in your own
                browser, under your own Google sign-in; we receive nothing from them.
              </p>
            </>
          ),
        },
        {
          id: "actions",
          title: "Actions on your computer",
          body: (
            <p>
              When you ask, {brand.name} can create reminders and calendar events in your own Calendar and Reminders apps
              (through macOS EventKit, with your permission) or, on Windows and Linux, as a scheduled notification
              (reminders) or an .ics file opened by your calendar app (events, and reminders when a notification isn’t
              possible). It can also open apps and links, run your Shortcuts and paste drafts where your cursor is.
              These happen on your computer; the reminders and events are stored by your own apps, not by us.
            </p>
          ),
        },
        {
          id: "meetings",
          title: "Meetings (optional)",
          body: (
            <>
              <p>
                If you turn on meeting notes, {brand.name} listens to your microphone and to your computer’s audio output
                (on a Mac this uses the macOS Screen Recording permission for audio only). It transcribes on your
                device. Meeting audio is never saved. Transcripts, notes and summaries are stored on your device,
                encrypted, until you delete them.
              </p>
              <p>
                Summaries, notes and nudges during the meeting are generated on your device when possible. Otherwise the
                transcript text is sent to our server and processed by Baseten as described above, and is not stored.
              </p>
              <p>
                The app reminds you to tell the other participants and offers a message you can send to let them know.
                Recording laws vary by place, and you are responsible for getting consent where the law requires it.
              </p>
            </>
          ),
        },
        {
          id: "suggestions",
          title: "Proactive suggestions (optional)",
          body: (
            <p>
              If you turn on suggestions, {brand.name} decides whether to offer help with the window you are using. On
              Macs with Apple Intelligence it decides on the device, and otherwise with local rules; nothing is sent
              unless you accept a suggestion. <strong>Suggestions from the cloud</strong> (optional, Pro, off until you
              say yes) let a computer without an on-device model ask our server instead: the app name, window title and
              up to 3,500 characters of the window’s text, with secrets redacted first, are sent to decide, and the
              answer is a short yes or no with a one-line offer. This text is not stored or logged, every such request
              appears in the app’s list of requests that left your computer, and you can turn it off at any time. The
              other exception is meeting
              nudges: during a meeting you have chosen to take notes on, the app checks the last few minutes of the
              transcript about every 90 seconds, on your device when possible and otherwise through our server as
              described above. Preferences learned from your feedback (for example, “don’t show me these”) are stored
              locally in your settings.
            </p>
          ),
        },
        {
          id: "hands-free",
          title: "Hands-free “Hey Ambient” (optional)",
          body: (
            <p>
              If you turn on hands-free, the app keeps your microphone open and listens on your device for “Hey
              Ambient”. When you start speaking, it transcribes only the first couple of seconds on your device to
              check for the phrase; anything that doesn’t start with it is discarded immediately. No audio or text is
              recorded, stored or sent unless you say the phrase, and then only your request is handled as described
              above. Your operating system shows its microphone indicator while hands-free is on. It is off by
              default and pauses while {brand.name} takes meeting notes.
            </p>
          ),
        },
        {
          id: "usage-statistics",
          title: "Anonymous usage statistics (optional, off by default)",
          body: (
            <>
              <p>
                We can only make the assistant better from real use, so the app can share anonymous usage counts with us.
                This is <strong>off until you turn it on</strong>: on the “You’re all set” screen at the end of setup, or
                with <strong>Share anonymous usage counts</strong> in the app’s Privacy Center. While it is off, nothing is
                collected or sent.
              </p>
              <p>
                <strong>What is collected:</strong> counts and timings of what the assistant does, such as how often a
                kind of suggestion is offered, accepted, dismissed or ignored; whether the suggestion check worked and
                roughly how long it took; which kind of request a voice command became (typing, an answer, an action);
                how long answers took, in broad ranges; whether actions such as reminders worked; which category of error
                happened (for example “timed out”); how a meeting’s notes turned out and its length, in broad ranges; how
                long dictation took (only 1 in 10, sampled); and 👍 or 👎 on answer and suggestion cards. Each count comes
                with the app version, your operating system family (macOS, Windows or Linux), your plan (Free, Pro or
                trial), and a random install ID created on your computer that changes every 30 days. The kind of app
                you were in is recorded only as a broad category: browser, mail, chat, editor, terminal or other.
              </p>
              <p>
                <strong>What is never collected:</strong> what you say, type or see; any text, transcripts, answers or
                screen content; window titles, web addresses, app names, file names or email addresses; your account,
                license or the device hash described below. Every value the app may send comes from a fixed list, and
                our server rejects anything else.
              </p>
              <p>
                The app sends these counts in batches, a few times a day and when you quit. Our server does not
                keep the individual events: it adds them to daily totals, and uses a one-way hash of the random install ID,
                changed every day, only to count how many installs shared data that day. Daily totals are kept for 180
                days and then deleted. Every upload appears in the Privacy Center’s list of requests that left your
                computer, with exactly what was sent. Turn it off at any time in the Privacy Center; from then on nothing
                more is collected or sent.
              </p>
            </>
          ),
        },
        {
          id: "meeting-email",
          title: "Meeting notes by email (optional)",
          body: (
            <p>
              If you are signed in, you can have the notes from a meeting emailed to you: with the “Email to me” button
              when the notes are ready, or automatically after every meeting if you choose “Always” in Meetings. The notes
              (title, date and length, summary, decisions, action items, questions for you and the follow-up draft) are
              sent to our server, with secrets redacted on your computer first, and emailed only to the email address of
              your {brand.name} account, never to any other address. We send them through our email provider, Resend,
              only to deliver that email. We do not store the notes or log their content. Each email you send this way
              appears in the Privacy Center’s list of requests.
            </p>
          ),
        },
        {
          id: "feedback",
          title: "Feedback and bug reports",
          body: (
            <>
              <p>
                You can send us feedback from the app (Send feedback in the menu or in Settings, 👎 on a card, or by
                asking {brand.name} out loud). Nothing is sent unless you choose to send it, and the app first shows you
                exactly what will be sent. A report contains your message, the email address you give for a reply (if
                any), the app version, your operating system and your plan, and the random install ID described above
                (used only to stop floods of reports).
              </p>
              <p>
                Two extras are sent only if you tick them: <strong>diagnostics</strong> (a summary of your settings,
                without your custom words or never-watch list, and the app’s last few hundred log lines, with secrets,
                window titles and web addresses removed) and, for a 👎 on a card, <strong>the example</strong> (that card’s
                question and answer, with secrets redacted). When you report something by voice and ask to include
                diagnostics, the last answer card from the past 2 minutes is attached as the example.
              </p>
              <p>
                Reports are stored in our database so we can read and fix them, and kept for up to 180 days, or 30 days
                after we mark them resolved, whichever comes first. If you gave an email address, we may use it to reply.
                To have a report deleted sooner, email {email}. Every report you send appears in the Privacy Center’s list
                of requests.
              </p>
            </>
          ),
        },
        {
          id: "trial",
          title: "Trial and free allowance",
          body: (
            <p>
              To give each computer one free trial and count the free weekly allowance of {brand.freePolishPerWeek} AI
              uses (shared across polish, smart writing, answers, actions, Ask and meeting summaries), the app sends a one-way hash of
              your computer’s hardware identifier. We store only a further keyed hash of it, with the date your trial
              started and the number of hosted AI uses in the current week. AI uses that run on your device, and Free’s
              weekly suggestions and monthly meetings, are counted on your device and are not sent to us. We cannot
              reverse the hash into your hardware identifier, and it is not linked to your name, email or payment
              details. The app also checks for a trial once, on first launch.
            </p>
          ),
        },
        {
          id: "billing",
          title: "Your account, payments and billing",
          body: (
            <>
              <p>
                Paid plans are sold through <strong>Polar</strong> (polar.sh), which acts as our merchant of record:
                Polar is the seller for your purchase and handles checkout, payment, sales tax and VAT, invoices and
                receipts, under its own privacy policy. We never see or store card numbers.
              </p>
              <p>From Polar we receive and use:</p>
              <ul>
                <li>your Polar customer ID and email address,</li>
                <li>your plan, subscription status and billing period.</li>
              </ul>
              <p>
                <strong>Signing in.</strong> You only need an account for a paid plan; Free and the trial work without
                one. To use Pro you sign in to the app with your email address and a 6-digit code we email you. We use
                your email to sign you in, to look up your subscription with Polar, and to send account emails (sign-in
                codes, and messages about your plan and billing). We do not keep a separate user database: the code is
                checked against a signed challenge, and while it is valid our database holds only a short-lived counter
                of attempts, keyed by a one-way hash of your email and deleted within about an hour.
              </p>
              <p>
                Once you are signed in, the app keeps a signed session on your device and receives a signed license
                token that contains your Polar customer ID, email address, plan and an expiry date; the app checks the
                token offline. A trial token contains only the device hash above, the plan and an expiry date. While
                you are signed in, the app periodically sends the session to our server, which checks your subscription
                with Polar so that renewals, cancellations and refunds reach the app. Signing out deletes the session
                and token from your device.
              </p>
            </>
          ),
        },
        {
          id: "network",
          title: "Other network requests the app makes",
          body: (
            <ul>
              <li>
                <strong>Model downloads:</strong> when you choose a speech model, the app downloads it from Hugging Face
                (huggingface.co), and from our backup storage at Cloudflare if that fails. The host sees your IP address
                and the file requested, as with any download. Nothing about your audio or transcripts is sent.
              </li>
              <li>
                <strong>Update checks:</strong> if enabled, the app asks our website for the latest version, and updates
                are downloaded from our storage at Cloudflare. These requests carry your IP address and app version. You
                can turn update checks off in settings.
              </li>
              <li>
                <strong>Installer downloads:</strong> installers on the website are served from our storage at
                Cloudflare, which sees your IP address and the file requested.
              </li>
              <li>
                <strong>Sign-in and plan checks:</strong> described above.
              </li>
              <li>
                <strong>Assistant settings check:</strong> on launch and at most once a day, the app downloads the
                assistant’s tuning settings (for example how often it may offer suggestions) from our website. The request
                carries only your IP address and the app version; nothing about you or your use is sent. If it fails, the
                app keeps its built-in settings.
              </li>
              <li>
                <strong>Network ledger:</strong> the app keeps a local, encrypted log of every request it sends and the
                text that was sent, for 30 days, which you can view in the Privacy Center. It stays on your device.
              </li>
            </ul>
          ),
        },
        {
          id: "website",
          title: "The website",
          body: (
            <>
              <p>
                We do not use analytics, advertising or tracking on this website. Our hosting provider processes standard
                server logs (such as IP address, user agent and the page requested) to deliver the site and keep it
                secure. If we add analytics in the future we will update this policy first.
              </p>
              <p>
                <strong>Cookies:</strong> the site sets no cookies of its own beyond what is strictly necessary for it to
                work. Polar’s checkout, which opens on Polar’s own pages, may set cookies needed for payment and fraud
                prevention.
              </p>
              <p>If you email us or use a contact form, we receive what you write and your email address.</p>
            </>
          ),
        },
        {
          id: "legal-bases",
          title: "Why we use data (legal bases)",
          body: (
            <ul>
              <li>To sign you in and provide the paid plans you ask for, and to send account emails — performance of a contract.</li>
              <li>
                To run the AI features you use, including hosted AI processing and web search — performance of a
                contract (and, on Free, our legitimate interests in providing the service you asked for).
              </li>
              <li>
                To run the free trial and free weekly AI allowance, and to stop the same computer from starting repeat
                trials — our legitimate interests.
              </li>
              <li>To collect anonymous usage statistics — your consent, which you can withdraw at any time in the app.</li>
              <li>To email you your meeting notes when you ask — performance of a contract.</li>
              <li>To read, answer and act on feedback you send us — our legitimate interests, and your consent for diagnostics and examples.</li>
              <li>To keep records required for tax and accounting — legal obligation.</li>
              <li>To answer your messages and keep our services secure — our legitimate interests.</li>
            </ul>
          ),
        },
        {
          id: "sharing",
          title: "Who we share data with",
          body: (
            <>
              <p>We do not sell personal data. We share it only with service providers who help us run the service:</p>
              <ul>
                <li>Polar (merchant of record for payments, tax and subscriptions),</li>
                <li>
                  Baseten (runs the hosted language model, for AI tasks that don’t run on your device),
                </li>
                <li>Tavily (web search; receives only the search query, through our server),</li>
                <li>Vercel (hosts the website and our server),</li>
                <li>
                  Neon (database holding the hashed trial, weekly allowance and sign-in attempt records, the daily usage
                  totals if you share them, and feedback you send),
                </li>
                <li>Cloudflare (stores and delivers installers, updates and backup model files),</li>
                <li>Resend (sends sign-in codes, account emails and the meeting notes you ask us to email you),</li>
                <li>our email provider, for messages you send us.</li>
              </ul>
              <p>
                Model files are downloaded directly from Hugging Face, which handles those requests under its own privacy
                policy. Apple Intelligence runs on your Mac; {brand.name} sends nothing to Apple. These providers may process data outside the UAE, including in the United States and the European Union.
                Where required, we rely on appropriate safeguards such as standard contractual clauses.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          title: "How long we keep data",
          body: (
            <ul>
              <li>
                Billing records: Polar keeps transaction records as merchant of record. We keep the billing records we
                hold for up to 7 years, as required by UAE tax law.
              </li>
              <li>
                Trial records: the hashed device and trial start date, for as long as we offer trials, so a computer
                cannot start a second trial.
              </li>
              <li>Weekly AI allowance: only the current week’s count; earlier weeks are deleted.</li>
              <li>Sign-in attempt counters: about an hour, keyed by a one-way hash of your email.</li>
              <li>
                Text sent for hosted AI processing: not stored by us after the response is returned.
              </li>
              <li>Web search results: cached on our server for up to 6 hours, against the query only.</li>
              <li>Anonymous usage statistics (only if you turned them on): daily totals, 180 days.</li>
              <li>Meeting notes you email to yourself: not stored by us; they are sent and forgotten.</li>
              <li>Feedback and bug reports: up to 180 days, or 30 days after they are resolved, whichever is sooner.</li>
              <li>Support emails: up to 24 months after the conversation ends, unless you ask us to delete them sooner.</li>
              <li>Server logs: kept by our hosting provider for a short period, typically no more than 30 days.</li>
              <li>
                Data on your device: dictation history, meeting transcripts, notes and summaries are kept until you
                delete them; screen memory for 7 days by default on Pro (1 to 90 days, your choice) and 24 hours on
                Free; the network ledger for 30
                days; the screen context buffer for 2 minutes, in memory only.
              </li>
            </ul>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <>
              <p>
                Under the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) and, if you are in the
                European Union or United Kingdom, the GDPR and UK GDPR, you can ask us to:
              </p>
              <ul>
                <li>tell you what personal data we hold about you and give you a copy,</li>
                <li>correct inaccurate data,</li>
                <li>delete your data (subject to records we must keep by law),</li>
                <li>restrict or object to certain processing,</li>
                <li>move your data to another service (portability).</li>
              </ul>
              <p>
                Email {email} to make a request; we will respond within the time the law requires. You may also complain to
                your local data protection authority — in the UAE, the UAE Data Office; in the EU or UK, your national
                supervisory authority.
              </p>
            </>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: (
            <p>
              On-device processing is our main safeguard: audio never leaves your device, and you can choose to run AI
              on your device. When text must leave, the app sends only what the
              request needs and redacts secrets such as card numbers, API keys, passwords and one-time codes first. Apps
              and sites on the never-watch list, password fields, crypto wallets, and any window showing a recovery
              phrase or private key are never read. Screen memory is encrypted on your
              device (with the key in your macOS Keychain on a Mac), meeting records are stored encrypted, and the network ledger lets you check
              every request the app has made. Sign-in sessions and license tokens are signed so they cannot be forged, connections to our
              servers use HTTPS, downloaded models and updates are checked against cryptographic hashes or signatures
              before use, and access to billing data is limited to people who need it.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>{brand.name} is not directed at children under 16, and we do not knowingly collect their data.</p>,
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: (
            <p>
              If we change how we handle data, we will update this page and its effective date. For material changes we
              will give notice on the website or in the app before they take effect.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              {company.legalName}, {company.jurisdiction}. Email {email}.
            </p>
          ),
        },
      ]}
    />
  );
}
