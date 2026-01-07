/***********************
 * Self RPG - Vanilla
 * localStorage + Canvas Radar
 ***********************/

const LS_KEY = "selfRpgData_v1";

/** RPG progression tuning */
const A = 50;   // quadratic coefficient
const B = 100;  // linear coefficient

function xpToReachLevel(level){
  // XP needed to reach "level" (level 1 => 0)
  const n = level - 1;
  return A * n * n + B * n;
}

function levelFromXp(xp){
  // find highest level such that xpToReachLevel(level) <= xp
  let level = 1;
  while (xpToReachLevel(level + 1) <= xp) level++;
  return level;
}

function progressInLevel(xp){
  const lvl = levelFromXp(xp);
  const curStart = xpToReachLevel(lvl);
  const nextStart = xpToReachLevel(lvl + 1);
  const inLevel = xp - curStart;
  const need = nextStart - curStart;
  const pct = need === 0 ? 0 : Math.max(0, Math.min(1, inLevel / need));
  return { level:lvl, inLevel, need, pct, curStart, nextStart };
}

/** Simple uuid */
function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/** Data */
let state = loadState();
let selectedAttributeId = null;

function defaultState(){
  return {
    attributes: [
      {id: uid(), name:"Эрудиция", icon:"🧠", xp: 0, createdAt: new Date().toISOString()},
      {id: uid(), name:"Здоровье", icon:"🏥", xp: 0, createdAt: new Date().toISOString()},
      {id: uid(), name:"Отношения", icon:"❤️", xp: 0, createdAt: new Date().toISOString()},
      {id: uid(), name:"Карьера", icon:"🎓", xp: 0, createdAt: new Date().toISOString()},
    ],
    actions: [
      {
        id: uid(),
        name: "Чтение книги",
        type: "daily",
        isActive: true,
        createdAt: new Date().toISOString(),
        rewards: [] // filled below
      }
    ],
    logs: [],
    onceDone: {} // {actionId:true}
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw){
      const s = defaultState();
      // fill rewards referencing existing attrs
      s.actions[0].rewards = [
        {attributeId: s.attributes[0].id, xp: 15},
        {attributeId: s.attributes[3].id, xp: 5}
      ];
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw);
  }catch(e){
    console.warn("State load error", e);
    const s = defaultState();
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    return s;
  }
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

/** DOM */
const attributesGrid = document.getElementById("attributesGrid");
const actionsList = document.getElementById("actionsList");

const addAttributeBtn = document.getElementById("addAttributeBtn");
const addActionBtn = document.getElementById("addActionBtn");

const backdrop = document.getElementById("backdrop");
const attrModal = document.getElementById("attrModal");
const actionModal = document.getElementById("actionModal");
const settingsModal = document.getElementById("settingsModal");

const attrName = document.getElementById("attrName");
const attrIcon = document.getElementById("attrIcon");
const saveAttrBtn = document.getElementById("saveAttrBtn");

const actionName = document.getElementById("actionName");
const actionType = document.getElementById("actionType");
const rewardsBuilder = document.getElementById("rewardsBuilder");
const addRewardRowBtn = document.getElementById("addRewardRowBtn");
const saveActionBtn = document.getElementById("saveActionBtn");

const openSettingsBtn = document.getElementById("openSettingsBtn");
const exportBtn = document.getElementById("exportBtn");
const saveToTelegramBtn = document.getElementById("saveToTelegramBtn");
const importBtn = document.getElementById("importBtn");
const wipeBtn = document.getElementById("wipeBtn");
const ioArea = document.getElementById("ioArea");
const resetDemoBtn = document.getElementById("resetDemoBtn");


// Scene elements
const attributeScene = document.getElementById("attributeScene");
const attributeActionsList = document.getElementById("attributeActionsList");
const backToMainBtn = document.getElementById("backToMainBtn");

const sceneTitle = document.getElementById("sceneTitle");
const sceneIcon = document.getElementById("sceneIcon");
const sceneName = document.getElementById("sceneName");
const sceneLevel = document.getElementById("sceneLevel");
const sceneProgressBar = document.getElementById("sceneProgressBar");
const sceneXpInLevel = document.getElementById("sceneXpInLevel");
const sceneXpTotal = document.getElementById("sceneXpTotal");

const radarCanvas = document.getElementById("radarCanvas");
const ctx = radarCanvas.getContext("2d");

// Telegram backup (copy to clipboard + open bot)
const TELEGRAM_BOT_USERNAME = "Jsonsaver_bot";


/** Modal helpers */
function openModal(modal){
  backdrop.classList.remove("hidden");
  modal.classList.remove("hidden");
}
function closeAllModals(){
  backdrop.classList.add("hidden");
  [attrModal, actionModal, settingsModal].forEach(m => m.classList.add("hidden"));
}
backdrop.addEventListener("click", closeAllModals);
document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", closeAllModals));

/** Rendering */
function render(){
  renderAttributes();
  renderActions();
  renderRadar();

  if(selectedAttributeId){
    renderAttributeScene();
  }
}

function renderAttributes(){
  attributesGrid.innerHTML = "";

  state.attributes.forEach(attr => {
    const prog = progressInLevel(attr.xp);

    const card = document.createElement("div");
    card.className = "attr-card";

    card.innerHTML = `
      <div class="attr-top">
        <div class="attr-icon">${escapeHtml(attr.icon || "✨")}</div>
        <div class="attr-level">Lv.${prog.level}</div>
      </div>
      <div class="attr-name">${escapeHtml(attr.name)}</div>
      <div class="progress"><div style="width:${Math.round(prog.pct*100)}%"></div></div>
      <div class="attr-xp">
        <span>${prog.inLevel} / ${prog.need}</span>
        <span>${attr.xp} XP</span>
      </div>
    `;

    card.style.cursor = "pointer";
    card.addEventListener("click", () => openAttributeScene(attr.id));

    attributesGrid.appendChild(card);
  });
}

function renderActions(){
  actionsList.innerHTML = "";

  const attrsById = Object.fromEntries(state.attributes.map(a => [a.id, a]));

  state.actions
    .filter(a => a.isActive)
    .forEach(action => {
      const rewardsText = action.rewards.map(r => {
        const at = attrsById[r.attributeId];
        if(!at) return "";
        return `${at.icon || "✨"} ${r.xp}xp`;
      }).filter(Boolean).join(" · ");

      const typeBadge = action.type === "daily"
        ? `<span class="badge badge--daily">daily</span>`
        : `<span class="badge badge--once">once</span>`;

      const isOnceDone = !!state.onceDone[action.id];
      const canDo = (action.type === "daily") || (action.type === "once" && !isOnceDone);

      const item = document.createElement("div");
      item.className = "action-item";

      item.innerHTML = `
        <div class="action-left">
          <div class="action-title">${escapeHtml(action.name)}</div>
          <div class="action-meta">
            ${typeBadge}
            <span class="badge">${escapeHtml(rewardsText || "нет наград")}</span>
            ${action.type === "once" && isOnceDone ? `<span class="badge">done</span>` : ""}
          </div>
        </div>
        <div class="action-buttons">
          <button class="small-btn" ${canDo ? "" : "disabled"} data-do="${action.id}">
            ${action.type === "daily" ? "+ XP" : (isOnceDone ? "Выполнено" : "Сделать")}
          </button>
          <button class="small-btn small-btn--ghost" data-del="${action.id}">Удалить</button>
        </div>
      `;

      actionsList.appendChild(item);
    });

  actionsList.querySelectorAll("[data-do]").forEach(btn => {
    btn.addEventListener("click", () => doAction(btn.getAttribute("data-do")));
  });
  actionsList.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => deleteAction(btn.getAttribute("data-del")));
  });
}


function openAttributeScene(attributeId){
  selectedAttributeId = attributeId;

  // hide main sections (radar, attributes, tasks)
  hideMainSections(true);

  // show scene
  attributeScene.classList.remove("hidden");

  renderAttributeScene();
}

function closeAttributeScene(){
  selectedAttributeId = null;

  attributeScene.classList.add("hidden");
  hideMainSections(false);
}

function hideMainSections(hide){
  const main = document.querySelector("main");
  const children = Array.from(main.children);

  children.forEach(el => {
    if(el.id === "attributeScene") return;
    if(hide) el.classList.add("hidden");
    else el.classList.remove("hidden");
  });
}

function renderAttributeScene(){
  const attr = state.attributes.find(a => a.id === selectedAttributeId);
  if(!attr) return;

  const prog = progressInLevel(attr.xp);

  sceneTitle.textContent = attr.name;
  sceneIcon.textContent = attr.icon || "✨";
  sceneName.textContent = attr.name;
  sceneLevel.textContent = `Lv.${prog.level}`;
  sceneProgressBar.style.width = `${Math.round(prog.pct*100)}%`;
  sceneXpInLevel.textContent = `${prog.inLevel} / ${prog.need}`;
  sceneXpTotal.textContent = `${attr.xp} XP`;

  renderActionsForAttribute(attr.id);
}

function renderActionsForAttribute(attributeId){
  attributeActionsList.innerHTML = "";

  const attrsById = Object.fromEntries(state.attributes.map(a => [a.id, a]));

  const actions = state.actions
    .filter(a => a.isActive)
    .filter(a => a.rewards.some(r => r.attributeId === attributeId));

  if(actions.length === 0){
    attributeActionsList.innerHTML = `
      <div class="card" style="padding:14px; color:var(--muted);">
        Нет действий для этого атрибута. Добавь действие и укажи награду для "${attrsById[attributeId]?.name || ""}".
      </div>
    `;
    return;
  }

  actions.forEach(action => {
    const rewardsText = action.rewards.map(r => {
      const at = attrsById[r.attributeId];
      if(!at) return "";
      return `${at.icon || "✨"} ${r.xp}xp`;
    }).filter(Boolean).join(" · ");

    const typeBadge = action.type === "daily"
      ? `<span class="badge badge--daily">daily</span>`
      : `<span class="badge badge--once">once</span>`;

    const isOnceDone = !!state.onceDone[action.id];
    const canDo = (action.type === "daily") || (action.type === "once" && !isOnceDone);

    const item = document.createElement("div");
    item.className = "action-item";

    item.innerHTML = `
      <div class="action-left">
        <div class="action-title">${escapeHtml(action.name)}</div>
        <div class="action-meta">
          ${typeBadge}
          <span class="badge">${escapeHtml(rewardsText || "нет наград")}</span>
          ${action.type === "once" && isOnceDone ? `<span class="badge">done</span>` : ""}
        </div>
      </div>
      <div class="action-buttons">
        <button class="small-btn" ${canDo ? "" : "disabled"} data-do="${action.id}">
          ${action.type === "daily" ? "+ XP" : (isOnceDone ? "Выполнено" : "Сделать")}
        </button>
      </div>
    `;

    attributeActionsList.appendChild(item);
  });

  attributeActionsList.querySelectorAll("[data-do]").forEach(btn => {
    btn.addEventListener("click", () => {
      doAction(btn.getAttribute("data-do"));
      renderAttributeScene();
    });
  });
}


/** Action execution */
function doAction(actionId){
  const action = state.actions.find(a => a.id === actionId);
  if(!action) return;

  if(action.type === "once" && state.onceDone[actionId]){
    return; // already done
  }

  // apply rewards to each attribute
  action.rewards.forEach(r => {
    const attr = state.attributes.find(a => a.id === r.attributeId);
    if(attr){
      attr.xp += Number(r.xp) || 0;
    }
  });

  // log
  state.logs.push({
    id: uid(),
    actionId,
    date: new Date().toISOString(),
    rewardsApplied: action.rewards.map(r => ({...r}))
  });

  // mark once
  if(action.type === "once"){
    state.onceDone[actionId] = true;
  }

  saveState();
  render();
}

function deleteAction(actionId){
  // soft delete
  const a = state.actions.find(x => x.id === actionId);
  if(!a) return;
  a.isActive = false;

  saveState();
  render();
}

/** HiDPI canvas setup (fixes blurry radar on retina screens) */
function setupCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  // Keep drawing coordinates in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height, dpr };
}

/** Radar chart (canvas) */

function renderRadar(){
  const { width: w, height: h } = setupCanvas(radarCanvas, ctx);
  ctx.imageSmoothingEnabled = true;

  // clear
  ctx.clearRect(0, 0, w, h);

  const attrs = state.attributes.slice(0, 8); // keep readable
  if(attrs.length < 3){
    drawCenteredText("Добавь 3+ атрибута", w/2, h/2);
    return;
  }

  const cx = w/2, cy = h/2 + 10;
  const radius = Math.min(w,h) * 0.33;

  // values = levels
  const levels = attrs.map(a => levelFromXp(a.xp));
  const maxLevel = Math.max(5, ...levels); // dynamic scale

  const spokes = attrs.length;
  const angleStep = (Math.PI * 2) / spokes;

  // grid rings
  ctx.save();
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1;

  const rings = 5;
  for(let r=1; r<=rings; r++){
    const rr = radius * (r / rings);
    drawPolygon(cx, cy, rr, spokes, -Math.PI/2);
  }

  // spokes lines
  for(let i=0;i<spokes;i++){
    const ang = -Math.PI/2 + i*angleStep;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius*Math.cos(ang), cy + radius*Math.sin(ang));
    ctx.stroke();
  }

  ctx.restore();

  // data polygon
  const points = [];
  for(let i=0;i<spokes;i++){
    const ang = -Math.PI/2 + i*angleStep;
    const v = levels[i] / maxLevel;
    const rr = radius * v;
    points.push([cx + rr*Math.cos(ang), cy + rr*Math.sin(ang)]);
  }

  // fill
  ctx.save();
  ctx.fillStyle = "rgba(59,130,246,0.22)";
  ctx.strokeStyle = "rgba(59,130,246,0.95)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  points.forEach((p, idx) => {
    if(idx === 0) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // labels around
  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = "12px system-ui";
  attrs.forEach((a, i) => {
    const ang = -Math.PI/2 + i*angleStep;
    const lx = cx + (radius + 40)*Math.cos(ang);
    const ly = cy + (radius + 40)*Math.sin(ang);

    const lvl = levelFromXp(a.xp);
    // icon
    ctx.font = "18px system-ui";
    ctx.fillText(a.icon || "✨", lx - 8, ly - 6);

    // name + level
    ctx.font = "11px system-ui";
    const name = truncate(a.name, 10);
    ctx.fillText(name, lx - 22, ly + 10);

    ctx.fillStyle = "#6B7280";
    ctx.font = "10px system-ui";
    ctx.fillText(`Lv.${lvl}`, lx - 16, ly + 24);

    ctx.fillStyle = "#111827";
  });

  ctx.restore();

  // title
  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = "bold 13px system-ui";
  ctx.fillText("", 14, 20);
  ctx.restore();
}

function drawPolygon(cx, cy, r, sides, rot){
  ctx.beginPath();
  for(let i=0;i<sides;i++){
    const ang = rot + (Math.PI*2*i)/sides;
    const x = cx + r*Math.cos(ang);
    const y = cy + r*Math.sin(ang);
    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawCenteredText(text, x, y){
  ctx.save();
  ctx.fillStyle = "#6b7280";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Add Attribute */
addAttributeBtn.addEventListener("click", () => {
  attrName.value = "";
  attrIcon.value = "";
  openModal(attrModal);
});

saveAttrBtn.addEventListener("click", () => {
  const name = attrName.value.trim();
  const icon = attrIcon.value.trim() || "✨";
  if(!name) return alert("Введите название атрибута");

  state.attributes.push({
    id: uid(),
    name,
    icon,
    xp: 0,
    createdAt: new Date().toISOString()
  });

  saveState();
  closeAllModals();
  render();
});

/** Add Action */
addActionBtn.addEventListener("click", () => {
  if(state.attributes.length === 0){
    alert("Сначала создай хотя бы один атрибут");
    return;
  }

  actionName.value = "";
  actionType.value = "daily";
  rewardsBuilder.innerHTML = "";
  addRewardRow(); // default row
  openModal(actionModal);
});

addRewardRowBtn.addEventListener("click", addRewardRow);

function addRewardRow(prefAttrId=null, prefXp=10){
  const row = document.createElement("div");
  row.className = "reward-row";

  const select = document.createElement("select");
  state.attributes.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.icon || "✨"} ${a.name}`;
    select.appendChild(opt);
  });
  if(prefAttrId) select.value = prefAttrId;

  const xpInput = document.createElement("input");
  xpInput.type = "number";
  xpInput.min = "0";
  xpInput.value = prefXp;

  const delBtn = document.createElement("button");
  delBtn.textContent = "🗑️";
  delBtn.addEventListener("click", () => row.remove());

  row.appendChild(select);
  row.appendChild(xpInput);
  row.appendChild(delBtn);

  rewardsBuilder.appendChild(row);
}

saveActionBtn.addEventListener("click", () => {
  const name = actionName.value.trim();
  if(!name) return alert("Введите название действия");

  const type = actionType.value;

  const rewards = [];
  rewardsBuilder.querySelectorAll(".reward-row").forEach(r => {
    const sel = r.querySelector("select");
    const inp = r.querySelector("input");
    const xp = Number(inp.value || 0);
    if(sel && xp > 0){
      rewards.push({ attributeId: sel.value, xp });
    }
  });

  if(rewards.length === 0){
    return alert("Добавь хотя бы одну награду (XP > 0)");
  }

  state.actions.push({
    id: uid(),
    name,
    type,
    isActive: true,
    createdAt: new Date().toISOString(),
    rewards
  });

  saveState();
  closeAllModals();
  render();
});

/** Settings */
openSettingsBtn.addEventListener("click", () => openModal(settingsModal));

exportBtn.addEventListener("click", () => {
  ioArea.value = JSON.stringify(state, null, 2);
});

saveToTelegramBtn.addEventListener("click", () => {
  saveToTelegram();
});


importBtn.addEventListener("click", () => {
  try{
    const raw = ioArea.value.trim();
    if(!raw) return alert("Вставь данные для импорта");

    // 1) Если это Telegram backup (RPG_BACKUP v1 + base64)
    if(raw.startsWith("RPG_BACKUP")){
      const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);

      // Ищем base64 строку (обычно 2-я строка)
      const b64 = lines.find(l => l !== "RPG_BACKUP v1" && !l.startsWith("("));
      if(!b64) throw new Error("Не найден base64 в бэкапе");

      // base64 -> json string (unicode-safe)
      const jsonStr = decodeURIComponent(escape(atob(b64)));

      const payload = JSON.parse(jsonStr);
      if(!payload || !payload.state) throw new Error("Неверная структура бэкапа");

      state = payload.state;
      saveState();
      render();
      alert("Импорт из Telegram успешен ✅");
      return;
    }

    // 2) Иначе пробуем как обычный JSON state
    const obj = JSON.parse(raw);
    if(!obj.attributes || !obj.actions) throw new Error("Неверная структура JSON");
    state = obj;

    saveState();
    render();
    alert("Импорт успешно ✅");
  }catch(e){
    alert("Ошибка импорта: " + e.message);
  }
});

wipeBtn.addEventListener("click", () => {
  if(confirm("Точно стереть всё?")){
    localStorage.removeItem(LS_KEY);
    state = loadState();
    render();
  }
});

backToMainBtn.addEventListener("click", closeAttributeScene);

resetDemoBtn.addEventListener("click", () => {
  if(confirm("Сбросить на демо данные?")){
    localStorage.removeItem(LS_KEY);
    state = loadState();
    render();
  }
});

function makeTelegramBackupText(){
  const payload = { v: 1, updatedAt: Date.now(), state };
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `RPG_BACKUP v1\n${b64}`;
}

function saveToTelegram(){
  const text = makeTelegramBackupText();
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).catch(()=>{});
  } else {
    try{ ioArea.value = text; }catch(e){}
  }
  const botUrl = `https://t.me/${TELEGRAM_BOT_USERNAME}`;
  window.open(botUrl, "_blank");
  alert("Бэкап скопирован ✅\nОткрой бота, вставь и отправь сообщение.\n\nДля восстановления: скопируй сообщение обратно и вставь в Импорт.");
}

/** Helpers */
function truncate(s, n){
  if(!s) return "";
  return s.length > n ? s.slice(0,n-1) + "…" : s;
}
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/** Init */
render();

/** Small mobile-friendly improvements */
window.addEventListener("resize", () => {
  // keep canvas crisp on resize if needed
  renderRadar();
});

// Prevent iOS double-tap zoom (extra надежность)
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });