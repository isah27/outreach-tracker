const STORAGE_KEY = "mos_prospect_tracker_v1";

const ANALYTICS_METRICS = [
  { key: "total", label: "Prospects", tone: "" },
  { key: "sent", label: "Reached out", tone: "info" },
  { key: "unsent", label: "Not sent", tone: "" },
  { key: "progress", label: "In progress", tone: "warn" },
  { key: "positive", label: "Positive", tone: "good" },
  { key: "negative", label: "Negative", tone: "bad" },
  { key: "responded", label: "Responded", tone: "good" },
  { key: "responseRate", label: "Response rate", tone: "info", suffix: "%" },
];

const ACTIVITY_TYPES = [
  { key: "outreach", label: "Outreach" },
  { key: "followup", label: "Follow-ups" },
  { key: "response", label: "Responses" },
];

function readProspects() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return Array.isArray(saved.prospects) ? saved.prospects : [];
  } catch {
    return [];
  }
}

function prospectBatch(prospect) {
  const number = Number(prospect.batch);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : 1;
}

function activityType(activity) {
  const type = String(activity.type || "")
    .trim()
    .toLowerCase();
  if (type === "follow-up") return "followup";
  if (type === "their response") return "response";
  return type;
}

function monthForTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: date.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    }),
  };
}

function collectAnalytics(prospects) {
  const sentProspects = prospects.filter((prospect) => !!prospect.outreachSent);
  const respondedProspects = prospects.filter((prospect) =>
    (Array.isArray(prospect.activity) ? prospect.activity : []).some(
      (activity) => activityType(activity) === "response",
    ),
  );
  const reachedOutResponded = respondedProspects.filter(
    (prospect) => !!prospect.outreachSent,
  );
  const metricValues = {
    total: prospects.length,
    sent: sentProspects.length,
    unsent: prospects.length - sentProspects.length,
    progress: prospects.filter((prospect) => prospect.status === "in_progress")
      .length,
    positive: prospects.filter((prospect) => prospect.status === "positive")
      .length,
    negative: prospects.filter((prospect) => prospect.status === "negative")
      .length,
    responded: respondedProspects.length,
    responseRate: sentProspects.length
      ? Math.round((reachedOutResponded.length / sentProspects.length) * 100)
      : 0,
  };

  const activityTotals = { outreach: 0, followup: 0, response: 0 };
  const months = new Map();
  prospects.forEach((prospect) => {
    (Array.isArray(prospect.activity) ? prospect.activity : []).forEach(
      (activity) => {
        const type = activityType(activity);
        if (!Object.hasOwn(activityTotals, type)) return;
        activityTotals[type] += 1;
        const month = monthForTimestamp(activity.timestamp);
        if (!month) return;
        if (!months.has(month.key)) {
          months.set(month.key, {
            key: month.key,
            label: month.label,
            outreach: 0,
            followup: 0,
            response: 0,
          });
        }
        months.get(month.key)[type] += 1;
      },
    );
  });

  return {
    metricValues,
    activityTotals,
    months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

function renderMetrics(metrics) {
  document.getElementById("analyticsMetrics").innerHTML = ANALYTICS_METRICS.map(
    (metric) => {
      const value = metrics[metric.key];
      return `<div class="stat ${metric.tone}">
        <div class="k">${metric.label}</div>
        <div class="v">${value}${metric.suffix || ""}</div>
      </div>`;
    },
  ).join("");
}

function renderActivity(activityTotals, months) {
  document.getElementById("activityTotals").innerHTML = ACTIVITY_TYPES.map(
    (type) => `<div class="activity-total">
      <span>${type.label}</span>
      <strong>${activityTotals[type.key]}</strong>
    </div>`,
  ).join("");

  const chart = document.getElementById("activityChart");
  if (!months.length) {
    chart.innerHTML = `<p class="analytics-empty">No dated outreach activity for this selection yet.</p>`;
    return;
  }

  const maxValue = Math.max(
    1,
    ...months.flatMap((month) => ACTIVITY_TYPES.map((type) => month[type.key])),
  );
  chart.innerHTML = months
    .slice()
    .reverse()
    .map(
      (month) => `<div class="activity-month">
        <div class="activity-month-label">${month.label}</div>
        <div class="activity-series">
          ${ACTIVITY_TYPES.map((type) => {
            const count = month[type.key];
            const width = count ? Math.max(3, (count / maxValue) * 100) : 0;
            return `<div class="activity-series-item">
              <span class="activity-series-label">${type.label}</span>
              <div class="activity-track"><div class="activity-bar ${type.key}" style="width:${width}%"></div></div>
              <strong>${count}</strong>
            </div>`;
          }).join("")}
        </div>
      </div>`,
    )
    .join("");
}

function renderAnalytics() {
  const prospects = readProspects();
  const batchSelect = document.getElementById("analyticsBatch");
  const currentBatch = batchSelect.value || "all";
  const batches = [...new Set(prospects.map(prospectBatch))].sort(
    (a, b) => a - b,
  );
  batchSelect.innerHTML = [
    `<option value="all">All batches</option>`,
    ...batches.map(
      (batch) => `<option value="${batch}">Batch ${batch}</option>`,
    ),
  ].join("");
  batchSelect.value =
    currentBatch === "all" ||
    batches.some((batch) => String(batch) === currentBatch)
      ? currentBatch
      : "all";

  const selectedProspects =
    batchSelect.value === "all"
      ? prospects
      : prospects.filter(
          (prospect) => prospectBatch(prospect) === Number(batchSelect.value),
        );
  const { metricValues, activityTotals, months } =
    collectAnalytics(selectedProspects);
  document.getElementById("analyticsScope").textContent =
    batchSelect.value === "all" ? "All batches" : `Batch ${batchSelect.value}`;
  renderMetrics(metricValues);
  renderActivity(activityTotals, months);
}

document
  .getElementById("analyticsBatch")
  .addEventListener("change", renderAnalytics);
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) renderAnalytics();
});

renderAnalytics();
