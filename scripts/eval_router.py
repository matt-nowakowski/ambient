"""Routing accuracy check for the voice agent (src-tauri/src/agent/router.rs).

Sends each labelled phrase through the router prompt on our hosted model and
reports misses. The priority metric is dictation routed away from "write":
that one must stay at zero.

  python3 scripts/eval_router.py <license key> [base url]
  (base url defaults to http://localhost:3123; run the web app with next dev)
"""
import json, re, sys, os, urllib.request, urllib.error, datetime, concurrent.futures as cf
key=sys.argv[1]
base=sys.argv[2] if len(sys.argv)>2 else "http://localhost:3123"
src=open(os.path.join(os.path.dirname(__file__),"..","src-tauri","src","agent","router.rs")).read()
system=re.search(r'const SYSTEM: &str = r#"(.*?)"#;',src,re.S).group(1)
now=datetime.datetime.now().strftime("%A %Y-%m-%d %H:%M")
system+=f"\n\nNOW: {now}\n\nPOLISH RULES:\nClean up filler words, fix punctuation and capitalisation. Keep the user's wording."
cases=[
 # write (dictation, including questions to other people)
 ("can we move the sync to thursday","write"),("is everyone okay with pushing the launch a week?","write"),
 ("what do you think about the new pricing page","write"),("could you send me the deck before the call","write"),
 ("how's the migration going on your side","write"),("do you want to grab lunch tomorrow","write"),
 ("should we use postgres or sqlite for this","write"),("when are you free next week","write"),
 ("add a section about pricing to the doc","write"),("open question: do we keep the free tier","write"),
 ("thanks Sam, I'll review it this afternoon","write"),("why don't we just ship it on Monday","write"),
 # answer
 ("what's the capital gains tax rate in the UK right now","answer"),("how many ounces in a cup","answer"),
 ("summarise this thread","answer"),("what does this error mean","answer"),("translate this into Spanish","answer"),
 ("hey ambient what's the weather in Lisbon tomorrow","answer"),("explain what a mutex is","answer"),
 ("what time is it in Tokyo","answer"),("convert 250 dollars to euros","answer"),("who won the champions league last year","answer"),
 # act
 ("remind me at 5 to call Sam","act"),("open Linear","act"),("add lunch with Ana on Friday at 1pm to my calendar","act"),
 ("search for flights to Lisbon in December","act"),("run my standup shortcut","act"),("go to github.com","act"),
 ("set a reminder to pay rent on the first","act"),("open Slack","act"),
 # recall
 ("what did I say about pricing yesterday","recall"),("what was that number I dictated earlier for the budget","recall"),
 ("what did I tell Ana about the launch date","recall"),
 # Spanish
 ("podemos mover la reunión al jueves","write"),("qué te parece la nueva página de precios","write"),
 ("gracias Sam, lo reviso esta tarde","write"),("cuándo estás libre la semana que viene","write"),
 ("deberíamos usar postgres o sqlite para esto","write"),
 ("cuál es el tipo del impuesto sobre plusvalías en España","answer"),("resume este hilo","answer"),
 ("qué significa este error","answer"),("traduce esto al inglés","answer"),("cuántas onzas tiene una taza","answer"),
 ("recuérdame a las 5 llamar a Sam","act"),("abre Slack","act"),("añade comida con Ana el viernes a la 1","act"),
 ("busca vuelos a Lisboa en diciembre","act"),
 ("qué dije ayer sobre los precios","recall"),("qué le dije a Ana sobre la fecha de lanzamiento","recall"),
 # Polish
 ("czy możemy przesunąć spotkanie na czwartek","write"),("co myślisz o nowej stronie z cenami","write"),
 ("dzięki Sam, przejrzę to po południu","write"),("kiedy masz czas w przyszłym tygodniu","write"),
 ("czy powinniśmy użyć postgresa czy sqlite","write"),
 ("jaka jest stawka podatku od zysków kapitałowych w Polsce","answer"),("podsumuj ten wątek","answer"),
 ("co oznacza ten błąd","answer"),("przetłumacz to na angielski","answer"),("ile uncji ma szklanka","answer"),
 ("przypomnij mi o 17 żeby zadzwonić do Sama","act"),("otwórz Slacka","act"),("dodaj lunch z Anią w piątek o 13","act"),
 ("wyszukaj loty do Lizbony w grudniu","act"),
 ("co mówiłem wczoraj o cenach","recall"),("co powiedziałem Ani o dacie premiery","recall"),
]
def run(c):
    q,want=c
    body=json.dumps({"model":"polish","messages":[{"role":"system","content":system},{"role":"user","content":"Transcript: "+q}],"max_tokens":300}).encode()
    req=urllib.request.Request(base+"/api/ai/v1/chat/completions",data=body,headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"})
    import time
    for attempt in range(6):
        try:
            out=json.load(urllib.request.urlopen(req,timeout=30))["choices"][0]["message"]["content"]
            break
        except urllib.error.HTTPError as e:
            # 429: our own per-minute limit; 5xx: an occasional slow upstream.
            if e.code in (429,500,502,503) and attempt<5: time.sleep(12); continue
            raise
    try:
        j=json.loads(out[out.find("{"):out.rfind("}")+1]); got=j.get("intent")
    except Exception: got="parse_error"; j=out
    return q,want,got,j
with cf.ThreadPoolExecutor(3) as ex: res=list(ex.map(run,cases))
ok=sum(1 for _,w,g,_ in res if w==g)
for q,w,g,j in res:
    if w!=g: print(f"MISS want={w} got={g}: {q}  -> {json.dumps(j)[:160]}")
print(f"{ok}/{len(res)} correct")
wrongly_not_write=sum(1 for _,w,g,_ in res if w=="write" and g!="write")
print("dictation misrouted away from write:",wrongly_not_write)
