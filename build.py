#!/usr/bin/env python3
"""Build an offline, dependency-free HTML page from the editable source."""
from pathlib import Path
import json

root=Path(__file__).resolve().parent
src=root
template=(src/"page.html").read_text(encoding="utf-8")
values={
    "CSS":(src/"style.css").read_text(encoding="utf-8"),
    "READER":(src/"reader.js").read_text(encoding="utf-8"),
    "LOCALE":(src/"locale.js").read_text(encoding="utf-8"),
    "APP":(src/"app.js").read_text(encoding="utf-8"),
    "MODEL":json.dumps(json.loads((root/"model.json").read_text(encoding="utf-8")),ensure_ascii=False,separators=(",",":")).replace("<","\\u003c"),
    "EXAMPLES":json.dumps(json.loads((root/"examples.json").read_text(encoding="utf-8")),ensure_ascii=False,separators=(",",":")).replace("<","\\u003c"),
}
for name,value in values.items():
    token="@@"+name+"@@"
    assert template.count(token)==1, name
    template=template.replace(token,value)
(root/"index.html").write_text(template, encoding="utf-8")
print("Built index.html:", len(template.encode("utf-8")), "bytes")
