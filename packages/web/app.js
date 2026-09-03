import { LineageGraphView, KIND_META } from './dist/graph-view.js';
import { downloadGraphPdf } from './dist/pdf-export.js';

const $ = (id) => document.getElementById(id);

let graphView = null;
let currentNode = null;
let currentLineage = null;
let currentVisibleLineage = null;
let activePathIds = null;
let pinnedPathIds = null;
let showAllEnabled = false;
let cachedPaths = { upstream: [], downstream: [] };
const symbolIndex = new Map();
const edgeIndex = new Map();
let appConfig = { sourceRoot: '', editorScheme: 'vscode' };

function viewMode() {
  const mode = $('viewMode').value;
  if (mode === 'path' || mode === 'sequence') return mode;
  return 'clustered';
}

function updateViewModeControls() {
  const sequence = viewMode() === 'sequence';
  $('showAllBtn').hidden = sequence;
  $('hideLeafHelpers').closest('label').hidden = sequence;
}

function sequenceStepCount(seq) {
  if (!seq?.segments) return 0;
  return seq.segments.reduce((sum, segment) => sum + segment.messages.length, 0);
}

function adjacencyFor(edges) {
  const forward = new Map();
  const reverse = new Map();
  for (const edge of edges ?? []) {
    const out = forward.get(edge.from) ?? [];
    out.push(edge.to);
    forward.set(edge.from, out);
    const incoming = reverse.get(edge.to) ?? [];
    incoming.push(edge.from);
    reverse.set(edge.to, incoming);
  }
  return { forward, reverse };
}

function reachable(start, adjacency) {
  const seen = new Set(start ? [start] : []);
  const queue = start ? [start] : [];
  for (let i = 0; i < queue.length; i += 1) {
    for (const next of adjacency.get(queue[i]) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function concernRelations() {
  switch ($('concernFilter').value) {
    case 'http':
      return new Set(['HANDLES']);
    case 'writes':
      return new Set(['WRITES']);
    case 'reads':
      return new Set(['READS']);
    case 'kafka':
      return new Set(['PUBLISHES', 'CONSUMED_BY']);
    default:
      return null;
  }
}

function concernNodeIds(lineage, relations) {
  if (!relations) return new Set(lineage.nodes.map((node) => node.id));
  const targetId = lineage.target.id;
  const { forward, reverse } = adjacencyFor(lineage.edges);
  const descendants = reachable(targetId, forward);
  const ancestors = reachable(targetId, reverse);
  const included = new Set([targetId]);

  for (const edge of lineage.edges) {
    if (!relations.has(String(edge.relation ?? '').toUpperCase())) continue;
    if (descendants.has(edge.from)) {
      const canReachEdge = reachable(edge.from, reverse);
      for (const id of descendants) {
        if (canReachEdge.has(id)) included.add(id);
      }
      included.add(edge.to);
    }
    if (ancestors.has(edge.to)) {
      const fromEdge = reachable(edge.to, forward);
      for (const id of ancestors) {
        if (fromEdge.has(id)) included.add(id);
      }
      included.add(edge.from);
    }
  }
  return included;
}

function filterLineage(lineage) {
  if (!lineage) return null;
  const isolate = $('isolatePath').checked && activePathIds?.length;
  let included = isolate
    ? new Set(activePathIds)
    : concernNodeIds(lineage, concernRelations());
  included.add(lineage.target.id);

  if (!isolate) {
    const direction = $('directionFilter').value;
    if (direction !== 'both') {
      included = new Set(
        lineage.nodes
          .filter(
            (node) =>
              included.has(node.id) &&
              (node.id === lineage.target.id ||
                (direction === 'upstream' ? node.hop <= 0 : node.hop >= 0)),
          )
          .map((node) => node.id),
      );
    }
  }

  let edges = lineage.edges.filter(
    (edge) => included.has(edge.from) && included.has(edge.to),
  );
  if (isolate) {
    const selectedEdges = new Set();
    for (let i = 0; i < activePathIds.length - 1; i += 1) {
      selectedEdges.add(`${activePathIds[i]}\0${activePathIds[i + 1]}`);
      selectedEdges.add(`${activePathIds[i + 1]}\0${activePathIds[i]}`);
    }
    edges = edges.filter((edge) => selectedEdges.has(`${edge.from}\0${edge.to}`));
  }
  if (!isolate && $('hideLeafHelpers').checked) {
    const degree = new Map();
    for (const edge of edges) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    const surfaceKinds = new Set(['http_endpoint', 'database_table', 'event_topic']);
    for (const node of lineage.nodes) {
      if (
        included.has(node.id) &&
        node.id !== lineage.target.id &&
        !surfaceKinds.has(node.kind) &&
        (degree.get(node.id) ?? 0) <= 1
      ) {
        included.delete(node.id);
      }
    }
    edges = edges.filter((edge) => included.has(edge.from) && included.has(edge.to));
  }

  const nodes = lineage.nodes.filter((node) => included.has(node.id));
  const visibleEdgeKeys = new Set(edges.map((edge) => `${edge.from}\0${edge.to}`));
  const paths = (lineage.paths ?? [])
    .map((path) => ({
      ...path,
      nodeIds: path.nodeIds.filter((id) => included.has(id)),
    }))
    .filter(
      (path) =>
        path.nodeIds.length > 1 &&
        path.nodeIds.every(
          (id, index) =>
            index === 0 ||
            visibleEdgeKeys.has(`${path.nodeIds[index - 1]}\0${id}`) ||
            visibleEdgeKeys.has(`${id}\0${path.nodeIds[index - 1]}`),
        ),
    );
  const maxHop = nodes.reduce((max, node) => Math.max(max, Math.abs(node.hop ?? 0)), 0);
  return {
    ...lineage,
    nodes,
    edges,
    paths,
    stats: { ...lineage.stats, nodeCount: nodes.length, edgeCount: edges.length, maxHop },
  };
}

function hexToCss(hex) {
  return `#${String(hex.toString(16)).padStart(6, '0')}`;
}

function populateLegend(nodes) {
  const el = $('kindLegend');
  if (!nodes?.length) {
    el.hidden = true;
    return;
  }
  const counts = new Map();
  for (const n of nodes) {
    const key = String(n.kind ?? 'symbol').toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const knownOrder = ['http_endpoint', 'database_table', 'event_topic', 'module', 'class', 'interface', 'method', 'function'];
  const ordered = [...counts.keys()].sort((a, b) => {
    const ia = knownOrder.indexOf(a);
    const ib = knownOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
  el.innerHTML = ordered
    .map((key) => {
      const meta = KIND_META[key] ?? { accent: 0x4b5563, label: key };
      const color = hexToCss(meta.accent);
      const label = meta.label ?? key;
      return `<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${escapeHtml(label)}&thinsp;(${counts.get(key)})</span>`;
    })
    .join('');
  el.hidden = false;
}

function renderFilteredGraph() {
  if (!currentLineage || !graphView) return;
  const lineage = filterLineage(currentLineage);
  currentVisibleLineage = lineage;
  const nodeById = new Map(lineage.nodes.map((node) => [node.id, node]));
  renderNodeList(lineage, currentNode?.id);
  renderEdgeList(lineage, nodeById);
  populateEdgePicker(lineage, nodeById);

  const concern =
    $('isolatePath').checked && activePathIds?.length
      ? 'Selected path'
      : ($('concernFilter').selectedOptions[0]?.textContent ?? 'All relationships');

  updateViewModeControls();

  graphView.render(lineage);
  graphView.selectNode(currentNode?.id ?? lineage.target.id);
  syncGraphHighlight();
  populateLegend(lineage.nodes);

  if (viewMode() === 'sequence') {
    const seq = graphView?.seq;
    const participants = seq?.participants?.length ?? lineage.nodes.length;
    const steps = sequenceStepCount(seq);
    $('graphStats').textContent = `${participants} participants · ${steps} steps · Sequence view (source order)`;
  } else {
    $('graphStats').textContent = `${lineage.stats.nodeCount} nodes · ${lineage.stats.edgeCount} edges · ${concern} · ${viewMode()} view`;
    if ($('concernFilter').value === 'reads' && !lineage.edges.some((edge) => edge.relation === 'READS')) {
      $('graphStats').textContent += ' — no READS edges in this lineage';
    } else if (lineage.stats.nodeCount > 800) {
      $('graphStats').textContent += ' — large graph, use concern or path isolation filters';
    }
  }

  const hint = document.querySelector('.graph-hint');
  if (hint) {
    hint.textContent =
      viewMode() === 'sequence'
        ? 'Click a participant to focus · ① numbers show source-derived call order'
        : 'Click a trace row to select a path · use “Isolate selected path” for large graphs · hover an edge for its relation';
  }
}

function pickDefaultPath() {
  const first = cachedPaths.downstream[0] ?? cachedPaths.upstream[0];
  if (!first?.length) return null;
  return first.filter((step) => typeof step !== 'string').map((step) => step.id);
}

function updateShowAllButton() {
  const btn = $('showAllBtn');
  btn.classList.toggle('active', showAllEnabled);
  btn.setAttribute('aria-pressed', String(showAllEnabled));
  btn.textContent = showAllEnabled ? 'Show all · on' : 'Show all';
}

function syncGraphHighlight() {
  if (!graphView || !currentLineage) return;
  if (viewMode() === 'sequence') return;
  if ($('isolatePath').checked && activePathIds?.length) {
    graphView.setShowAllMode(false);
    graphView.highlightPath(activePathIds);
    activateTraceRow(activePathIds);
    return;
  }
  graphView.setShowAllMode(showAllEnabled);
  if (showAllEnabled) {
    document.querySelectorAll('.trace-list-item').forEach((item) => item.classList.remove('active'));
    if (viewMode() === 'path') graphView.setActivePath([]);
    else graphView.clearHighlight();
    return;
  }
  const ids = pinnedPathIds ?? pickDefaultPath();
  applyPathToGraph(ids, { activateRow: Boolean(ids), pin: false });
  if (viewMode() === 'clustered' && ids?.length) graphView.highlightPath(ids);
}

function activateTraceRow(nodeIds) {
  if (!nodeIds?.length) {
    document.querySelectorAll('.trace-list-item').forEach((item) => item.classList.remove('active'));
    return;
  }
  const key = nodeIds.join('\0');
  document.querySelectorAll('.trace-list-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.pathKey === key);
  });
}

function applyPathToGraph(nodeIds, { activateRow = true, pin = true } = {}) {
  if (pin) pinnedPathIds = nodeIds?.length ? [...nodeIds] : null;
  activePathIds = nodeIds?.length ? [...nodeIds] : null;
  if (viewMode() === 'sequence') {
    graphView?.selectNode(activePathIds?.[0] ?? currentNode?.id ?? currentLineage?.target?.id);
    if (activateRow) activateTraceRow(activePathIds);
    return;
  }
  if ($('isolatePath').checked) {
    renderFilteredGraph();
    if (activateRow) activateTraceRow(activePathIds);
    return;
  }
  if (showAllEnabled) {
    if (viewMode() === 'path') graphView?.setActivePath(activePathIds);
    else graphView?.highlightPathOverlay(activePathIds);
    if (activateRow) activateTraceRow(activePathIds);
    updateShowAllButton();
    return;
  }
  showAllEnabled = false;
  graphView?.setActivePath(activePathIds);
  if (viewMode() === 'clustered' && activePathIds?.length) graphView?.highlightPath(activePathIds);
  if (activateRow) activateTraceRow(activePathIds);
  else if (!activePathIds) activateTraceRow(null);
  updateShowAllButton();
}

function symbolLabel(n) {
  const location = formatNodeLocation(n);
  return location ? `${n.label} — ${location}` : n.label;
}

function normalizePathSeparators(path) {
  return String(path).replace(/\\/g, '/');
}

function absFilePath(node) {
  if (!node?.file) return null;
  const file = normalizePathSeparators(node.file);
  if (/^[a-zA-Z]:\//.test(file) || file.startsWith('/')) return file;
  const root = normalizePathSeparators(appConfig.sourceRoot ?? '');
  if (!root) return file;
  return `${root.replace(/\/$/, '')}/${file.replace(/^\//, '')}`;
}

function editorUrl(node) {
  const abs = absFilePath(node);
  if (!abs) return null;
  const scheme = appConfig.editorScheme === 'cursor' ? 'cursor' : 'vscode';
  const line = node.line != null ? `:${node.line}` : '';
  return `${scheme}://file/${abs}${line}`;
}

async function loadConfig() {
  try {
    appConfig = await fetch('/config').then((r) => r.json());
  } catch {
    appConfig = { sourceRoot: '', editorScheme: 'vscode' };
  }
}

async function pivotToNode(node) {
  if (!node?.id) return;
  pinnedPathIds = null;
  activePathIds = null;
  showAllEnabled = false;
  updateShowAllButton();
  $('query').value = symbolLabel(node);
  await selectNode(node);
}

async function loadSymbolList() {
  const data = await api('/nodes/symbols?limit=1000');
  symbolIndex.clear();
  const dl = $('symbolList');
  dl.innerHTML = '';
  for (const n of data.results ?? []) {
    const label = symbolLabel(n);
    symbolIndex.set(label, n);
    const opt = document.createElement('option');
    opt.value = label;
    dl.appendChild(opt);
  }
}

function populateEdgePicker(lineage, nodeById) {
  edgeIndex.clear();
  const dl = $('edgeListPicker');
  dl.innerHTML = '';
  const edgeInput = $('edgeQuery');
  if (!lineage?.edges?.length) {
    edgeInput.disabled = true;
    edgeInput.value = '';
    return;
  }
  edgeInput.disabled = false;
  for (const e of lineage.edges) {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    const label = `${from?.label ?? e.from} → ${to?.label ?? e.to} [${e.relation ?? 'calls'}]`;
    edgeIndex.set(label, e);
    const opt = document.createElement('option');
    opt.value = label;
    dl.appendChild(opt);
  }
}

function focusEdge(edge, nodeById) {
  const from = nodeById.get(edge.from);
  if (!from) return;
  currentNode = from;
  renderNodeDetail(from, currentLineage);
  renderNodeList(currentLineage, from.id);
  graphView?.selectNode(from.id);
  graphView?.highlightEdge(edge.from, edge.to);
}

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function depthParam() {
  const raw = $('depth').value.trim();
  if (!raw || raw === '0') return '0';
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '0';
}

function depthLabel() {
  const d = depthParam();
  return d === '0' ? 'unlimited' : d;
}

function kindAccentCss(kind) {
  const key = String(kind ?? '').toLowerCase();
  const meta = KIND_META[key];
  if (!meta) return '#4b5563';
  return hexToCss(meta.accent);
}

function kindLabelText(kind) {
  const key = String(kind ?? '').toLowerCase();
  return KIND_META[key]?.label ?? kind ?? 'symbol';
}

function renderNodeDetail(node, lineage) {
  const stats = lineage?.stats;
  const actions = $('nodeActions');
  const editorLink = $('openEditorLink');
  const url = editorUrl(node);
  const card = $('nodeCard');

  if (node?.id) {
    actions.hidden = false;
    if (url) {
      editorLink.href = url;
      editorLink.hidden = false;
    } else {
      editorLink.hidden = true;
    }

    const accentColor = kindAccentCss(node.kind);
    const kindLabel = kindLabelText(node.kind);
    const hopText = node.hop != null ? hopLabel(node.hop) : '?';
    const filePart = formatNodeLocation(node);
    const fileHtml = filePart
      ? url
        ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(filePart)}</a>`
        : escapeHtml(filePart)
      : '<span style="opacity:0.5">no source location</span>';
    const lineageText = stats
      ? `${stats.nodeCount} nodes · ${stats.edgeCount} edges · max hop ${stats.maxHop}`
      : null;

    card.hidden = false;
    card.innerHTML = `
      <div class="node-card-header">
        <span class="node-kind-badge" style="background:${accentColor}">${escapeHtml(kindLabel)}</span>
        <span class="node-card-label">${escapeHtml(node.label)}</span>
      </div>
      <div class="node-card-meta">
        <span>${fileHtml}</span>
        <span>hop <span class="node-card-hop">${escapeHtml(hopText)}</span>${lineageText ? ` · ${escapeHtml(lineageText)}` : ''}</span>
      </div>`;
  } else {
    actions.hidden = true;
    card.hidden = true;
  }

  $('nodeMeta').textContent = JSON.stringify(
    {
      id: node.id,
      label: node.label,
      kind: node.kind,
      file: node.file,
      absoluteFile: absFilePath(node),
      line: node.line,
      hop: node.hop,
      confidence: node.raw?.confidence,
      editorUrl: url ?? undefined,
      lineage: stats
        ? `${stats.nodeCount} nodes · ${stats.edgeCount} edges · max hop ${stats.maxHop}`
        : undefined,
      raw: node.raw,
    },
    null,
    2,
  );
}

function editorLinkHtml(node) {
  const url = editorUrl(node);
  if (!url) return '';
  return `<a class="editor-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" title="Open in editor" onclick="event.stopPropagation()">↗</a>`;
}

function renderTraceList(el, paths, nodeById) {
  el.innerHTML = '';
  if (!paths?.length) {
    const li = document.createElement('li');
    li.textContent = 'No trace paths found.';
    el.appendChild(li);
    return;
  }
  for (const path of paths) {
    const li = document.createElement('li');
    li.className = 'trace-list-item';
    li.title = viewMode() === 'path' ? 'Click to show this path as a linear chain' : 'Click to highlight this path on the graph';
    const ids = path.filter((step) => typeof step !== 'string').map((step) => step.id);
    li.dataset.pathKey = ids.join('\0');
    li.onclick = (e) => {
      if (e.target.closest('.trace-step-wrap')) return;
      applyPathToGraph(ids);
    };
    for (let i = 0; i < path.length; i += 1) {
      if (i > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = '→';
        li.appendChild(arrow);
      }
      const step = path[i];
      if (typeof step === 'string') {
        const span = document.createElement('span');
        span.textContent = step;
        li.appendChild(span);
      } else {
        const wrap = document.createElement('span');
        wrap.className = 'trace-step-wrap';
        const stepLink = document.createElement('span');
        const location = formatNodeLocation(step);
        stepLink.textContent = location ? `${step.label} (${location})` : step.label;
        stepLink.className = 'trace-step';
        stepLink.title = 'Click to focus · double-click to trace from here';
        stepLink.onclick = () => focusNode(step);
        stepLink.ondblclick = (e) => {
          e.stopPropagation();
          pivotToNode(step);
        };
        wrap.appendChild(stepLink);
        if (editorUrl(step)) {
          wrap.insertAdjacentHTML('beforeend', editorLinkHtml(step));
        }
        li.appendChild(wrap);
      }
    }
    el.appendChild(li);
  }
}

function shortFile(file) {
  if (!file) return '';
  return file.split(/[/\\]/).pop();
}

function formatNodeLocation(node) {
  if (!node?.file) {
    if (node?.kind === 'event_topic') return 'topic';
    if (node?.kind === 'database_table') return 'table';
    if (node?.kind === 'http_endpoint') return 'endpoint';
    return '';
  }
  return `${shortFile(node.file)}:${node.line ?? '?'}`;
}

function hopClass(hop) {
  if (hop < 0) return 'hop-up';
  if (hop > 0) return 'hop-down';
  return '';
}

function hopLabel(hop) {
  if (hop === 0) return '0 (target)';
  return hop > 0 ? `+${hop}` : String(hop);
}

function renderNodeList(lineage, selectedId) {
  const host = $('nodeList');
  const nodes = [...(lineage?.nodes ?? [])].sort((a, b) => {
    if (a.hop !== b.hop) return a.hop - b.hop;
    return String(a.label).localeCompare(String(b.label));
  });
  if (!nodes.length) {
    host.innerHTML = '<p class="hint">No nodes in lineage.</p>';
    return;
  }
  const rows = nodes
    .map(
      (n) => `<tr data-node-id="${escapeAttr(n.id)}" class="${n.id === selectedId ? 'selected' : ''}" title="Click to focus · double-click to trace from here">
        <td class="${hopClass(n.hop)}">${escapeHtml(hopLabel(n.hop))}</td>
        <td>${escapeHtml(n.label)}${editorLinkHtml(n)}</td>
        <td class="muted">${escapeHtml(formatNodeLocation(n) || '—')}</td>
        <td class="muted">${escapeHtml(n.kind ?? '')}</td>
      </tr>`,
    )
    .join('');
  host.innerHTML = `<table class="data-table">
    <thead><tr><th>Hop</th><th>Symbol</th><th>Location</th><th>Kind</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  host.querySelectorAll('tbody tr').forEach((row) => {
    row.onclick = () => {
      const node = nodes.find((n) => n.id === row.dataset.nodeId);
      if (node) focusNode(node);
    };
    row.ondblclick = () => {
      const node = nodes.find((n) => n.id === row.dataset.nodeId);
      if (node) pivotToNode(node);
    };
  });
}

function renderEdgeList(lineage, nodeById) {
  const host = $('edgeList');
  const edges = [...(lineage?.edges ?? [])].sort((a, b) => {
    const fromA = nodeById.get(a.from)?.label ?? a.from;
    const fromB = nodeById.get(b.from)?.label ?? b.from;
    return String(fromA).localeCompare(String(fromB));
  });
  if (!edges.length) {
    host.innerHTML = '<p class="hint">No edges in lineage.</p>';
    return;
  }
  const rows = edges
    .map((e) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      const conf = edgeConfidenceLabel(e);
      return `<tr>
        <td>${escapeHtml(from?.label ?? e.from)}</td>
        <td class="muted">→</td>
        <td>${escapeHtml(to?.label ?? e.to)}</td>
        <td class="muted">${escapeHtml(e.relation ?? 'calls')}</td>
        <td class="muted">${conf}</td>
      </tr>`;
    })
    .join('');
  host.innerHTML = `<table class="data-table">
    <thead><tr><th>From</th><th></th><th>To</th><th>Relation</th><th>Conf</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function edgeConfidenceLabel(edge) {
  const certainty = edge.certainty ?? edge.raw?.provenance?.certainty;
  const score = edge.confidenceScore ?? edge.raw?.provenance?.confidence;
  if (certainty) {
    return score != null ? `${certainty} · ${Math.round(score * 100)}%` : certainty;
  }
  if (typeof edge.confidence === 'number') return `${Math.round(edge.confidence * 100)}%`;
  return edge.confidence ?? '—';
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function focusNode(node) {
  currentNode = node;
  renderNodeDetail(node, currentLineage);
  renderNodeList(currentVisibleLineage ?? currentLineage, node.id);
  graphView?.selectNode(node.id);
  if (showAllEnabled) {
    const ids = graphView?.highlightPathThroughNode(node.id);
    if (ids?.length) {
      pinnedPathIds = ids;
      activePathIds = ids;
      activateTraceRow(ids);
    }
  } else if (!pinnedPathIds?.length) {
    graphView?.highlightPathsContaining(node.id);
  }
}

function buildLabelPaths(lineage) {
  const nodeById = new Map(lineage.nodes.map((n) => [n.id, n]));
  const upstream = lineage.paths
    .filter((p) => p.direction === 'upstream')
    .map((p) => p.nodeIds.map((id) => nodeById.get(id)).filter(Boolean).reverse());
  const downstream = lineage.paths
    .filter((p) => p.direction === 'downstream')
    .map((p) => p.nodeIds.map((id) => nodeById.get(id)).filter(Boolean));
  return { upstream, downstream, nodeById };
}

async function ensureGraph() {
  if (!graphView) {
    graphView = new LineageGraphView($('graphHost'));
    await graphView.init();
    graphView.onNodeSelect = (node) => {
      if (!node) return;
      focusNode(node);
    };
    graphView.onNodePivot = (node) => {
      if (!node) return;
      pivotToNode(node);
    };
    graphView.getEditorUrl = (node) => editorUrl(node);
    graphView.formatNodeTooltip = (node) => formatNodeTooltip(node);
    graphView.formatEdgeTooltip = (edge, fromNode, toNode) => formatEdgeTooltip(edge, fromNode, toNode);
  }
}

function formatNodeTooltip(node) {
  if (!node) return '';
  const lines = [
    node.label,
    absFilePath(node) ?? node.file ?? '?',
    `line ${node.line ?? '?'}`,
    `kind: ${node.kind ?? 'symbol'}`,
    `hop: ${node.hop ?? '?'}`,
  ];
  if (node.raw?.confidence) lines.push(`confidence: ${node.raw.confidence}`);
  lines.push('Double-click to trace from here');
  return lines.join('\n');
}

function formatEdgeTooltip(edge, fromNode, toNode) {
  const lines = [
    `${fromNode?.label ?? edge.from} → ${toNode?.label ?? edge.to}`,
    `relation: ${edge.relation ?? 'calls'}`,
  ];
  if (edge.confidence != null) {
    lines.push(`confidence: ${edgeConfidenceLabel(edge)}`);
  }
  if (edge.certainty != null) lines.push(`certainty: ${edge.certainty}`);
  if (edge.file) lines.push(absFilePath({ file: edge.file }) ?? edge.file);
  if (edge.line != null) lines.push(`line ${edge.line}`);
  return lines.join('\n');
}

function renderBlastList(host, items, emptyText, formatItem) {
  if (!items?.length) {
    host.innerHTML = `<h4>${escapeHtml(host.dataset.title ?? '')}</h4><p class="blast-empty">${escapeHtml(emptyText)}</p>`;
    return;
  }
  const rows = items.map(formatItem).join('');
  host.innerHTML = `<h4>${escapeHtml(host.dataset.title ?? '')}</h4><ul class="blast-list">${rows}</ul>`;
}

function renderSurfaceImpact(impact) {
  const panel = $('blastRadius');
  if (!impact) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  renderBlastList(
    $('blastEndpoints'),
    impact.endpoints,
    'No HTTP endpoints on upstream call paths.',
    (ep) =>
      `<li><strong>${escapeHtml(ep.method)}</strong> ${escapeHtml(ep.path)} <span class="blast-via">→ ${escapeHtml(ep.handler)}</span></li>`,
  );

  renderBlastList(
    $('blastTables'),
    impact.tables,
    'No database tables detected on affected paths.',
    (t) =>
      `<li><strong>${escapeHtml(t.name)}</strong> <span class="blast-via">via ${escapeHtml(t.via.join(', '))}</span></li>`,
  );

  const kafkaItems = [
    ...(impact.kafka?.publishes ?? []).map((p) => ({
      kind: 'publish',
      text: `publish ${p.topic}`,
      via: p.via.join(', '),
    })),
    ...(impact.kafka?.consumes ?? []).map((c) => ({
      kind: 'consume',
      text: `consume ${c.topic} (${c.consumer}${c.callback ? ` → ${c.callback}` : ''})`,
      via: '',
    })),
  ];
  const kafkaHost = $('blastKafka');
  kafkaHost.dataset.title = `Kafka (${kafkaItems.length})`;
  if (!kafkaItems.length) {
    kafkaHost.innerHTML = '<h4>Kafka</h4><p class="blast-empty">No Kafka topics on affected paths.</p>';
  } else {
    kafkaHost.innerHTML = `<h4>Kafka (${kafkaItems.length})</h4><ul class="blast-list">${kafkaItems
      .map(
        (k) =>
          `<li><strong>${escapeHtml(k.text)}</strong>${k.via ? ` <span class="blast-via">via ${escapeHtml(k.via)}</span>` : ''}</li>`,
      )
      .join('')}</ul>`;
  }

  renderBlastList(
    $('blastExternal'),
    impact.external,
    'No external APIs detected.',
    (e) =>
      `<li><strong>${escapeHtml(e.url)}</strong> <span class="blast-via">via ${escapeHtml(e.via.join(', '))}</span></li>`,
  );
}

async function selectNode(node) {
  currentNode = node;
  pinnedPathIds = null;
  activePathIds = null;
  showAllEnabled = false;
  updateShowAllButton();
  $('exportPdfBtn').disabled = true;
  $('graphStats').textContent = 'Loading lineage…';
  $('blastRadius').hidden = true;
  const d = depthParam();
  const [lineage, traces, surfaceImpact] = await Promise.all([
    api(`/nodes/${encodeURIComponent(node.id)}/lineage?depth=${d}`),
    api(`/nodes/${encodeURIComponent(node.id)}/traces?depth=${d}`),
    api(`/nodes/${encodeURIComponent(node.id)}/surface-impact?depth=${d}`).catch(() => null),
  ]);
  const { upstream, downstream, nodeById } = buildLabelPaths(lineage);
  currentLineage = lineage;
  cachedPaths = { upstream, downstream };

  const detailNode = { ...node, hop: lineage.target.id === node.id ? 0 : node.hop };
  currentNode = detailNode;
  renderNodeDetail(detailNode, lineage);
  renderSurfaceImpact(surfaceImpact);
  renderTraceList($('upstreamTraces'), upstream.length ? upstream : traces.upstreamTraces ?? [], nodeById);
  renderTraceList($('downstreamTraces'), downstream.length ? downstream : traces.downstreamTraces ?? [], nodeById);

  await ensureGraph();
  graphView.setViewMode(viewMode());
  if (!pinnedPathIds?.length) pinnedPathIds = pickDefaultPath();
  activePathIds = pinnedPathIds ? [...pinnedPathIds] : null;
  renderFilteredGraph();
  $('exportPdfBtn').disabled = false;
}

async function exportPdf() {
  if (!graphView || !currentLineage || !currentNode) return;
  const button = $('exportPdfBtn');
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Generating…';
  try {
    const image = graphView.captureGraphImage();
    downloadGraphPdf({
      image,
      title: `CodeTracr — ${currentNode.label}`,
      subtitle: `${currentVisibleLineage?.stats.nodeCount ?? currentLineage.stats.nodeCount} nodes · ${currentVisibleLineage?.stats.edgeCount ?? currentLineage.stats.edgeCount} edges · ${viewMode()} view · depth ${depthLabel()}`,
    });
  } catch (error) {
    console.error(error);
    window.alert(`Could not generate PDF: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function search() {
  const q = $('query').value.trim();
  if (!q) return;
  const hit = symbolIndex.get(q);
  if (hit) {
    await selectNode(hit);
    return;
  }
  const data = await api(`/nodes/search?q=${encodeURIComponent(q)}&limit=30`);
  const results = data.results ?? [];
  if (results.length === 1) {
    await selectNode(results[0]);
    return;
  }
  const box = $('results');
  box.innerHTML = '<h2>Results</h2>';
  for (const n of results) {
    const btn = document.createElement('button');
    btn.textContent = symbolLabel(n);
    btn.onclick = () => selectNode(n);
    box.appendChild(btn);
  }
}

$('searchBtn').onclick = search;
$('traceFromBtn').onclick = () => {
  if (currentNode) pivotToNode(currentNode);
};
$('fitBtn').onclick = () => graphView?.fitToView();
$('exportPdfBtn').onclick = exportPdf;
$('showAllBtn').onclick = () => {
  showAllEnabled = !showAllEnabled;
  syncGraphHighlight();
  updateShowAllButton();
};
$('viewMode').addEventListener('change', () => {
  updateViewModeControls();
  graphView?.setViewMode(viewMode());
  renderFilteredGraph();
});

updateViewModeControls();
$('concernFilter').addEventListener('change', renderFilteredGraph);
$('directionFilter').addEventListener('change', renderFilteredGraph);
$('isolatePath').addEventListener('change', renderFilteredGraph);
$('hideLeafHelpers').addEventListener('change', renderFilteredGraph);
$('query').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search();
});
$('depth').addEventListener('change', () => {
  if (currentNode) selectNode(currentNode);
});

$('edgeQuery').addEventListener('change', () => {
  const edge = edgeIndex.get($('edgeQuery').value.trim());
  if (!edge || !currentLineage) return;
  const nodeById = new Map(currentLineage.nodes.map((n) => [n.id, n]));
  focusEdge(edge, nodeById);
});

$('blastEndpoints').dataset.title = 'HTTP endpoints';
$('blastTables').dataset.title = 'Database tables';
$('blastExternal').dataset.title = 'External APIs';

loadConfig()
  .then(() => loadSymbolList())
  .catch((err) => console.error(err));
updateShowAllButton();
