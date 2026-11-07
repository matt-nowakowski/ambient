import { brand, upstream } from "./brand";

export type Release = {
  version: string;
  date: string; // ISO yyyy-mm-dd
  title: string;
  summary: string;
  sections: { heading: string; items: string[] }[];
};

/** Newest first. Add a new object at the top for each release. */
export const changelog: Release[] = [
  {
    version: "0.1.27",
    date: "2026-11-07",
    title: "Fewer false alarms",
    summary: "Terminals stop looking like wallets, and suggestion cards are cleaner.",
    sections: [
      {
        heading: "Fixed",
        items: [
          "A terminal listing pasted images no longer looks like a recovery phrase, so Ambient stops pausing there.",
        ],
      },
      {
        heading: "Improved",
        items: ["Suggestion cards drop the hint line underneath."],
      },
    ],
  },
  {
    version: "0.1.26",
    date: "2026-11-07",
    title: "Read at a glance",
    summary:
      "Shorter words everywhere, tooltips for the details, and one button style across the app.",
    sections: [
      {
        heading: "Improved",
        items: [
          "Settings, Models, Privacy and Account show a name and a control; details moved into small ⓘ tooltips.",
          "About 120 longer lines cut to a few words, in every language.",
          "Every button follows one style: same height, weight and corners.",
          "The on-device AI card fits on one line, and sizes read as \"1.0 GB\" instead of \"1,000 MB\".",
        ],
      },
      {
        heading: "Fixed",
        items: [
          "The Apple Intelligence row has proper space above and below.",
        ],
      },
    ],
  },
  {
    version: "0.1.25",
    date: "2026-11-07",
    title: "Remembers what you just saw",
    summary:
      "Ambient can refer back to the window you looked at a moment ago, writes messages even when a name is misheard, and suggestion cards speak to you, not to themselves.",
    sections: [
      {
        heading: "Fixed",
        items: [
          "\"Open the website we just looked at\" works: Ambient keeps the windows you looked at in the last few minutes (from Remember what you've seen when it's on) and opens the real link from that page instead of guessing.",
          "Links on a page are read with where they go, so \"open their website\" uses the site's own address.",
          "\"Tell Emmy, please, I'll call her tomorrow\" in a chat with Emilia is written to her (\"I'll call you tomorrow.\"), even when the name is misheard. A draft never comes back as your own words repeated.",
          "Saying yes to a suggestion shows a card titled with what it offered, never Ambient's own instructions.",
        ],
      },
      {
        heading: "Improved",
        items: [
          "More room inside the Privacy cards: the lines under each setting and the Keep for choices no longer feel crammed.",
        ],
      },
    ],
  },
  {
    version: "0.1.22",
    date: "2026-11-07",
    title: "Gets it right",
    summary:
      "Replies land where they should, answers read the window you're actually in and look things up, and messages are written to the person you're talking to.",
    sections: [
      {
        heading: "Fixed",
        items: [
          "Answers follow you: ask about a different window or tab and Ambient reads that one, instead of answering from the last page you asked about.",
          "Questions about ratings, reviews, prices or anything specific search the web, even when the answer also reads your screen.",
          "\"Tell Emi I'll call her tomorrow\" in Messages is written to Emi: \"I'll call you tomorrow.\" Messaging apps are read like email now, so Ambient can see who you're talking to.",
          "\"Tell Claude to wait for me\" is written as the message itself (\"Wait for me.\"), not your instruction tidied up.",
          "A new email presses Compose and gives you the draft to paste; a reply that can't be confirmed in the reply box is shown in a card too, so it's never lost.",
          "The \"Written for you\" chip can be closed, and always goes on its own.",
          "When the cloud is slow or down, Ambient answers on your computer if it has an on-device model, and otherwise tells you the connection is slow instead of spinning. Dictation never waits more than 6 seconds.",
        ],
      },
      {
        heading: "Improved",
        items: [
          "Setup now shows what Ambient can do beyond dictation: ask anything, ask about your screen, have it write for you, and get things done.",
          "History shows what Ambient wrote beside what you said.",
          "Models has two tabs: Voice models and Reasoning models.",
          "Even spacing on every Privacy card, and the Account card fits the tips sign-up, which now matches the sign-in field.",
        ],
      },
    ],
  },
  {
    version: "0.1.20",
    date: "2026-11-06",
    title: "Tidier, and clearer about what it reads",
    summary:
      "Copy any part of a card, tidier pages with smoother motion, and if you're upgrading, a short note on what Ambient reads now.",
    sections: [
      {
        heading: "Improved",
        items: [
          "Select any text on a card to copy just that part.",
          "Reading the window you're in and suggestions are now on for everyone, including people upgrading. Home shows a one-time note saying so, with a button to Privacy if you'd rather turn them off. Turning them off sticks, and replaying the tour no longer turns them back on.",
          "Privacy, Settings, Meetings and Account have more room to breathe, buttons no longer wrap, and sections open and close smoothly.",
          "Manage or cancel your plan from Account, or from tryambient.ai/billing.",
          "Account shows the real date your plan renews, or \"Ends\" with its last day if you've cancelled.",
        ],
      },
      {
        heading: "Fixed",
        items: [
          "Commands you dictate at a shell prompt, like \"echo tell her I'll be late\", are typed as you said them.",
          "A sentence that happens to start with \"never mind\" is typed instead of closing a card, and \"never mind\" with no card up is typed rather than ignored.",
          "Cards finish dissolving before they close.",
          "If a renewal payment fails, Pro keeps working while your card is retried, instead of switching off within hours.",
        ],
      },
    ],
  },
  {
    version: "0.1.19",
    date: "2026-11-06",
    title: "Sees what you see",
    summary:
      "Ambient now reads the window you're in from the start, so it understands requests like \"tell Claude to wait\" right where you are.",
    sections: [
      {
        heading: "Improved",
        items: [
          "Reading the screen and suggestions are on from the start, so Ambient understands what you say with the window you say it in. You can turn either off in Privacy.",
          "\"Say that Claude should wait\" in a terminal, or a message to any AI, is written for you and typed there, not typed word for word.",
          "\"Close that\" with one of Ambient's cards up closes the card, in any language.",
          "Cards now dissolve when they go, instead of just closing.",
          "A tidier on-device AI section in Privacy, and the \"Never watch this app\" button no longer wraps.",
        ],
      },
    ],
  },
  {
    version: "0.1.18",
    date: "2026-11-06",
    title: "It reads the moment",
    summary:
      "Ambient now works out what you want from what you say and what's on your screen, in any app and any language, instead of following fixed rules.",
    sections: [
      {
        heading: "New",
        items: [
          "Every dictation is understood in context: Ambient looks at what you said and the window you're in, then types it, tidies it, writes a reply for you, answers, or acts. No more lists of apps or phrases deciding for it.",
          "\"Reply to this email saying it's all good\" works on any mail site, in any language: Ambient finds the reply button on the page itself.",
          "Answer Ambient's cards in your own words, in any language: \"sure, tell her Thursday works\", \"not now\", \"stop showing these\".",
          "Follows your Intelligence setting: on your computer when you choose that, in the cloud otherwise. With No AI, your words are typed exactly as you said them.",
        ],
      },
      {
        heading: "Fixed",
        items: [
          "On Mac, asking Ambient to reply to an email in Gmail could close Ambient instead of opening the reply. Replace and Undo on a card had the same problem. They all work now.",
          "On Windows, a dismissed card could leave an empty outline in the corner that you couldn't close, covering what was under it. Cards now go away completely.",
          "The recording pill no longer shows your words as you speak by default, because they arrived a second or two late. What you said still lands as soon as you stop. You can turn live words back on in Settings.",
        ],
      },
    ],
  },
  {
    version: "0.1.16",
    date: "2026-11-06",
    title: "Models in one place",
    summary:
      "Speech models now live in Ambient's own folder, so they're never shared with other tools and uninstalling Ambient removes them too.",
    sections: [
      {
        heading: "Fixed",
        items: [
          "Downloaded models were kept in a cache folder shared with other apps, where another tool's clean-up could delete them and uninstalling Ambient left them behind. They now live in Ambient's own folder.",
          "Models you've already downloaded move there the first time you open this version, instantly and without downloading again. Other apps' models aren't touched.",
        ],
      },
    ],
  },
  {
    version: "0.1.15",
    date: "2026-11-06",
    title: "Works from the menu bar",
    summary:
      "Everything Ambient does now works with its window closed, right from your menu bar or tray, including straight after you log in.",
    sections: [
      {
        heading: "Fixed",
        items: [
          "When Ambient started hidden at login, dictation shortcuts and pasting could stay off until you opened its window. They're on from the start now.",
          "If dictation can't start, paste or transcribe while the window is closed, Ambient tells you in a small card instead of failing quietly.",
          "On Windows, Ambient asks not to be slowed down in the background, so suggestions, meetings and hands-free stay on time.",
        ],
      },
    ],
  },
  {
    version: "0.1.14",
    date: "2026-11-06",
    title: "Every request, on the record",
    summary:
      "A privacy release: the Privacy Center now lists every request Ambient makes, and the privacy policy says exactly what's true.",
    sections: [
      {
        heading: "Privacy",
        items: [
          "Requests that left this computer now lists everything: model and update downloads, update checks, the daily check-in, the trial, sign-in, plan and Free allowance checks, and the billing link.",
          "The privacy policy now covers No AI, downloads, cloud suggestion checks and license codes, and the few characters read before your cursor to join dictations, which never leave your computer.",
        ],
      },
      {
        heading: "Fixed",
        items: [
          "On a Mac, suggestions, meeting offers and hands-free now keep working while Ambient lives only in the menu bar, with its window closed.",
        ],
      },
      {
        heading: "And",
        items: [
          "Settings › About › Acknowledgments now credits the speech engine, the on-device AI runtime and the fonts too, with their licences.",
          "The docs walk through setup step by step, and describe on-device AI, No AI and private pages as they work today.",
        ],
      },
    ],
  },
  {
    version: "0.1.12",
    date: "2026-11-06",
    title: "Smoother from the first minute",
    summary:
      "A calmer setup, dictation that joins up naturally, no surprise permission prompts, and tidier cards.",
    sections: [
      {
        heading: "Setup",
        items: [
          "“Where should the AI run?” now says plainly that it's about polishing, drafts, answers and suggestions; speech recognition always stays on your computer.",
          "A new step for a few more choices: tidy up with AI, help improve Ambient, and tips by email, each with room to breathe.",
          "The practice step uses plain dictation so you feel the speed, and every step shares the same calm layout.",
        ],
      },
      {
        heading: "Fixed",
        items: [
          "Dictating right after existing text adds the space and capitals you'd expect, in any app.",
          "Ambient no longer asks to access your Downloads folder after setup.",
          "Buttons on suggestions and answers stay on one line, answers no longer show reference numbers like [4], and sources are limited to the best three.",
        ],
      },
    ],
  },
  {
    version: "0.1.11",
    date: "2026-11-05",
    title: "Steadier, in every language",
    summary:
      "A fixes-only release, tested on Mac, Windows and Linux before it shipped: requests in any language get answered, private pages stay private, and suggestions understand more.",
    sections: [
      {
        heading: "Fixed",
        items: [
          "Questions and requests in any language are answered from the desktop and file windows on Windows and Linux, instead of being typed into the window.",
          "“Close that”, “never mind” and “what can I say?” work in your language.",
          "With “No AI” chosen, asking for something tells you AI is off instead of typing it.",
          "More banking and health pages are recognised as private, in French, Italian, Portuguese and Dutch too, and Ambient says it doesn't act on them.",
          "Short chats with a deadline, in any language, can get a reminder suggestion.",
        ],
      },
      {
        heading: "Behind the scenes",
        items: [
          "Every release now passes a set of 180+ real-world scenarios in eight languages on Mac, Windows and Linux before it ships.",
        ],
      },
    ],
  },
  {
    version: "0.1.10",
    date: "2026-11-05",
    title: "Sharper suggestions, your AI your way",
    summary:
      "Setup works again, “No AI” really means nothing is sent, suggestions show up in any chat or mail app, and on-device AI is easier to choose and manage.",
    sections: [
      {
        heading: "Fixed",
        items: [
          "New installs of 0.1.8 could stop on a blank screen after the speech model step. Setup now goes on to choose where AI runs, then the demo.",
          "With “No AI” chosen, nothing is sent and no model runs. Asking for something that needs AI tells you how to turn it on, and you can pick “No AI” in Settings too.",
          "Answers to a suggestion no longer disappear when they mention something missing, like “Sam didn't reply”.",
        ],
      },
      {
        heading: "Suggestions",
        items: [
          "Ambient recognises a chat, an email or a long read from what's on screen, so Discord, Telegram, Teams, any webmail and new apps get offers too.",
          "Each thread gets its own chance: one offer in Mail or Slack no longer quiets the rest of that app for hours.",
          "Esc dismisses a suggestion and Enter accepts it, without reaching the app you're in.",
          "When fresh facts help, like an error message or a company you're meeting, the answer includes web results.",
        ],
      },
      {
        heading: "Cards",
        items: [
          "Select text in an answer to copy it; click code to copy it.",
          "Buttons follow what's happening: Stop while it writes, “Inserted” with Undo after you insert, a spinner while a suggestion runs.",
        ],
      },
      {
        heading: "Writing",
        items: [
          "Say “reply that…”, “write to them that…” or “remind me…” and Ambient acts at once, no waiting on AI. “Note:” types the rest as said.",
          "What you dictate is always text to type, never an instruction to the AI, and if polish fails your words are typed anyway, with a note.",
          "Learning from corrections only offers clear name and term fixes, and never loses one.",
        ],
      },
      {
        heading: "Privacy",
        items: [
          "Ambient recognises banking, payment, medical, password and ID pages from what they show, in any language, and doesn't read them. Ask about one and it tells you so.",
        ],
      },
      {
        heading: "On-device AI",
        items: [
          "New downloads start with the recommended model (about 1.1 GB). Choosing “On this computer” without Apple Intelligence offers it right away.",
          "Switching models takes effect at once, a cancelled download keeps the model you had, and Remove frees every model you downloaded.",
          "Models show relative quality and speed, described in your language.",
        ],
      },
      {
        heading: "And",
        items: [
          "Email me tips: a short, optional series of tips, from setup or Account. Confirm once, unsubscribe any time.",
          "History details show which speech model and AI ran, and how long each step took.",
          "Translation fixes in German, Spanish, French and Polish.",
        ],
      },
    ],
  },
  {
    version: "0.1.8",
    date: "2026-11-04",
    title: "Faster, sharper, more yours",
    summary:
      "Dictation is instant by default, smart writing works in every app and language, suggestions show up when they can help, and Ambient learns your words. Optional on-device AI on every computer.",
    sections: [
      {
        heading: "Speed",
        items: [
          "New installs start with AI polish off, so your words appear the moment you stop. Turn polish on any time.",
          "Your first word is never cut off: the mic stays ready for a minute after you dictate. You choose how long in Settings › Sound.",
          "Polish skips very short dictations and no longer waits on an extra check when you speak a language other than English.",
        ],
      },
      {
        heading: "Smart writing",
        items: [
          "Say “reply that…” or “write that…” in your language and Ambient drafts the message. “Odpisz, że wszystko ok” works too.",
          "It decides from what's on screen, not from a list of apps, so Messages, Slack and Mail behave the same.",
          "Replies go to the right person: it knows who you are and who you're answering.",
          "Give apps and sites a style: casual for Slack, polished for Gmail, word for word in your code editor.",
          "It learns your corrections. Fix the same word twice and it offers to remember it.",
        ],
      },
      {
        heading: "The colleague",
        items: [
          "Suggestions on every computer, more often and at better moments: a question in Slack, a deadline in an email (“Remind me?”), a new error in your terminal, a page in another language.",
          "Questions like “what's the weather” are answered in Ambient's card, never by opening your browser. Say “close that” to dismiss a card.",
          "Optional on-device AI: download a small model (about 1.7 GB) and polish, decisions and suggestions run on your computer. On a Mac it's an alternative to Apple Intelligence.",
        ],
      },
      {
        heading: "Settings and setup",
        items: [
          "Every setting says what it changes and what it doesn't, with a “Right now” summary of what reads your screen and what can use the cloud.",
          "Make Ambient your dictation app: if another app uses the same shortcut, Ambient takes it, and tells you when one is running.",
          "Your clipboard comes back exactly as it was after Ambient pastes, files and formatting included.",
          "Windows and Linux fixes across the agent, menus that open in front, and clearer Polish.",
        ],
      },
      {
        heading: "Where the AI runs",
        items: [
          "Setup now asks where Ambient's intelligence should live: in the cloud, on this computer, or nowhere at all.",
          "On a Mac that supports it, Apple Intelligence runs it. Otherwise pick a model to download, from a tiny 0.6B up to a 4B that writes best, each shown with its size and scores.",
          "The scores come from the models' own published benchmarks rather than tests we ran ourselves, and the picker says so.",
          "Choose “None” and Ambient stays a plain dictation tool: nothing is sent anywhere, and asking for something that needs AI gets a friendly explanation instead of silence.",
        ],
      },
      {
        heading: "History",
        items: [
          "A dictation can now say what ran: which speech model, whether your words were typed as said, polished or written for you, and how long each step took.",
          "Open Details on an entry to see it. Entries from before this version show no Details rather than an empty one.",
        ],
      },
      {
        heading: "Shortcuts",
        items: [
          "Double-tap a modifier, such as Right Option, to start and stop dictating. A tap that is really part of another shortcut is left alone.",
          "Bind an extra mouse button (Mouse 4, Mouse 5 or the middle button) to dictating or asking. Left and right click stay yours.",
        ],
      },
      {
        heading: "Updates",
        items: [
          "Ambient checks for new versions while it runs and downloads one quietly, then tells you once that it is ready.",
          "“Restart to update” sits at the top of the menu bar menu. Ignore it and the update installs when you next quit, so the following launch is already current.",
          "It never interrupts a recording, a meeting or something you asked it to do.",
        ],
      },
      {
        heading: "Fixes",
        items: [
          "Suggestions stay honest about what is on screen: a terminal transcript is no longer offered as an email thread, and a card can no longer argue with its own title.",
          "The same suggestion no longer comes back while you sit on the same window.",
          "A screen full of hashes is no longer mistaken for a private key, so Ambient stops backing away from ordinary terminals.",
          "Rating a suggestion no longer leaves the old thumb pressed on the next one.",
          "A dismissed card comes apart instead of simply fading.",
        ],
      },
    ],
  },
  {
    version: "0.1.7",
    date: "2026-11-03",
    title: "Your desktop colleague",
    summary:
      "Ambient now knows when to type what you said and when to write it for you, offers help from your first day, and Free gets the whole colleague with weekly limits.",
    sections: [
      {
        heading: "Smart writing",
        items: [
          "Each time you dictate, Ambient decides: type it as you said it, tidy it up, or write it for you. “Tell him I can't make it, be polite” becomes a proper message.",
          "A small note shows what it did. Click “Use my words”, or just say it, to get your exact words back.",
          "Select text and say “make this more formal” or “shorter”; “Undo rewrite” brings your original back.",
          "Edit by voice: say “warmer” or “shorter” right after.",
          "It learns where you prefer your own words. Choose Smart, Always as I said, or Always polish in Settings.",
        ],
      },
      {
        heading: "Free gets the colleague",
        items: [
          "Every agent feature is now on Free, with weekly limits: 25 AI uses, 10 suggestions, 2 meetings a month and the last 24 hours of recall. Hands-free “Hey Ambient” included.",
          "Pro removes the limits. Home shows what's left, and Ambient tells you kindly when you reach one.",
          "Background decisions, like working out what you meant, never use up your AI uses.",
        ],
      },
      {
        heading: "Getting started",
        items: [
          "Setup introduces Ambient as your desktop colleague, and a new step shows how it offers help, with the switch to turn suggestions on.",
          "AI polish is on by default for new installs, with a clear switch during setup. Your existing choice doesn't change.",
          "Your first suggestion comes with a one-time tip on how to answer it.",
        ],
      },
    ],
  },
  {
    version: "0.1.6",
    date: "2026-11-03",
    title: "A colleague, not a command line",
    summary:
      "Ask anything and Ambient answers, does it, or tells you why not and what it can do instead. It also offers help more often, in better moments, and learns what you want.",
    sections: [
      {
        heading: "The agent",
        items: [
          "Requests always get a response: “remind me tomorrow morning…”, “can we reply saying…”, questions with nothing selected. If it can't do something, it says why and offers an alternative.",
          "Suggestions like a colleague: summarise a long thread, “Reply to Ana?” (say “yes, tell them Thursday works”), translate a page, explain an error. Never the same offer twice on one window, and quieter when you dismiss.",
          "A reliable on-device judge on Macs with Apple Intelligence, and visible cloud suggestions when you choose Cloud.",
          "Reminders on every system: Reminders on Mac, notifications on Windows and Linux, with a clear fallback and Undo.",
          "Report a bug by voice: “Hey Ambient, report a bug…”, or 👍/👎 on any answer, or Send feedback in the menu.",
        ],
      },
      {
        heading: "Meetings",
        items: [
          "When a call ends, a card says your notes are ready: open, copy, or email them to yourself (signed in).",
        ],
      },
      {
        heading: "Privacy",
        items: [
          "“What you've told me”: the suggestions you've turned off, with Undo, instead of a long list of switches.",
          "Optional anonymous usage counts (never what you say, type or see), off unless you turn them on.",
        ],
      },
      {
        heading: "App",
        items: [
          "A full-size Dock icon on macOS, and setup stays in front after the intro.",
          "Setup picks a speech model that's already on your computer.",
          "Clear, translated error messages with Try again, instead of technical ones.",
          "First launch tidies up: ejects the installer and offers to move it to the Bin.",
          "Windows and Linux: the intro, glass and animations, with Ctrl key hints; screen memory key protected by Windows.",
          "Translations reviewed in every language.",
        ],
      },
    ],
  },
  {
    version: "0.1.5",
    date: "2026-11-03",
    title: "The agent on Windows and Linux",
    summary:
      "Every agent feature now runs on macOS, Windows and Linux (in beta on Windows and Linux). A new Intelligence setting decides where the AI runs.",
    sections: [
      {
        heading: "Windows and Linux (beta)",
        items: [
          "Ask about what's on screen, recall what you've seen and find your files, with suggestions, meeting notes from the call's audio and call detection.",
          "Windows reads windows through UI Automation, finds files with Windows Search, reads upcoming meetings from Outlook, and runs Start menu shortcuts or Power Automate flows.",
          "Linux reads windows through AT-SPI (we show you how to turn it on), finds files with Tracker or locate, reads meetings from GNOME Calendar, and runs your apps or scripts.",
          "The answer card floats above your apps without taking focus.",
        ],
      },
      {
        heading: "Intelligence: where the AI runs",
        items: [
          "Automatic (default), On this computer only, or Cloud, in Privacy. Every feature works with each choice.",
          "On this computer only now covers AI polish too: nothing is sent for AI at all.",
          "Suggestions from the cloud: an opt-in for computers without an on-device model (Pro). Redacted, listed in your request log, off until you say yes.",
          "“This Mac” is now “this computer” throughout.",
        ],
      },
    ],
  },
  {
    version: "0.1.4",
    date: "2026-11-02",
    title: "Suggestions that think, replies that land",
    summary:
      "Ambient now looks at any window you stay on and offers help when it can, judged on your Mac. Replies open the reply box for you, and a proper Dock icon.",
    sections: [
      {
        heading: "The agent",
        items: [
          "Suggestions for far more situations. On Macs with Apple Intelligence, an on-device model decides whether it can help with the window you're on; nothing is sent to decide.",
          "New suggestions: help filling in forms, translate a page in another language, summarise long documents, reply to a question in chat, explain a terminal error.",
          "Long email threads are recognised in Google Workspace mail too, and in Arc.",
          "Replies understand how people actually ask: “please reply to this email saying…”, “let them know…”, “write back…”. With no reply box open, Ambient opens one (Mail and Gmail) and writes the reply into it.",
          "Cards close reliably when you click elsewhere, with a quicker, softer fade.",
        ],
      },
      {
        heading: "Privacy",
        items: [
          "Chrome, Brave and Edge: Ambient now steps back from crypto wallets in the side panel and extension pop-ups too.",
        ],
      },
      {
        heading: "Fixes",
        items: [
          "Dictation never pastes what was already on your clipboard instead of what you said.",
          "A proper Ambient icon in the Dock instead of a tiny dot.",
          "Search (⌘K) highlights the matching setting in its real shape.",
          "The Pro card's corners are clean.",
        ],
      },
    ],
  },
  {
    version: "0.1.3",
    date: "2026-11-02",
    title: "Smoother setup, a smarter agent",
    summary:
      "Fixes from our first full test run: setup keeps you in front, dictation stops when you pause, and the agent always answers back.",
    sections: [
      {
        heading: "Dictation",
        items: [
          "Tap-to-talk now stops on its own after a pause (adjustable, or off) as well as on the shortcut.",
          "Custom words are spelled exactly as you added them, even when they're heard slightly differently.",
          "AI polish is faster: the connection is ready before you finish speaking.",
          "Dictating with no text box selected shows “Did you mean to type this?” with Copy, instead of losing the text.",
        ],
      },
      {
        heading: "The agent",
        items: [
          "It always shows that it heard you: a listening card for the shortcut and for “Hey Ambient”, and a clear note when it can't help.",
          "Follow-up questions keep the context of the last answer.",
          "“Reply saying…” and “draft an email…” now write the reply instead of typing your instruction.",
          "Sources show only real pages, emails and files, never internal ones.",
          "Actions fit the moment: Insert only when you're in a text box, Reply, Add to calendar, Open link, Copy code.",
          "Answer cards close when you click elsewhere, and fade out instead of snapping shut.",
          "Say “yes” or “not now” to a suggestion without pressing anything, and long email threads in Gmail and Mail get a summary offer.",
          "Web search is more reliable, and says so when it can't reach the web.",
          "Ask “what can I say?” to see examples.",
        ],
      },
      {
        heading: "Privacy",
        items: [
          "Steps back automatically from crypto wallets (including browser extensions like MetaMask), password managers and banking sites.",
          "A clearer Privacy page, with a single Pause menu.",
        ],
      },
      {
        heading: "App",
        items: [
          "Search everything with ⌘K: every page and setting is one jump away.",
          "Setup brings Ambient back to the front after each permission, and records full shortcut combinations.",
          "A redesigned “What can I say?”, Meetings and Account, with billing and sign-out in a ⋯ menu.",
          "Your plan shows what's left today, not what you've used.",
          "Fixes for the sidebar highlight, card corners, equal-height cards and a leftover Dock dot after quitting.",
        ],
      },
    ],
  },
  {
    version: "0.1.1",
    date: "2026-11-02",
    title: "Release pipeline",
    summary:
      "No app changes. Installers for every platform now come from one automated, signed and notarized release build.",
    sections: [
      {
        heading: "Changes",
        items: [
          "macOS disk images are notarized and stapled, so they open offline without a Gatekeeper warning.",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-11-02",
    title: `First release of ${brand.name}`,
    summary: `A voice agent that writes, answers and acts. ${brand.name} is built on ${upstream.name} by ${upstream.author} (${upstream.license}): speech recognition runs on your computer, and the agent answers, acts and takes meeting notes when you ask it to.`,
    sections: [
      {
        heading: "Dictation (free, unlimited)",
        items: [
          "On-device speech-to-text in about 100 languages, with push-to-talk or toggle shortcuts.",
          "AI polish cleans up what you say before it's typed.",
          "History: search, play back, copy and re-transcribe; transcribe audio files.",
          "A new design throughout: glass surfaces, light and dark themes.",
        ],
      },
      {
        heading: "The agent (Pro, macOS)",
        items: [
          "One shortcut writes, answers, acts or recalls, decided by what you say and which app you're in.",
          "Answers in a glass card with sources; web search only when needed.",
          "Reminders and calendar events in your own apps, opening apps and links, running your Shortcuts.",
          "Meeting notes for any call with no bot joining: you and them, notes, summary, action items and live nudges.",
          "Suggestions at the right moment: long threads, drafts, dates, prices, errors, pull requests, spreadsheets, meetings.",
          "Privacy Center: per-feature opt-ins, never-watch list, what's stored, and every request that left your Mac.",
        ],
      },
      {
        heading: "Known limitations",
        items: [
          "Screen reading, suggestions and meeting call audio are macOS-only for now; Windows and Linux get dictation, answers and actions.",
          "Computer use (operating apps for you) is coming soon.",
          "On Wayland, global shortcuts are limited: bind the command-line toggle to a desktop shortcut (see Linux setup).",
        ],
      },
    ],
  },
];
