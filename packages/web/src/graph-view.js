import { Application, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';

const NODE_W = 240;
const MIN_NODE_H = 78;
const COL_GAP = 320;
const ROW_GAP = 28;
const PATH_GAP = 100;
const TEXT_RES = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

const styles = {
  title: new TextStyle({ fill: '#f1f3f5', fontSize: 14, fontWeight: '700', wordWrap: true, breakWords: true, wordWrapWidth: NODE_W - 20 }),
  meta: new TextStyle({ fill: '#9aa0a6', fontSize: 11, wordWrap: true, wordWrapWidth: NODE_W - 16 }),
  badge: new TextStyle({ fill: '#7aa2f7', fontSize: 10, fontWeight: '600' }),
  step: new TextStyle({ fill: '#1a1d24', fontSize: 13, fontWeight: '800' }),
  hint: new TextStyle({ fill: '#9aa0a6', fontSize: 14, align: 'center', wordWrap: true, wordWrapWidth: 420 }),
  edgeLabel: new TextStyle({ fill: '#c7ccd4', fontSize: 10, fontWeight: '700' }),
  edgeLabelActive: new TextStyle({ fill: '#1a1d24', fontSize: 10, fontWeight: '800' }),
};

const EDGE_LABEL_PAD_X = 8;
const EDGE_LABEL_PAD_Y = 4;
const EDGE_LABEL_OFFSET_Y = 18;

function skipPointer(...targets) {
  for (const target of targets) {
    if (target) target.eventMode = 'none';
  }
}

function plainLabel(label) {
  return String(label).replace(/^\./, '').replace(/\(\)$/, '');
}

function shortFile(file) {
  if (!file) return '';
  return file.split(/[/\\]/).slice(-2).join('/');
}

function nodeLocation(node) {
  if (!node?.file) {
    if (node?.kind === 'event_topic') return 'topic';
    if (node?.kind === 'database_table') return 'table';
    if (node?.kind === 'http_endpoint') return 'endpoint';
    return '';
  }
  return `${shortFile(node.file)}:${node.line ?? '?'}`;
}

export const KIND_META = {
  http_endpoint:  { fill: 0x1a3040, accent: 0x38bdf8, label: 'endpoint' },
  database_table: { fill: 0x1a2a1a, accent: 0x4ade80, label: 'table' },
  event_topic:    { fill: 0x2a1f35, accent: 0xc084fc, label: 'topic' },
  module:         { fill: 0x1f2a3a, accent: 0x60a5fa, label: 'module' },
  class:          { fill: 0x1f2a3a, accent: 0x93c5fd, label: 'class' },
  interface:      { fill: 0x1f2632, accent: 0x7dd3fc, label: 'interface' },
  method:         { fill: 0x1a1d24, accent: 0x64748b, label: 'method' },
  function:       { fill: 0x1a1d24, accent: 0x64748b, label: 'fn' },
};

function kindMeta(kind) {
  const key = String(kind ?? '').toLowerCase();
  return KIND_META[key] ?? { fill: 0x1a1d24, accent: 0x4b5563, label: kind ?? 'symbol' };
}

const RELATION_COLOR = {
  CALLS:               0x58a6ff,
  IMPORTS:             0x58a6ff,
  HANDLES:             0x38bdf8,
  RESOLVES_TO:         0x38bdf8,
  WRITES:              0xf87171,
  READS:               0x4ade80,
  PUBLISHES:           0xc084fc,
  CONSUMED_BY:         0xc084fc,
  POSSIBLE_RESOLUTION: 0x9c6ade,
  DEPENDS_ON:          0x7aa2f7,
  IMPLEMENTS:          0x7dd3fc,
  INJECTED_WITH:       0xa78bfa,
};

function edgeColor(edge, active) {
  if (active) return 0xffd166;
  const relation = String(edge?.relation ?? edge?.confidence ?? '').toUpperCase();
  return RELATION_COLOR[relation] ?? 0x4b5563;
}

function bezierPoint(x1, y1, cx1, cy1, cx2, cy2, x2, y2, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * x1 + 3 * u ** 2 * t * cx1 + 3 * u * t ** 2 * cx2 + t ** 3 * x2,
    y: u ** 3 * y1 + 3 * u ** 2 * t * cy1 + 3 * u * t ** 2 * cy2 + t ** 3 * y2,
  };
}

function relationLabel(edge) {
  return edge?.relation ?? 'calls';
}

function edgeKey(from, to) {
  return `${from}\0${to}`;
}

function pathEdgeKeys(nodeIds) {
  const keys = new Set();
  for (let i = 0; i < nodeIds.length - 1; i += 1) {
    keys.add(edgeKey(nodeIds[i], nodeIds[i + 1]));
  }
  return keys;
}

const SEQ_PARTICIPANT_W = 180;
const SEQ_PARTICIPANT_H = 56;
const SEQ_COL_GAP = 260;
const SEQ_ROW_GAP = 68;
const SEQ_ACTIVATION_W = 14;
const SEQ_ASYNC_GAP = 48;
const SEQ_PADDING = 80;

function relationUpper(edge) {
  return String(edge?.relation ?? edge?.raw?.relation ?? '').toUpperCase();
}

function isAsyncRelation(relation) {
  return relation === 'PUBLISHES' || relation === 'CONSUMED_BY';
}

function collectOutgoingOccurrences(nodeId, edges) {
  const items = [];
  for (const edge of edges ?? []) {
    if (edge.from !== nodeId) continue;
    const occs = edge.occurrences;
    if (occs?.length) {
      for (const occ of occs) {
        items.push({ edge, occurrence: occ, targetId: edge.to });
      }
    } else {
      items.push({
        edge,
        occurrence: {
          line: edge.line ?? 0,
          column: edge.column ?? 0,
          order: edge.line ?? Number.MAX_SAFE_INTEGER,
        },
        targetId: edge.to,
      });
    }
  }
  items.sort((a, b) => (a.occurrence.order ?? 0) - (b.occurrence.order ?? 0));
  return items;
}

function orderParticipantIds(ids) {
  const ordered = [];
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

function expandScope(
  callerId,
  stepPrefix,
  visited,
  segment,
  edges,
  pendingAsyncConsumers,
) {
  const items = collectOutgoingOccurrences(callerId, edges);
  for (let i = 0; i < items.length; i += 1) {
    const { edge, occurrence, targetId } = items[i];
    const childStep = [...stepPrefix, i + 1];
    const relation = relationUpper(edge);
    segment.messages.push({
      step: segment.messages.length + 1,
      stepPath: childStep,
      fromId: callerId,
      toId: targetId,
      label: relationLabel(edge),
      certain: edge.certainty !== 'POSSIBLE' && edge.raw?.provenance?.certainty !== 'POSSIBLE',
      orderConfidence: occurrence.order ? 'source-order' : occurrence.line ? 'line-order' : 'path-order',
      edge,
      occurrence,
      async: isAsyncRelation(relation),
    });

    if (relation === 'PUBLISHES') {
      for (const consumerEdge of edges) {
        if (consumerEdge.from !== targetId || relationUpper(consumerEdge) !== 'CONSUMED_BY') {
          continue;
        }
        const alreadyQueued = pendingAsyncConsumers.some(
          (item) => item.topicId === targetId && item.consumerId === consumerEdge.to,
        );
        if (!alreadyQueued) {
          pendingAsyncConsumers.push({
            topicId: targetId,
            consumerId: consumerEdge.to,
            edge: consumerEdge,
          });
        }
      }
      continue;
    }
    if (relation === 'CONSUMED_BY') continue;

    if (!visited.has(targetId)) {
      visited.add(targetId);
      expandScope(targetId, childStep, visited, segment, edges, pendingAsyncConsumers);
      visited.delete(targetId);
    }
  }
}

export function buildSequence(lineage, rootId) {
  const edges = lineage?.edges ?? [];
  const nodeById = new Map((lineage?.nodes ?? []).map((node) => [node.id, node]));
  const participantIds = [];
  const recordParticipant = (id) => {
    if (id && nodeById.has(id)) participantIds.push(id);
  };
  recordParticipant(rootId);

  const producerSegment = { isAsync: false, messages: [] };
  const pendingAsyncConsumers = [];
  if (rootId) {
    const visited = new Set();
    expandScope(rootId, [], visited, producerSegment, edges, pendingAsyncConsumers);
    for (const msg of producerSegment.messages) {
      recordParticipant(msg.fromId);
      recordParticipant(msg.toId);
    }
  }

  const segments = [producerSegment];
  const seenConsumerKeys = new Set();
  for (const pending of pendingAsyncConsumers) {
    const key = `${pending.topicId}\0${pending.consumerId}`;
    if (!pending.consumerId || seenConsumerKeys.has(key)) continue;
    seenConsumerKeys.add(key);
    const segment = { isAsync: true, messages: [] };
    const occurrence = pending.edge.occurrences?.[0] ?? {
      line: pending.edge.line ?? 0,
      column: pending.edge.column ?? 0,
      order: pending.edge.line ?? Number.MAX_SAFE_INTEGER,
    };
    segment.messages.push({
      step: 1,
      stepPath: [1],
      fromId: pending.topicId,
      toId: pending.consumerId,
      label: relationLabel(pending.edge),
      certain:
        pending.edge.certainty !== 'POSSIBLE' &&
        pending.edge.raw?.provenance?.certainty !== 'POSSIBLE',
      orderConfidence: 'path-order',
      edge: pending.edge,
      occurrence,
      async: true,
    });
    const visited = new Set();
    expandScope(pending.consumerId, [1], visited, segment, edges, []);
    for (const msg of segment.messages) {
      recordParticipant(msg.fromId);
      recordParticipant(msg.toId);
    }
    segments.push(segment);
  }

  const orderedIds = orderParticipantIds(participantIds);
  const participants = orderedIds.map((id) => {
    const node = nodeById.get(id);
    return { id, label: node?.label ?? id, kind: node?.kind, node };
  });
  const participantIndex = new Map(participants.map((p, index) => [p.id, index]));

  for (const segment of segments) {
    for (const msg of segment.messages) {
      msg.fromIdx = participantIndex.get(msg.fromId) ?? 0;
      msg.toIdx = participantIndex.get(msg.toId) ?? 0;
    }
  }

  return { participants, segments };
}

function formatStepPath(stepPath, uncertain) {
  const text = stepPath.map(String).join('.');
  return uncertain ? `~${text}` : text;
}

export function layoutSequence(seq, host) {
  const padding = SEQ_PADDING;
  const participantX = seq.participants.map((_, index) => padding + index * SEQ_COL_GAP);
  const messageY = [];
  let y = padding + SEQ_PARTICIPANT_H + SEQ_ROW_GAP;
  let rowIndex = 0;

  for (let segmentIndex = 0; segmentIndex < seq.segments.length; segmentIndex += 1) {
    if (segmentIndex > 0) {
      y += SEQ_ASYNC_GAP;
      messageY.push({ y, kind: 'async-divider', segmentIndex });
      y += SEQ_ASYNC_GAP;
    }
    const segment = seq.segments[segmentIndex];
    for (const msg of segment.messages) {
      messageY.push({ y, kind: 'message', segmentIndex, message: msg, rowIndex });
      msg.layoutY = y;
      y += SEQ_ROW_GAP;
      rowIndex += 1;
    }
  }

  const totalW =
    padding * 2 +
    (seq.participants.length > 0 ? (seq.participants.length - 1) * SEQ_COL_GAP + SEQ_PARTICIPANT_W : 0);
  const totalH = y + padding;
  return { participantX, messageY, totalW, totalH, padding };
}

export class LineageGraphView {
  constructor(host) {
    this.host = host;
    this.onNodeSelect = null;
    this.onNodePivot = null;
    this.getEditorUrl = null;
    this.formatNodeTooltip = null;
    this.formatEdgeTooltip = null;
    this.app = null;
    this.world = null;
    this.nodeSprites = new Map();
    this.edgeItems = [];
    this.flowItems = [];
    this.positions = new Map();
    this.selectedId = null;
    this.highlightNodeIds = null;
    this.highlightEdgeKeys = null;
    this.lineage = null;
    this.viewMode = 'clustered';
    this.activePathIds = null;
    this.showAllMode = false;
    this.lastPointer = { x: 0, y: 0 };
    this.initPromise = null;
    this.tickerFn = null;
    this.tooltipEl = null;
    this.hoveredEdgeKey = null;
    this.pinnedEdgeKey = null;
    this.lastTap = { id: null, time: 0 };
    this.seq = null;
    this.seqLayout = null;
    this.seqMessages = [];
    this.hoverBadgeLayer = null;
  }

  async init() {
    if (this.app) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.app = new Application();
      await this.app.init({
        background: '#0b0d12',
        antialias: true,
        resizeTo: this.host,
        resolution: TEXT_RES,
        autoDensity: true,
      });
      this.host.appendChild(this.app.canvas);

      this.world = new Container();
      this.app.stage.addChild(this.world);
      this.world.eventMode = 'passive';

      this.app.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

      let panning = false;
      this.app.stage.eventMode = 'static';
      this.app.stage.hitArea = this.app.screen;
      this.app.stage.on('pointerdown', (e) => {
        if (e.target === this.app.stage || e.target === this.world) {
          panning = true;
          this.lastPointer = { x: e.global.x, y: e.global.y };
        }
      });
      this.app.stage.on('pointerup', () => {
        panning = false;
      });
      this.app.stage.on('pointerupoutside', () => {
        panning = false;
      });
      this.app.stage.on('pointermove', (e) => {
        if (!panning) return;
        this.world.x += e.global.x - this.lastPointer.x;
        this.world.y += e.global.y - this.lastPointer.y;
        this.lastPointer = { x: e.global.x, y: e.global.y };
      });

      this.tooltipEl = document.createElement('div');
      this.tooltipEl.id = 'graphTooltip';
      this.host.appendChild(this.tooltipEl);
    })();

    return this.initPromise;
  }

  setShowAllMode(enabled) {
    this.showAllMode = Boolean(enabled);
  }

  setViewMode(mode) {
    this.viewMode =
      mode === 'path' ? 'path' : mode === 'sequence' ? 'sequence' : 'clustered';
    this.rerender();
  }

  setActivePath(nodeIds) {
    this.activePathIds = nodeIds?.length ? [...nodeIds] : null;
    this.rerender();
  }

  onWheel(e) {
    e.preventDefault();
    const scale = e.deltaY < 0 ? 1.08 : 0.92;
    const newScale = Math.min(2.5, Math.max(0.2, this.world.scale.x * scale));
    const rect = this.app.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - this.world.x) / this.world.scale.x;
    const wy = (my - this.world.y) / this.world.scale.y;
    this.world.scale.set(newScale);
    this.world.x = mx - wx * newScale;
    this.world.y = my - wy * newScale;
  }

  stopAnimation() {
    if (this.tickerFn && this.app) {
      this.app.ticker.remove(this.tickerFn);
      this.tickerFn = null;
    }
    this.flowItems = [];
  }

  startFlowAnimation() {
    this.stopAnimation();
    if (!this.flowItems.length || !this.app) return;
    this.tickerFn = () => {
      const t = performance.now() * 0.001;
      for (const item of this.flowItems) {
        const progress = (t * 0.55 + item.phase) % 1;
        item.dot.x = item.x1 + (item.x2 - item.x1) * progress;
        item.dot.y = item.y1 + (item.y2 - item.y1) * progress;
        item.dot.alpha = 0.55 + Math.sin(progress * Math.PI) * 0.45;
      }
    };
    this.app.ticker.add(this.tickerFn);
  }

  buildPathSequenceOrder(nodes, paths, targetId) {
    const pathDepthById = this.buildPathDepthByNode(paths, targetId);
    const orderByCol = new Map();
    const placed = new Map();

    const upstream = (paths ?? []).filter((p) => p.direction === 'upstream');
    const downstream = (paths ?? []).filter((p) => p.direction === 'downstream');

    const place = (id) => {
      const col = pathDepthById.get(id);
      if (col === undefined) return;
      const seen = placed.get(col) ?? new Set();
      if (seen.has(id)) return;
      seen.add(id);
      placed.set(col, seen);
      if (!orderByCol.has(col)) orderByCol.set(col, []);
      orderByCol.get(col).push(id);
    };

    for (const path of upstream) {
      for (const id of [...path.nodeIds].reverse()) place(id);
    }
    for (const path of downstream) {
      for (const id of path.nodeIds) place(id);
    }

    return orderByCol;
  }

  sortNodesByPathOrder(group, col, orderByCol) {
    const order = orderByCol.get(col);
    if (!order?.length) {
      return [...group].sort((a, b) => a.label.localeCompare(b.label));
    }
    const rank = new Map(order.map((id, index) => [id, index]));
    return [...group].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        a.label.localeCompare(b.label),
    );
  }

  layoutColumn(node, activePathIds, targetId, pathDepthById) {
    if (activePathIds?.length && targetId) {
      const idx = activePathIds.indexOf(node.id);
      const targetIdx = activePathIds.indexOf(targetId);
      if (idx >= 0 && targetIdx >= 0) return idx - targetIdx;
    }
    return pathDepthById?.get(node.id) ?? node.hop;
  }

  buildPathDepthByNode(paths, targetId) {
    const depth = new Map([[targetId, 0]]);
    for (const path of paths ?? []) {
      const ids = path.nodeIds;
      const tIdx = ids.indexOf(targetId);
      if (tIdx < 0) continue;
      for (let i = 0; i < ids.length; i += 1) {
        const d = path.direction === 'upstream' ? tIdx - i : i - tIdx;
        const prev = depth.get(ids[i]);
        if (prev === undefined || Math.abs(d) > Math.abs(prev)) depth.set(ids[i], d);
      }
    }
    return depth;
  }

  layoutClustered(nodes, edges, paths, activePathIds, targetId) {
    const orderByCol = this.buildPathSequenceOrder(nodes, paths, targetId);
    const pathDepthById = this.buildPathDepthByNode(paths, targetId);
    const byCol = new Map();
    for (const node of nodes) {
      const col = this.layoutColumn(node, activePathIds, targetId, pathDepthById);
      if (!byCol.has(col)) byCol.set(col, []);
      byCol.get(col).push(node);
    }

    const cols = [...byCol.keys()].sort((a, b) => a - b);
    const positions = new Map();
    const centerX = Math.max(this.host.clientWidth / 2, cols.length * COL_GAP);
    const centerY = Math.max(this.host.clientHeight / 2, 240);

    for (const col of cols) {
      byCol.set(col, this.sortNodesByPathOrder(byCol.get(col), col, orderByCol));
    }

    for (const col of cols) {
      const group = byCol.get(col);
      const heights = group.map((node) => this.measureNodeHeight(node));
      const totalH = heights.reduce((sum, height) => sum + height, 0) + (group.length - 1) * ROW_GAP;
      let y = centerY - totalH / 2;
      const x = centerX + col * COL_GAP;
      for (let index = 0; index < group.length; index += 1) {
        const node = group[index];
        const height = heights[index];
        positions.set(node.id, { x, y, height, hop: node.hop });
        y += height + ROW_GAP;
      }
    }

    return positions;
  }

  layoutPath(nodeIds) {
    const positions = new Map();
    const centerY = Math.max(this.host.clientHeight / 2, 80 + MIN_NODE_H / 2);
    const totalW = nodeIds.length * NODE_W + (nodeIds.length - 1) * PATH_GAP;
    let x = Math.max(80, (this.host.clientWidth - totalW) / 2);
    nodeIds.forEach((id, index) => {
      const node = this.nodeById(id);
      const height = node ? this.measureNodeHeight(node) : MIN_NODE_H;
      positions.set(id, { x, y: centerY - height / 2, height, hop: index });
      x += NODE_W + PATH_GAP;
    });
    return positions;
  }

  findEdge(fromId, toId) {
    return this.lineage?.edges?.find((e) => e.from === fromId && e.to === toId) ?? {
      from: fromId,
      to: toId,
      relation: 'calls',
    };
  }

  getTraceStep(nodeId) {
    if (!this.activePathIds?.length) return null;
    const idx = this.activePathIds.indexOf(nodeId);
    return idx >= 0 ? idx + 1 : null;
  }

  hideTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
      this.tooltipEl.textContent = '';
    }
  }

  showTooltip(text, clientX, clientY) {
    if (!this.tooltipEl || !text) return;
    this.tooltipEl.textContent = text;
    this.tooltipEl.style.display = 'block';
    const rect = this.host.getBoundingClientRect();
    const pad = 12;
    let left = clientX - rect.left + pad;
    let top = clientY - rect.top + pad;
    const tw = this.tooltipEl.offsetWidth;
    const th = this.tooltipEl.offsetHeight;
    if (left + tw > rect.width - pad) left = clientX - rect.left - tw - pad;
    if (top + th > rect.height - pad) top = clientY - rect.top - th - pad;
    this.tooltipEl.style.left = `${Math.max(pad, left)}px`;
    this.tooltipEl.style.top = `${Math.max(pad, top)}px`;
  }

  nodeById(id) {
    return this.lineage?.nodes?.find((n) => n.id === id);
  }

  setHoveredEdge(key) {
    if (this.hoveredEdgeKey === key) return;
    this.hoveredEdgeKey = key;
    this.updateEdgeLabelVisibility();
  }

  setPinnedEdge(key) {
    this.pinnedEdgeKey = this.pinnedEdgeKey === key ? null : key;
    this.updateEdgeLabelVisibility();
  }

  updateEdgeLabelVisibility() {
    for (const item of this.edgeItems) {
      if (!item.label) continue;
      const key = edgeKey(item.from, item.to);
      const hovered = this.hoveredEdgeKey === key;
      const pinned = this.pinnedEdgeKey === key;
      const show = hovered || pinned;
      item.label.visible = show;
      item.label.alpha = 1;
      this.styleEdgeLabel(item, hovered || pinned);
    }
  }

  styleEdgeLabel(item, emphasized) {
    if (!item.labelBg || !item.labelText) return;
    const fill = emphasized ? 0xffd166 : 0x1f2430;
    const stroke = emphasized ? 0xffd166 : 0x4b5563;
    const textStyle = emphasized ? styles.edgeLabelActive : styles.edgeLabel;
    const bounds = item.labelText.getLocalBounds();
    const w = Math.max(28, bounds.width + EDGE_LABEL_PAD_X * 2);
    const h = Math.max(18, bounds.height + EDGE_LABEL_PAD_Y * 2);
    item.labelBg.clear();
    item.labelBg.roundRect(-w / 2, -h / 2, w, h, 6).fill({ color: fill, alpha: emphasized ? 0.95 : 0.92 }).stroke({
      width: 1,
      color: stroke,
      alpha: 1,
    });
    item.labelText.style = textStyle;
  }

  bindNodePointerEvents(container, node) {
    container.on('pointerover', (e) => {
      const location = nodeLocation(node);
      const text = this.formatNodeTooltip?.(node) ?? (location ? `${node.label}\n${location}` : node.label);
      this.showTooltip(text, e.clientX, e.clientY);
    });
    container.on('pointermove', (e) => {
      if (this.tooltipEl?.style.display === 'block') {
        this.showTooltip(this.tooltipEl.textContent, e.clientX, e.clientY);
      }
    });
    container.on('pointerout', () => this.hideTooltip());
    container.on('pointertap', (e) => {
      e.stopPropagation();
      const now = performance.now();
      const isDouble = this.lastTap.id === node.id && now - this.lastTap.time < 350;
      this.lastTap = { id: node.id, time: now };
      if (isDouble) {
        if (this.onNodePivot) this.onNodePivot(node);
        return;
      }
      this.selectNode(node.id);
      if (this.viewMode === 'clustered') {
        if (this.showAllMode) this.highlightPathThroughNode(node.id);
        else if (!this.activePathIds?.length) this.highlightPathsContaining(node.id);
      }
      if (this.onNodeSelect) this.onNodeSelect(node);
    });
  }

  bindEdgePointerEvents(hit, item) {
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    const key = edgeKey(item.from, item.to);
    hit.on('pointerover', (e) => {
      this.setHoveredEdge(key);
      const fromNode = this.nodeById(item.from);
      const toNode = this.nodeById(item.to);
      const text =
        this.formatEdgeTooltip?.(item.edge, fromNode, toNode) ??
        `${fromNode?.label ?? item.from} → ${toNode?.label ?? item.to}\n${relationLabel(item.edge)}`;
      this.showTooltip(text, e.clientX, e.clientY);
    });
    hit.on('pointermove', (e) => {
      if (this.tooltipEl?.style.display === 'block') {
        this.showTooltip(this.tooltipEl.textContent, e.clientX, e.clientY);
      }
    });
    hit.on('pointerout', () => {
      this.setHoveredEdge(null);
      this.hideTooltip();
    });
    hit.on('pointertap', (e) => {
      e.stopPropagation();
      this.setPinnedEdge(key);
    });
  }

  addEdgeLabel(item, x, y) {
    const label = new Container();
    label.x = x;
    label.y = y - EDGE_LABEL_OFFSET_Y;
    label.visible = false;

    const text = this.makeText(relationLabel(item.edge), styles.edgeLabel);
    text.anchor.set(0.5);
    const bg = new Graphics();
    skipPointer(bg, text, label);
    label.addChild(bg, text);

    item.label = label;
    item.labelBg = bg;
    item.labelText = text;
    this.styleEdgeLabel(item, false);

    if (this.edgeLabelLayer) this.edgeLabelLayer.addChild(label);
    return label;
  }

  addStepBadge(parent, x, y, step) {
    const badge = new Container();
    badge.x = x;
    badge.y = y;
    const ring = new Graphics();
    ring.circle(0, 0, 16).fill({ color: 0xffd166 }).stroke({ width: 2, color: 0x1a1d24 });
    const label = this.makeText(String(step), styles.step);
    label.anchor.set(0.5);
    skipPointer(ring, label);
    badge.addChild(ring, label);
    parent.addChild(badge);
    return badge;
  }

  addStepBadgeForNode(nodeId, step) {
    const pos = this.positions.get(nodeId);
    if (!pos || !this.stepBadgeLayer) return null;
    return this.addStepBadge(this.stepBadgeLayer, pos.x + NODE_W - 22, pos.y + 10, step);
  }

  makeText(text, style) {
    return new Text({ text, style, resolution: TEXT_RES * 2, roundPixels: true });
  }

  nodeTitleStyle(label) {
    const length = plainLabel(label).length;
    const fontSize = length > 90 ? 11 : length > 60 ? 12 : length > 36 ? 13 : 14;
    return new TextStyle({
      fill: '#f1f3f5',
      fontSize,
      fontWeight: '700',
      wordWrap: true,
      breakWords: true,
      wordWrapWidth: NODE_W - 20,
      lineHeight: fontSize + 3,
    });
  }

  measureNodeHeight(node) {
    const title = this.makeText(plainLabel(node.label), this.nodeTitleStyle(node.label));
    const meta = this.makeText(nodeLocation(node) || node.kind || 'symbol', styles.meta);
    const badge = this.makeText(node.kind ?? 'symbol', styles.badge);
    const height = Math.max(MIN_NODE_H, Math.ceil(8 + title.height + 5 + meta.height + 5 + badge.height + 10));
    title.destroy();
    meta.destroy();
    badge.destroy();
    return height;
  }

  clearWorld() {
    this.stopAnimation();
    this.hideTooltip();
    this.hoveredEdgeKey = null;
    this.pinnedEdgeKey = null;
    this.world.removeChildren();
    this.nodeSprites.clear();
    this.edgeItems = [];
    this.pathEdgeLayer = null;
    this.stepBadgeLayer = null;
    this.edgeLabelLayer = null;
    this.positions.clear();
  }

  restorePathHighlight() {
    if (!this.activePathIds?.length) return;
    this.highlightNodeIds = new Set(this.activePathIds);
    this.highlightEdgeKeys = pathEdgeKeys(this.activePathIds);
  }

  drawPathEdgeOverlay() {
    if (!this.pathEdgeLayer || !this.highlightEdgeKeys?.size) return;
    this.pathEdgeLayer.removeChildren();
    for (const item of this.edgeItems) {
      if (!this.highlightEdgeKeys.has(edgeKey(item.from, item.to))) continue;
      const from = this.positions.get(item.from);
      const to = this.positions.get(item.to);
      if (!from || !to) continue;
      const spread = item.spread ?? 0;
      const x1 = from.x + NODE_W;
      const y1 = from.y + from.height / 2;
      const x2 = to.x;
      const y2 = to.y + to.height / 2;
      const gfx = new Graphics();
      gfx.moveTo(x1, y1);
      gfx.bezierCurveTo(x1 + 80, y1 + spread, x2 - 80, y2 - spread, x2, y2);
      gfx.stroke({ width: 4, color: 0xffd166, alpha: 1 });
      const head = new Graphics();
      head.poly([0, 0, -12, -6, -12, 6]).fill(0xffd166);
      head.x = x2;
      head.y = y2;
      head.rotation = Math.atan2(y2 - (y1 + spread * 0.2), x2 - (x2 - 80));
      skipPointer(gfx, head);
      this.pathEdgeLayer.addChild(gfx, head);
    }
  }

  addNode(node, isTarget, selected) {
    const pos = this.positions.get(node.id);
    if (!pos) return;
    const container = new Container();
    container.x = pos.x;
    container.y = pos.y;
    container.eventMode = 'static';
    container.cursor = 'pointer';

    const gfx = new Graphics();
    const km = kindMeta(node.kind);
    const fill = isTarget ? 0x1f3a5f : km.fill;
    const stroke = selected ? 0xffd166 : isTarget ? 0x58a6ff : 0x2f3542;
    gfx.roundRect(0, 0, NODE_W, pos.height, 8).fill(fill).stroke({
      width: selected ? 3 : isTarget ? 2.5 : 1.5,
      color: stroke,
    });
    gfx.rect(0, 0, 4, pos.height).fill({ color: km.accent, alpha: isTarget ? 1 : 0.75 });
    skipPointer(gfx);

    const title = this.makeText(plainLabel(node.label), this.nodeTitleStyle(node.label));
    title.x = 10;
    title.y = 8;

    const meta = this.makeText(nodeLocation(node) || node.kind || 'symbol', styles.meta);
    meta.x = 10;
    meta.y = title.y + title.height + 5;

    const step = this.getTraceStep(node.id);
    const badgeText = step != null ? (node.kind ?? 'symbol') : `${node.kind ?? 'symbol'} · hop ${node.hop}`;
    const badge = this.makeText(badgeText, styles.badge);
    badge.x = 10;
    badge.y = meta.y + meta.height + 5;
    skipPointer(title, meta, badge);

    container.addChild(gfx, title, meta, badge);
    const stepBadge =
      step != null
        ? this.stepBadgeLayer
          ? this.addStepBadgeForNode(node.id, step)
          : this.addStepBadge(container, NODE_W - 22, 10, step)
        : null;

    container.hitArea = new Rectangle(0, 0, NODE_W, pos.height);
    this.bindNodePointerEvents(container, node);

    this.nodeSprites.set(node.id, { container, gfx, node, title, meta, badge, stepBadge, height: pos.height });
    this.nodeLayer.addChild(container);
  }

  drawBezierEdge(from, to, edge, spread, active) {
    const x1 = from.x + NODE_W;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const cx1 = x1 + 80;
    const cy1 = y1 + spread;
    const cx2 = x2 - 80;
    const cy2 = y2 - spread;
    const color = edgeColor(edge, active);
    const width = active ? 3.5 : 1.5;
    const alpha = active ? 1 : this.highlightEdgeKeys ? 0.12 : 0.55;

    const gfx = new Graphics();
    gfx.moveTo(x1, y1);
    gfx.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
    gfx.stroke({ width, color, alpha });

    const head = new Graphics();
    head.poly([0, 0, -10, -5, -10, 5]).fill({ color, alpha });
    head.x = x2;
    head.y = y2;
    head.rotation = Math.atan2(y2 - (y1 + spread * 0.2), x2 - (x2 - 80));
    skipPointer(gfx, head);

    const hit = new Graphics();
    hit.moveTo(x1, y1);
    hit.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
    hit.stroke({ width: 14, color: 0xffffff, alpha: 0.001 });

    const mid = bezierPoint(x1, y1, cx1, cy1, cx2, cy2, x2, y2, 0.5);

    return { gfx, head, hit, mid, from: edge.from, to: edge.to, edge, spread };
  }

  drawLinearEdge(from, to, edge, animated) {
    const x1 = from.x + NODE_W + 6;
    const y1 = from.y + from.height / 2;
    const x2 = to.x - 6;
    const y2 = to.y + to.height / 2;
    const color = edgeColor(edge, true);

    const gfx = new Graphics();
    gfx.moveTo(x1, y1);
    gfx.lineTo(x2, y2);
    gfx.stroke({ width: 3, color, alpha: 0.35 });
    gfx.moveTo(x1, y1);
    gfx.lineTo(x2, y2);
    gfx.stroke({ width: 2, color, alpha: 0.9 });

    const head = new Graphics();
    head.poly([0, 0, -12, -6, -12, 6]).fill(color);
    head.x = x2;
    head.y = y2;
    head.rotation = Math.atan2(y2 - y1, x2 - x1);
    skipPointer(gfx, head);

    const hit = new Graphics();
    hit.moveTo(x1, y1);
    hit.lineTo(x2, y2);
    hit.stroke({ width: 14, color: 0xffffff, alpha: 0.001 });

    const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };

    const items = { gfx, head, hit, mid, from: edge.from, to: edge.to, edge };
    if (animated) {
      const dot = new Graphics();
      dot.circle(0, 0, 5).fill({ color: 0xffd166, alpha: 0.95 });
      dot.circle(0, 0, 9).stroke({ width: 2, color: 0xffd166, alpha: 0.35 });
      skipPointer(dot);
      this.edgeLayer.addChild(dot);
      this.flowItems.push({
        dot,
        x1,
        y1,
        x2,
        y2,
        phase: Math.random(),
      });
    }
    return items;
  }

  paintNode(sprite, selected, active = true) {
    const node = sprite.node;
    const isTarget = node.id === this.lineage?.target?.id;
    const muted = !active;
    const km = kindMeta(node.kind);
    const fill = isTarget ? 0x1f3a5f : km.fill;
    const stroke = selected ? 0xffd166 : isTarget ? 0x58a6ff : active ? 0x7aa2f7 : 0x2f3542;
    sprite.container.alpha = 1;
    sprite.gfx.clear();
    sprite.gfx.roundRect(0, 0, NODE_W, sprite.height, 8).fill({ color: fill, alpha: muted ? 0.35 : 1 }).stroke({
      width: selected ? 3 : isTarget ? 2.5 : 1.5,
      color: stroke,
      alpha: muted ? 0.45 : 1,
    });
    sprite.gfx.rect(0, 0, 4, sprite.height).fill({ color: km.accent, alpha: muted ? 0.3 : isTarget ? 1 : 0.75 });
    const textAlpha = muted ? 0.45 : 1;
    if (sprite.title) sprite.title.alpha = textAlpha;
    if (sprite.meta) sprite.meta.alpha = textAlpha;
    if (sprite.badge) sprite.badge.alpha = textAlpha;
    if (sprite.stepBadge) sprite.stepBadge.alpha = muted ? 0.55 : 1;
  }

  applyHighlightStyles() {
    if (this.viewMode === 'path') return;
    const nodeActive = this.highlightNodeIds ? (id) => this.highlightNodeIds.has(id) : () => true;
    const edgeActive = this.highlightEdgeKeys ? (from, to) => this.highlightEdgeKeys.has(edgeKey(from, to)) : () => true;

    if (this.showAllMode) {
      if (!this.highlightEdgeKeys?.size) return;
      for (const [nodeId, sprite] of this.nodeSprites) {
        this.paintNode(sprite, nodeId === this.selectedId, true);
      }
      for (const item of this.edgeItems) {
        const active = edgeActive(item.from, item.to);
        const from = this.positions.get(item.from);
        const to = this.positions.get(item.to);
        if (!from || !to) continue;
        const spread = item.spread ?? 0;
        const x1 = from.x + NODE_W;
        const y1 = from.y + from.height / 2;
        const x2 = to.x;
        const y2 = to.y + to.height / 2;
        const color = edgeColor(item.edge, false);
        const width = 1.5;
        const alpha = active ? 0.2 : 0.35;
        item.gfx.clear();
        item.gfx.moveTo(x1, y1);
        item.gfx.bezierCurveTo(x1 + 80, y1 + spread, x2 - 80, y2 - spread, x2, y2);
        item.gfx.stroke({ width, color, alpha });
        item.head.clear();
        item.head.poly([0, 0, -10, -5, -10, 5]).fill({ color, alpha });
        item.head.x = x2;
        item.head.y = y2;
        item.head.rotation = Math.atan2(y2 - (y1 + spread * 0.2), x2 - (x2 - 80));
      }
      this.drawPathEdgeOverlay();
      this.updateEdgeLabelVisibility();
      return;
    }

    for (const [nodeId, sprite] of this.nodeSprites) {
      const active = nodeActive(nodeId);
      this.paintNode(sprite, nodeId === this.selectedId, active);
    }

    for (const item of this.edgeItems) {
      const active = edgeActive(item.from, item.to);
      const from = this.positions.get(item.from);
      const to = this.positions.get(item.to);
      if (!from || !to) continue;
      const spread = item.spread ?? 0;
      item.gfx.clear();
      item.head.clear();
      const x1 = from.x + NODE_W;
      const y1 = from.y + from.height / 2;
      const x2 = to.x;
      const y2 = to.y + to.height / 2;
      const color = edgeColor(item.edge, active);
      const width = active ? 3.5 : 1.5;
      const alpha = active ? 1 : this.highlightEdgeKeys ? 0.1 : 0.55;
      item.gfx.moveTo(x1, y1);
      item.gfx.bezierCurveTo(x1 + 80, y1 + spread, x2 - 80, y2 - spread, x2, y2);
      item.gfx.stroke({ width, color, alpha });
      item.head.poly([0, 0, -10, -5, -10, 5]).fill({ color, alpha });
      item.head.x = x2;
      item.head.y = y2;
      item.head.rotation = Math.atan2(y2 - (y1 + spread * 0.2), x2 - (x2 - 80));
    }
    this.updateEdgeLabelVisibility();
  }

  findBestPathThrough(nodeId) {
    const matches = (this.lineage?.paths ?? []).filter((p) => p.nodeIds.includes(nodeId));
    if (!matches.length) return null;
    matches.sort((a, b) => b.nodeIds.length - a.nodeIds.length);
    const best = matches[0];
    return best.direction === 'upstream' ? [...best.nodeIds].reverse() : [...best.nodeIds];
  }

  highlightPathThroughNode(nodeId) {
    const nodeIds = this.findBestPathThrough(nodeId);
    if (!nodeIds?.length) return null;
    return this.highlightPathOverlay(nodeIds);
  }

  highlightPathOverlay(nodeIds) {
    if (!nodeIds?.length) return null;
    if (this.viewMode === 'path') {
      this.setActivePath(nodeIds);
      return nodeIds;
    }
    this.activePathIds = [...nodeIds];
    this.highlightNodeIds = new Set(nodeIds);
    this.highlightEdgeKeys = pathEdgeKeys(nodeIds);
    this.rerender();
    return nodeIds;
  }

  highlightPath(nodeIds) {
    if (this.viewMode === 'path') {
      this.setActivePath(nodeIds);
      return;
    }
    this.activePathIds = nodeIds?.length ? [...nodeIds] : null;
    this.highlightNodeIds = nodeIds?.length ? new Set(nodeIds) : null;
    this.highlightEdgeKeys = nodeIds?.length ? pathEdgeKeys(nodeIds) : null;
    this.rerender();
  }

  highlightEdge(from, to) {
    this.activePathIds = [from, to];
    this.highlightNodeIds = new Set([from, to]);
    this.highlightEdgeKeys = new Set([edgeKey(from, to)]);
    if (this.viewMode === 'path') {
      this.setActivePath([from, to]);
      return;
    }
    this.rerender();
  }

  highlightPathsContaining(nodeId) {
    if (this.viewMode === 'path' || this.showAllMode) return;
    if (this.activePathIds?.length) return;
    if (!this.lineage?.paths?.length) return;
    const nodeIds = new Set([nodeId]);
    const edgeKeys = new Set();
    for (const path of this.lineage.paths) {
      if (!path.nodeIds.includes(nodeId)) continue;
      for (const id of path.nodeIds) nodeIds.add(id);
      for (const key of pathEdgeKeys(path.nodeIds)) edgeKeys.add(key);
    }
    this.highlightNodeIds = nodeIds;
    this.highlightEdgeKeys = edgeKeys;
    this.applyHighlightStyles();
    if (this.showAllMode) this.drawPathEdgeOverlay();
  }

  clearHighlight() {
    this.highlightNodeIds = null;
    this.highlightEdgeKeys = null;
    this.activePathIds = null;
    if (this.viewMode === 'clustered') this.rerender();
  }

  clearSelection() {
    this.selectedId = null;
    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  renderPathView(nodeIds) {
    const nodeById = new Map(this.lineage.nodes.map((n) => [n.id, n]));
    const nodes = nodeIds.map((id) => nodeById.get(id)).filter(Boolean);
    if (!nodes.length) {
      const hint = this.makeText(
        'Select a trace path from the sidebar to view a linear lineage chain.',
        styles.hint,
      );
      hint.anchor.set(0.5);
      hint.x = this.host.clientWidth / 2;
      hint.y = this.host.clientHeight / 2;
      this.world.addChild(hint);
      return;
    }

    this.positions = this.layoutPath(nodeIds);
    this.edgeLayer = new Container();
    this.edgeLayer.eventMode = 'passive';
    this.edgeLayer.interactiveChildren = true;
    this.edgeLabelLayer = new Container();
    skipPointer(this.edgeLabelLayer);
    this.edgeLabelLayer.eventMode = 'none';
    this.nodeLayer = new Container();
    this.nodeLayer.eventMode = 'static';
    this.nodeLayer.interactiveChildren = true;
    this.stepBadgeLayer = new Container();
    skipPointer(this.stepBadgeLayer);
    this.stepBadgeLayer.eventMode = 'none';
    this.world.addChild(this.edgeLayer, this.edgeLabelLayer, this.nodeLayer);

    for (let i = 0; i < nodeIds.length - 1; i += 1) {
      const from = this.positions.get(nodeIds[i]);
      const to = this.positions.get(nodeIds[i + 1]);
      if (!from || !to) continue;
      const edge = this.findEdge(nodeIds[i], nodeIds[i + 1]);
      const item = this.drawLinearEdge(from, to, edge, true);
      this.edgeLayer.addChild(item.gfx, item.head, item.hit);
      this.bindEdgePointerEvents(item.hit, item);
      this.addEdgeLabel(item, item.mid.x, item.mid.y);
      this.edgeItems.push(item);
    }

    for (const node of nodes) {
      const isTarget = node.id === this.lineage.target.id;
      this.addNode(node, isTarget, node.id === this.selectedId);
    }

    this.world.addChild(this.stepBadgeLayer);

    this.startFlowAnimation();
    this.fitToView();
  }

  renderClustered(data) {
    this.highlightNodeIds = null;
    this.highlightEdgeKeys = null;
    this.positions = this.layoutClustered(
      data.nodes,
      data.edges,
      data.paths ?? this.lineage?.paths,
      this.activePathIds,
      data.target?.id,
    );

    this.edgeLayer = new Container();
    this.edgeLayer.eventMode = 'passive';
    this.edgeLayer.interactiveChildren = true;
    this.edgeLabelLayer = new Container();
    skipPointer(this.edgeLabelLayer);
    this.edgeLabelLayer.eventMode = 'none';
    this.nodeLayer = new Container();
    this.nodeLayer.eventMode = 'static';
    this.nodeLayer.interactiveChildren = true;
    this.world.addChild(this.edgeLayer, this.edgeLabelLayer, this.nodeLayer);

    const lanesBySource = new Map();
    for (const edge of data.edges) {
      if (!this.positions.get(edge.from) || !this.positions.get(edge.to)) continue;
      const bucket = lanesBySource.get(edge.from) ?? [];
      bucket.push(edge);
      lanesBySource.set(edge.from, bucket);
    }
    for (const bucket of lanesBySource.values()) {
      bucket.sort((a, b) => (this.positions.get(a.to)?.y ?? 0) - (this.positions.get(b.to)?.y ?? 0));
    }

    for (const bucket of lanesBySource.values()) {
      bucket.forEach((edge, laneIndex) => {
        const from = this.positions.get(edge.from);
        const to = this.positions.get(edge.to);
        if (!from || !to) return;
        const spread = bucket.length > 1 ? (laneIndex - (bucket.length - 1) / 2) * 22 : 0;
        const item = this.drawBezierEdge(from, to, edge, spread, false);
        item.spread = spread;
        this.edgeLayer.addChild(item.gfx, item.head, item.hit);
        this.bindEdgePointerEvents(item.hit, item);
        this.addEdgeLabel(item, item.mid.x, item.mid.y);
        this.edgeItems.push(item);
      });
    }

    this.pathEdgeLayer = new Container();
    skipPointer(this.pathEdgeLayer);
    this.world.addChild(this.pathEdgeLayer);

    this.stepBadgeLayer = new Container();
    skipPointer(this.stepBadgeLayer);
    this.stepBadgeLayer.eventMode = 'none';

    for (const node of data.nodes) {
      const isTarget = node.id === data.target.id;
      this.addNode(node, isTarget, node.id === this.selectedId);
    }

    this.world.addChild(this.stepBadgeLayer);

    this.fitToView();
  }

  drawDashedLine(gfx, x1, y1, x2, y2, dash = 8, gap = 4) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    let dist = 0;
    while (dist < len) {
      const start = dist;
      const end = Math.min(dist + dash, len);
      const sx = x1 + ux * start;
      const sy = y1 + uy * start;
      const ex = x1 + ux * end;
      const ey = y1 + uy * end;
      gfx.moveTo(sx, sy);
      gfx.lineTo(ex, ey);
      dist += dash + gap;
    }
  }

  addSeqParticipant(participant, x, y) {
    const node = participant.node;
    const km = kindMeta(participant.kind);
    const container = new Container();
    container.x = x - SEQ_PARTICIPANT_W / 2;
    container.y = y;
    container.eventMode = 'static';
    container.cursor = 'pointer';

    const gfx = new Graphics();
    gfx.roundRect(0, 0, SEQ_PARTICIPANT_W, SEQ_PARTICIPANT_H, 8).fill(km.fill).stroke({
      width: node?.id === this.selectedId ? 2.5 : 1.5,
      color: node?.id === this.selectedId ? 0xffd166 : 0x2f3542,
    });
    gfx.rect(0, 0, 4, SEQ_PARTICIPANT_H).fill({ color: km.accent, alpha: 0.85 });
    skipPointer(gfx);

    const title = this.makeText(plainLabel(participant.label), {
      ...styles.badge,
      fill: '#f1f3f5',
      fontSize: 12,
      fontWeight: '700',
      wordWrap: true,
      wordWrapWidth: SEQ_PARTICIPANT_W - 16,
    });
    title.x = 10;
    title.y = 8;

    const badge = this.makeText(km.label, styles.badge);
    badge.x = 10;
    badge.y = title.y + title.height + 4;
    skipPointer(title, badge);

    container.addChild(gfx, title, badge);
    container.hitArea = new Rectangle(0, 0, SEQ_PARTICIPANT_W, SEQ_PARTICIPANT_H);

    if (node) {
      this.bindNodePointerEvents(container, node);
    }

    this.nodeLayer.addChild(container);
    this.nodeSprites.set(participant.id, {
      container,
      gfx,
      node,
      title,
      meta: badge,
      badge,
      height: SEQ_PARTICIPANT_H,
    });
  }

  drawSeqLifeline(x, yTop, yBottom) {
    const gfx = new Graphics();
    this.drawDashedLine(gfx, x, yTop, x, yBottom);
    gfx.stroke({ width: 1.5, color: 0x2f3542, alpha: 0.85 });
    skipPointer(gfx);
    this.edgeLayer.addChild(gfx);
  }

  addSeqMessage(msg, layout, fromX, toX, y) {
    const relation = relationUpper(msg.edge);
    const async = msg.async || isAsyncRelation(relation);
    const orderUncertain = !async && msg.orderConfidence !== 'source-order';
    const color = async ? 0xc084fc : edgeColor(msg.edge, false);
    const alpha = msg.certain ? 1 : 0.75;

    const gfx = new Graphics();
    if (async) {
      this.drawDashedLine(gfx, fromX, y, toX, y);
    } else {
      gfx.moveTo(fromX, y);
      gfx.lineTo(toX, y);
    }
    gfx.stroke({ width: async ? 2 : 2.5, color, alpha });

    const head = new Graphics();
    const tipX = toX > fromX ? toX - 8 : toX + 8;
    head.poly([0, 0, -10, -5, -10, 5]).fill({ color, alpha });
    head.x = tipX;
    head.y = y;
    head.rotation = toX >= fromX ? 0 : Math.PI;
    skipPointer(gfx, head);

    const hit = new Graphics();
    hit.moveTo(fromX, y);
    hit.lineTo(toX, y);
    hit.stroke({ width: 14, color: 0xffffff, alpha: 0.001 });

    const labelText = orderUncertain && !relation.endsWith('?') ? `${msg.label}?` : msg.label;
    const label = this.makeText(labelText, async ? styles.edgeLabel : styles.edgeLabel);
    label.anchor.set(0.5, 1);
    label.x = (fromX + toX) / 2;
    label.y = y - 6;

    const stepLabel = formatStepPath(msg.stepPath, orderUncertain);
    const stepText = this.makeText(stepLabel, styles.step);
    stepText.anchor.set(0.5);
    stepText.x = Math.min(fromX, toX) - 28;
    stepText.y = y;

    const item = { gfx, head, hit, from: msg.fromId, to: msg.toId, edge: msg.edge, mid: { x: (fromX + toX) / 2, y } };
    this.bindEdgePointerEvents(hit, item);
    this.edgeLayer.addChild(gfx, head, hit);
    this.edgeLabelLayer.addChild(label, stepText);

    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    hit.on('pointertap', (e) => {
      e.stopPropagation();
      const toNode = this.nodeById(msg.toId);
      if (toNode && this.onNodeSelect) this.onNodeSelect(toNode);
    });
  }

  drawAsyncDivider(y, xStart, xEnd) {
    const gfx = new Graphics();
    this.drawDashedLine(gfx, xStart, y, xEnd, y);
    gfx.stroke({ width: 1.5, color: 0x4b5563, alpha: 0.9 });
    skipPointer(gfx);
    this.edgeLayer.addChild(gfx);

    const label = this.makeText('async', {
      fill: '#c084fc',
      fontSize: 11,
      fontWeight: '700',
    });
    label.anchor.set(0.5);
    label.x = (xStart + xEnd) / 2;
    label.y = y;
    skipPointer(label);
    this.edgeLabelLayer.addChild(label);
  }

  renderSequence(seq, layout) {
    this.seq = seq;
    this.seqLayout = layout;
    this.seqMessages = seq.segments.flatMap((segment) => segment.messages);

    this.edgeLayer = new Container();
    this.edgeLayer.eventMode = 'passive';
    this.edgeLayer.interactiveChildren = true;
    this.edgeLabelLayer = new Container();
    skipPointer(this.edgeLabelLayer);
    this.edgeLabelLayer.eventMode = 'none';
    this.nodeLayer = new Container();
    this.nodeLayer.eventMode = 'static';
    this.nodeLayer.interactiveChildren = true;
    this.world.addChild(this.edgeLayer, this.edgeLabelLayer, this.nodeLayer);

    const yTop = layout.padding + SEQ_PARTICIPANT_H;
    const yBottom = layout.totalH - layout.padding;

    for (let i = 0; i < seq.participants.length; i += 1) {
      const x = layout.participantX[i];
      this.drawSeqLifeline(x, yTop, yBottom);
      this.addSeqParticipant(seq.participants[i], x, layout.padding);
    }

    const xStart = layout.participantX[0] ?? layout.padding;
    const xEnd =
      layout.participantX[seq.participants.length - 1] ?? layout.padding + SEQ_PARTICIPANT_W;

    for (const row of layout.messageY) {
      if (row.kind === 'async-divider') {
        this.drawAsyncDivider(row.y, xStart - SEQ_PARTICIPANT_W / 2, xEnd + SEQ_PARTICIPANT_W / 2);
        continue;
      }
      const msg = row.message;
      const fromX = layout.participantX[msg.fromIdx];
      const toX = layout.participantX[msg.toIdx];
      this.addSeqMessage(msg, layout, fromX, toX, row.y);
    }

    this.positions = new Map();
    for (let i = 0; i < seq.participants.length; i += 1) {
      this.positions.set(seq.participants[i].id, {
        x: layout.participantX[i] - SEQ_PARTICIPANT_W / 2,
        y: layout.padding,
        width: SEQ_PARTICIPANT_W,
        height: SEQ_PARTICIPANT_H,
      });
    }

    this.fitToView(0.5);
  }

  rerender() {
    if (!this.app || !this.lineage) return;
    this.clearWorld();
    if (this.viewMode === 'sequence') {
      const rootId = this.selectedId ?? this.lineage?.target?.id;
      this.seq = buildSequence(this.lineage, rootId);
      const layout = layoutSequence(this.seq, this.host);
      this.renderSequence(this.seq, layout);
      return;
    }
    if (this.viewMode === 'path') {
      this.renderPathView(this.activePathIds ?? []);
    } else {
      this.renderClustered(this.lineage);
      if (this.activePathIds?.length) {
        this.restorePathHighlight();
        this.applyHighlightStyles();
      } else if (!this.showAllMode && this.selectedId) {
        this.highlightPathsContaining(this.selectedId);
      }
    }
  }

  render(data) {
    if (!this.app) return;
    this.lineage = data;
    this.rerender();
  }

  updateSeqSelectionHighlight(selectedId) {
    for (const [nodeId, sprite] of this.nodeSprites) {
      const node = sprite.node;
      if (!node) continue;
      const km = kindMeta(node.kind);
      const selected = nodeId === selectedId;
      sprite.gfx.clear();
      sprite.gfx.roundRect(0, 0, SEQ_PARTICIPANT_W, SEQ_PARTICIPANT_H, 8).fill(km.fill).stroke({
        width: selected ? 2.5 : 1.5,
        color: selected ? 0xffd166 : 0x2f3542,
      });
      sprite.gfx.rect(0, 0, 4, SEQ_PARTICIPANT_H).fill({ color: km.accent, alpha: 0.85 });
    }
  }

  selectNode(id) {
    const prev = this.selectedId;
    this.selectedId = id;
    if (this.viewMode === 'sequence') {
      const rootId = id ?? this.lineage?.target?.id;
      const prevRoot = prev ?? this.lineage?.target?.id;
      if (rootId !== prevRoot) this.rerender();
      else this.updateSeqSelectionHighlight(id);
      return;
    }
    if (this.viewMode === 'clustered') this.applyHighlightStyles();
    else {
      for (const [nodeId, sprite] of this.nodeSprites) {
        this.paintNode(sprite, nodeId === id, true);
      }
    }
  }

  graphWorldBounds() {
    if (this.viewMode === 'sequence' && this.seqLayout) {
      return {
        minX: 0,
        minY: 0,
        maxX: this.seqLayout.totalW,
        maxY: this.seqLayout.totalH,
        width: this.seqLayout.totalW,
        height: this.seqLayout.totalH,
      };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pos of this.positions.values()) {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + NODE_W);
      maxY = Math.max(maxY, pos.y + pos.height);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  fitToView(minScale = 0.7) {
    if (this.positions.size === 0) return;
    const { minX, minY, maxX, maxY, width, height } = this.graphWorldBounds();
    const pad = 60;
    const bw = width + pad * 2;
    const bh = height + pad * 2;
    const sx = this.host.clientWidth / bw;
    const sy = this.host.clientHeight / bh;
    const scale = Math.min(1.25, Math.max(minScale, Math.min(sx, sy)));
    this.world.scale.set(scale);
    this.world.x = (this.host.clientWidth - (minX + maxX) * scale) / 2;
    this.world.y = (this.host.clientHeight - (minY + maxY) * scale) / 2;
  }

  captureGraphImage() {
    if (!this.app || !this.world || this.positions.size === 0) {
      throw new Error('Render a graph before exporting it.');
    }

    this.hideTooltip();
    const wasAnimating = Boolean(this.tickerFn);
    this.stopAnimation();

    const pad = 80;
    const bounds = this.graphWorldBounds();
    const frameW = bounds.width + pad * 2;
    const frameH = bounds.height + pad * 2;
    const maxPixels = 8192;
    const resolution = Math.max(1, Math.min(3, maxPixels / frameW, maxPixels / frameH));

    const transform = {
      x: this.world.x,
      y: this.world.y,
      scaleX: this.world.scale.x,
      scaleY: this.world.scale.y,
    };

    try {
      this.world.position.set(0, 0);
      this.world.scale.set(1);

      const canvas = this.app.renderer.extract.canvas({
        target: this.world,
        frame: new Rectangle(bounds.minX - pad, bounds.minY - pad, frameW, frameH),
        resolution,
        antialias: true,
        clearColor: '#0b0d12',
      });

      return {
        dataUrl: canvas.toDataURL('image/jpeg', 0.95),
        format: 'JPEG',
        width: canvas.width,
        height: canvas.height,
        worldWidth: frameW,
        worldHeight: frameH,
      };
    } finally {
      this.world.position.set(transform.x, transform.y);
      this.world.scale.set(transform.scaleX, transform.scaleY);
      this.app.renderer.render(this.app.stage);
      if (wasAnimating) this.startFlowAnimation();
    }
  }

  destroy() {
    this.stopAnimation();
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
      this.initPromise = null;
    }
    this.host.innerHTML = '';
  }
}
