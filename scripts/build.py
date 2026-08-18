#!/usr/bin/env python3
from pathlib import Path
import json, html, shutil

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/"dist"
CFG=json.loads((ROOT/"config"/"site.json").read_text(encoding="utf-8"))

UI={
"ru":{"current":"Текущий выпуск","archive":"Архив","articles":"Статьи","ask":"Вопрос раввину","bios":"Биографии","about":"Об издании","read":"Читать онлайн","print":"Как распечатать PDF","print_text":"В настройках принтера установите поля страницы 5 мм со всех сторон и печатайте в масштабе 100% / Actual size, если принтер поддерживает такие поля."},
"he":{"current":"הגיליון הנוכחי","archive":"ארכיון","articles":"מאמרים","ask":"שאל את הרב","bios":"רבנים ואישים","about":"אודות","read":"לקריאה באתר","print":"איך להדפיס את ה־PDF","print_text":"בהגדרות ההדפסה יש לקבוע שוליים של 5 מ״מ מכל צד ולהדפיס בקנה מידה של 100% / Actual size, אם המדפסת תומכת בשוליים כאלה."},
"en":{"current":"Current Issue","archive":"Archive","articles":"Articles","ask":"Ask the Rav","bios":"Biographies","about":"About","read":"Read online","print":"How to print the PDF","print_text":"In the printer settings, set page margins to 5 mm on all sides and print at 100% / Actual size, if your printer supports margins this small."},
"de":{"current":"Aktuelle Ausgabe","archive":"Archiv","articles":"Artikel","ask":"Frage an den Rabbiner","bios":"Biographien","about":"Über Jeschurun","read":"Online lesen","print":"PDF richtig drucken","print_text":"Stellen Sie in den Druckereinstellungen Seitenränder von 5 mm auf allen Seiten ein und drucken Sie mit 100% / Actual size, sofern Ihr Drucker so kleine Ränder unterstützt."},
"fr":{"current":"Numéro actuel","archive":"Archives","articles":"Articles","ask":"Question au rabbin","bios":"Biographies","about":"À propos","read":"Lire en ligne","print":"Comment imprimer le PDF","print_text":"Dans les paramètres de l’imprimante, réglez les marges à 5 mm de chaque côté et imprimez à 100 % / Actual size, si votre imprimante accepte des marges aussi étroites."}}
SUB={"ru":"Из учения нашего наставника, рава Шимшона Рафаэля Гирша, благословенной памяти, и продолжателей его пути, прошлых и ныне живущих.","he":"מתורתו של מורינו הרב שמשון רפאל הירש זצ״ל וממשיכי דרכו זצ״ל ויבלחט״א","en":"From the teachings of our teacher, Rabbi Samson Raphael Hirsch, of blessed memory, and of those who continue in his path — past and present.","de":"Aus der Lehre unseres Lehrers, Rabbiner Samson Raphael Hirsch sel. A., und derer, die seinen Weg fortführen — früher und heute.","fr":"D’après l’enseignement de notre maître, le rabbin Samson Raphaël Hirsch, de mémoire bénie, et de ceux qui poursuivent sa voie, hier comme aujourd’hui."}
SW={"he":"עברית","en":"EN","ru":"RU","de":"DE","fr":"FR"}

def esc(s): return html.escape(str(s),quote=True)
def load_issues():
    arr=[]
    for f in (ROOT/"content"/"issues").glob("*/*/issue.json"):
        d=json.loads(f.read_text(encoding="utf-8"))
        if d.get("status")=="published" and d.get("hebrew_year",0)>=CFG["archive_start_year"]:
            d["_rel"]=str(f.parent.relative_to(ROOT/"content"/"issues"));arr.append(d)
    return sorted(arr,key=lambda x:(x["hebrew_year"],x.get("published_at",""),x.get("sort_order",0)),reverse=True)
def root_for(route): return "../"*(route.strip("/").count("/")+2) if route else "../"
def shell(lang,title,body,route=""):
    root=root_for(route);ui=UI[lang];rtl=' class="rtl"' if lang=="he" else ""
    sw="".join('<a class="{a}" href="{r}{l}/{route}">{lab}</a>'.format(a="active" if l==lang else "",r=root,l=l,route=route,lab=SW[l]) for l in CFG["languages"])
    nav='<nav class="main-nav">'+''.join([
        f'<a href="{root}{lang}/">{ui["current"]}</a>',f'<a href="{root}{lang}/archive/">{ui["archive"]}</a>',
        f'<a href="{root}{lang}/articles/">{ui["articles"]}</a>',f'<a href="{root}{lang}/ask-rav/">{ui["ask"]}</a>',
        f'<a href="{root}{lang}/biographies/">{ui["bios"]}</a>',f'<a href="{root}{lang}/about/">{ui["about"]}</a>'])+'</nav>'
    mast=CFG["mastheads"][lang]
    return f'<!doctype html><html lang="{lang}" dir="{"rtl" if lang=="he" else "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} — Jeschurun</title><link rel="stylesheet" href="{root}assets/style.css"></head><body{rtl}><header class="site-header"><img class="masthead" src="{root}assets/{mast}" alt="Jeschurun"><div class="language-switch">{sw}</div><div class="site-subtitle">{SUB[lang]}</div></header>{nav}<main>{body}</main><footer><img class="publisher-seal" src="{root}assets/publisher-seal.png" alt=""><p class="publisher-line">{esc(CFG.get("footer_name", {}).get(lang, "Adas Jeschurun"))}</p></footer></body></html>'
def blocks(bs):
    out=[]
    for b in bs:
        t=b.get("type","p");x=esc(b.get("text",""))
        if t=="h2":out.append(f"<h2>{x}</h2>")
        elif t=="h3":out.append(f"<h3>{x}</h3>")
        elif t=="hebrew":out.append(f'<p class="hebrew-quote" dir="rtl" lang="he">{x}</p>')
        elif t=="quote":out.append(f'<p class="quote">{x}</p>')
        else:out.append(f"<p>{x}</p>")
    return "".join(out)
def copy_dl(issue,lang,key):
    rel=issue.get("downloads",{}).get(lang,{}).get(key)
    if not rel:return None
    src=ROOT/"content"/"issues"/issue["_rel"]/rel
    if not src.exists():return None
    dest=DIST/"downloads"/issue["id"]/src.name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
    return f"downloads/{issue['id']}/{src.name}"
def build():
    if DIST.exists():shutil.rmtree(DIST)
    DIST.mkdir();shutil.copytree(ROOT/"assets",DIST/"assets")
    issues=load_issues();cur=next((i for i in issues if i["_rel"]==CFG["current_issue"]),None)
    if not cur:raise SystemExit("current_issue is invalid or not published")
    (DIST/"index.html").write_text('<!doctype html><html><head><meta charset="utf-8"><script>(function(){var l=(navigator.language||"en").toLowerCase();if(l.startsWith("he"))location.replace("./he/");else if(l.startsWith("ru"))location.replace("./ru/");else if(l.startsWith("de"))location.replace("./de/");else if(l.startsWith("fr"))location.replace("./fr/");else location.replace("./en/");})();</script></head><body></body></html>',encoding="utf-8")
    for lang in CFG["languages"]:
        ui=UI[lang];(DIST/lang).mkdir(parents=True,exist_ok=True);c=cur["languages"].get(lang) or cur["languages"][CFG["default_language"]]
        href=f'issues/{cur["hebrew_year"]}/{cur["slug"]}/'
        home=f'<section class="issue"><div class="issue-head"><div class="kicker">{esc(c["kicker"])}</div><h1>{esc(c["parasha"])}</h1><hr class="divider"><p class="issue-title">{esc(c["title"])}</p></div><div class="issue-body"><p>{esc(c["summary"])}</p><div class="buttons"><a class="button primary" href="{href}">{ui["read"]}</a></div></div></section><div class="grid"><section class="card"><h2>{ui["archive"]}</h2><a class="card-link" href="archive/">{ui["archive"]} →</a></section><section class="card"><h2>{ui["articles"]}</h2><a class="card-link" href="articles/">{ui["articles"]} →</a></section><section class="card"><h2>{ui["ask"]}</h2><a class="card-link" href="ask-rav/">{ui["ask"]} →</a></section><section class="card"><h2>{ui["bios"]}</h2><a class="card-link" href="biographies/">{ui["bios"]} →</a></section></div>'
        (DIST/lang/"index.html").write_text(shell(lang,c["parasha"],home),encoding="utf-8")
        by={}
        for i in issues:by.setdefault(i["hebrew_year"],[]).append(i)
        ar=[]
        for y in sorted(by,reverse=True):
            ar.append(f'<section class="section-hero"><h1>{y}</h1></section><div class="content-list">')
            for i in by[y]:
                x=i["languages"].get(lang) or i["languages"][CFG["default_language"]]
                ar.append(f'<article class="content-card"><div class="meta">{esc(i["published_at"])}</div><h2>{esc(x["parasha"])}</h2><p>{esc(x["title"])}</p><a class="card-link" href="../issues/{i["hebrew_year"]}/{i["slug"]}/">{ui["read"]} →</a></article>')
            ar.append("</div>")
        p=DIST/lang/"archive";p.mkdir();(p/"index.html").write_text(shell(lang,ui["archive"],"".join(ar),"archive/"),encoding="utf-8")
        for i in issues:
            x=i["languages"].get(lang) or i["languages"][CFG["default_language"]];pdf=copy_dl(i,lang,"pdf");epub=copy_dl(i,lang,"epub")
            b=[f'<a class="button primary" href="#article">{ui["read"]}</a>']
            if pdf:b.append(f'<a class="button" href="../../../../{pdf}">PDF</a>')
            if epub:b.append(f'<a class="button" href="../../../../{epub}">EPUB</a>')
            pn=f'<details class="print-help"><summary>{ui["print"]}</summary><p>{ui["print_text"]}</p></details>' if pdf else ""
            page=f'<section class="issue"><div class="issue-head"><div class="kicker">{esc(x["kicker"])}</div><h1>{esc(x["parasha"])}</h1><hr class="divider"><p class="issue-title">{esc(x["title"])}</p></div><div class="issue-body"><p>{esc(x["summary"])}</p><div class="buttons">{"".join(b)}</div>{pn}</div></section><article class="reading-article" id="article">{blocks(x.get("body",[]))}</article>'
            p=DIST/lang/"issues"/str(i["hebrew_year"])/i["slug"];p.mkdir(parents=True,exist_ok=True);(p/"index.html").write_text(shell(lang,x["title"],page,f'issues/{i["hebrew_year"]}/{i["slug"]}/'),encoding="utf-8")
        cards=[]
        for f in (ROOT/"content"/"articles").glob("*/article.json"):
            a=json.loads(f.read_text(encoding="utf-8"));x=a["languages"].get(lang)
            if not x:continue
            src=next((i for i in issues if i["_rel"]==a["source_issue"]),None);h=f'../issues/{src["hebrew_year"]}/{src["slug"]}/#article' if src else "#"
            cards.append(f'<article class="content-card"><h2>{esc(x["title"])}</h2><p>{esc(x["summary"])}</p><a class="card-link" href="{h}">{ui["read"]} →</a></article>')
        p=DIST/lang/"articles";p.mkdir();(p/"index.html").write_text(shell(lang,ui["articles"],f'<section class="section-hero"><h1>{ui["articles"]}</h1></section><div class="content-list">{"".join(cards)}</div>',"articles/"),encoding="utf-8")
        cards=[]
        for f in (ROOT/"content"/"biographies").glob("*.json"):
            d=json.loads(f.read_text(encoding="utf-8"));x=d["languages"].get(lang)
            if x:cards.append(f'<article class="content-card"><div class="meta">{esc(d["years"])}</div><h2>{esc(x["name"])}</h2><p>{esc(x["summary"])}</p></article>')
        p=DIST/lang/"biographies";p.mkdir();(p/"index.html").write_text(shell(lang,ui["bios"],f'<section class="section-hero"><h1>{ui["bios"]}</h1></section><div class="content-list">{"".join(cards)}</div>',"biographies/"),encoding="utf-8")
        privacy={"ru":"Форма будет подключена через служебный адрес сайта; личный email раввина не будет показан спрашивающему.","he":"הטופס יחובר דרך כתובת המערכת; כתובת הדוא״ל האישית של הרב לא תיחשף לשואל.","en":"The form will use a site/system address; the Rav’s personal email will not be disclosed to the questioner.","de":"Das Formular wird über eine Systemadresse versandt; die persönliche E-Mail-Adresse des Rabbiners wird nicht offengelegt.","fr":"Le formulaire utilisera une adresse du site; l’adresse personnelle du rabbin ne sera pas révélée."}[lang]
        p=DIST/lang/"ask-rav";p.mkdir();(p/"index.html").write_text(shell(lang,ui["ask"],f'<section class="section-hero"><h1>{ui["ask"]}</h1><p>{privacy}</p></section><section class="form-card"><p>Cloudflare connection is the next step.</p><button disabled>{ui["ask"]}</button></section>',"ask-rav/"),encoding="utf-8")
        p=DIST/lang/"about";p.mkdir();(p/"index.html").write_text(shell(lang,ui["about"],f'<section class="section-hero"><h1>{ui["about"]}</h1><p>Jeschurun · {esc(CFG["publisher"])} · {esc(CFG["publisher_place"])}</p></section>',"about/"),encoding="utf-8")
    print("Built",DIST)
if __name__=="__main__":build()
