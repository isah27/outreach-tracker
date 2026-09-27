const STORAGE_KEY = "mos_prospect_tracker_v1";

const STATUS_LABEL = {
  not_contacted: "Not contacted",
  in_progress: "In progress",
  positive: "Positive",
  negative: "Negative",
};

const STATUS_FROM_LABEL = {
  "not contacted": "not_contacted",
  not_contacted: "not_contacted",
  "in progress": "in_progress",
  in_progress: "in_progress",
  positive: "positive",
  negative: "negative",
};

function nowISO() {
  return new Date().toISOString();
}

function uid() {
  try {
    if (globalThis.crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* file:// pages are not a secure context */
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emptyState() {
  return { prospects: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.prospects)) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

let state = loadState();
let selectedId = null;
let pendingImport = null;
let filters = {
  q: "",
  niche: "all",
  status: "all",
  outreach: "all",
  confidence: "all",
};

let toastTimer = null;
function toast(msg, duration = 2400) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), duration);
}

function getSelected() {
  return state.prospects.find((p) => p.id === selectedId) || null;
}

function updateProspect(id, patch, activityItem) {
  state.prospects = state.prospects.map((p) => {
    if (p.id !== id) return p;
    const next = { ...p, ...patch, updatedAt: nowISO() };
    if (activityItem) next.activity = [activityItem, ...(p.activity || [])];
    return next;
  });
  saveState();
}

function addActivity(id, type, content) {
  if (!content || !content.trim()) {
    toast("Write something first.");
    return;
  }
  const item = {
    id: uid(),
    type,
    content: content.trim(),
    timestamp: nowISO(),
  };
  const extra = {};
  if (type === "outreach") extra.outreachSent = true;
  const p = state.prospects.find((x) => x.id === id);
  if (type === "outreach" && p && p.status === "not_contacted") {
    extra.status = "in_progress";
    extra.statusUpdatedAt = nowISO();
  }
  updateProspect(id, extra, item);
  toast("Saved.");
}

function setStatus(id, status) {
  const p = state.prospects.find((x) => x.id === id);
  if (!p || p.status === status) return;
  const item = {
    id: uid(),
    type: "status",
    content: `Status changed: ${STATUS_LABEL[p.status]} → ${STATUS_LABEL[status]}`,
    timestamp: nowISO(),
  };
  updateProspect(id, { status, statusUpdatedAt: nowISO() }, item);
}

function deleteActivity(pid, aid) {
  state.prospects = state.prospects.map((p) => {
    if (p.id !== pid) return p;
    return {
      ...p,
      activity: (p.activity || []).filter((a) => a.id !== aid),
      updatedAt: nowISO(),
    };
  });
  saveState();
}

function deleteProspect(id) {
  const p = state.prospects.find((x) => x.id === id);
  if (!p) return;
  const label = p.handle ? `@${p.handle}` : p.name || "this prospect";
  if (
    !confirm(
      `Delete ${label}? Their outreach, follow-ups, and replies on this browser will be removed. This cannot be undone.`,
    )
  ) {
    return;
  }
  state.prospects = state.prospects.filter((x) => x.id !== id);
  if (selectedId === id) selectedId = null;
  saveState();
  closeDrawer();
  toast(`${label} deleted.`);
}

function filtered() {
  const q = filters.q.trim().toLowerCase();
  const items = state.prospects.filter((p) => {
    if (filters.niche !== "all" && p.niche !== filters.niche) return false;
    if (filters.status !== "all" && p.status !== filters.status) return false;
    if (filters.outreach === "sent" && !p.outreachSent) return false;
    if (filters.outreach === "unsent" && p.outreachSent) return false;
    if (filters.confidence !== "all" && p.confidence !== filters.confidence)
      return false;
    if (!q) return true;
    const blob = [
      p.handle,
      p.name,
      p.specialty,
      p.mosAngle,
      p.email,
      p.notes,
      String(p.id),
    ]
      .join(" ")
      .toLowerCase();
    return blob.includes(q);
  });
  return items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function counts() {
  const all = state.prospects;
  return {
    total: all.length,
    sent: all.filter((p) => p.outreachSent).length,
    unsent: all.filter((p) => !p.outreachSent).length,
    progress: all.filter((p) => p.status === "in_progress").length,
    positive: all.filter((p) => p.status === "positive").length,
    negative: all.filter((p) => p.status === "negative").length,
  };
}

function typeLabel(t) {
  return (
    {
      outreach: "Outreach",
      followup: "Follow-up",
      response: "Their response",
      note: "Note",
      status: "Status",
    }[t] || t
  );
}

const TYPE_FROM_LABEL = {
  outreach: "outreach",
  "follow-up": "followup",
  followup: "followup",
  "their response": "response",
  response: "response",
  note: "note",
  status: "status",
};

function normalizeType(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  return TYPE_FROM_LABEL[key] || raw || "note";
}

function typeBadgeClass(t) {
  if (t === "response") return "positive";
  if (t === "outreach") return "sent";
  if (t === "followup") return "in_progress";
  if (t === "status") return "Micro";
  return "Micro";
}

function renderStats() {
  const c = counts();
  document.getElementById("stats").innerHTML = `
    <div class="stat"><div class="k">Prospects</div><div class="v">${c.total}</div></div>
    <div class="stat info"><div class="k">Reached out</div><div class="v">${c.sent}</div></div>
    <div class="stat"><div class="k">Not sent</div><div class="v">${c.unsent}</div></div>
    <div class="stat warn"><div class="k">In progress</div><div class="v">${c.progress}</div></div>
    <div class="stat good"><div class="k">Positive</div><div class="v">${c.positive}</div></div>
    <div class="stat bad"><div class="k">Negative</div><div class="v">${c.negative}</div></div>
  `;
}

function renderTable() {
  const rows = filtered();
  const body = document.getElementById("tbody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty">${state.prospects.length ? "No prospects match these filters." : "No prospects yet. Add one or import an Excel file."}</div></td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (p) => `
    <tr data-id="${p.id}" class="${p.id === selectedId ? "active" : ""}">
      <td class="mono">#${p.id}</td>
      <td>
        <div class="handle">@${p.handle}</div>
        <span>${p.name}</span>
      </td>
      <td><span class="badge ${p.niche}">${p.niche}</span></td>
      <td class="hide-sm">${p.followers} · ${p.size}</td>
      <td><span class="badge ${p.confidence}">${p.confidence}</span></td>
      <td><span class="badge ${p.outreachSent ? "sent" : "unsent"}">${p.outreachSent ? "Sent" : "Not sent"}</span></td>
      <td><span class="badge ${p.status}">${STATUS_LABEL[p.status]}</span></td>
      <td class="hide-sm" style="color:var(--faint);font-size:12px">${fmt(p.updatedAt)}</td>
    </tr>
  `,
    )
    .join("");
  body.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => openDrawer(Number(tr.dataset.id)));
  });
}

function openDrawer(id) {
  selectedId = id;
  document.getElementById("backdrop").classList.add("show");
  document.getElementById("drawer").classList.add("show");
  renderDrawer();
  renderTable();
}

function closeDrawer() {
  selectedId = null;
  document.getElementById("backdrop").classList.remove("show");
  document.getElementById("drawer").classList.remove("show");
  renderTable();
}

function renderDrawer() {
  const p = getSelected();
  const root = document.getElementById("drawer");
  if (!p) return;
  const acts = (p.activity || [])
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  root.innerHTML = `
    <div class="drawer-head">
      <div class="drawer-head-row">
        <div>
          <h2>#${p.id} · @${p.handle}</h2>
          <div class="sub">${p.name} · <a href="${p.url}" target="_blank" rel="noopener" style="color:var(--accent)">${p.url.replace("https://www.instagram.com/", "ig/")}</a></div>
        </div>
        <div class="drawer-actions">
          <button type="button" class="ghost" id="editProspectBtn">Edit</button>
          <button type="button" class="ghost danger" id="deleteProspectBtn">Delete</button>
          <button type="button" class="ghost" id="closeDrawer">Close</button>
        </div>
      </div>
    </div>
    <div class="drawer-body">
      <div class="meta-grid">
        <div class="meta"><div class="k">Niche</div><div class="v">${p.niche}</div></div>
        <div class="meta"><div class="k">Followers</div><div class="v">${p.followers} · ${p.size}</div></div>
        <div class="meta"><div class="k">Confidence</div><div class="v">${p.confidence}</div></div>
        <div class="meta"><div class="k">Email</div><div class="v">${p.email || "—"}</div></div>
        <div class="meta"><div class="k">Created</div><div class="v">${fmt(p.createdAt)}</div></div>
        <div class="meta"><div class="k">Updated</div><div class="v">${fmt(p.updatedAt)}</div></div>
        <div class="meta"><div class="k">Status changed</div><div class="v">${fmt(p.statusUpdatedAt)}</div></div>
        <div class="meta"><div class="k">Outreach</div><div class="v">${p.outreachSent ? "Sent" : "Not sent"}</div></div>
      </div>

      ${p.specialty ? `<div class="block"><h3>Specialty</h3><p>${escapeHtml(p.specialty)}</p></div>` : ""}
      ${p.whyFits ? `<div class="block"><h3>Why they fit</h3><p>${escapeHtml(p.whyFits)}</p></div>` : ""}
      ${p.noPaidOffer ? `<div class="block"><h3>Offers / monetization</h3><p>${escapeHtml(p.noPaidOffer)}</p></div>` : ""}
      ${p.mosAngle ? `<div class="block"><h3>Offer angle</h3><p>${escapeHtml(p.mosAngle)}</p></div>` : ""}
      ${p.notes ? `<div class="block"><h3>Notes</h3><p>${escapeHtml(p.notes)}</p></div>` : ""}

      <div class="block">
        <h3>Deal status</h3>
        <select class="field" id="statusSelect">
          <option value="not_contacted">Not contacted</option>
          <option value="in_progress">In progress</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
        </select>
      </div>

      <div class="block">
        <h3>Log outreach message</h3>
        <textarea id="outreachText" placeholder="Paste the first message you sent this prospect..."></textarea>
        <div class="row-actions"><button class="primary" id="saveOutreach">Save outreach</button></div>
      </div>

      <div class="block">
        <h3>Log follow-up</h3>
        <textarea id="followupText" placeholder="Follow-up you sent..."></textarea>
        <div class="row-actions"><button id="saveFollowup">Save follow-up</button></div>
      </div>

      <div class="block">
        <h3>Log their response</h3>
        <textarea id="responseText" placeholder="What they replied..."></textarea>
        <div class="row-actions"><button id="saveResponse">Save response</button></div>
      </div>

      <div class="block">
        <h3>Internal note</h3>
        <textarea id="noteText" placeholder="Anything else to remember..."></textarea>
        <div class="row-actions"><button id="saveNote">Save note</button></div>
      </div>

      <div class="block">
        <h3>Activity log (${acts.length})</h3>
        <ul class="activity">
          ${
            acts.length
              ? acts
                  .map(
                    (a) => `
            <li>
              <div class="top">
                <span class="badge ${typeBadgeClass(a.type)}">${typeLabel(a.type)}</span>
                <span class="when">${fmt(a.timestamp)} <button class="del" data-aid="${a.id}">delete</button></span>
              </div>
              <div class="body">${escapeHtml(a.content)}</div>
            </li>
          `,
                  )
                  .join("")
              : `<li style="color:var(--muted)">No activity yet.</li>`
          }
        </ul>
      </div>
    </div>
  `;
  root.querySelector("#closeDrawer").onclick = closeDrawer;
  root.querySelector("#editProspectBtn").onclick = () => openProspectForm(p.id);
  root.querySelector("#deleteProspectBtn").onclick = () => deleteProspect(p.id);
  const sel = root.querySelector("#statusSelect");
  sel.value = p.status;
  sel.onchange = () => setStatus(p.id, sel.value);
  root.querySelector("#saveOutreach").onclick = () => {
    addActivity(
      p.id,
      "outreach",
      document.getElementById("outreachText").value,
    );
    renderDrawer();
  };
  root.querySelector("#saveFollowup").onclick = () => {
    addActivity(
      p.id,
      "followup",
      document.getElementById("followupText").value,
    );
    renderDrawer();
  };
  root.querySelector("#saveResponse").onclick = () => {
    addActivity(
      p.id,
      "response",
      document.getElementById("responseText").value,
    );
    renderDrawer();
  };
  root.querySelector("#saveNote").onclick = () => {
    addActivity(p.id, "note", document.getElementById("noteText").value);
    renderDrawer();
  };
  root.querySelectorAll(".del").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      deleteActivity(p.id, btn.dataset.aid);
      renderDrawer();
    };
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function exportExcel() {
  const prospects = state.prospects;
  const sheet1 = prospects.map((p) => ({
    "#": p.id,
    Handle: "@" + p.handle,
    Name: p.name,
    Niche: p.niche,
    Specialty: p.specialty,
    Followers: p.followers,
    Size: p.size,
    Instagram: p.url,
    Email: p.email || "",
    Confidence: p.confidence,
    "Outreach sent": p.outreachSent ? "Yes" : "No",
    Status: STATUS_LABEL[p.status],
    "Why they fit": p.whyFits,
    "Offers / monetization": p.noPaidOffer,
    "Offer angle": p.mosAngle,
    Notes: p.notes || "",
    Created: fmt(p.createdAt),
    Updated: fmt(p.updatedAt),
    "Status updated": fmt(p.statusUpdatedAt),
    "Created ISO": p.createdAt || "",
    "Updated ISO": p.updatedAt || "",
    "Status updated ISO": p.statusUpdatedAt || "",
    "Latest outreach": latestOf(p, "outreach"),
    "Latest follow-up": latestOf(p, "followup"),
    "Latest response": latestOf(p, "response"),
  }));

  const sheet2 = [];
  prospects.forEach((p) => {
    (p.activity || []).forEach((a) => {
      sheet2.push({
        "#": p.id,
        Handle: "@" + p.handle,
        Name: p.name,
        Type: typeLabel(a.type),
        Content: a.content,
        Timestamp: fmt(a.timestamp),
        "ISO time": a.timestamp,
        "Activity id": a.id,
      });
    });
  });
  sheet2.sort((a, b) => new Date(b["ISO time"]) - new Date(a["ISO time"]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(sheet1),
    "Prospects",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(sheet2),
    "Activity",
  );
  const stamp = fileStamp();
  XLSX.writeFile(wb, `prospects-${stamp}.xlsx`);
  toast("Excel downloaded.");
}

function fileStamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function latestOf(p, type) {
  const hit = (p.activity || [])
    .filter((a) => a.type === type)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  return hit ? `${fmt(hit.timestamp)} — ${hit.content}` : "";
}

function resetData() {
  if (
    !confirm(
      "Clear all prospects and activity on this browser? This cannot be undone.",
    )
  )
    return;
  localStorage.removeItem(STORAGE_KEY);
  state = emptyState();
  selectedId = null;
  saveState();
  closeDrawer();
  toast("All local data cleared.");
}

function pick(item, keys) {
  for (const key of keys) {
    const value = item[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function toISO(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const utc = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(utc.getTime())) return utc.toISOString();
  }
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return "";
}

function asBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "yes" || text === "true" || text === "1" || text === "sent";
}

function normalizeStatus(value, outreachSent) {
  const key = String(value || "").trim().toLowerCase();
  if (STATUS_FROM_LABEL[key]) return STATUS_FROM_LABEL[key];
  return outreachSent ? "in_progress" : "not_contacted";
}

function importedList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.prospects)) return raw.prospects;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.items)) return raw.items;
  if (raw.handle || raw.Handle || raw.name || raw.Name || raw.username) return [raw];
  return [];
}

function normalizeActivity(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: item.id || item["Activity id"] ? String(item.id || item["Activity id"]) : uid(),
      type: normalizeType(item.type || item.Type),
      content: String(item.content || item.Content || ""),
      timestamp: toISO(item.timestamp || item["ISO time"] || item.Timestamp) || nowISO(),
    }));
}

function normalizeImported(raw) {
  const list = importedList(raw);
  const ts = nowISO();
  const used = new Set();
  let nextId = 0;
  const prospects = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const directHandle = pick(item, ["handle", "Handle", "username"]);
    const link = pick(item, ["Instagram", "instagram", "url", "profile"]);
    const handle = parseHandle(
      directHandle ||
        (/instagram\.com/i.test(link) || /^@?[A-Za-z0-9._]+$/.test(link) ? link : ""),
    );
    const name = pick(item, ["name", "Name"]);
    if (!handle && !name) return;
    const outreachSent = asBool(
      item.outreachSent ?? item.outreach_sent ?? item["Outreach sent"] ?? item.outreach,
    );
    const explicitUrl = pick(item, ["url", "Instagram", "instagram", "profile"]);
    const url = /^https?:\/\//i.test(explicitUrl)
      ? explicitUrl
      : profileUrlFromHandle(handle);
    let id = Number(item.id ?? item["#"]);
    if (!Number.isFinite(id) || id <= 0 || used.has(id)) {
      id = Math.max(nextId, i) + 1;
      while (used.has(id)) id += 1;
    }
    used.add(id);
    if (id > nextId) nextId = id;
    prospects.push({
      id,
      handle,
      name,
      niche: pick(item, ["niche", "Niche"]),
      specialty: pick(item, ["specialty", "Specialty"]),
      followers: pick(item, ["followers", "Followers"]),
      size: pick(item, ["size", "Size"]),
      url,
      whyFits: pick(item, ["whyFits", "why_fits", "Why they fit"]),
      noPaidOffer: pick(item, ["noPaidOffer", "Offers / monetization", "monetization"]),
      mosAngle: pick(item, ["mosAngle", "angle", "Offer angle"]),
      confidence: pick(item, ["confidence", "Confidence"]),
      email: pick(item, ["email", "Email"]),
      notes: pick(item, ["notes", "Notes"]),
      outreachSent,
      status: normalizeStatus(pick(item, ["status", "Status"]), outreachSent),
      createdAt: toISO(item.createdAt || item["Created ISO"] || item.Created) || ts,
      updatedAt: toISO(item.updatedAt || item["Updated ISO"] || item.Updated) || ts,
      statusUpdatedAt:
        toISO(item.statusUpdatedAt || item["Status updated ISO"] || item["Status updated"]) || ts,
      activity: normalizeActivity(item.activity),
    });
  });
  return prospects;
}

function prospectKey(p) {
  if (p.handle) return `h:${p.handle.toLowerCase()}`;
  return `n:${String(p.name || "").toLowerCase()}`;
}

function closeImportDialog() {
  pendingImport = null;
  const backdrop = document.getElementById("importBackdrop");
  if (backdrop) backdrop.hidden = true;
}

function applyImported(incoming, mode) {
  if (mode === "replace") {
    selectedId = null;
    document.getElementById("backdrop").classList.remove("show");
    document.getElementById("drawer").classList.remove("show");
    state.prospects = incoming;
    saveState();
    toast(`Imported ${incoming.length} prospect${incoming.length === 1 ? "" : "s"}.`);
    return;
  }
  const existing = new Set(state.prospects.map(prospectKey));
  let nextId = state.prospects.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0);
  let added = 0;
  incoming.forEach((p) => {
    const key = prospectKey(p);
    if (existing.has(key)) return;
    nextId += 1;
    state.prospects.push({ ...p, id: nextId });
    existing.add(key);
    added += 1;
  });
  saveState();
  toast(
    added
      ? `Added ${added} prospect${added === 1 ? "" : "s"}.`
      : "Those prospects are already in the list.",
  );
}

function readFileBuffer(file) {
  if (file && typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsArrayBuffer(file);
  });
}

function sheetByName(wb, name) {
  const found = (wb.SheetNames || []).find((n) => String(n).toLowerCase() === name.toLowerCase());
  return found ? wb.Sheets[found] : null;
}

function sheetRows(sheet) {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function uniqueActivity(lists) {
  const seen = new Set();
  const out = [];
  lists.flat().forEach((item) => {
    if (!item) return;
    const key = [item.id, item.type, item.timestamp, item.content].join("\u0000");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

function workbookToProspects(wb) {
  const prospectSheet =
    sheetByName(wb, "Prospects") || (wb.SheetNames[0] && wb.Sheets[wb.SheetNames[0]]);
  const rows = sheetRows(prospectSheet);
  const grouped = new Map();
  sheetRows(sheetByName(wb, "Activity")).forEach((row) => {
    const idKey = String(row["#"] ?? "").replace(/^#/, "").trim();
    const handleKey = parseHandle(row.Handle || row.handle || "").toLowerCase();
    const entry = {
      id: row["Activity id"] || "",
      type: row.Type || row.type || "note",
      content: row.Content || row.content || "",
      timestamp: row["ISO time"] || row.Timestamp || row.timestamp || "",
    };
    [idKey ? `id:${idKey}` : "", handleKey ? `h:${handleKey}` : ""]
      .filter(Boolean)
      .forEach((key) => {
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(entry);
      });
  });
  rows.forEach((row) => {
    const idKey = String(row["#"] ?? row.id ?? "").replace(/^#/, "").trim();
    const handleKey = parseHandle(row.Handle || row.handle || "").toLowerCase();
    row.activity = uniqueActivity([
      idKey ? grouped.get(`id:${idKey}`) : [],
      handleKey ? grouped.get(`h:${handleKey}`) : [],
    ]);
    row.createdAt = row["Created ISO"] || row.createdAt || row.Created || "";
    row.updatedAt = row["Updated ISO"] || row.updatedAt || row.Updated || "";
    row.statusUpdatedAt =
      row["Status updated ISO"] || row.statusUpdatedAt || row["Status updated"] || "";
  });
  return normalizeImported(rows);
}

function importExcelBuffer(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    toast("That file is not an Excel workbook.");
    return;
  }
  let incoming;
  try {
    incoming = workbookToProspects(wb);
  } catch {
    toast("Could not read the prospects in that file.");
    return;
  }
  if (!incoming.length) {
    toast("No prospects found in that workbook.");
    return;
  }
  if (!state.prospects.length) {
    applyImported(incoming, "replace");
    return;
  }
  pendingImport = incoming;
  const count = incoming.length;
  document.getElementById("importSummary").textContent =
    `This workbook has ${count} prospect${count === 1 ? "" : "s"}. You already have ${state.prospects.length}. Replace the current list, or merge and skip people who are already here.`;
  document.getElementById("importBackdrop").hidden = false;
}

function parseHandle(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const cleaned = value.replace(/^@/, "");
  const match = cleaned.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i,
  );
  if (match) return match[1];
  return cleaned.replace(/\/+$/, "").split(/[/?#\s]/)[0];
}

function profileUrlFromHandle(handle) {
  return handle ? `https://www.instagram.com/${handle}/` : "";
}

function updateUrlPreview() {
  const preview = document.getElementById("urlPreview");
  const handle = parseHandle(document.getElementById("fHandle").value);
  if (!handle) {
    preview.textContent = "Profile URL will appear from the handle";
    preview.classList.add("empty");
    return;
  }
  preview.textContent = profileUrlFromHandle(handle);
  preview.classList.remove("empty");
}

function formEl() {
  return document.getElementById("prospectForm");
}

function openProspectForm(editId) {
  const form = formEl();
  form.reset();
  form.elements.id.value = "";
  document.getElementById("formTitle").textContent = editId
    ? "Edit prospect"
    : "Add prospect";
  document.getElementById("saveFormBtn").textContent = editId
    ? "Save changes"
    : "Save prospect";
  if (editId) {
    const p = state.prospects.find((x) => x.id === editId);
    if (!p) return;
    form.elements.id.value = String(p.id);
    form.elements.handle.value = p.handle || "";
    form.elements.name.value = p.name || "";
    form.elements.niche.value = p.niche || "";
    form.elements.email.value = p.email || "";
    form.elements.specialty.value = p.specialty || "";
    form.elements.followers.value = p.followers || "";
    form.elements.size.value = p.size || "";
    form.elements.confidence.value = p.confidence || "";
    form.elements.status.value = p.status || "not_contacted";
    form.elements.outreachSent.checked = !!p.outreachSent;
    form.elements.whyFits.value = p.whyFits || "";
    form.elements.noPaidOffer.value = p.noPaidOffer || "";
    form.elements.mosAngle.value = p.mosAngle || "";
    form.elements.notes.value = p.notes || "";
  } else {
    form.elements.status.value = "not_contacted";
  }
  updateUrlPreview();
  document.getElementById("formBackdrop").hidden = false;
  form.elements.handle.focus();
}

function closeProspectForm() {
  document.getElementById("formBackdrop").hidden = true;
}

function readForm() {
  const form = formEl();
  const handle = parseHandle(form.elements.handle.value);
  const name = form.elements.name.value.trim();
  const niche = form.elements.niche.value.trim();
  ["fHandle", "fName", "fNiche"].forEach((id) =>
    document.getElementById(id).classList.remove("error"),
  );
  let ok = true;
  if (!handle) {
    document.getElementById("fHandle").classList.add("error");
    ok = false;
  }
  if (!name) {
    document.getElementById("fName").classList.add("error");
    ok = false;
  }
  if (!niche) {
    document.getElementById("fNiche").classList.add("error");
    ok = false;
  }
  if (!ok) {
    toast("Fill in the required fields.");
    return null;
  }
  const url = profileUrlFromHandle(handle);
  form.elements.handle.value = handle;
  return {
    handle,
    name,
    niche,
    url,
    email: form.elements.email.value.trim(),
    specialty: form.elements.specialty.value.trim(),
    followers: form.elements.followers.value.trim(),
    size: form.elements.size.value,
    confidence: form.elements.confidence.value,
    status: form.elements.status.value || "not_contacted",
    outreachSent: form.elements.outreachSent.checked,
    whyFits: form.elements.whyFits.value.trim(),
    noPaidOffer: form.elements.noPaidOffer.value.trim(),
    mosAngle: form.elements.mosAngle.value.trim(),
    notes: form.elements.notes.value.trim(),
  };
}

function submitProspectForm(e) {
  e.preventDefault();
  const data = readForm();
  if (!data) return;
  const form = formEl();
  const existingId = form.elements.id.value
    ? Number(form.elements.id.value)
    : null;
  const ts = nowISO();

  if (existingId) {
    const prev = state.prospects.find((p) => p.id === existingId);
    const activity = [];
    if (prev && prev.status !== data.status) {
      activity.push({
        id: uid(),
        type: "status",
        content: `Status changed: ${STATUS_LABEL[prev.status]} → ${STATUS_LABEL[data.status]}`,
        timestamp: ts,
      });
    }
    if (prev && prev.outreachSent !== data.outreachSent) {
      activity.push({
        id: uid(),
        type: "status",
        content: data.outreachSent
          ? "Marked outreach as sent."
          : "Marked outreach as not sent.",
        timestamp: ts,
      });
    }
    activity.push({
      id: uid(),
      type: "note",
      content: "Prospect details updated.",
      timestamp: ts,
    });
    state.prospects = state.prospects.map((p) => {
      if (p.id !== existingId) return p;
      return {
        ...p,
        ...data,
        updatedAt: ts,
        statusUpdatedAt:
          prev && prev.status !== data.status ? ts : p.statusUpdatedAt,
        activity: [...activity, ...(p.activity || [])],
      };
    });
    saveState();
    closeProspectForm();
    toast("Prospect updated.");
    openDrawer(existingId);
    return;
  }

  const nextId = Math.max(0, ...state.prospects.map((p) => p.id)) + 1;
  const p = {
    id: nextId,
    ...data,
    createdAt: ts,
    updatedAt: ts,
    statusUpdatedAt: ts,
    activity: [
      {
        id: uid(),
        type: "status",
        content: "Prospect added.",
        timestamp: ts,
      },
    ],
  };
  state.prospects.push(p);
  saveState();
  closeProspectForm();
  toast("Prospect added.");
  openDrawer(p.id);
}

function renderNicheFilter() {
  const sel = document.getElementById("niche");
  const current = filters.niche;
  const niches = [
    ...new Set(state.prospects.map((p) => p.niche).filter(Boolean)),
  ].sort();
  sel.innerHTML =
    `<option value="all">All niches</option>` +
    niches
      .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
      .join("");
  sel.value = niches.includes(current) || current === "all" ? current : "all";
  filters.niche = sel.value;
}

function render() {
  renderStats();
  renderNicheFilter();
  renderTable();
  if (selectedId) renderDrawer();
}

function bind() {
  document.getElementById("q").addEventListener("input", (e) => {
    filters.q = e.target.value;
    render();
  });
  document.getElementById("niche").addEventListener("change", (e) => {
    filters.niche = e.target.value;
    render();
  });
  document.getElementById("status").addEventListener("change", (e) => {
    filters.status = e.target.value;
    render();
  });
  document.getElementById("outreach").addEventListener("change", (e) => {
    filters.outreach = e.target.value;
    render();
  });
  document.getElementById("confidence").addEventListener("change", (e) => {
    filters.confidence = e.target.value;
    render();
  });
  document.getElementById("exportBtn").onclick = exportExcel;
  document.getElementById("resetBtn").onclick = resetData;
  document.getElementById("importFile").addEventListener("change", async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;
    let buffer;
    try {
      buffer = await readFileBuffer(file);
    } catch {
      input.value = "";
      toast("Could not read that file.");
      return;
    }
    input.value = "";
    importExcelBuffer(buffer);
  });
  document.getElementById("importReplaceBtn").onclick = () => {
    const incoming = pendingImport;
    closeImportDialog();
    if (incoming) applyImported(incoming, "replace");
  };
  document.getElementById("importMergeBtn").onclick = () => {
    const incoming = pendingImport;
    closeImportDialog();
    if (incoming) applyImported(incoming, "merge");
  };
  document.getElementById("importCancelBtn").onclick = closeImportDialog;
  document.getElementById("importDismissBtn").onclick = closeImportDialog;
  document.getElementById("importBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "importBackdrop") closeImportDialog();
  });
  document.getElementById("addBtn").onclick = () => openProspectForm(null);
  document.getElementById("backdrop").onclick = closeDrawer;
  document.getElementById("closeFormBtn").onclick = closeProspectForm;
  document.getElementById("cancelFormBtn").onclick = closeProspectForm;
  document.getElementById("formBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "formBackdrop") closeProspectForm();
  });
  document
    .getElementById("prospectForm")
    .addEventListener("submit", submitProspectForm);
  document
    .getElementById("fHandle")
    .addEventListener("input", updateUrlPreview);
  document.getElementById("fHandle").addEventListener("blur", () => {
    const handle = parseHandle(document.getElementById("fHandle").value);
    if (handle) document.getElementById("fHandle").value = handle;
    updateUrlPreview();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!document.getElementById("importBackdrop").hidden) {
      closeImportDialog();
      return;
    }
    if (!document.getElementById("formBackdrop").hidden) closeProspectForm();
  });
}

bind();
render();
