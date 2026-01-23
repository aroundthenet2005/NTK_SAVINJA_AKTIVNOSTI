const CACHE = new Map();
const STORAGE_KEY = "tp_db_override_v1";

function loadLocalDB(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){
    return null;
  }
}
function saveLocalDB(db){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }catch(e){}
}
function clearLocalDB(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
}

async function loadDB(){
  const local = loadLocalDB();
  if(local){
    window.__DB_SOURCE = "local";
    return local;
  }
  window.__DB_SOURCE = "file";
  return await fetchJSON("data/db.json");
}

async function fetchText(url){
  if(CACHE.has(url)) return CACHE.get(url);
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) return "";
  const txt = await res.text();
  CACHE.set(url, txt);
  return txt;
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("Fetch failed: " + url);
  return await res.json();
}

function norm(p){ return (p||"").trim().replace(/^\/+/, ""); }

async function hydrateTexts(){
  const nodes = document.querySelectorAll("[data-text]");
  await Promise.all(Array.from(nodes).map(async el => {
    const key = norm(el.getAttribute("data-text"));
    if(!key) return;
    const txt = (await fetchText(`content/${key}.txt`)).trim();
    el.textContent = txt;
  }));
}

async function hydrateHrefs(){
  const nodes = document.querySelectorAll("[data-href]");
  await Promise.all(Array.from(nodes).map(async el => {
    const key = norm(el.getAttribute("data-href"));
    if(!key) return;
    const txt = (await fetchText(`content/${key}.txt`)).trim();
    if(txt) el.setAttribute("href", txt);
  }));
}

function wireMobileMenu(){
  const b = document.querySelector("[data-burger]");
  const m = document.querySelector("[data-mobilemenu]");
  if(b && m) b.addEventListener("click", () => m.classList.toggle("open"));
}

function fmtTime(dt){
  const h = String(dt.getHours()).padStart(2,"0");
  const m = String(dt.getMinutes()).padStart(2,"0");
  return `${h}:${m}`;
}
function fmtDate(dt){
  const y = dt.getFullYear();
  const mo = String(dt.getMonth()+1).padStart(2,"0");
  const d = String(dt.getDate()).padStart(2,"0");
  return `${y}-${mo}-${d}`;
}
function parseLocal(isoNoZ){
  const s = String(isoNoZ||"").trim();
  if(!s) return new Date("invalid");
  // Expected: YYYY-MM-DDTHH:MM (admin picker) -> add seconds
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return new Date(s + ":00");
  // Fallback (allows seconds)
  return new Date(s);
}

function addDays(d, n){ const x = new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
function addMonths(d, n){ const x = new Date(d.getTime()); x.setMonth(x.getMonth()+n); return x; }
function addYears(d, n){ const x = new Date(d.getTime()); x.setFullYear(x.getFullYear()+n); return x; }

function expandTrainings(db, fromDate, toDate){
  const out = [];
  const trainings = db.trainings || [];
  trainings.forEach(t=>{
    const baseStart = parseLocal(t.start);
    if(Number.isNaN(baseStart.getTime())){ return; }
    const durMin = Number(t.durationMin || 60);
    const recur = t.recurrence || {type:"none"};
    const until = recur.until ? new Date(recur.until + "T23:59:59") : toDate;

    function pushInstance(start){
      const end = new Date(start.getTime() + durMin*60000);
      if(start >= fromDate && start <= toDate){
        out.push({
          instanceId: `${t.id}__${fmtDate(start)}_${fmtTime(start).replace(":","")}`,
          trainingId: t.id,
          title: t.title || "Trening",
          start, end,
          locationId: t.locationId,
          headCoachId: t.headCoachId,
          assistantCoachIds: t.assistantCoachIds || [],
          playerIds: t.playerIds || [],
          notes: t.notes || ""
        });
      }
    }

    const type = (recur.type || "none").toLowerCase();
    if(type === "none"){
      if(baseStart <= toDate && baseStart >= fromDate) pushInstance(baseStart);
      else if(baseStart < fromDate && baseStart <= toDate) pushInstance(baseStart);
      return;
    }

    let cur = baseStart;
    const maxIters = 600;
    let i=0;
    while(cur <= toDate && cur <= until && i < maxIters){
      if(cur >= fromDate) pushInstance(cur);
      const interval = Number(recur.interval || 1);

      if(type === "weekly"){
        cur = addDays(cur, 7*interval);
      } else if(type === "biweekly"){
        cur = addDays(cur, 14);
      } else if(type === "monthly"){
        cur = addMonths(cur, interval);
      } else if(type === "yearly" || type === "annual"){
        cur = addYears(cur, interval);
      } else {
        break;
      }
      i++;
    }
  });

  out.sort((a,b)=>a.start-b.start);
  return out;
}

function idMap(arr){
  const m = new Map();
  (arr||[]).forEach(x=>m.set(x.id,x));
  return m;
}

function setActiveNav(){
  const current = (location.pathname.split("/").pop() || "index.html");
  document.querySelectorAll(".navlinks a").forEach(a=>{
    a.classList.toggle("active", a.getAttribute("href")===current);
  });
}

function openModal(modal, title, bodyHtml){
  modal.querySelector("[data-modal-title]").textContent = title || "";
  modal.querySelector("[data-modal-body]").innerHTML = bodyHtml || "";
  modal.classList.add("open");
  document.body.style.overflow="hidden";
}
function closeModal(modal){
  modal.classList.remove("open");
  document.body.style.overflow="";
}
function wireModal(modal){
  modal.addEventListener("click", (e)=>{ if(e.target === modal) closeModal(modal); });
  modal.querySelector("[data-modal-close]").addEventListener("click", ()=>closeModal(modal));
  window.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeModal(modal); });
}

function buildCalendar(container, instances, monthDate, maps){
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startDay = (first.getDay()+6)%7; // Monday=0
  const daysInMonth = new Date(year, month+1, 0).getDate();

  container.innerHTML = "";
  const weekLabels = ["Pon","Tor","Sre","Čet","Pet","Sob","Ned"];
  weekLabels.forEach(l=>{
    const h = document.createElement("div");
    h.className="day";
    h.style.minHeight="unset";
    h.innerHTML = `<div class="d">${l}</div>`;
    container.appendChild(h);
  });

  for(let i=0;i<startDay;i++){
    const d = document.createElement("div");
    d.className="day";
    d.innerHTML = `<div class="d" style="opacity:.35"> </div>`;
    container.appendChild(d);
  }

  const byDate = new Map();
  instances.forEach(inst=>{
    const k = fmtDate(inst.start);
    if(!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(inst);
  });

  for(let day=1; day<=daysInMonth; day++){
    const date = new Date(year, month, day);
    const key = fmtDate(date);
    const items = byDate.get(key) || [];
    const box = document.createElement("div");
    box.className="day";
    box.innerHTML = `<div class="d">${day}</div>`;
    items.slice(0,4).forEach(inst=>{
      const loc = maps.locations.get(inst.locationId)?.name || "";
      const ev = document.createElement("div");
      ev.className="event";
      ev.dataset.instanceId = inst.instanceId;
      ev.innerHTML = `<div class="t">${fmtTime(inst.start)} • ${inst.title}</div><div class="m">${loc}</div>`;
      box.appendChild(ev);
    });
    if(items.length > 4){
      const more = document.createElement("div");
      more.className="small";
      more.style.marginTop="8px";
      more.textContent = `+${items.length-4} več`;
      box.appendChild(more);
    }
    container.appendChild(box);
  }
}

function renderUpcoming(tableBody, instances, maps, emptyText){
  tableBody.innerHTML="";
  if(instances.length===0){
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=5;
    td.className="small";
    td.textContent = emptyText || "Ni treningov.";
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }
  instances.forEach(inst=>{
    const tr=document.createElement("tr");
    const dateTd=document.createElement("td"); dateTd.textContent = fmtDate(inst.start);
    const timeTd=document.createElement("td"); timeTd.textContent = `${fmtTime(inst.start)}–${fmtTime(inst.end)}`;
    const titleTd=document.createElement("td"); titleTd.textContent = inst.title;
    const locTd=document.createElement("td"); locTd.textContent = maps.locations.get(inst.locationId)?.name || "";
    const coachTd=document.createElement("td"); coachTd.textContent = maps.coaches.get(inst.headCoachId)?.name || "";
    tr.appendChild(dateTd); tr.appendChild(timeTd); tr.appendChild(titleTd); tr.appendChild(locTd); tr.appendChild(coachTd);
    tr.dataset.instanceId = inst.instanceId;
    tr.style.cursor="pointer";
    tableBody.appendChild(tr);
  });
}

function makeSelectOptions(sel, items, placeholder){
  sel.innerHTML = "";
  const opt0=document.createElement("option");
  opt0.value=""; opt0.textContent = placeholder || "Vsi";
  sel.appendChild(opt0);
  items.forEach(x=>{
    const o=document.createElement("option");
    o.value=x.id;
    o.textContent=x.name;
    sel.appendChild(o);
  });
}

function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function buildDetails(inst, maps){
  const loc = maps.locations.get(inst.locationId);
  const head = maps.coaches.get(inst.headCoachId);
  const assistants = (inst.assistantCoachIds||[]).map(id=>maps.coaches.get(id)?.name).filter(Boolean);
  const players = (inst.playerIds||[]).map(id=>maps.players.get(id)?.name).filter(Boolean);

  const badges = [];
  if(loc?.name) badges.push(`<span class="badge">${escapeHtml(loc.name)}</span>`);
  if(head?.name) badges.push(`<span class="badge">Trener: ${escapeHtml(head.name)}</span>`);
  if(assistants.length) badges.push(`<span class="badge">Pomočniki: ${escapeHtml(assistants.join(", "))}</span>`);
  badges.push(`<span class="badge">${escapeHtml(fmtDate(inst.start))} • ${escapeHtml(fmtTime(inst.start))}–${escapeHtml(fmtTime(inst.end))}</span>`);

  const mapsLink = loc?.mapsUrl ? `<a class="btn" target="_blank" rel="noopener" href="${escapeHtml(loc.mapsUrl)}">Odpri zemljevid</a>` : "";

  return `
    <div class="badges">${badges.join("")}</div>
    <div class="hr"></div>
    <h3>Igralci</h3>
    <div class="chips">
      ${(players.length ? players.map(p=>`<span class="chip">${escapeHtml(p)}</span>`).join("") : `<div class="small">Ni vpisanih igralcev.</div>`)}
    </div>
    <div class="hr"></div>
    <h3>Opombe</h3>
    <div class="small">${escapeHtml(inst.notes || "")}</div>
    <div class="hr"></div>
    ${mapsLink}
  `;
}

function applyFilters(instances, coachId, locationId, playerId){
  return instances.filter(inst=>{
    if(coachId && inst.headCoachId !== coachId && !(inst.assistantCoachIds||[]).includes(coachId)) return false;
    if(locationId && inst.locationId !== locationId) return false;
    if(playerId && !(inst.playerIds||[]).includes(playerId)) return false;
    return true;
  });
}

async function homePage(){
  const db = await loadDB();
  const maps = { players: idMap(db.players), coaches: idMap(db.coaches), locations: idMap(db.locations) };
  const localNote = document.querySelector("[data-local-only]");
  if(localNote && window.__DB_SOURCE==="local") localNote.style.display = "block";
  const localReset = document.querySelector("[data-local-reset]");
  if(localReset) localReset.addEventListener("click", ()=>{ clearLocalDB(); location.reload(); });

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = addDays(now, Number(db.settings?.publicDaysAhead || 60));
  let instances = expandTrainings(db, addDays(from, -10), to);

  const monthLabel = document.querySelector("[data-month-label]");
  const calendarEl = document.querySelector("[data-calendar]");
  const upcomingBody = document.querySelector("[data-upcoming-body]");
  const modal = document.querySelector("[data-modal]");
  wireModal(modal);

  const coachSel = document.querySelector("[data-filter-coach]");
  const locSel = document.querySelector("[data-filter-location]");
  const playerSel = document.querySelector("[data-filter-player]");

  makeSelectOptions(coachSel, db.coaches, "Vsi trenerji");
  makeSelectOptions(locSel, db.locations, "Vse lokacije");
  makeSelectOptions(playerSel, db.players, "Vsi igralci");

  let viewMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const emptyText = (await fetchText("content/home/upcoming/empty.txt")).trim();

  function render(){
    const filtered = applyFilters(instances, coachSel.value, locSel.value, playerSel.value);

    const monthFrom = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const monthTo = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 0);
    const calItems = filtered.filter(x=>x.start >= addDays(monthFrom, -1) && x.start <= addDays(monthTo, 1));

    monthLabel.textContent = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth()+1).padStart(2,"0")}`;
    buildCalendar(calendarEl, calItems, viewMonth, maps);

    const upItems = filtered.filter(x=>x.start >= now && x.start <= to).slice(0, 40);
    renderUpcoming(upcomingBody, upItems, maps, emptyText);
  }

  document.querySelector("[data-month-prev]").addEventListener("click", ()=>{ viewMonth = addMonths(viewMonth, -1); render(); });
  document.querySelector("[data-month-next]").addEventListener("click", ()=>{ viewMonth = addMonths(viewMonth, 1); render(); });
  [coachSel, locSel, playerSel].forEach(s=>s.addEventListener("change", render));

  document.addEventListener("click", (e)=>{
    const t = e.target;
    const ev = t.closest?.(".event");
    const tr = t.closest?.("tr[data-instance-id]");
    const id = ev?.dataset?.instanceId || tr?.dataset?.instanceId;
    if(!id) return;
    const inst = instances.find(x=>x.instanceId===id);
    if(!inst) return;
    openModal(modal, inst.title, buildDetails(inst, maps));
  });

  render();

  const next7 = instances.filter(x=>x.start >= now && x.start <= addDays(now, 7));
  const k1 = document.querySelector("[data-kpi-week]");
  const k2 = document.querySelector("[data-kpi-next]");
  const k3 = document.querySelector("[data-kpi-players]");
  if(k1) k1.textContent = String(next7.length);
  if(k2) k2.textContent = String(instances.filter(x=>x.start>=now && x.start<=to).length);
  if(k3) k3.textContent = String((db.players||[]).length);
}

function downloadText(filename, text){
  const blob = new Blob([text], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function filePick(accept){
  return new Promise((resolve)=>{
    const i = document.createElement("input");
    i.type="file";
    i.accept = accept || ".json";
    i.onchange = ()=> resolve(i.files?.[0] || null);
    i.click();
  });
}

function uuid(prefix){
  return prefix + Math.random().toString(16).slice(2,10) + "_" + Date.now().toString(16);
}

function tokenMatch(pin, input){
  return (String(pin||"").trim() === String(input||"").trim());
}

function optHtml(opts, selected){
  return (opts||[]).map(o=>`<option value="${(o.id||"")}" ${o.id===selected?"selected":""}>${(o.name||"")}</option>`).join("");
}

function renderAdminLists(db, maps){
  const playersT = document.querySelector("[data-admin-players]");
  const coachesT = document.querySelector("[data-admin-coaches]");
  const locsT = document.querySelector("[data-admin-locations]");
  const trainingsT = document.querySelector("[data-admin-trainings]");

  playersT.innerHTML = (db.players||[]).map(p=>`
    <tr>
      <td>${p.name||""}</td>
      <td style="width:160px;">
        <button class="btn" data-act="edit-player" data-id="${p.id}">Uredi</button>
        <button class="btn danger" data-act="del-player" data-id="${p.id}">X</button>
      </td>
    </tr>`).join("") || `<tr><td class="small" colspan="2">Ni igralcev.</td></tr>`;

  coachesT.innerHTML = (db.coaches||[]).map(c=>`
    <tr>
      <td>${c.name||""}</td>
      <td style="width:160px;">
        <button class="btn" data-act="edit-coach" data-id="${c.id}">Uredi</button>
        <button class="btn danger" data-act="del-coach" data-id="${c.id}">X</button>
      </td>
    </tr>`).join("") || `<tr><td class="small" colspan="2">Ni trenerjev.</td></tr>`;

  locsT.innerHTML = (db.locations||[]).map(l=>`
    <tr>
      <td>${l.name||""}</td>
      <td class="small">${l.address||""}</td>
      <td style="width:160px;">
        <button class="btn" data-act="edit-loc" data-id="${l.id}">Uredi</button>
        <button class="btn danger" data-act="del-loc" data-id="${l.id}">X</button>
      </td>
    </tr>`).join("") || `<tr><td class="small" colspan="3">Ni lokacij.</td></tr>`;

  trainingsT.innerHTML = (db.trainings||[]).map(t=>{
    const loc = maps.locations.get(t.locationId)?.name || "";
    const coach = maps.coaches.get(t.headCoachId)?.name || "";
    const recur = t.recurrence?.type && t.recurrence?.type!=="none" ? `${t.recurrence.type} do ${t.recurrence.until||"?"}` : "brez";
    return `
      <tr>
        <td>${t.title||"Trening"}</td>
        <td class="small">${t.start||""}</td>
        <td class="small">${loc}</td>
        <td class="small">${coach}</td>
        <td class="small">${recur}</td>
        <td style="width:160px;">
          <button class="btn" data-act="edit-tr" data-id="${t.id}">Uredi</button>
          <button class="btn danger" data-act="del-tr" data-id="${t.id}">X</button>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td class="small" colspan="6">Ni treningov.</td></tr>`;
}

function buildMultiSelect(items, selectedIds){
  const selected = new Set(selectedIds||[]);
  const options = (items||[]).map(x=>({id:x.id,name:x.name}));
  return {selected, options};
}

function renderMultiSelectUI(root, ms){
  root.innerHTML = `
    <input class="input" placeholder="Začni tipkati ime..." data-ms-search>
    <div class="hr"></div>
    <div class="chips" data-ms-chips></div>
    <div class="hr"></div>
    <div class="small">Klikni ime za dodajanje:</div>
    <div class="chips" data-ms-options></div>
  `;

  const chips = root.querySelector("[data-ms-chips]");
  const opts = root.querySelector("[data-ms-options]");
  const search = root.querySelector("[data-ms-search]");

  function draw(filter){
    chips.innerHTML = "";
    Array.from(ms.selected).forEach(id=>{
      const name = ms.options.find(o=>o.id===id)?.name || id;
      const chip = document.createElement("span");
      chip.className="chip";
      chip.innerHTML = `${name} <button type="button" data-id="${id}">×</button>`;
      chips.appendChild(chip);
    });
    chips.querySelectorAll("button").forEach(b=>{
      b.addEventListener("click", ()=>{ ms.selected.delete(b.dataset.id); draw(search.value); });
    });

    const q = (filter||"").toLowerCase().trim();
    const show = ms.options.filter(o=>{
      if(ms.selected.has(o.id)) return false;
      if(!q) return true;
      return (o.name||"").toLowerCase().includes(q);
    }).slice(0, 24);

    opts.innerHTML = "";
    show.forEach(o=>{
      const chip = document.createElement("button");
      chip.type="button";
      chip.className="chip";
      chip.style.cursor="pointer";
      chip.textContent = o.name;
      chip.addEventListener("click", ()=>{ ms.selected.add(o.id); draw(search.value); });
      opts.appendChild(chip);
    });
  }

  search.addEventListener("input", ()=>draw(search.value));
  draw("");
}

function readMultiSelect(ms){ return Array.from(ms.selected); }

async function adminPage(){
  const pin = (await fetchText("content/admin/pin.txt")).trim();
  const input = prompt("Vnesi ADMIN PIN:");
  if(!tokenMatch(pin, input)){
    alert("Napačen PIN.");
    location.href = "index.html";
    return;
  }

  let db = await loadDB();
  function remap(){
    return { players: idMap(db.players), coaches: idMap(db.coaches), locations: idMap(db.locations) };
  }
  let maps = remap();

  const modal = document.querySelector("[data-modal]");
  wireModal(modal);

  function syncRender(){
    saveLocalDB(db);
    maps = remap();
    renderAdminLists(db, maps);

    const now = new Date();
    const to = new Date(now.getTime() + Number(db.settings?.publicDaysAhead||60)*86400000);
    const inst = expandTrainings(db, addDays(now,-1), to);
    document.querySelector("[data-admin-kpi-tr]").textContent = String((db.trainings||[]).length);
    document.querySelector("[data-admin-kpi-instances]").textContent = String(inst.filter(x=>x.start>=now).length);
    document.querySelector("[data-admin-kpi-players]").textContent = String((db.players||[]).length);
  }

  function openForm(title, innerHtml, onSave){
    openModal(modal, title, innerHtml);
    const form = modal.querySelector("form");
    form.addEventListener("submit", (e)=>{
      e.preventDefault();
      onSave(new FormData(form));
      closeModal(modal);
      syncRender();
    });
  }

  document.querySelector("[data-admin-export]").addEventListener("click", ()=>{
    downloadText("db.json", JSON.stringify(db, null, 2));
    alert("Preneseno: db.json. Zamenjaj datoteko /data/db.json na hostingu.");
  });

  const settingsBtn = document.querySelector("[data-admin-settings]");
  if(settingsBtn) settingsBtn.addEventListener("click", ()=>{
    const cur = Number(db.settings?.publicDaysAhead || 60);
    openForm("Nastavitve prikaza", `
      <form>
        <label class="small">Koliko dni naprej naj se generirajo treningi za javni pogled?</label>
        <input class="input" name="days" type="number" min="30" step="1" value="${cur}" required>
        <div class="small" style="margin-top:8px;">Namig: 365 za celo leto.</div>
        <div class="hr"></div>
        <button class="btn primary" type="submit">Shrani</button>
      </form>
    `, fd=>{
      const days = Math.max(30, Number(fd.get("days")||60));
      db.settings = db.settings || {};
      db.settings.publicDaysAhead = days;
    });
  });

  const publishBtn = document.querySelector("[data-admin-publish]");
  if(publishBtn) publishBtn.addEventListener("click", async ()=>{
    const storageKey = "tp_publish_key";
    try{
      publishBtn.disabled = true;
      publishBtn.textContent = "Objavljam...";

      const endpoint = (await fetchText("content/admin/publish_endpoint.txt")).trim() || "/.netlify/functions/publish-db";

      // Preberi shranjen ključ (če obstaja). Ob 401 ga pobrišemo in vprašamo ponovno.
      let key = localStorage.getItem(storageKey) || "";

      for(let attempt = 1; attempt <= 10; attempt++){
        if(!key){
          key = prompt(`Vnesi PUBLISH ključ (poskus ${attempt}/10):`);
          if(!key){
            alert("Objava preklicana.");
            return;
          }
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "x-publish-key": key },
          body: JSON.stringify({ db })
        });

        const out = await res.json().catch(()=>({}));

        if(res.ok){
          // Shranimo samo, če je bil ključ pravilen.
          localStorage.setItem(storageKey, key);
          alert("Objavljeno v GitHub. GitHub Pages bo posodobil stran po commitu.
" + (out.commitUrl ? ("Commit: " + out.commitUrl) : ""));
          return;
        }

        if(res.status === 401){
          // Napačen ključ: počistimo in vprašamo ponovno.
          key = "";
          localStorage.removeItem(storageKey);
          if(attempt === 10){
            alert("Napaka pri objavi: Unauthorized (preveč poskusov).");
            return;
          }
          continue;
        }

        alert("Napaka pri objavi: " + (out.error || res.status));
        return;
      }
    }catch(e){
      alert("Napaka pri objavi: " + (e && e.message ? e.message : e));
    }finally{
      publishBtn.disabled = false;
      publishBtn.textContent = "Objavi na splet";
    }
  });
      const out = await res.json().catch(()=>({}));
      if(!res.ok){ alert("Napaka pri objavi: " + (out.error || res.status)); return; }
      alert("Objavljeno v GitHub. Netlify bo naredil nov deploy (push -> deploy).\n" + (out.commitUrl ? ("Commit: " + out.commitUrl) : ""));
    }catch(e){
      alert("Napaka pri objavi: " + (e && e.message ? e.message : e));
    }finally{
      publishBtn.disabled = false;
      publishBtn.textContent = "Objavi na splet";
    }
  });

  const resetBtn = document.querySelector("[data-admin-reset]");
  if(resetBtn) resetBtn.addEventListener("click", ()=>{
    if(confirm("Počistim lokalne spremembe na tej napravi?")){
      clearLocalDB();
      location.reload();
    }
  });


  document.querySelector("[data-admin-import]").addEventListener("click", async ()=>{
    const f = await filePick(".json");
    if(!f) return;
    const txt = await f.text();
    try{
      const obj = JSON.parse(txt);
      if(!obj.players || !obj.trainings) throw new Error("Neveljaven format.");
      db = obj;
      alert("Uvoženo. Ne pozabi potem zamenjati /data/db.json na hostingu.");
      syncRender();
    }catch(e){
      alert("Napaka pri uvozu: " + e.message);
    }
  });

  document.querySelector("[data-add-player]").addEventListener("click", ()=>{
    openForm("Dodaj igralca", `
      <form>
        <label class="small">Ime</label>
        <input class="input" name="name" required>
        <div class="hr"></div>
        <button class="btn primary" type="submit">Shrani</button>
      </form>
    `, fd=>{
      db.players = db.players || [];
      db.players.push({id: uuid("p_"), name: String(fd.get("name")||"").trim()});
    });
  });

  document.querySelector("[data-add-coach]").addEventListener("click", ()=>{
    openForm("Dodaj trenerja", `
      <form>
        <label class="small">Ime</label>
        <input class="input" name="name" required>
        <div class="hr"></div>
        <button class="btn primary" type="submit">Shrani</button>
      </form>
    `, fd=>{
      db.coaches = db.coaches || [];
      db.coaches.push({id: uuid("c_"), name: String(fd.get("name")||"").trim()});
    });
  });

  document.querySelector("[data-add-loc]").addEventListener("click", ()=>{
    openForm("Dodaj lokacijo", `
      <form>
        <label class="small">Ime</label>
        <input class="input" name="name" required>
        <label class="small" style="margin-top:10px; display:block;">Naslov</label>
        <input class="input" name="address">
        <label class="small" style="margin-top:10px; display:block;">Google Maps link</label>
        <input class="input" name="mapsUrl" placeholder="https://maps.google.com/...">
        <div class="hr"></div>
        <button class="btn primary" type="submit">Shrani</button>
      </form>
    `, fd=>{
      db.locations = db.locations || [];
      db.locations.push({
        id: uuid("l_"),
        name: String(fd.get("name")||"").trim(),
        address: String(fd.get("address")||"").trim(),
        mapsUrl: String(fd.get("mapsUrl")||"").trim()
      });
    });
  });

  document.querySelector("[data-add-tr]").addEventListener("click", ()=>{
    const playersMS = buildMultiSelect(db.players||[], []);
    const assistantsMS = buildMultiSelect(db.coaches||[], []);
    openModal(modal, "Dodaj trening", `
      <form>
        <label class="small">Naziv</label>
        <input class="input" name="title" value="Trening" required>

        <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
          <div>
            <label class="small">Začetek (YYYY-MM-DDTHH:MM)</label>
            <input class="input" name="start" type="datetime-local" required>
          </div>
          <div>
            <label class="small">Trajanje (min)</label>
            <input class="input" name="durationMin" type="number" value="90" min="15" required>
          </div>
        </div>

        <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
          <div>
            <label class="small">Lokacija</label>
            <select class="input" name="locationId" required>
              ${optHtml(db.locations||[], "")}
            </select>
          </div>
          <div>
            <label class="small">Glavni trener</label>
            <select class="input" name="headCoachId" required>
              ${optHtml(db.coaches||[], "")}
            </select>
          </div>
        </div>

        <div class="hr"></div>
        <h3>Pomočniki</h3>
        <div data-ms-assist></div>

        <div class="hr"></div>
        <h3>Igralci</h3>
        <div data-ms-players></div>

        <div class="hr"></div>
        <label class="small">Ponavljanje</label>
        <div class="grid" style="grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:8px;">
          <select class="input" name="recurType">
            <option value="none">Brez</option>
            <option value="weekly">Tedensko</option>
            <option value="biweekly">Na 2 tedna</option>
            <option value="monthly">Mesečno</option>
            <option value="yearly">Letno</option>
          </select>
          <input class="input" name="recurInterval" type="number" value="1" min="1" title="interval">
          <input class="input" name="recurUntil" type="date" placeholder="do (YYYY-MM-DD)">
        </div>

        <div class="hr"></div>
        <label class="small">Opombe</label>
        <textarea name="notes"></textarea>

        <div class="hr"></div>
        <button class="btn primary" type="submit">Shrani</button>
      </form>
    `);

    renderMultiSelectUI(modal.querySelector("[data-ms-assist]"), assistantsMS);
    renderMultiSelectUI(modal.querySelector("[data-ms-players]"), playersMS);

    const form = modal.querySelector("form");
    form.addEventListener("submit", (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const recurType = String(fd.get("recurType")||"none");
      const startVal = String(fd.get("start")||"").trim();
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startVal)){
        alert("Start mora biti v formatu YYYY-MM-DDTHH:MM (uporabi picker).");
        return;
      }
      const recur = {type: recurType, interval: Number(fd.get("recurInterval")||1)};
      const until = String(fd.get("recurUntil")||"").trim();
      if(until) recur.until = until;

      db.trainings = db.trainings || [];
      db.trainings.push({
        id: uuid("t_"),
        title: String(fd.get("title")||"Trening").trim(),
        start: String(fd.get("start")||"").trim(),
        durationMin: Number(fd.get("durationMin")||60),
        locationId: String(fd.get("locationId")||"").trim(),
        headCoachId: String(fd.get("headCoachId")||"").trim(),
        assistantCoachIds: readMultiSelect(assistantsMS).filter(id=>id!==String(fd.get("headCoachId")||"").trim()),
        playerIds: readMultiSelect(playersMS),
        notes: String(fd.get("notes")||"").trim(),
        recurrence: recurType==="none" ? {type:"none"} : recur
      });
      closeModal(modal);
      syncRender();
    });
  });

  document.addEventListener("click", (e)=>{
    const btn = e.target.closest?.("button[data-act]");
    if(!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;

    function delArr(arrName){
      const arr = db[arrName] || [];
      db[arrName] = arr.filter(x=>x.id !== id);
    }

    if(act==="del-player"){ if(confirm("Izbrišem igralca?")){ delArr("players"); syncRender(); } }
    if(act==="del-coach"){ if(confirm("Izbrišem trenerja?")){ delArr("coaches"); syncRender(); } }
    if(act==="del-loc"){ if(confirm("Izbrišem lokacijo?")){ delArr("locations"); syncRender(); } }
    if(act==="del-tr"){ if(confirm("Izbrišem trening?")){ delArr("trainings"); syncRender(); } }

    if(act==="edit-player"){
      const p = (db.players||[]).find(x=>x.id===id);
      if(!p) return;
      openForm("Uredi igralca", `
        <form>
          <label class="small">Ime</label>
          <input class="input" name="name" value="${p.name||""}" required>
          <div class="hr"></div>
          <button class="btn primary" type="submit">Shrani</button>
        </form>
      `, fd=>{ p.name = String(fd.get("name")||"").trim(); });
    }

    if(act==="edit-coach"){
      const c = (db.coaches||[]).find(x=>x.id===id);
      if(!c) return;
      openForm("Uredi trenerja", `
        <form>
          <label class="small">Ime</label>
          <input class="input" name="name" value="${c.name||""}" required>
          <div class="hr"></div>
          <button class="btn primary" type="submit">Shrani</button>
        </form>
      `, fd=>{ c.name = String(fd.get("name")||"").trim(); });
    }

    if(act==="edit-loc"){
      const l = (db.locations||[]).find(x=>x.id===id);
      if(!l) return;
      openForm("Uredi lokacijo", `
        <form>
          <label class="small">Ime</label>
          <input class="input" name="name" value="${l.name||""}" required>
          <label class="small" style="margin-top:10px; display:block;">Naslov</label>
          <input class="input" name="address" value="${l.address||""}">
          <label class="small" style="margin-top:10px; display:block;">Google Maps link</label>
          <input class="input" name="mapsUrl" value="${l.mapsUrl||""}">
          <div class="hr"></div>
          <button class="btn primary" type="submit">Shrani</button>
        </form>
      `, fd=>{
        l.name = String(fd.get("name")||"").trim();
        l.address = String(fd.get("address")||"").trim();
        l.mapsUrl = String(fd.get("mapsUrl")||"").trim();
      });
    }

    if(act==="edit-tr"){
      const t = (db.trainings||[]).find(x=>x.id===id);
      if(!t) return;

      const playersMS = buildMultiSelect(db.players||[], t.playerIds||[]);
      const assistantsMS = buildMultiSelect(db.coaches||[], t.assistantCoachIds||[]);
      const recurType = t.recurrence?.type || "none";
      const recurInterval = Number(t.recurrence?.interval || 1);
      const recurUntil = t.recurrence?.until || "";

      openModal(modal, "Uredi trening", `
        <form>
          <label class="small">Naziv</label>
          <input class="input" name="title" value="${t.title||""}" required>

          <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
            <div>
              <label class="small">Začetek (YYYY-MM-DDTHH:MM)</label>
              <input class="input" name="start" type="datetime-local" value="${t.start||""}" required>
            </div>
            <div>
              <label class="small">Trajanje (min)</label>
              <input class="input" name="durationMin" type="number" value="${String(t.durationMin||60)}" min="15" required>
            </div>
          </div>

          <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
            <div>
              <label class="small">Lokacija</label>
              <select class="input" name="locationId" required>
                ${optHtml(db.locations||[], t.locationId)}
              </select>
            </div>
            <div>
              <label class="small">Glavni trener</label>
              <select class="input" name="headCoachId" required>
                ${optHtml(db.coaches||[], t.headCoachId)}
              </select>
            </div>
          </div>

          <div class="hr"></div>
          <h3>Pomočniki</h3>
          <div data-ms-assist></div>

          <div class="hr"></div>
          <h3>Igralci</h3>
          <div data-ms-players></div>

          <div class="hr"></div>
          <label class="small">Ponavljanje</label>
          <div class="grid" style="grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:8px;">
            <select class="input" name="recurType">
              <option value="none" ${recurType==="none"?"selected":""}>Brez</option>
              <option value="weekly" ${recurType==="weekly"?"selected":""}>Tedensko</option>
              <option value="biweekly" ${recurType==="biweekly"?"selected":""}>Na 2 tedna</option>
              <option value="monthly" ${recurType==="monthly"?"selected":""}>Mesečno</option>
              <option value="yearly" ${recurType==="yearly"?"selected":""}>Letno</option>
            </select>
            <input class="input" name="recurInterval" type="number" value="${String(recurInterval)}" min="1">
            <input class="input" name="recurUntil" type="date" value="${recurUntil}" placeholder="do (YYYY-MM-DD)">
          </div>

          <div class="hr"></div>
          <label class="small">Opombe</label>
          <textarea name="notes">${t.notes||""}</textarea>

          <div class="hr"></div>
          <button class="btn primary" type="submit">Shrani</button>
        </form>
      `);

      renderMultiSelectUI(modal.querySelector("[data-ms-assist]"), assistantsMS);
      renderMultiSelectUI(modal.querySelector("[data-ms-players]"), playersMS);

      const form = modal.querySelector("form");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const type = String(fd.get("recurType")||"none");
      const startVal = String(fd.get("start")||"").trim();
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startVal)){
        alert("Start mora biti v formatu YYYY-MM-DDTHH:MM (uporabi picker).");
        return;
      }
        const recur = {type, interval: Number(fd.get("recurInterval")||1)};
        const until = String(fd.get("recurUntil")||"").trim();
        if(until) recur.until = until;

        t.title = String(fd.get("title")||"Trening").trim();
        t.start = String(fd.get("start")||"").trim();
        t.durationMin = Number(fd.get("durationMin")||60);
        t.locationId = String(fd.get("locationId")||"").trim();
        t.headCoachId = String(fd.get("headCoachId")||"").trim();
        t.assistantCoachIds = readMultiSelect(assistantsMS).filter(x=>x!==t.headCoachId);
        t.playerIds = readMultiSelect(playersMS);
        t.notes = String(fd.get("notes")||"").trim();
        t.recurrence = type==="none" ? {type:"none"} : recur;

        closeModal(modal);
        syncRender();
      });
    }
  });

  syncRender();
}

async function kontaktPage(){}

async function main(){
  wireMobileMenu();
  await Promise.all([hydrateTexts(), hydrateHrefs()]);
  setActiveNav();

  const page = document.body.getAttribute("data-page");
  if(page==="home") await homePage();
  if(page==="admin") await adminPage();
  if(page==="kontakt") await kontaktPage();
}
window.addEventListener("DOMContentLoaded", main);
