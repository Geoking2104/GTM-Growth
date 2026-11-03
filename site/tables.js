/**
 * Table rendering for the free read.
 *
 * One renderer for two sources: rows measured by the server (`/api/free-read`)
 * and the illustrative rows shown before an API is connected. Sample tables are
 * always labelled — a number a visitor could mistake for their own is worse than
 * no number at all.
 */

const STATUS_LABEL = {
  pass: "pass",
  warn: "watch",
  fail: "fix",
  info: "info",
};

function cell(text, className) {
  const element = document.createElement("td");
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function buildTable(table, dict) {
  const figure = document.createElement("figure");
  figure.className = "data-figure";

  const header = document.createElement("figcaption");
  const title = document.createElement("h3");
  title.textContent = table.title;
  const subtitle = document.createElement("p");
  subtitle.className = "data-sub";
  subtitle.textContent = table.subtitle ?? "";
  header.append(title, subtitle);

  if (table.sample) {
    const badge = document.createElement("span");
    badge.className = "badge-sample";
    badge.textContent = dict.tables.sampleBadge;
    header.append(badge);
  }
  if (table.connected) {
    const badge = document.createElement("span");
    badge.className = "badge-live";
    badge.textContent = dict.tables.liveBadge;
    header.append(badge);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";
  const element = document.createElement("table");
  element.className = "data-table";

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of [dict.tables.colSignal, dict.tables.colValue, dict.tables.colStatus]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    headRow.append(th);
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  for (const row of table.rows) {
    const tr = document.createElement("tr");

    const labelCell = document.createElement("th");
    labelCell.scope = "row";
    labelCell.textContent = row.label;
    tr.append(labelCell, cell(row.value, "value"));

    const statusCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `pill status-${row.status}`;
    pill.textContent = dict.tables.statuses[row.status] ?? STATUS_LABEL[row.status] ?? row.status;
    statusCell.append(pill);
    tr.append(statusCell);

    if (row.note) {
      const noteRow = document.createElement("tr");
      noteRow.className = "note-row";
      const noteCell = document.createElement("td");
      noteCell.colSpan = 3;
      noteCell.textContent = row.note;
      noteRow.append(noteCell);
      body.append(tr, noteRow);
    } else {
      body.append(tr);
    }
  }

  element.append(head, body);
  wrapper.append(element);
  figure.append(header, wrapper);
  return figure;
}

/** Render every table into the container, replacing previous content. */
export function renderTables(container, tables, dict) {
  container.replaceChildren(...tables.map((table) => buildTable(table, dict)));
}

/**
 * Illustrative rows shown when no API is connected: they describe the shape of
 * the deliverable, and the badge says exactly that.
 */
export function sampleTables(dict) {
  return dict.tables.sample;
}
