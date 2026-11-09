"use strict";
const fs=require("node:fs");
const path=require("node:path");
const R=require("./reader.js");
const model=require("./model.json");
const external=require("./public-excerpts.json");
const root=__dirname;
const load=p=>fs.readFileSync(path.join(root,p),"utf8").split("\n").filter(x=>x&&!x.startsWith("#")).map(x=>x.split("|"));
const train=load("training.de.txt");
const cases=load("evaluation.de.txt");
const trained=new Set(train.map(x=>x[1]));
if(cases.some(x=>trained.has(x[1]))) throw new Error("Training/evaluation overlap");
const byLabel=Object.create(null),misses=[];
for(const [label,text] of cases){
  const pred=R.classify(text,model);
  byLabel[label]??={correct:0,total:0};
  byLabel[label].total++;
  if(pred.label===label) byLabel[label].correct++;
  else misses.push({label,top:pred.label,text});
}
const ablated={labels:model.labels,bias:model.bias.map(()=>0),features:{}};
const samples=external.map(x=>{
  const result=R.read(x.text,model), without=R.read(x.text,ablated);
  const match=r=>r.date.status===x.expectedDate && (!x.expectedKind||r.cards.some(c=>c.kind===x.expectedKind));
  return {id:x.id,withModel:match(result),noLearnedWeights:match(without),
    exactEvidence:result.cards.every(c=>result.source.slice(c.start,c.end)===c.quote)};
});
const result={training:train.length,eval:cases.length,
  correct:Object.values(byLabel).reduce((a,b)=>a+b.correct,0),byLabel,misses,
  publicExcerpts:samples};
console.log(JSON.stringify(result,null,2));
