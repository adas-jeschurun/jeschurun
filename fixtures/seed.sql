-- Offline fixture seed for test:offline
DELETE FROM related_articles;
DELETE FROM article_tags;
DELETE FROM tags;
DELETE FROM translations;
DELETE FROM articles;
DELETE FROM answers;
DELETE FROM bios;
DELETE FROM issues;
DELETE FROM site_config;
DELETE FROM files;
DELETE FROM import_manifest;

INSERT INTO issues(id,hebrew_year,slug,parasha_key,published_at,status,sort_order,meta_json) VALUES
('5787-noach',5787,'noach','noach','2026-10-16','published',0,'{"articles":["alpha","beta"],"rabbi_answers":["q1"],"downloads":{"en":{"pdf":"downloads/en.pdf","epub":"downloads/en.epub"}}}'),
('5786-ki-tavo',5786,'ki-tavo','ki-tavo','2026-08-28','published',0,'{"articles":["gamma"],"rabbi_answers":[],"downloads":{}}');

INSERT INTO articles(id,slug,status,source_issue,published_at,updated_at,lead_image,order_in_issue,meta_json) VALUES
('alpha','alpha','published','5787/noach','2026-10-16','','',1,'{}'),
('beta','beta','published','5787/noach','2026-10-15','','',2,'{}'),
('gamma','gamma','published','5786/ki-tavo','2026-08-28','','',1,'{}'),
('delta','delta','published','5787/noach','2026-10-14','','',3,'{}'),
('epsilon','epsilon','published','5786/ki-tavo','2026-08-27','','',2,'{}');

INSERT INTO answers(id,slug,status,source_issue,published_at,updated_at,meta_json) VALUES
('q1','q1','published','5787/noach','2026-10-16','','{}');

INSERT INTO translations(id,kind,parent_id,lang,title,summary,body_md,body_text,extra_json) VALUES
('article:alpha:en','article','alpha','en','Alpha Title','Alpha summary','## Hello\n\nBody of alpha with teshuvah.','Hello Body of alpha with teshuvah.','{}'),
('article:alpha:he','article','alpha','he','כותרת אלפא','תקציר','גוף עם ניקוד בְּרֵאשִׁית','גוף עם ניקוד בראשית','{}'),
('article:beta:en','article','beta','en','Beta Title','Beta summary','Body beta ethics.','Body beta ethics.','{}'),
('article:gamma:en','article','gamma','en','Gamma Title','Gamma summary','Body gamma memory.','Body gamma memory.','{}'),
('article:delta:en','article','delta','en','Delta Title','Delta summary','Body delta.','Body delta.','{}'),
('article:epsilon:en','article','epsilon','en','Epsilon Title','Epsilon summary','Body epsilon.','Body epsilon.','{}'),
('answer:q1:en','answer','q1','en','Question one','What about shabbat?','Answer body.','Answer body.','{"question":"What about shabbat?"}'),
('issue:5787-noach:en','issue','5787-noach','en','Noach Issue','Summary','','Noach Issue Summary','{"parasha":"Noach"}'),
('issue:5786-ki-tavo:en','issue','5786-ki-tavo','en','Ki Tavo Issue','Summary','','Ki Tavo Issue Summary','{"parasha":"Ki Tavo"}');

INSERT INTO tags(slug,labels_json) VALUES
('ethics','{"en":"Ethics","he":"מוסר","ru":"Этика","de":"Ethik","fr":"Éthique"}'),
('teshuvah','{"en":"Teshuvah","he":"תשובה","ru":"Тшува","de":"Teschuwa","fr":"Techouva"}'),
('parasha-noach','{"en":"Noach","he":"נח","ru":"Ноах","de":"Noach","fr":"Noach"}'),
('parasha-ki-tavo','{"en":"Ki Tavo","he":"כי תבוא","ru":"Ки Таво","de":"Ki Tavo","fr":"Ki Tavo"}'),
('memory','{"en":"Memory","he":"זיכרון","ru":"Память","de":"Erinnerung","fr":"Mémoire"}');

INSERT INTO article_tags(article_id,tag_slug) VALUES
('alpha','ethics'),('alpha','teshuvah'),('alpha','parasha-noach'),
('beta','ethics'),('beta','parasha-noach'),
('gamma','memory'),('gamma','ethics'),('gamma','parasha-ki-tavo'),
('delta','teshuvah'),('delta','parasha-noach'),
('epsilon','memory'),('epsilon','parasha-ki-tavo');

INSERT INTO related_articles(article_id,related_id,score) VALUES
('alpha','beta',2),('beta','alpha',2),
('alpha','gamma',1),('gamma','alpha',1),
('alpha','delta',1),('delta','alpha',1),
('beta','delta',1),('delta','beta',1),
('gamma','epsilon',1),('epsilon','gamma',1);

INSERT INTO site_config(key,value) VALUES('current_issue','5787/noach');
INSERT INTO import_manifest(key,value) VALUES('source_sha','fixture');
