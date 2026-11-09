/* TaskBridge Live — local clause classifier and source-grounded plan logic. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TaskBridgeReader = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const LIMIT = 4800;
  const RX = {
    german: /(?:\b(?:sie|ihr|ihre|der|die|das|ein|eine|und|oder|abgabe|aufgabe|falls|wenn|bitte|bearbeiten|freiwillig|frist|hochladen)\b|[äöüß])/gi,
    choice: /\b(?:entweder|wahlweise)\b.{1,260}\boder\b|\b(?:genau|nur)\s+ein(?:e|en|es)?\b.{0,120}\b(?:auswählen|auszuwählen|wählen|bearbeiten|aufgaben|option|alternativ|varianten?|themen)\b|\bwählen\s+sie\s+(?:zwischen\b|ein(?:e|en|es)?\s+der\s+(?:folgenden|beiden|drei|vorgeschlagenen)\b)/i,
    conditional: /\b(?:falls|sofern|wenn|sollte|es sei denn|andernfalls|ansonsten|vorausgesetzt|außer wenn|im falle|nur für|ausgenommen)\b|\bbei\s+(?:technischen|einem|einer|fehlender|fehlendem|bedarf|problemen|einem ausfall)\b/i,
    avoid: /\b(?:nicht (?:zulässig|erlaubt|gestattet)|unzulässig|untersagt|verboten|ausgeschlossen|verzichten sie|nicht weitergeben)\b|\b(?:reichen|laden|schreiben|verwenden|benutzen|fügen|senden|versenden)\s+sie\b.{0,95}\b(?:keine|keinen|kein|nicht)\b/i,
    optional: /\b(?:freiwillig|optional|unverbindlich|nicht erforderlich|nicht nötig|keine pflicht|müssen nicht|wer möchte|wenn sie möchten|bei bedarf|lediglich eine anregung)\b/i,
    pending: /\b(?:bekannt\s*gegeben|folgt später|steht.{0,20}nicht fest|wird nachgereicht|noch offen|wird noch festgelegt|termin folgt|noch nicht festgelegt)\b/i,
    due: /\b(?:abgabetermin\w*|abgabefrist\w*|abgabeschluss\w*|einsendeschluss\w*|einreichungsfrist\w*|abzugeben|einzureichen|frist(?:en)?|spätestens|fällig)\b|\bspäteste\s+abgabe\b|\babgabe\s*:|\babgabe\b.{0,48}\b(?:bis|am|endet|termin|schluss|wird)\b|\bbis\b.{0,60}\b(?:ab|ein|hoch)\b/i,
    submissionDue: /\b(?:abgabe\w*|einreich\w*|einsend\w*|abzugeben|einzureichen|abgeben|hochladen|hochgeladen|hochzuladen|upload|senden|reichen|einzuschicken)\b/i,
    scopedDue: /\b(?:für\s+(?:(?:die|das|den)\s+)?(?:gruppe[n]?|teams?|erstsemester\w*|teilnehmende[n]?|studierende[n]?|kursteilnehmende[n]?)|(?:gruppe|team)\s+(?:[A-Z]|\d{1,3}))\b/i,
    dueVerb: /\b(?:abgabe|einreichung|einreichen|abzugeben|einzureichen|hochladen|laden|reicht|reichen|senden|abgeben|geben)\b/i,
    conflict: /\b(?:ursprünglich|statt|verschoben|bisher|ersetzt|nicht mehr|vorläufig|frühestens|abweichend|unterschiedliche fristen|je nach|verlängert)\b/i,
    contextDate: /\b(?:vorlesung|sprechstunde|veranstaltung|seminarsitzung|besprechung|vorbesprechung|raum|findet statt|besprechen|klausur|prüfung|beginn)\b/i,
    clockTime: /\b\d{1,2}(?:[:.]\d{2})?\s*uhr\b|\b\d{1,2}:\d{2}\b/i,
    operative: /\b(?:sie|muss|müssen|soll|sollen|pflicht|wählen|abgabe|aufgabe|einreichen|erforderlich|vorgegeben|obligatorisch|laden|abgeben|anhang|hochgeladen|erlaubt|verwendet|beigefügt)\b/i,
    delivery: /\b(?:pdf|docx|xlsx|pptx?|zip|datei|anhang|format|moodle|ilias|upload|portal|einreich\w*|abgab\w*|e[ -]?mail)\b/i,
    deliveryVerb: /\b(?:laden|hochladen|hochgeladen|reichen|einreichen|eingereicht|abgeben|abgegeben|abgabe|senden|schicken|format|dateiname|benennen|speichern|übermitteln)\b/i,
    concreteDelivery: /\b(?:pdf|docx|xlsx|moodle|ilias|abgabeportal|e-mail|dateiname)\b/i,
    compoundOptional: /(?:[,;]\s*(?:aber\s+|jedoch\s+)?|\bund\s+)(?:(?![,;]).){1,110}\b(?:ist pflicht|sind pflicht|ist verpflichtend|sind verpflichtend|muss bearbeitet|sind abzugeben|ist abzugeben)\b/i
  };
  const MONTHS = {
    januar:1, jan:1, februar:2, feb:2, märz:3, maerz:3, mär:3, april:4, apr:4, mai:5,
    juni:6, jun:6, juli:7, jul:7, august:8, aug:8, september:9, sep:9, sept:9,
    oktober:10, okt:10, november:11, nov:11, dezember:12, dez:12
  };
  const monthNames = Object.keys(MONTHS).sort((a,b)=>b.length-a.length).join("|");
  const dateRX = new RegExp(
    "(?<![\\d.])(?:(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})?(?![\\d.])|(\\d{1,2})\\.\\s*("+
    monthNames +")(?:\\.)?(?:\\s+(\\d{4}))?(?![a-zäöüß]))" +
    "(?:\\s*,?\\s*(?:um\\s*)?(\\d{1,2})(?:[.:](\\d{2}))?\\s*Uhr|\\s*,?\\s*(?:um\\s*)?(\\d{1,2}):(\\d{2})(?!\\d))?",
    "gi"
  );

  function features(text) {
    const tokens = text.toLowerCase().normalize("NFC")
      .replace(/[0-9]+(?:[.,][0-9]+)*/g, " # ").match(/[a-zäöüß]+|#/g) || [];
    const x = new Map();
    if (tokens.length) x.set("first:"+tokens[0],.82);
    tokens.forEach((token,i)=>{
      x.set("w:"+token,1);
      if (i) x.set("pair:"+tokens[i-1]+":"+token,.71);
      if (token.length>=6) x.set("prefix:"+token.slice(0,5),.61);
      if (token.length>=4) {
        const m = "^"+token+"$";
        for (const n of [3,4]) for (let j=0;j<=m.length-n;j++) x.set("g:"+m.slice(j,j+n),.36);
      }
    });
    return x;
  }

  function classify(text, model) {
    const x = features(text);
    let magnitude=0, covered=0;
    for (const v of x.values()) magnitude += v*v;
    const norm = Math.sqrt(magnitude) || 1;
    const scores = model.bias.slice();
    for (const [term,v] of x) {
      if (!Object.hasOwn(model.features,term)) continue;
      covered+=v*v;
      const weight=model.features[term];
      for (let i=0;i<scores.length;i++) scores[i]+=weight[i]*v/norm;
    }
    const max = Math.max(...scores);
    const exp = scores.map(v=>Math.exp(v-max));
    const sum = exp.reduce((a,b)=>a+b,0);
    const ranked = model.labels.map((label,i)=>({label, score:exp[i]/sum})).sort((a,b)=>b.score-a.score);
    return {label:ranked[0].label, score:ranked[0].score, margin:ranked[0].score-ranked[1].score, coverage:covered/(magnitude||1)};
  }

  function clauses(text) {
    const out=[];
    const lines=text.split("\n");
    let offset=0;
    for (let index=0;index<lines.length;index++) {
      const line=lines[index];
      let start=0;
      function add(end) {
        const raw=line.slice(start,end);
        const left=(raw.match(/^\s*/) || [""])[0].length;
        const right=(raw.match(/\s*$/) || [""])[0].length;
        const at=start+left, stop=end-right;
        if (stop>at && /[A-Za-zÄÖÜäöüß]/.test(line.slice(at,stop))) {
          out.push({quote:line.slice(at,stop),line:index+1,start:offset+at,end:offset+stop});
        }
        start=end;
      }
      for (let i=0;i<line.length;i++) {
        if (!/[.!?]/.test(line[i])) continue;
        const tail=line.slice(i+1);
        if (!/^\s+\S/.test(tail)) continue;
        const before=line.slice(start,i+1);
        if (line[i]==="." && (
          /^\s*(?:[-•]\s*)?\d{1,2}\.$/.test(before) ||
          /(?:\b(?:bzw|usw|ca|ggf|dipl|dr|prof|nr|abb|vgl|d\.h|z\.b|bspw|u\.a)\.|\b[a-z]\.)$/i.test(before) ||
          (/\d\.$/.test(before) && new RegExp("^\\s*(?:"+monthNames+")\\b","i").test(tail)) ||
          (/^\s*(?:um\s+\d|uhr\b)/i.test(tail))
        )) continue;
        if (/^\s+["„“'(\[]*[A-ZÄÖÜ0-9]/.test(tail)) add(i+1);
      }
      add(line.length);
      offset+=line.length+1;
    }
    return out;
  }

  function datesIn(quote) {
    const result=[];
    for (const match of quote.matchAll(dateRX)) {
      const day=Number(match[1]||match[4]);
      const month=match[2] ? Number(match[2]) : MONTHS[match[5].toLowerCase()];
      const rawYear=match[3]||match[6]||"";
      const year=rawYear.length===4 ? Number(rawYear) : 2000;
      const hour=match[7]||match[9], minute=match[8]||match[10];
      const days=month>=1&&month<=12 ? new Date(Date.UTC(year,month,0)).getUTCDate() : 0;
      const valid=day>=1&&day<=days&&(!hour||Number(hour)<24)&&(!minute||Number(minute)<60)&&rawYear.length!==2;
      const raw=match[0].trim();
      result.push({raw,key:[rawYear,month,day,hour==null?"":Number(hour),minute==null?(hour==null?"":0):Number(minute)].join(":"),valid});
    }
    return result;
  }

  function choiceParts(quote) {
    let tail=quote.match(/\b(?:entweder|wahlweise)\s+(.+?)\s+oder\s+(.+?)\s*[.!?]?\s*$/i);
    if (!tail) tail=quote.match(/\b(?:genau\s+eine\w*|nur\s+eine\w*)\b[^:]*:\s*(.+?)\s+oder\s+(.+?)\s*[.!?]?\s*$/i);
    if (!tail) return [];
    const parts=[tail[1].trim(),tail[2].replace(/[.!?]$/,"").trim()];
    if (parts.some(x=>!x||x.length>120||/\b(?:oder|sondern|außer|weder|sowohl|falls|wenn)\b/i.test(x)||/[;,]/.test(x))) return [];
    if (/\b(?:nicht|keine[nrs]?)\b/i.test(quote.slice(0,tail.index))) return [];
    return parts;
  }

  function conditionParts(quote) {
    if (/\b(?:es sei denn|ansonsten|andernfalls|außer wenn|vorausgesetzt|sollte|nur für)\b/i.test(quote)) return null;
    let m=quote.match(/^\s*(?:[-•]\s*)?(?:(?:nur\s+)?(?:falls|wenn|sofern))\s+([^,;]+),\s*(?:dann\s+)?(.+?)\s*[.!?]?\s*$/i);
    if (m && !RX.conditional.test(m[2]) && !/[;:]/.test(m[2]))
      return {condition:m[1].trim(),action:m[2].replace(/[.!?]$/,"").trim()};
    m=quote.match(/^(.+?),?\s+nur\s+wenn\s+([^,;]+?)\s*[.!?]?\s*$/i);
    if (m && !RX.conditional.test(m[1]) && !/[;:]/.test(m[1]))
      return {condition:m[2].trim(),action:m[1].replace(/,\s*$/,"").trim()};
    return null;
  }

  function read(text, model) {
    if (typeof text!=="string") return {error:"empty",cards:[]};
    if (text.length>LIMIT) return {error:"length",cards:[]};
    const trimmed=text.trim();
    if (trimmed.length<6) return {error:"empty",cards:[]};
    const markers=trimmed.match(RX.german)||[];
    if (markers.length<1) return {error:"language",cards:[]};
    const cards=[];
    let context=0;
    for (const span of clauses(text)) {
      const q=span.quote, pred=classify(q,model);
      const possibleDates=datesIn(q);
      const eventTiming=(possibleDates.length>0||RX.clockTime.test(q))&&RX.contextDate.test(q)&&!RX.submissionDue.test(q);
      if (eventTiming) {context++;continue;}
      const conditional=RX.conditional.test(q)&&!RX.optional.test(q);
      const choice=RX.choice.test(q);
      const avoided=RX.avoid.test(q)&&!RX.optional.test(q);
      const optional=RX.optional.test(q);
      const explicitDue=RX.due.test(q) || (/\bbis\b/i.test(q) && RX.dueVerb.test(q) && possibleDates.length>0);
      let kind=null, method="text", reason=null, extra={};
      if (avoided && conditional) {
        kind="review";reason="compound";extra.dueReview=explicitDue;
      } else if (avoided) {
        kind="avoid";
      } else if (optional && (RX.compoundOptional.test(q)||choice)) {
        kind="review";reason="compound";extra.dueReview=explicitDue;
      } else if (optional) {
        kind="optional";
      } else if (choice && (conditional||/\b(?:mindestens|höchstens|mehrere|nicht|weder)\b/i.test(q))) {
        kind="review";reason="compound";extra.dueReview=explicitDue;
      } else if (conditional) {
        const parts=conditionParts(q);
        if (parts) {kind="condition";extra.parts=parts;extra.dueReview=explicitDue;}
        else {kind="review";reason="condition";extra.dueReview=explicitDue;}
      } else if (choice) {
        kind="choice";extra.options=choiceParts(q);extra.dueReview=explicitDue;
      } else if (explicitDue) {
        const usable=possibleDates.filter(d=>d.valid);
        if (RX.pending.test(q)) {
          kind="deadline";extra.dateState="pending";
        } else if (RX.conflict.test(q)||RX.scopedDue.test(q)||possibleDates.some(d=>!d.valid)||new Set(usable.map(d=>d.key)).size>1) {
          kind="deadline";extra.dateState="review";
        } else if (usable.length) {
          kind="deadline";extra.dateState="stated";extra.date=usable[0];
        } else {
          kind="deadline";extra.dateState="review";
        }
      } else if (pred.coverage>=.27 && pred.score>=.34 && pred.margin>=.09) {
        method="model";
        if (pred.label==="required" && !/\b(?:nicht|keine[nrs]?|weder|könnten)\b/i.test(q)) kind="required";
        else if (pred.label==="optional") kind="optional";
        else if (pred.label==="delivery" && RX.delivery.test(q)&&RX.deliveryVerb.test(q)) kind="delivery";
        else if (pred.label==="context" && !(RX.deliveryVerb.test(q)&&RX.delivery.test(q))) {context++;continue;}
        else {kind="review";reason=pred.label==="deadline"?"unprovenDate":"unclear";extra.dueReview=pred.label==="deadline";}
      } else if (RX.operative.test(q)||pred.label!=="context") {
        kind="review";method="review";reason="unclear";
      } else {
        context++;continue;
      }
      if (kind) {
        cards.push({id:"c"+(cards.length+1),...span,kind,method,reason,...extra});
        if (kind==="deadline" && extra.dateState==="stated" && RX.concreteDelivery.test(q) &&
            RX.deliveryVerb.test(q) && !/\b(?:nicht|keine[nrs]?|alternativ)\b/i.test(q)) {
          cards.push({id:"c"+(cards.length+1),...span,kind:"delivery",method:"text",reason:null});
        }
      }
    }
    for (const c of cards) {
      if (c.kind!=="condition" || !/\bmoodle\b.{0,44}\b(?:nicht erreichbar|nicht verfügbar|ausfällt)\b/i.test(c.parts.condition) ||
          !/\bstattdessen\b/i.test(c.parts.action) || !/\be-mail\b/i.test(c.parts.action)) continue;
      const candidates=cards.filter(x=>x.kind==="delivery"&&x.start<c.start&&/\bmoodle\b/i.test(x.quote));
      if (candidates.length===1) c.replaces=candidates[0].id;
    }
    const due=cards.filter(c=>c.kind==="deadline"||c.dueReview);
    const stated=due.filter(c=>c.dateState==="stated");
    let date={status:"missing",cardIds:due.map(x=>x.id)};
    if (due.length) {
      if (due.every(c=>c.dateState==="pending")) date.status="pending";
      else if (stated.length===due.length && new Set(stated.map(c=>c.date.key)).size===1) {
        date.status="stated";date.raw=stated[0].date.raw;
      } else date.status="review";
    }
    const modelCards=cards.filter(c=>c.method==="model").length;
    return {cards,date,context,learned:modelCards,lines:text.split("\n").length,source:text};
  }

  function checkPlan(result, selected={}, conditions={}) {
    const issues=[];
    const alternatives=new Map();
    for (const c of result.cards) if (c.replaces) alternatives.set(c.replaces,conditions[c.id]);
    let checks=0;
    for (const c of result.cards) {
      if (c.kind==="required"||c.kind==="delivery") {
        checks++;
        const replaced=alternatives.has(c.id);
        const decision=alternatives.get(c.id);
        if (replaced&&decision==="yes") {
          if (selected[c.id]) issues.push({id:c.id,code:"instead"});
        } else if ((!replaced||decision==="no")&&!selected[c.id]) issues.push({id:c.id,code:"missing"});
      } else if (c.kind==="choice" && c.options.length===2) {
        checks++;
        const indexes=Array.isArray(selected[c.id]) ? new Set(selected[c.id].filter(x=>x===0||x===1)) : new Set();
        if (indexes.size!==1) issues.push({id:c.id,code:indexes.size>1?"both":"one"});
      } else if (c.kind==="condition" && c.parts) {
        checks++;
        const state=conditions[c.id];
        if (state!=="yes"&&state!=="no") issues.push({id:c.id,code:"condition"});
        else if (state==="yes"&&!selected[c.id]) issues.push({id:c.id,code:"ifYes"});
        else if (state==="no"&&selected[c.id]) issues.push({id:c.id,code:"ifNo"});
      }
    }
    return {checks,issues,passed:checks>0&&issues.length===0};
  }

  return {LIMIT,features,classify,clauses,datesIn,read,checkPlan};
});
