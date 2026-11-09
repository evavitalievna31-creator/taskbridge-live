(function () {
  "use strict";
  const R=TaskBridgeReader;
  const model=JSON.parse(document.getElementById("model").textContent);
  const examples=JSON.parse(document.getElementById("examples-data").textContent);
  const $=id=>document.getElementById(id);
  const {labels,resolveLocale,countLabel}=TaskBridgeLocale;
  let preferred="en";
  try { preferred=resolveLocale(localStorage.getItem("taskbridge-locale")); } catch {}
  const state={lang:preferred,example:null,result:null,mode:"edit",highlight:null,showOther:false,changed:false,plan:{},conditions:{},feedback:null,status:null};
  const s=()=>labels[state.lang];
  const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const aria=(node,label)=>node.setAttribute("aria-label",label);
  let toastTimer;

  function setLanguage() {
    document.documentElement.lang=state.lang;
    document.title="TaskBridge Live — "+s().hero1+" "+s().hero2;
    document.querySelectorAll("[data-t]").forEach(node=>{node.textContent=s()[node.dataset.t]??node.textContent;});
    document.querySelectorAll("[data-a]").forEach(node=>aria(node,s()[node.dataset.a]));
    document.querySelectorAll("[data-p]").forEach(node=>{node.placeholder=s()[node.dataset.p];});
    document.querySelectorAll("[data-lang]").forEach(node=>node.setAttribute("aria-pressed",String(node.dataset.lang===state.lang)));
    try { localStorage.setItem("taskbridge-locale",state.lang); } catch {}
    renderSource();
    renderPlan();
  }

  function renderSource() {
    document.querySelectorAll("[data-example]").forEach(btn=>{
      btn.setAttribute("aria-pressed",String(btn.dataset.example===state.example));
      btn.querySelector(".example-label").textContent=examples[btn.dataset.example][state.lang];
    });
    $("origin-badge").textContent=state.example?s().exampleOrigin:s().realOrigin;
    const count=new Intl.NumberFormat(state.lang).format($("brief").value.length);
    $("char-count").textContent=count+" / "+new Intl.NumberFormat(state.lang).format(R.LIMIT);
    $("edit-view").setAttribute("aria-pressed",String(state.mode==="edit"));
    $("line-view").setAttribute("aria-pressed",String(state.mode==="lines"));
    $("brief").hidden=state.mode==="lines";
    $("line-view-body").hidden=state.mode==="edit";
    if (state.mode==="lines") renderLines();
    const status=$("source-status");
    status.textContent=state.status ? (s().err[state.status]||s()[state.status]||"") : "";
    status.style.color=state.status==="readDone"?"var(--deep)":"";
  }

  function renderLines() {
    const host=$("line-view-body");
    host.replaceChildren();
    const lines=$("brief").value.split("\n");
    let at=0;
    lines.forEach((line,i)=>{
      const node=document.createElement("div");
      node.className="line-row";
      node.id="source-line-"+(i+1);
      node.tabIndex=-1;
      const index=document.createElement("span");
      index.className="line-index";index.textContent=i+1;index.setAttribute("aria-hidden","true");
      const text=document.createElement("span");text.lang="de";
      const c=state.highlight;
      if (c&&c.line===i+1&&state.result?.source===$("brief").value) {
        node.classList.add("active");
        const begin=Math.max(0,c.start-at),end=Math.min(line.length,c.end-at);
        text.append(document.createTextNode(line.slice(0,begin)));
        const mark=document.createElement("mark");mark.textContent=line.slice(begin,end);text.append(mark);
        text.append(document.createTextNode(line.slice(end)));
        aria(node,s().line+" "+(i+1)+": "+line);
      } else text.textContent=line||"\u00a0";
      node.append(index,text);host.append(node);at+=line.length+1;
    });
  }

  function sourceButton(card) {
    return '<button type="button" class="line-button" data-evidence="'+esc(card.id)+'" aria-label="'+esc(s().lineLabel+" "+card.line)+'">'+esc(s().line+" "+card.line)+'</button>';
  }

  function describe(c) {
    const q=c.quote;
    if (c.kind==="required") {
      if (/vergleichen sie die beiden standorte und notieren sie ihre beobachtungen/i.test(q)) return s().compareSites;
      if (/erstellen sie eine tabelle mit (?:drei|ihren) beobachtungen/i.test(q)) return s().tableObs;
      if (/beschreiben sie die ergebnisse in eigenen worten/i.test(q)) return s().description;
    }
    if (c.kind==="delivery") {
      if (/\bpdf\b/i.test(q)&&/\bmoodle\b/i.test(q)&&!/\bilias\b|e-mail/i.test(q)) return s().uploadPDF;
      if (/\bpdf\b/i.test(q)&&/\be-mail\b/i.test(q)&&!/\bmoodle|ilias\b/i.test(q)) return s().emailPDF;
      if (/\b(?:als|format)\s*:?\s*pdf\b/i.test(q)) return s().fileFormat;
    }
    if (c.kind==="condition"&&/moodle nicht erreichbar/i.test(c.parts?.condition||"")&&/e-mail/i.test(c.parts?.action||"")) return s().fallbackEmail;
    return s().action[c.kind];
  }

  function control(c, display, index) {
    const option=index!=null;
    const checked=option?(state.plan[c.id]||[]).includes(index):Boolean(state.plan[c.id]);
    return '<label class="check-control'+(option?'':' single-check')+'"><input type="checkbox" data-card="'+esc(c.id)+'"'+(option?' data-option="'+index+'"':'')+(checked?' checked':'')+'><span'+(option?' lang="de"':'')+'>'+esc(display)+'</span></label>';
  }

  function renderCard(c) {
    let interaction="";
    if (c.kind==="choice") {
      interaction=c.options.length===2
        ? '<div class="choice-row" role="group" aria-label="'+esc(s().action.choice)+'">'+c.options.map((x,i)=>control(c,x,i)).join("")+'</div>'
        : '<p class="part">'+esc(s().choiceUnavailable)+'</p>';
    } else if (c.kind==="condition") {
      const condition=state.conditions[c.id]||"";
      interaction='<p class="part"><b>'+esc(s().ifPart)+':</b> <span lang="de">'+esc(c.parts.condition)+'</span></p>'+
        '<p class="part"><b>'+esc(s().thenPart)+':</b> <span lang="de">'+esc(c.parts.action)+'</span></p>'+
        '<div class="condition-row"><label class="part" for="when-'+c.id+'">'+esc(s().conditionState)+'</label><select id="when-'+c.id+'" data-condition="'+c.id+'">'+
        ["","yes","no"].map(x=>'<option value="'+x+'"'+(x===condition?' selected':'')+'>'+esc(s()[x||"unsure"])+'</option>').join("")+
        '</select></div>'+control(c,s().include);
    } else if (c.kind==="required"||c.kind==="delivery") interaction=control(c,s().include);
    const warning=c.kind==="review"||(c.kind==="deadline"&&c.dateState!=="stated");
    return '<article class="card'+(warning?' needs-review':'')+'" data-id="'+c.id+'" data-kind="'+esc(c.kind)+'">'+
      '<div class="card-header"><span class="tag">'+esc(s().tag[c.kind])+'</span>'+sourceButton(c)+'</div>'+
      '<h3>'+esc(describe(c))+'</h3><p class="evidence"><q lang="de">'+esc(c.quote)+'</q></p>'+interaction+'</article>';
  }

  function renderFeedback() {
    const el=$("feedback");
    if (!el) return;
    const f=state.feedback;
    document.querySelectorAll(".card.has-issue").forEach(n=>n.classList.remove("has-issue"));
    if (!f) { el.hidden=true;el.innerHTML="";return; }
    el.hidden=false;el.className="feedback"+(f.passed?"":" fail");
    if (f.passed) el.innerHTML="<strong>"+esc(s().passed)+"</strong><span>"+esc(s().passNote)+"</span>";
    else if (f.checks===0) el.textContent=s().noCheck;
    else {
      el.innerHTML="<strong>"+esc(s().needs)+"</strong><ul>"+f.issues.map(issue=>{
        const card=state.result.cards.find(x=>x.id===issue.id);
        document.querySelector('[data-id="'+issue.id+'"]')?.classList.add("has-issue");
        return "<li>"+esc(s().issue[issue.code])+(card?sourceButton(card):"")+"</li>";
      }).join("")+"</ul>";
    }
  }

  function renderPlan() {
    const host=$("plan-content");
    const result=state.result;
    $("copy").hidden=!(result?.cards?.length);
    if (!result) {
      host.innerHTML='<div class="plan-empty"><strong>'+esc(s()[state.changed?"changedTitle":"draftTitle"])+'</strong><p>'+esc(s()[state.changed?"changedNote":"draftNote"])+'</p></div>';
      return;
    }
    if (!result.cards.length) {
      host.innerHTML='<div class="plan-empty"><strong>'+esc(s().noRules)+'</strong><p>'+esc(s().noRulesNote)+'</p></div>';
      return;
    }
    const d=result.date, dateCard=result.cards.find(x=>x.id===d.cardIds[0]);
    const num=key=>result.cards.filter(c=>key.includes(c.kind)).length;
    const count=(n,k)=>countLabel(state.lang,n,k);
    const stats=[count(num(["required","delivery","condition"]),"actions"),count(num(["choice"]),"choices"),
      ...(num(["review"])?[count(num(["review"]),"reviews")]:[])].join(" · ");
    const detail={stated:"dateExact",missing:"dateMissing",pending:"datePending",review:"dateReview"}[d.status];
    const other=result.cards.filter(c=>c.kind==="optional");
    const visible=result.cards.filter(c=>(c.kind!=="optional"||state.showOther)&&
      !(d.status==="stated"&&c.kind==="deadline"&&c.dateState==="stated"));
    const checkable=R.checkPlan(result,state.plan,state.conditions).checks>0;
    host.innerHTML='<div class="summary"><div class="summary-intro"><div class="meta">'+esc(s().summaryLabel)+'</div><strong>'+esc(s().planOverview)+'</strong><small>'+esc(stats)+'</small></div>'+
      '<div class="date-box'+(d.status==="stated"?"":" unset")+'"><div class="meta">'+esc(s().deadlineLabel)+'</div><strong'+(d.raw?' lang="de"':'')+'>'+esc(d.raw||s()[d.status])+'</strong><small>'+esc(s()[detail])+'</small>'+(dateCard?sourceButton(dateCard):"")+'</div></div>'+
      '<div class="cards">'+visible.map(renderCard).join("")+'</div>'+
      (other.length?'<div class="filters"><button type="button" class="small-button" id="toggle-other" aria-expanded="'+state.showOther+'">'+esc(s()[state.showOther?"otherHide":"otherShow"])+'</button><span class="filters-note">'+esc(count(other.length,"optionalCount"))+'</span></div>':"")+
      (checkable?'<div class="plan-action"><button type="button" class="primary" id="check-plan">'+esc(s().check)+'</button>'+
      (state.example==="choice"?'<button type="button" class="small-button" id="common-mistake">'+esc(s().guess)+'</button>':"")+'</div>':"")+
      '<div id="feedback" class="feedback" aria-live="polite" hidden></div>';
    renderFeedback();
  }

  function resetPlan() {state.plan={};state.conditions={};state.feedback=null;state.showOther=false;state.highlight=null;}
  function run(announce=true) {
    const value=$("brief").value;
    const result=R.read(value,model);
    resetPlan();state.changed=false;
    state.result=result.error?null:result;
    state.status=result.error||(announce?"readDone":null);
    renderSource();renderPlan();
  }
  function load(name,announce=true) {
    state.example=name;state.mode="edit";$("brief").value=examples[name].text;
    run(announce);
  }

  function showEvidence(id) {
    const c=state.result?.cards.find(x=>x.id===id);
    if (!c||state.result.source!==$("brief").value) return;
    state.highlight=c;state.mode="lines";renderSource();
    const node=$("source-line-"+c.line);
    node?.focus({preventScroll:true});
    node?.scrollIntoView({block:"nearest",behavior:"instant"});
  }

  function showToast(key) {
    const el=$("toast");el.textContent=s()[key];el.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},2600);
  }

  async function copyChecklist() {
    const result=state.result;
    if (!result?.cards?.length) return;
    const d=result.date;
    const body=[s().copyHeader,s().deadlineLabel+": "+(d.raw||s()[d.status]),"",
      ...result.cards.map(c=>s().tag[c.kind]+" · "+s().line+" "+c.line+"\n"+describe(c)+"\n"+c.quote+"\n"),
      s().copyFooter].join("\n");
    try { if (navigator.clipboard?.writeText) {await navigator.clipboard.writeText(body);showToast("copied");return;} } catch {}
    try {
      const blob=new Blob([body],{type:"text/plain;charset=utf-8"});
      const href=URL.createObjectURL(blob), a=document.createElement("a");
      a.href=href;a.download="taskbridge-checklist.txt";a.click();
      setTimeout(()=>URL.revokeObjectURL(href),1000);
      showToast("downloaded");
    } catch {showToast("copyError");}
  }

  $("brief").addEventListener("input",()=>{
    if (state.result) {state.changed=true;state.result=null;resetPlan();renderPlan();}
    state.status=null;state.example=null;
    renderSource();
  });
  $("brief").addEventListener("keydown",e=>{
    if (e.key==="Enter"&&(e.ctrlKey||e.metaKey)) {e.preventDefault();run();}
  });
  document.addEventListener("change",e=>{
    const node=e.target;
    if (node.matches("[data-card]")) {
      const id=node.dataset.card;
      if (node.hasAttribute("data-option")) {
        const options=new Set(state.plan[id]||[]);
        if (node.checked) options.add(Number(node.dataset.option));else options.delete(Number(node.dataset.option));
        state.plan[id]=[...options];
      } else state.plan[id]=node.checked;
    } else if (node.matches("[data-condition]")) state.conditions[node.dataset.condition]=node.value;
    else return;
    if (state.feedback) {state.feedback=null;renderFeedback();}
  });
  document.addEventListener("click",e=>{
    const btn=e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.lang) {state.lang=resolveLocale(btn.dataset.lang);setLanguage();return;}
    if (btn.dataset.example) {load(btn.dataset.example);return;}
    if (btn.dataset.evidence) {showEvidence(btn.dataset.evidence);return;}
    if (btn.id==="run") {run();return;}
    if (btn.id==="clear") {
      state.mode="edit";state.example=null;state.result=null;state.changed=false;state.status=null;resetPlan();
      $("brief").value="";renderSource();renderPlan();$("brief").focus();return;
    }
    if (btn.id==="edit-view"||btn.id==="line-view") {
      state.mode=btn.id==="edit-view"?"edit":"lines";
      renderSource();return;
    }
    if (btn.id==="copy") {void copyChecklist();return;}
    if (btn.id==="toggle-other") {state.showOther=!state.showOther;renderPlan();$("toggle-other")?.focus();return;}
    if (btn.id==="common-mistake") {
      for (const c of state.result.cards) {
        if (c.kind==="required"||c.kind==="delivery") state.plan[c.id]=true;
        if (c.kind==="choice"&&c.options.length===2) state.plan[c.id]=[0,1];
      }
      state.feedback=R.checkPlan(state.result,state.plan,state.conditions);renderPlan();
      $("feedback")?.scrollIntoView({block:"nearest",behavior:"instant"});
      $("check-plan")?.focus({preventScroll:true});return;
    }
    if (btn.id==="check-plan") {
      state.feedback=R.checkPlan(state.result,state.plan,state.conditions);
      renderFeedback();$("feedback")?.scrollIntoView({block:"nearest",behavior:"instant"});
    }
  });
  setLanguage();
  load("choice",false);
})();
