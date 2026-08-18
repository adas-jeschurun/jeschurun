#!/usr/bin/env python3
from pathlib import Path
import json,sys
R=Path(__file__).resolve().parents[1]
if len(sys.argv)<3:raise SystemExit("Usage: python scripts/new_issue.py 5786 slug")
year=int(sys.argv[1]);slug=sys.argv[2];f=R/"content"/"issues"/str(year)/slug;f.mkdir(parents=True,exist_ok=False);(f/"downloads").mkdir()
d={"id":f"{year}-{slug}","hebrew_year":year,"slug":slug,"parasha_key":slug,"published_at":"","status":"draft","sort_order":0,"languages":{},"downloads":{},"articles":[],"tags":[]}
(f/"issue.json").write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding="utf-8");print("Created",f)
