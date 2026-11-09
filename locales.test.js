"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const L=require("./locale.js");
const R=require("./reader.js");
const model=require("./model.json");
const examples=require("./examples.json");
const {text:publicBrief}=require("./public-excerpts.json").find(x=>x.id==="jku-delivery");
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const languages=["en","de","fr"];
const inline=Array.from(html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g),m=>({attrs:m[1],code:m[2]}));
const attr=(node,name)=>new RegExp('(?:^|\\s)'+name+'="([^"]*)"').exec(node)?.[1];

function simulate(initialLocale=null) {
  const byId=new Map(), groups=new Map(), listeners={}, prefs=new Map();
  let focus=null, copied=null;
  class Node {
    constructor(tag="div") {
      this.tag=tag;
      this.attrs={};this.style={};this.dataset={};this.events={};this.children=[];
      this.value="";this.textContent="";this.hidden=false;this.classList={add(){},remove(){}};
    }
    setAttribute(k,v) {this.attrs[k]=String(v);}
    hasAttribute(k) {return Object.hasOwn(this.attrs,k);}
    addEventListener(k,fn) {this.events[k]=fn;}
    append(...nodes) {this.children.push(...nodes);}
    replaceChildren(...nodes) {this.children=nodes;}
    querySelector(selector) {return selector===".example-label"?this.exampleLabel:null;}
    closest(selector) {return selector==="button"&&this.tag==="button"?this:null;}
    matches(selector) {return selector==="[data-card]"?this.dataset.card!==undefined:selector==="[data-condition]"&&this.dataset.condition!==undefined;}
    focus() {focus=this;}
    scrollIntoView() {}
  }
  for(const [,tag,attrs] of html.split('<script type="application/json"')[0].matchAll(/<([a-z][\w-]*)([^<>]*)>/gi)) {
    const n=new Node(tag),id=attr(attrs,"id");
    if(id) byId.set(id,n);
    for (const key of ["t","a","p","example","lang"]) {
      const v=attr(attrs,"data-"+key);
      if(v===undefined) continue;
      n.dataset[key]=v;
      if(key==="example") n.exampleLabel=new Node("span");
      const selector="[data-"+key+"]";
      if(!groups.has(selector)) groups.set(selector,[]);
      groups.get(selector).push(n);
    }
  }
  const dynamic=new Set(["feedback","toggle-other","check-plan","common-mistake"]);
  function find(id) {
    if(!byId.has(id)&&dynamic.has(id)&&byId.get("plan-content").innerHTML?.includes('id="'+id+'"')) byId.set(id,new Node(id==="feedback"?"div":"button"));
    if(id.startsWith("source-line-")) return byId.get("line-view-body").children.find(n=>n.id===id);
    return byId.get(id);
  }
  for (const {attrs,code} of inline.filter(s=>attr(s.attrs,"type")==="application/json")) {
    const n=new Node("script");n.textContent=code;byId.set(attr(attrs,"id"),n);
  }
  if(initialLocale!==null) prefs.set("taskbridge-locale",initialLocale);
  const document={documentElement:new Node("html"),getElementById:find,querySelectorAll:key=>groups.get(key)||[],
    querySelector:()=>null,addEventListener:(event,fn)=>listeners[event]=fn,createElement:tag=>new Node(tag),
    createTextNode:value=>({textContent:value})};
  const localStorage={getItem:key=>prefs.get(key)||null,setItem:(key,v)=>prefs.set(key,v)};
  const env=vm.createContext({document,localStorage,navigator:{clipboard:{async writeText(s){copied=s;}}},clearTimeout(){},setTimeout(){return 1;}});
  for(const {attrs,code} of inline) if(!attr(attrs,"type")) vm.runInContext(code,env);
  const emit=(event,target)=>listeners[event]({target});
  return {
    find,document,prefs,focus:()=>focus,clip:()=>copied,
    translation:key=>groups.get("[data-t]").find(n=>n.dataset.t===key).textContent,
    group:key=>groups.get("[data-lang]").find(n=>n.dataset.lang===key),
    switchTo:key=>emit("click",groups.get("[data-lang]").find(n=>n.dataset.lang===key)),
    open:key=>emit("click",groups.get("[data-example]").find(n=>n.dataset.example===key)),
    click:id=>{const n=new Node("button");n.id=id;emit("click",n);},
    evidence:id=>{const n=new Node("button");n.dataset.evidence=id;emit("click",n);},
    input:value=>{const n=find("brief");n.value=value;n.events.input();},
    change:(id,checked,option)=>{const n=new Node("input");n.dataset.card=id;n.checked=checked;
      if(option!=null){n.setAttribute("data-option",option);n.dataset.option=String(option);}emit("change",n);},
    condition:(id,value)=>{const n=new Node("select");n.dataset.condition=id;n.value=value;emit("change",n);},
    plan:()=>find("plan-content").innerHTML,
    feedback:()=>find("feedback")?.innerHTML,
  };
}

const leaves=o=>Object.entries(o).flatMap(([k,v])=>Array.isArray(v)||typeof v==="string"?[k]:leaves(v).map(s=>k+"."+s)).sort();
test("built interface ships exactly EN, DE and FR with complete translation keys",()=>{
  assert.deepEqual(Object.keys(L.labels),languages);
  assert.deepEqual(Array.from(html.matchAll(/data-lang="([a-z]+)"/g),m=>m[1]),languages);
  assert.doesNotMatch(html,/\p{Script=Cyrillic}/u);
  for(const lang of languages) {
    assert.deepEqual(leaves(L.labels[lang]),leaves(L.labels.en));
    for(const [,key] of html.matchAll(/data-[tap]="([a-zA-Z]+)"/g)) assert.ok(L.labels[lang][key],lang+":"+key);
  }
});
test("all examples have localized names and the same German source, with natural count labels",()=>{
  for(const key in examples) {
    assert.deepEqual(Object.keys(examples[key]),[...languages,"text"]);
    assert.ok(R.read(examples[key].text,model).cards.length);
    assert.equal(new Set(languages.map(lang=>examples[key][lang])).size,3);
  }
  assert.equal(L.countLabel("en",1,"choices"),"1 choice");
  assert.equal(L.countLabel("de",2,"actions"),"2 Aufgaben");
  assert.equal(L.countLabel("fr",2,"optionalCount"),"2 facultatifs");
});
test("the built page keeps wrong choices and evidence when switching locale, then accepts the corrected plan",()=>{
  const ui=simulate();
  const result=R.read(examples.choice.text,model), choice=result.cards.find(c=>c.kind==="choice");
  ui.click("common-mistake");
  assert.ok(ui.feedback().includes(L.labels.en.issue.both));
  ui.evidence(choice.id);
  assert.equal(ui.focus().id,"source-line-3");
  assert.equal(ui.focus().children[1].children.find(n=>n.tag==="mark").textContent,choice.quote);
  for(const lang of ["de","fr","en"]) {
    ui.switchTo(lang);
    assert.equal(ui.document.documentElement.lang,lang);
    assert.equal(ui.translation("planTitle"),L.labels[lang].planTitle);
    assert.ok(ui.feedback().includes(L.labels[lang].issue.both));
    assert.ok(ui.plan().includes(choice.quote));
    assert.equal((ui.plan().match(/data-option="\d" checked/g)||[]).length,2);
  }
  ui.change(choice.id,false,0);
  ui.click("check-plan");
  assert.ok(ui.feedback().includes(L.labels.en.passed));
});
test("new German text gets the same source and deadline state in all three interface languages",()=>{
  const ui=simulate();
  for(const lang of languages) {
    ui.switchTo(lang);
    ui.input(publicBrief);
    ui.click("run");
    assert.ok(ui.plan().includes(publicBrief));
    assert.ok(ui.plan().includes(L.labels[lang].uploadPDF));
    assert.ok(ui.plan().includes(L.labels[lang].dateMissing));
    assert.equal(ui.find("source-status").textContent,L.labels[lang].readDone);
  }
});
test("switching language retains a conditional submission plan and unresolved dates are localized",()=>{
  const ui=simulate();
  ui.open("conditional");
  const x=R.read(examples.conditional.text,model);
  const condition=x.cards.find(c=>c.kind==="condition"), delivery=x.cards.find(c=>c.kind==="delivery"), required=x.cards.find(c=>c.kind==="required");
  ui.change(required.id,true);ui.change(delivery.id,true);ui.condition(condition.id,"yes");ui.change(condition.id,true);
  ui.click("check-plan");
  ui.switchTo("fr");
  assert.ok(ui.feedback().includes(L.labels.fr.issue.instead));
  ui.change(delivery.id,false);ui.click("check-plan");
  assert.ok(ui.feedback().includes(L.labels.fr.passed));
  ui.open("pending");
  assert.ok(ui.plan().includes(L.labels.fr.pending));
  ui.open("conflict");
  assert.ok(ui.plan().includes(L.labels.fr.dateReview));
});
test("valid preferences persist and an obsolete value falls back to English; copied guidance matches the chosen language",async()=>{
  const ui=simulate("uk");
  assert.equal(ui.prefs.get("taskbridge-locale"),"en");
  for (const lang of ["de","fr"]) {
    ui.switchTo(lang);
    assert.equal(ui.prefs.get("taskbridge-locale"),lang);
    assert.equal(ui.group(lang).attrs["aria-pressed"],"true");
    assert.equal(simulate(lang).document.documentElement.lang,lang);
    ui.click("copy");
    await Promise.resolve();
    assert.ok(ui.clip().startsWith(L.labels[lang].copyHeader));
    assert.ok(ui.clip().includes(examples.choice.text.split("\n")[2]));
  }
});
