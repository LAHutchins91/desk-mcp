export function renderLanding(input: { supabaseUrl: string; supabaseAnonKey: string; appBaseUrl: string; connectLead: string }) {
  const supabaseUrl = JSON.stringify(input.supabaseUrl);
  const supabaseAnonKey = JSON.stringify(input.supabaseAnonKey);
  const appBaseUrl = JSON.stringify(input.appBaseUrl);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Desk</title>
  <link rel="icon" href="/icon.svg">
  <style>
    :root{color-scheme:light;--bg:#f6f4ef;--text:#1c1915;--muted:#5c564c;--line:#ddd6c8;--accent:#0c6b4d;--card:#fff}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:18px/1.55 ui-sans-serif,system-ui,sans-serif}
    main{max-width:980px;margin:0 auto;padding:28px 20px 72px}a{color:var(--accent)}
    nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px}.brand{font-weight:800;letter-spacing:-.03em}
    h1{font-size:clamp(40px,7vw,68px);line-height:.95;letter-spacing:-.045em;margin:8px 0 16px}
    .muted{color:var(--muted)} .card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px}
    .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:22px}.plans{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    button,.btn{font:inherit;border-radius:12px;padding:12px 16px;border:1px solid var(--line);background:#fff;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
    .primary{background:var(--accent);color:#fff;border-color:var(--accent)} button:disabled{opacity:.55;cursor:wait}
    label{display:block;margin:12px 0 4px} input,textarea,select{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;background:#fff}
    textarea{min-height:90px} .row{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px} .error{color:#8d1d18} .ok{color:#0c6b4d}
    article.item{border-top:1px solid var(--line);padding:10px 0} [hidden]{display:none!important}
    footer{display:flex;gap:16px;flex-wrap:wrap;margin-top:48px;color:var(--muted)}
    @media(max-width:760px){.grid,.plans{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main>
  <nav><div class="brand">Desk</div><span class="muted" id="servicePill">Approved answers only</span></nav>
  <section class="grid">
    <div>
      <p class="muted" id="heroEyebrow">Support policy that stays approved</p>
      <h1 id="heroTitle">Do not promise what was never approved.</h1>
      <p id="heroDescription">Desk keeps a support team's approved answers, refund rules, and escalation limits. An assistant can look them up, and it must refuse a refund, a feature, or a timeline that is not in that set.</p>
      ${input.connectLead}
      <div class="row" id="signedOutActions"><button class="primary" id="googleBtn" type="button">Continue with Google</button><a class="btn" href="#plans">See trial and Pro</a></div>
      <div class="card" id="accountCard" hidden>
        <p class="muted">Signed in</p>
        <p id="userEmail"></p>
        <p id="subscriptionStatus" class="muted">Checking account…</p>
        <div class="row"><button id="signOutBtn" type="button">Sign out</button><button id="portalBtn" type="button">Manage billing</button><a class="btn primary" id="workspaceLink" href="/app">Open desk workspace</a></div>
      </div>
      <p id="notice" class="ok" role="status"></p>
      <p id="error" class="error" role="alert"></p>
    </div>
    <aside class="card" id="salesAside">
      <p><strong>Approved answers</strong><br><span class="muted">The reply the team already signed off.</span></p>
      <p><strong>Refund rules</strong><br><span class="muted">A situation, a decision, and the only wording allowed.</span></p>
      <p><strong>Escalation limits</strong><br><span class="muted">Which channel may promise anything, and how far a case may move.</span></p>
      <p><strong>Commitments</strong><br><span class="muted">Feature statements and timelines, verbatim or not at all.</span></p>
    </aside>
  </section>
  <section id="plans">
    <h2>14-day trial, then Pro</h2>
    <p class="muted">Monthly and yearly checkout are handled by Stripe. Checkout shows the plan terms. Desk does not print a price.</p>
    <div class="plans">
      <article class="card"><h3>Monthly</h3><p>A 14-day trial, then Pro, billed each month.</p><ul><li>Approved answers</li><li>Refund rules</li><li>Escalation limits</li><li>Feature and timeline commitments</li></ul><button class="checkout" data-plan="monthly" type="button">Start monthly trial</button></article>
      <article class="card"><h3>Yearly</h3><p>The same 14-day trial, then Pro, billed once a year.</p><ul><li>Everything in Monthly</li><li>One annual billing cycle</li><li>Same refusal rules</li></ul><button class="primary checkout" data-plan="annual" type="button">Start yearly trial</button></article>
    </div>
  </section>
  <section id="workspace" hidden>
    <h2>Your desk</h2>
    <p class="muted">Save only wording the team has approved. An assistant will not invent a refund, a feature, or a timeline that is missing here.</p>
    <div class="grid">
      <form id="deskForm" class="card"><h3>New desk</h3><label for="deskName">Name</label><input id="deskName" required maxlength="200"><label for="deskDescription">Description</label><textarea id="deskDescription" maxlength="4000"></textarea><button class="primary" type="submit">Create desk</button></form>
      <div class="card"><h3>Desks</h3><label for="deskSelect">Open</label><select id="deskSelect"><option value="">Choose a desk</option></select><div id="deskList"></div></div>
    </div>
    <div id="policy" hidden>
      <form id="answerForm" class="card"><h3>Approved answer</h3><input id="answerRevision" type="hidden"><label>Topic<input id="answerTopic" required maxlength="200"></label><label>Question<input id="answerQuestion" required maxlength="500"></label><label>Approved wording<textarea id="answerBody" required maxlength="8000"></textarea></label><button class="primary" type="submit">Save approved answer</button></form>
      <form id="refundForm" class="card"><h3>Refund rule</h3><input id="refundRevision" type="hidden"><label>Name<input id="refundName" required maxlength="200"></label><label>Situation phrases, one per line<textarea id="refundTerms" required></textarea></label><label>Decision<select id="refundDecision"><option>ALLOW</option><option>DENY</option></select></label><label>Only approved wording<textarea id="refundRemedy" required maxlength="4000"></textarea></label><label>Eligibility window in days, optional<input id="refundWindow" inputmode="numeric"></label><button class="primary" type="submit">Save refund rule</button></form>
      <form id="limitForm" class="card"><h3>Escalation limit</h3><input id="limitRevision" type="hidden"><label>Name<input id="limitName" required></label><label>Channel<input id="limitChannel" required placeholder="chat"></label><label>Tier ladder, one per line<textarea id="limitLadder" required></textarea></label><label>Highest tier<input id="limitMax" required></label><label><input id="limitRefund" type="checkbox"> May promise a refund</label><label><input id="limitFeature" type="checkbox"> May promise a feature</label><label><input id="limitTimeline" type="checkbox"> May promise a timeline</label><label>Notes<textarea id="limitNotes"></textarea></label><button class="primary" type="submit">Save escalation limit</button></form>
      <form id="commitForm" class="card"><h3>Feature or timeline</h3><input id="commitRevision" type="hidden"><label>Kind<select id="commitKind"><option>FEATURE</option><option>TIMELINE</option></select></label><label>Name<input id="commitName" required></label><label>Exact statement<textarea id="commitStatement" required maxlength="2000"></textarea></label><button class="primary" type="submit">Save commitment</button></form>
      <div class="card"><h3>On this desk</h3><div id="policyList"></div></div>
    </div>
    <p id="workspaceMessage" role="status"></p>
  </section>
  <footer><a href="/connect">Connect an assistant</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a><a href="/data">Your data</a><a href="/health">System health</a></footer>
</main>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/dist/umd/supabase.js"></script>
<script>
(function(){
  var SUPABASE_URL=${supabaseUrl}, SUPABASE_ANON_KEY=${supabaseAnonKey}, APP_BASE_URL=${appBaseUrl};
  var token="", current=null, isPro=false, ready=false, client=null, selected="";
  function el(id){return document.getElementById(id)}
  function showError(msg){el("error").textContent=msg}
  function clearError(){el("error").textContent=""}
  function lines(id){return el(id).value.split(/\\n/).map(function(x){return x.trim()}).filter(Boolean)}
  function renderAccess(pro, accountReady){
    isPro=pro; ready=accountReady;
    el("plans").hidden=pro;
    el("salesAside").hidden=pro;
    el("workspace").hidden=!(pro&&location.pathname==="/app");
    el("workspaceLink").hidden=!pro;
    if(pro&&location.pathname==="/app") void loadDesks();
  }
  function setSignedOut(){token="";current=null;el("accountCard").hidden=true;el("signedOutActions").hidden=false;renderAccess(false,true);el("subscriptionStatus").textContent=""}
  function setSignedIn(session){
    current=session; token=session.access_token||"";
    el("userEmail").textContent=(session.user&&session.user.email)||"Signed in";
    el("accountCard").hidden=false; el("signedOutActions").hidden=true;
    void loadProfile(session);
  }
  async function loadProfile(session){
    try{
      var r=await fetch(SUPABASE_URL+"/rest/v1/profiles?id=eq."+encodeURIComponent(session.user.id)+"&select=plan,subscription_status",{headers:{apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+token}});
      var rows=await r.json();
      var p=rows&&rows[0];
      var pro=Boolean(p&&(p.subscription_status==="trialing"||p.subscription_status==="active"));
      renderAccess(pro,true);
      el("subscriptionStatus").textContent=pro?(p.subscription_status==="trialing"?"Desk Pro · Trial in progress":"Desk Pro · Active"):"Signed in · start a 14-day trial below";
    }catch(e){renderAccess(false,false);el("subscriptionStatus").textContent="Unable to confirm your subscription."}
  }
  async function deskApi(path, options){
    var opts=options||{}; opts.headers=Object.assign({"Content-Type":"application/json",Authorization:"Bearer "+token},opts.headers||{});
    var r=await fetch(path,opts); var text=await r.text(); var data=text?JSON.parse(text):null;
    if(!r.ok) throw new Error((data&&data.error)||"Request could not complete.");
    return data.data;
  }
  function item(title, body, onEdit){
    var box=document.createElement("article"); box.className="item";
    var h=document.createElement("strong"); h.textContent=title; box.appendChild(h);
    var p=document.createElement("p"); p.textContent=body; box.appendChild(p);
    if(onEdit){var b=document.createElement("button"); b.type="button"; b.textContent="Edit"; b.onclick=onEdit; box.appendChild(b)}
    return box;
  }
  async function loadDesks(){
    var rows=await deskApi("/api/workspace/desks");
    var select=el("deskSelect"); select.replaceChildren(new Option("Choose a desk",""));
    rows.forEach(function(desk){select.add(new Option(desk.name,desk.id))});
    if(selected) select.value=selected;
  }
  async function loadPolicy(){
    if(!selected){el("policy").hidden=true;return}
    el("policy").hidden=false;
    var answers=await deskApi("/api/workspace/answers?includeRetired=true&deskId="+encodeURIComponent(selected));
    var rules=await deskApi("/api/workspace/refund-rules?includeRetired=true&deskId="+encodeURIComponent(selected));
    var limits=await deskApi("/api/workspace/escalation-limits?includeRetired=true&deskId="+encodeURIComponent(selected));
    var commits=await deskApi("/api/workspace/commitments?includeRetired=true&deskId="+encodeURIComponent(selected));
    var list=el("policyList"); list.replaceChildren();
    answers.forEach(function(row){list.appendChild(item(row.topic+" · rev "+row.revision,row.question+"\\n"+row.answer,function(){el("answerTopic").value=row.topic;el("answerQuestion").value=row.question;el("answerBody").value=row.answer;el("answerRevision").value=row.revision}))});
    rules.forEach(function(row){list.appendChild(item(row.name+" · "+row.decision,row.remedy,function(){el("refundName").value=row.name;el("refundTerms").value=row.matchTerms.join("\\n");el("refundDecision").value=row.decision;el("refundRemedy").value=row.remedy;el("refundWindow").value=row.windowDays==null?"":String(row.windowDays);el("refundRevision").value=row.revision}))});
    limits.forEach(function(row){list.appendChild(item(row.channel+" · max "+row.maxTier,row.notes||row.tierLadder.join(", "),function(){el("limitName").value=row.name;el("limitChannel").value=row.channel;el("limitLadder").value=row.tierLadder.join("\\n");el("limitMax").value=row.maxTier;el("limitRefund").checked=row.allowRefundPromise;el("limitFeature").checked=row.allowFeaturePromise;el("limitTimeline").checked=row.allowTimelinePromise;el("limitNotes").value=row.notes||"";el("limitRevision").value=row.revision}))});
    commits.forEach(function(row){list.appendChild(item(row.kind+" · "+row.name,row.statement,function(){el("commitKind").value=row.kind;el("commitName").value=row.name;el("commitStatement").value=row.statement;el("commitRevision").value=row.revision}))});
    if(!list.childNodes.length) list.textContent="Nothing approved on this desk yet.";
  }
  function rev(id){var n=Number(el(id).value);return n>0?n:undefined}
  el("deskSelect").onchange=function(){selected=this.value;void loadPolicy().catch(function(e){el("workspaceMessage").textContent=e.message})};
  el("deskForm").onsubmit=async function(e){e.preventDefault();try{var row=await deskApi("/api/workspace/desks",{method:"POST",body:JSON.stringify({name:el("deskName").value.trim(),description:el("deskDescription").value.trim()||undefined})});selected=row.id;this.reset();await loadDesks();await loadPolicy();el("workspaceMessage").textContent="Desk created."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("answerForm").onsubmit=async function(e){e.preventDefault();try{await deskApi("/api/workspace/answers",{method:"POST",body:JSON.stringify({deskId:selected,topic:el("answerTopic").value,question:el("answerQuestion").value,answer:el("answerBody").value,expectedRevision:rev("answerRevision")})});el("answerRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Approved answer saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("refundForm").onsubmit=async function(e){e.preventDefault();try{var windowDays=el("refundWindow").value.trim();await deskApi("/api/workspace/refund-rules",{method:"POST",body:JSON.stringify({deskId:selected,name:el("refundName").value,matchTerms:lines("refundTerms"),decision:el("refundDecision").value,remedy:el("refundRemedy").value,windowDays:windowDays?Number(windowDays):null,expectedRevision:rev("refundRevision")})});el("refundRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Refund rule saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("limitForm").onsubmit=async function(e){e.preventDefault();try{await deskApi("/api/workspace/escalation-limits",{method:"POST",body:JSON.stringify({deskId:selected,name:el("limitName").value,channel:el("limitChannel").value,tierLadder:lines("limitLadder"),maxTier:el("limitMax").value,allowRefundPromise:el("limitRefund").checked,allowFeaturePromise:el("limitFeature").checked,allowTimelinePromise:el("limitTimeline").checked,notes:el("limitNotes").value,expectedRevision:rev("limitRevision")})});el("limitRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Escalation limit saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  el("commitForm").onsubmit=async function(e){e.preventDefault();try{await deskApi("/api/workspace/commitments",{method:"POST",body:JSON.stringify({deskId:selected,kind:el("commitKind").value,name:el("commitName").value,statement:el("commitStatement").value,expectedRevision:rev("commitRevision")})});el("commitRevision").value="";await loadPolicy();el("workspaceMessage").textContent="Commitment saved."}catch(err){el("workspaceMessage").textContent=err.message}};
  function resume(){
    try{var saved=sessionStorage.getItem("deskPluginReturn");if(!saved)return false;sessionStorage.removeItem("deskPluginReturn");var pending=JSON.parse(saved);if(!pending||Date.now()-pending.createdAt>600000)return false;location.assign(pending.id?"/oauth/consent?authorization_id="+encodeURIComponent(pending.id):"/connections");return true}catch(e){return false}
  }
  async function init(){
    if(!SUPABASE_URL||!SUPABASE_ANON_KEY||!window.supabase){setSignedOut();showError("Google sign-in is not configured yet.");return}
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{flowType:"implicit",persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}});
    client.auth.onAuthStateChange(function(_e,session){if(session){if(resume())return;setSignedIn(session)}else setSignedOut()});
    var result=await client.auth.getSession();
    var session=result&&result.data?result.data.session:null;
    if(session){if(resume())return;setSignedIn(session)}else setSignedOut();
  }
  el("googleBtn").onclick=async function(){clearError();if(!client){showError("Google sign-in is not configured yet.");return}this.disabled=true;try{var r=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:APP_BASE_URL}});if(r.error)throw r.error}catch(e){this.disabled=false;showError(e.message||String(e))}};
  el("signOutBtn").onclick=async function(){if(client)await client.auth.signOut();setSignedOut();location.href="/"};
  el("portalBtn").onclick=async function(){try{var r=await fetch("/billing/portal",{method:"POST",headers:{Authorization:"Bearer "+token}});var d=await r.json();if(!r.ok)throw Error(d.error||"Unable to open billing");location.href=d.url}catch(e){showError(e.message)}};
  document.querySelectorAll(".checkout").forEach(function(btn){btn.onclick=async function(){clearError();if(!token){showError("Sign in with Google first, then start the trial.");return}if(isPro||!ready){showError("Refresh your subscription status before starting checkout.");return}btn.disabled=true;try{var r=await fetch("/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({plan:btn.getAttribute("data-plan")})});var d=await r.json();if(!r.ok)throw Error(d.error||"Unable to start checkout");location.href=d.url}catch(e){btn.disabled=false;showError(e.message)}}});
  var checkout=new URLSearchParams(location.search).get("checkout");
  if(checkout==="success") el("notice").textContent="Checkout completed. Your subscription is being confirmed.";
  if(checkout==="cancelled") showError("Checkout was cancelled. No changes were made.");
  init();
})();
</script>
</body></html>`;
}
