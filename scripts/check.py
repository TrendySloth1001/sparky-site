#!/usr/bin/env python3
"""Tiny sanity check: HTML tag balance, local asset paths, duplicate ids, page weight."""
import re, sys, os
from html.parser import HTMLParser
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOID = {"meta","link","img","br","hr","input","source","use","path","circle","rect","ellipse"}
bad = 0
class P(HTMLParser):
    def __init__(s): super().__init__(); s.stack=[]; s.ids=set(); s.refs=[]; s.frag=[]
    def handle_starttag(s, t, a):
        a = dict(a)
        if t not in VOID: s.stack.append(t)
        if "id" in a:
            if a["id"] in s.ids: print("dup id", a["id"]); globals()["bad"] += 1
            s.ids.add(a["id"])
        for k in ("src","href"):
            v = a.get(k)
            if v and not re.match(r"(https?:|mailto:|data:)", v):
                (s.frag if v.startswith("#") else s.refs).append(v)
    def handle_endtag(s, t):
        if t in VOID: return
        if not s.stack or s.stack[-1] != t: print("mismatched </%s>, open: %s" % (t, s.stack[-3:])); globals()["bad"] += 1
        else: s.stack.pop()
for page in ("index.html", "404.html"):
    p = P(); p.feed(open(os.path.join(root, page)).read())
    if p.stack: print(page, "unclosed", p.stack); bad += 1
    for r in p.refs:
        f = os.path.join(root, r.lstrip("/").split("#")[0].split("?")[0])
        if not os.path.exists(f): print(page, "BROKEN", r); bad += 1
    for f in p.frag:
        if f != "#" and f[1:] not in p.ids and f[1:] != "main": print(page, "missing anchor", f); bad += 1
css = open(os.path.join(root, "css/style.css")).read()
for u in re.findall(r"url\(\"?([^)\"]+)\"?\)", css):
    if not os.path.exists(os.path.normpath(os.path.join(root, "css", u))): print("css BROKEN", u); bad += 1
print("OK" if not bad else "%d problems" % bad)
sys.exit(1 if bad else 0)
