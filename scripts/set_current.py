#!/usr/bin/env python3
from pathlib import Path
import json,sys
R=Path(__file__).resolve().parents[1]
if len(sys.argv)!=2:raise SystemExit("Usage: python scripts/set_current.py 5786/ki-tetze")
rel=sys.argv[1].strip("/")
if not (R/"content"/"issues"/rel/"issue.json").exists():raise SystemExit("Issue not found")
p=R/"config"/"site.json";d=json.loads(p.read_text(encoding="utf-8"));d["current_issue"]=rel;p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding="utf-8");print("Current:",rel)
