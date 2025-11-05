<!-- In your <head> or before </body> -->
<script>
(async function(){
  const today = new Date().toISOString().slice(0,10);
  const res = await fetch(`/quests/${today}.json`, {cache:"no-store"});
  if(!res.ok){ console.warn("Quest not found for", today); return; }
  const q = await res.json();

  const mount = document.getElementById("daily-quest");
  if(!mount){ return; }

  const key = (i)=>`mcq:${q.id}:step:${i}:done`;

  const wrap = document.createElement("div");
  wrap.style.border = "1px solid #ddd";
  wrap.style.borderRadius = "12px";
  wrap.style.padding = "16px";
  wrap.style.background = "#fff";
  wrap.style.maxWidth = "720px";
  wrap.style.margin = "16px auto";

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="width:12px;height:12px;border-radius:3px;background:${q.color||"#5c7cfa"}"></div>
      <h2 style="margin:0;font-family:system-ui">${q.title} — ${q.theme}</h2>
    </div>
    <div style="color:#555;margin-bottom:8px;font-family:system-ui">${q.lore}</div>
    <div style="font-family:system-ui;font-size:14px;margin-bottom:12px">
      <strong>Date:</strong> ${q.date} &nbsp; • &nbsp;
      <strong>Biome hint:</strong> ${q.biome_hint} &nbsp; • &nbsp;
      <strong>Reward:</strong> ${q.reward}
    </div>
    <ol id="mcq-steps" style="font-family:system-ui;line-height:1.5;padding-left:20px;margin:0 0 12px 0"></ol>
    <div id="mcq-progress" style="font-family:system-ui;font-size:14px;margin-top:8px;color:#333"></div>
    <div id="mcq-vote" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"></div>
    <div style="font-family:system-ui;font-size:12px;color:#666;margin-top:8px">
      Rules: ${q.rules?.join(" • ") || ""}
    </div>
  `;

  const list = wrap.querySelector("#mcq-steps");
  q.steps.forEach((s, i)=>{
    const li = document.createElement("li");
    li.style.margin = "8px 0";
    const id = `step-${i}`;
    const done = localStorage.getItem(key(i)) === "1";
    li.innerHTML = `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input id="${id}" type="checkbox" ${done?"checked":""}/>
        <span>${s}</span>
      </label>
    `;
    list.appendChild(li);
    li.querySelector("input").addEventListener("change", (e)=>{
      localStorage.setItem(key(i), e.target.checked ? "1" : "0");
      renderProgress();
    });
  });

  function renderProgress(){
    const total = q.steps.length;
    const done = q.steps.filter((_,i)=> localStorage.getItem(key(i))==="1").length;
    wrap.querySelector("#mcq-progress").textContent = `Progress: ${done}/${total} steps complete`;
  }
  renderProgress();

  // Voting UI (works local-only OR with Supabase if configured)
  const voteBox = wrap.querySelector("#mcq-vote");
  const voteBtns = [
    {k:"fun", label:"👍 Fun"},
    {k:"okay", label:"🙂 Okay"},
    {k:"hard", label:"😅 Too Hard"}
  ];
  voteBtns.forEach(v=>{
    const btn = document.createElement("button");
    btn.textContent = v.label;
    btn.style.cssText = "font-family:system-ui;border:1px solid #ddd;border-radius:8px;padding:8px 10px;background:#f8f9fa;cursor:pointer";
    btn.addEventListener("click", ()=>submitVote(v.k));
    voteBox.appendChild(btn);
  });

  async function submitVote(option){
    // Local-only record so users can't spam themselves
    const votedKey = `mcq:${q.id}:voted`;
    if(localStorage.getItem(votedKey)==="1"){ alert("Thanks! You already voted today."); return; }
    localStorage.setItem(votedKey,"1");

    // If Supabase env is present, also record public vote
    const url = window.SUPABASE_REST_URL; // e.g. "https://xyzcompany.supabase.co/rest/v1"
    const anon = window.SUPABASE_ANON_KEY; // anon key (public)
    if(url && anon){
      try{
        const userHash = (await crypto.subtle.digest("SHA-256", new TextEncoder().encode(navigator.userAgent + (new Date()).toDateString())))
          .then(buf => Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,16));
        const payload = { date: q.id, theme: q.theme, option, ua: navigator.userAgent, user_hash: await userHash };
        await fetch(`${url}/votes`, {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "apikey": anon,
            "Authorization": `Bearer ${anon}`,
            "Prefer": "return=minimal"
          },
          body: JSON.stringify(payload)
        });
        // fetch and show aggregate if allowed
        if(window.SUPABASE_PUBLIC_AGG_VIEW){
          const r = await fetch(`${url}/${window.SUPABASE_PUBLIC_AGG_VIEW}?date=eq.${q.id}`, {
            headers: {"apikey":anon,"Authorization":`Bearer ${anon}`}
          });
          if(r.ok){
            const data = await r.json();
            const counts = data.reduce((m,row)=>{ m[row.option]=Number(row.count)||0; return m; },{});
            alert(`Thanks for voting!\nFun: ${counts.fun||0} • Okay: ${counts.okay||0} • Too Hard: ${counts.hard||0}`);
            return;
          }
        }
      }catch(e){ console.warn("Vote submit (public) failed; local vote saved.", e); }
    }
    alert("Thanks for voting!");
  }

  mount.replaceWith(wrap);
})();
</script>
