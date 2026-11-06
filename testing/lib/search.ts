/**
 * Canned web results in place of Tavily: a few plausible results picked by
 * keyword, so an answer that needs the web is answered from "sources" like
 * in the app, at no cost and the same every run.
 */
type Result = { title: string; url: string; excerpt: string };

/** A question with many results, two from one site: the card shows at
 * most three, one per site, and the answer cites none of them by number. */
const MANY: Result[] = [
  {
    title:
      "Lisbon population 2026 — Example Statistics Portal, city and metro area figures",
    url: "https://stats.example.com/lisbon",
    excerpt:
      "Lisbon's city proper has about 548,000 residents; the metropolitan area about 2.9 million.",
  },
  {
    title: "Lisbon metropolitan area — Example Statistics Portal",
    url: "https://www.stats.example.com/lisbon-metro",
    excerpt: "The Lisbon metropolitan area counts roughly 2.9 million people.",
  },
  {
    title: "Lisbon — Example Encyclopedia",
    url: "https://encyclopedia.example.com/lisbon",
    excerpt:
      "Lisbon is the capital of Portugal, with around 550,000 people in the city.",
  },
  {
    title: "Portugal census results — Example Government Office",
    url: "https://census.example.gov/pt",
    excerpt: "Census figures put the Lisbon municipality at 545,796 residents.",
  },
  {
    title: "Largest cities in Europe — Example Atlas",
    url: "https://atlas.example.org/europe-cities",
    excerpt: "Lisbon ranks among the EU's mid-sized capitals by population.",
  },
];

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
  {
    match:
      /population|inhabitants|how many people|ludność|mieszkańc|einwohner|bevölkerung|población|habitantes/i,
    results: MANY,
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
