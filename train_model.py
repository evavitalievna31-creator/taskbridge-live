#!/usr/bin/env python3
"""Train the browser's compact classifier from the documented synthetic corpus."""
from collections import Counter
from math import sqrt
from pathlib import Path
import json
import re
import unicodedata
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parent

def feature_map(text):
    norm = unicodedata.normalize("NFC", text.lower())
    norm = re.sub(r"[0-9]+(?:[.,][0-9]+)*", " # ", norm)
    tokens = re.findall(r"[a-zäöüß]+|#", norm)
    x = {}
    if tokens:
        x["first:" + tokens[0]] = 0.82
    for i, token in enumerate(tokens):
        x["w:" + token] = 1.0
        if i:
            x["pair:" + tokens[i-1] + ":" + token] = 0.71
        if len(token) >= 6:
            x["prefix:" + token[:5]] = 0.61
        if len(token) >= 4:
            marked = "^" + token + "$"
            for n in (3, 4):
                for j in range(len(marked) - n + 1):
                    x["g:" + marked[j:j+n]] = 0.36
    norm = sqrt(sum(v*v for v in x.values())) or 1
    return {k:v/norm for k,v in x.items()}

def main():
    rows = [line.strip().split("|", 1) for line in (ROOT/"training.de.txt").read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")]
    assert len({text for _,text in rows}) == len(rows), "Duplicate training sample"
    vectorizer = DictVectorizer()
    x = vectorizer.fit_transform(feature_map(text) for _,text in rows)
    model = LogisticRegression(C=19, max_iter=400, class_weight="balanced", random_state=17)
    model.fit(x, [tag for tag,_ in rows])
    def rounded(values):
        return [round(float(v), 5) for v in values]
    data = {
        "version": 1, "algorithm": "multinomial logistic regression",
        "labels": list(model.classes_), "bias": rounded(model.intercept_),
        "nTrain": len(rows), "trainingCounts": dict(sorted(Counter(tag for tag,_ in rows).items())),
        "features": {term:rounded(model.coef_[:,i]) for i,term in enumerate(vectorizer.get_feature_names_out())},
    }
    (ROOT/"model.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",",":"))+"\n", encoding="utf-8")
    print(f"{len(rows)} labeled clauses · {len(data['features'])} weighted features · {len(data['labels'])} classes")

if __name__ == "__main__":
    main()
