/**
 * Canned web results in place of Tavily: a few plausible results picked by
 * keyword, so an answer that needs the web is answered from "sources" like
 * in the app, at no cost and the same every run.
 */
type Result = { title: string; url: string; excerpt: string };

const CANNED: { match: RegExp; results: Result[] }[] = [
  {
    match:
      /weather|wetter|pogod|tiempo|météo|meteo|clima|天気|forecast|rain|deszcz/i,
    results: [
      {
        title: "Weather forecast — Example Weather",
        url: "https://weather.example.com/forecast",
        excerpt:
          "Tomorrow: partly cloudy, high 19°C, low 12°C, 10% chance of rain, light wind from the west.",
      },
    ],
  },
  {
    match:
      /price|cost|cena|preis|precio|prix|bitcoin|stock|kurs|exchange|rate/i,
    results: [
      {
        title: "Market data — Example Finance",
        url: "https://finance.example.com/quote",
        excerpt:
          "Latest quote: 1 EUR = 1.08 USD; BTC 61,200 USD (+1.2% today).",
      },
    ],
  },
  {
    match: /news|wiadomości|nachrichten|noticias|actualités|score|wynik|match/i,
    results: [
      {
        title: "Top stories — Example News",
        url: "https://news.example.com/today",
        excerpt:
          "Today's main stories: a new climate agreement, a tech launch, and the local team won 2–1.",
      },
    ],
  },
];

const GENERIC: Result[] = [
  {
    title: "Search result — Example Encyclopedia",
    url: "https://encyclopedia.example.com/article",
    excerpt:
      "A short reference article that covers the question's topic in general terms.",
  },
];

export function cannedSearch(query: string): Result[] {
  return CANNED.find((c) => c.match.test(query))?.results ?? GENERIC;
}
