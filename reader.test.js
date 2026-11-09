"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const R=require("./reader.js");
const model=require("./model.json");
const e=require("./examples.json");
const publicExcerpts=require("./public-excerpts.json");
const read=t=>R.read(t,model);
function proofIsExact(x){
  for (const c of x.cards) {
    assert.equal(x.source.slice(c.start,c.end),c.quote);
    assert.equal(x.source.slice(0,c.start).split("\n").length,c.line);
  }
}
test("learner sees real classification of a new requirement and delivery clause",()=>{
  const x=read(e.choice.text);
  assert.equal(x.date.raw,"19.11.2026 um 16:00 Uhr");
  assert.ok(x.cards.find(c=>c.kind==="required"&&c.method==="model"));
  assert.ok(x.cards.find(c=>c.kind==="delivery"&&c.method==="model"));
  assert.equal(x.cards.find(c=>c.kind==="optional").line,6);
  proofIsExact(x);
});
test("one of two: an incorrect plan is repaired against the cited clause",()=>{
  const x=read(e.choice.text), plan={};
  for(const c of x.cards) if (["delivery","required"].includes(c.kind)) plan[c.id]=true;
  const choice=x.cards.find(c=>c.kind==="choice");
  assert.deepEqual(choice.options,["Analyse A","Fotoprotokoll B"]);
  plan[choice.id]=[0,1];
  assert.deepEqual(R.checkPlan(x,plan).issues,[{id:choice.id,code:"both"}]);
  plan[choice.id]=[1];assert.ok(R.checkPlan(x,plan).passed);
  plan[choice.id]=[];assert.equal(R.checkPlan(x,plan).issues[0].code,"one");
});
test("explicit fallback replaces the ordinary delivery only if its condition applies",()=>{
  const x=read(e.conditional.text);
  const required=x.cards.find(c=>c.kind==="required"), cond=x.cards.find(c=>c.kind==="condition");
  const regular=x.cards.find(c=>c.kind==="delivery");
  assert.equal(cond.replaces,regular.id);
  assert.equal(cond.parts.condition,"Moodle nicht erreichbar ist");
  assert.equal(R.checkPlan(x,{[required.id]:true,[regular.id]:true},{[cond.id]:"yes"}).issues[0].code,"instead");
  assert.ok(R.checkPlan(x,{[required.id]:true,[cond.id]:true},{[cond.id]:"yes"}).passed);
  assert.ok(R.checkPlan(x,{[required.id]:true,[regular.id]:true},{[cond.id]:"no"}).passed);
  assert.equal(R.checkPlan(x,{[required.id]:true,[cond.id]:true},{}).issues[0].code,"condition");
  proofIsExact(x);
});
test("pending and competing dates never become a deadline",()=>{
  const a=read(e.pending.text), b=read(e.conflict.text);
  assert.equal(a.date.status,"pending");
  assert.equal(b.date.status,"review");
  assert.equal(b.date.cardIds.length,2);
  assert.equal(a.date.raw,undefined);assert.equal(b.date.raw,undefined);
  proofIsExact(a);proofIsExact(b);
});
test("an explicit combined delivery and deadline keeps both parts",()=>{
  const x=read("Laden Sie die Datei bis zum 10.12.2026 um 18 Uhr als PDF in Moodle hoch.");
  assert.equal(x.date.raw,"10.12.2026 um 18 Uhr");
  assert.deepEqual(x.cards.map(c=>c.kind),["deadline","delivery"]);
  proofIsExact(x);
});
test("no date inferred from context, invalid calendar date or relative cutoff",()=>{
  assert.equal(read("Die Vorlesung beginnt am 17. November um 10 Uhr.").date.status,"missing");
  assert.equal(read("Die Abgabefrist endet am 31.02.2026 um 23 Uhr.").date.status,"review");
  assert.equal(read("Die Aufgaben sind bis zum nächsten Montag abzugeben.").date.status,"review");
  assert.equal(read("Abgabe bis 15.10.26.").date.status,"review");
});
test("source spans survive leading spaces, CRLF, abbreviations and multiple clauses",()=>{
  const x=read("  Bearbeiten Sie die Aufgaben. Laden Sie die Datei als PDF in Moodle hoch.\r\nAbgabe bis zum 16. Juni um 14 Uhr.\nDie Hinweise finden Sie z. B. im Reader.");
  assert.equal(x.date.raw,"16. Juni um 14 Uhr");
  proofIsExact(x);
  assert.ok(x.cards.filter(c=>c.line===1).length>=2);
});
test("a mixed or unparsed clause is not treated as an actionable choice or a single optional task",()=>{
  assert.equal(read("Eine Skizze ist optional, eine Begründung ist Pflicht.").cards[0].kind,"review");
  const x=read("Wählen Sie eines der folgenden Themen und schreiben Sie einen Aufsatz.");
  assert.equal(x.cards[0].kind,"choice");assert.deepEqual(x.cards[0].options,[]);
  assert.equal(R.checkPlan(x).checks,0);
  assert.equal(read("Bearbeiten Sie die Aufgabe, es sei denn, Sie sind entschuldigt.").cards[0].kind,"review");
});
test("empty, foreign-language and overly long input do not yield a checklist",()=>{
  assert.equal(read("").error,"empty");
  assert.equal(read("Upload the file before Friday.").error,"language");
  assert.equal(read("Aufgabe ".repeat(700)).error,"length");
});
for(const entry of publicExcerpts) test("public excerpt: "+entry.id,()=>{
  const x=read(entry.text);
  assert.equal(x.date.status,entry.expectedDate);
  if(entry.expectedKind) assert.ok(x.cards.some(c=>c.kind===entry.expectedKind));
  if(entry.id==="oke-choice") assert.equal(x.cards.find(c=>c.kind==="choice").options.length,0);
  proofIsExact(x);
});

test("an event start with spätestens does not become a submission deadline",()=>{
  const x=read("Die Vorlesung beginnt spätestens am 17.11.2026 um 10 Uhr.\nAbgabe spätestens am 19.11.2026 um 16:00 Uhr.");
  assert.equal(x.date.status,"stated");
  assert.equal(x.date.raw,"19.11.2026 um 16:00 Uhr");
  assert.deepEqual(x.cards.filter(c=>c.kind==="deadline").map(c=>c.line),[2]);
  proofIsExact(x);
});
test("a deadline restricted to an applicant group is left for confirmation",()=>{
  const x=read("Für Gruppe B endet die Abgabefrist am 20.11.2026 um 15 Uhr.");
  assert.equal(x.date.status,"review");
  assert.equal(x.date.raw,undefined);
  assert.equal(x.cards[0].kind,"deadline");
  assert.equal(x.cards[0].dateState,"review");
  proofIsExact(x);
});
