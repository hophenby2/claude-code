import {
  Align,
  BoxSizing,
  Dimension,
  Direction,
  Display,
  Edge,
  Errata,
  ExperimentalFeature,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Overflow,
  PositionType,
  Unit,
  Wrap
} from "./enums.js";
const UNDEFINED_VALUE = { unit: Unit.Undefined, value: NaN };
const AUTO_VALUE = { unit: Unit.Auto, value: NaN };
function pointValue(v) {
  return { unit: Unit.Point, value: v };
}
function percentValue(v) {
  return { unit: Unit.Percent, value: v };
}
function resolveValue(v, ownerSize) {
  switch (v.unit) {
    case Unit.Point:
      return v.value;
    case Unit.Percent:
      return isNaN(ownerSize) ? NaN : v.value * ownerSize / 100;
    default:
      return NaN;
  }
}
function isDefined(n) {
  return !isNaN(n);
}
function sameFloat(a, b) {
  return a === b || a !== a && b !== b;
}
function defaultStyle() {
  return {
    direction: Direction.Inherit,
    flexDirection: FlexDirection.Column,
    justifyContent: Justify.FlexStart,
    alignItems: Align.Stretch,
    alignSelf: Align.Auto,
    alignContent: Align.FlexStart,
    flexWrap: Wrap.NoWrap,
    overflow: Overflow.Visible,
    display: Display.Flex,
    positionType: PositionType.Relative,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: AUTO_VALUE,
    margin: new Array(9).fill(UNDEFINED_VALUE),
    padding: new Array(9).fill(UNDEFINED_VALUE),
    border: new Array(9).fill(UNDEFINED_VALUE),
    position: new Array(9).fill(UNDEFINED_VALUE),
    gap: new Array(3).fill(UNDEFINED_VALUE),
    width: AUTO_VALUE,
    height: AUTO_VALUE,
    minWidth: UNDEFINED_VALUE,
    minHeight: UNDEFINED_VALUE,
    maxWidth: UNDEFINED_VALUE,
    maxHeight: UNDEFINED_VALUE
  };
}
const EDGE_LEFT = 0;
const EDGE_TOP = 1;
const EDGE_RIGHT = 2;
const EDGE_BOTTOM = 3;
function resolveEdge(edges, physicalEdge2, ownerSize, allowAuto = false) {
  let v = edges[physicalEdge2];
  if (v.unit === Unit.Undefined) {
    if (physicalEdge2 === EDGE_LEFT || physicalEdge2 === EDGE_RIGHT) {
      v = edges[Edge.Horizontal];
    } else {
      v = edges[Edge.Vertical];
    }
  }
  if (v.unit === Unit.Undefined) {
    v = edges[Edge.All];
  }
  if (v.unit === Unit.Undefined) {
    if (physicalEdge2 === EDGE_LEFT) v = edges[Edge.Start];
    if (physicalEdge2 === EDGE_RIGHT) v = edges[Edge.End];
  }
  if (v.unit === Unit.Undefined) return 0;
  if (v.unit === Unit.Auto) return allowAuto ? NaN : 0;
  return resolveValue(v, ownerSize);
}
function resolveEdgeRaw(edges, physicalEdge2) {
  let v = edges[physicalEdge2];
  if (v.unit === Unit.Undefined) {
    if (physicalEdge2 === EDGE_LEFT || physicalEdge2 === EDGE_RIGHT) {
      v = edges[Edge.Horizontal];
    } else {
      v = edges[Edge.Vertical];
    }
  }
  if (v.unit === Unit.Undefined) v = edges[Edge.All];
  if (v.unit === Unit.Undefined) {
    if (physicalEdge2 === EDGE_LEFT) v = edges[Edge.Start];
    if (physicalEdge2 === EDGE_RIGHT) v = edges[Edge.End];
  }
  return v;
}
function isMarginAuto(edges, physicalEdge2) {
  return resolveEdgeRaw(edges, physicalEdge2).unit === Unit.Auto;
}
function hasAnyAutoEdge(edges) {
  for (let i = 0; i < 9; i++) if (edges[i].unit === 3) return true;
  return false;
}
function hasAnyDefinedEdge(edges) {
  for (let i = 0; i < 9; i++) if (edges[i].unit !== 0) return true;
  return false;
}
function resolveEdges4Into(edges, ownerSize, out) {
  const eH = edges[6];
  const eV = edges[7];
  const eA = edges[8];
  const eS = edges[4];
  const eE = edges[5];
  const pctDenom = isNaN(ownerSize) ? NaN : ownerSize / 100;
  let v = edges[0];
  if (v.unit === 0) v = eH;
  if (v.unit === 0) v = eA;
  if (v.unit === 0) v = eS;
  out[0] = v.unit === 1 ? v.value : v.unit === 2 ? v.value * pctDenom : 0;
  v = edges[1];
  if (v.unit === 0) v = eV;
  if (v.unit === 0) v = eA;
  out[1] = v.unit === 1 ? v.value : v.unit === 2 ? v.value * pctDenom : 0;
  v = edges[2];
  if (v.unit === 0) v = eH;
  if (v.unit === 0) v = eA;
  if (v.unit === 0) v = eE;
  out[2] = v.unit === 1 ? v.value : v.unit === 2 ? v.value * pctDenom : 0;
  v = edges[3];
  if (v.unit === 0) v = eV;
  if (v.unit === 0) v = eA;
  out[3] = v.unit === 1 ? v.value : v.unit === 2 ? v.value * pctDenom : 0;
}
function isRow(dir) {
  return dir === FlexDirection.Row || dir === FlexDirection.RowReverse;
}
function isReverse(dir) {
  return dir === FlexDirection.RowReverse || dir === FlexDirection.ColumnReverse;
}
function crossAxis(dir) {
  return isRow(dir) ? FlexDirection.Column : FlexDirection.Row;
}
function leadingEdge(dir) {
  switch (dir) {
    case FlexDirection.Row:
      return EDGE_LEFT;
    case FlexDirection.RowReverse:
      return EDGE_RIGHT;
    case FlexDirection.Column:
      return EDGE_TOP;
    case FlexDirection.ColumnReverse:
      return EDGE_BOTTOM;
  }
}
function trailingEdge(dir) {
  switch (dir) {
    case FlexDirection.Row:
      return EDGE_RIGHT;
    case FlexDirection.RowReverse:
      return EDGE_LEFT;
    case FlexDirection.Column:
      return EDGE_BOTTOM;
    case FlexDirection.ColumnReverse:
      return EDGE_TOP;
  }
}
function createConfig() {
  const config = {
    pointScaleFactor: 1,
    errata: Errata.None,
    useWebDefaults: false,
    free() {
    },
    isExperimentalFeatureEnabled() {
      return false;
    },
    setExperimentalFeatureEnabled() {
    },
    setPointScaleFactor(f) {
      config.pointScaleFactor = f;
    },
    getErrata() {
      return config.errata;
    },
    setErrata(e) {
      config.errata = e;
    },
    setUseWebDefaults(v) {
      config.useWebDefaults = v;
    }
  };
  return config;
}
class Node {
  style;
  layout;
  parent;
  children;
  measureFunc;
  config;
  isDirty_;
  isReferenceBaseline_;
  // Per-layout scratch (not public API)
  _flexBasis = 0;
  _mainSize = 0;
  _crossSize = 0;
  _lineIndex = 0;
  // Fast-path flags maintained by style setters. Per CPU profile, the
  // positioning loop calls isMarginAuto 6× and resolveEdgeRaw(position) 4×
  // per child per layout pass — ~11k calls for the 1000-node bench, nearly
  // all of which return false/undefined since most nodes have no auto
  // margins and no position insets. These flags let us skip straight to
  // the common case with a single branch.
  _hasAutoMargin = false;
  _hasPosition = false;
  // Same pattern for the 3× resolveEdges4Into calls at the top of every
  // layoutNode(). In the 1000-node bench ~67% of those calls operate on
  // all-undefined edge arrays (most nodes have no border; only cols have
  // padding; only leaf cells have margin) — a single-branch skip beats
  // ~20 property reads + ~15 compares + 4 writes of zeros.
  _hasPadding = false;
  _hasBorder = false;
  _hasMargin = false;
  // -- Dirty-flag layout cache. Mirrors upstream CalculateLayout.cpp's
  // layoutNodeInternal: skip a subtree entirely when it's clean and we're
  // asking the same question we cached the answer to. Two slots since
  // each node typically sees a measure call (performLayout=false, from
  // computeFlexBasis) followed by a layout call (performLayout=true) with
  // different inputs per parent pass — a single slot thrashes. Re-layout
  // bench (dirty one leaf, recompute root) went 2.7x→1.1x with this:
  // clean siblings skip straight through, only the dirty chain recomputes.
  _lW = NaN;
  _lH = NaN;
  _lWM = 0;
  _lHM = 0;
  _lOW = NaN;
  _lOH = NaN;
  _lFW = false;
  _lFH = false;
  // _hasL stores INPUTS early (before compute) but layout.width/height are
  // mutated by the multi-entry cache and by subsequent compute calls with
  // different inputs. Without storing OUTPUTS, a _hasL hit returns whatever
  // layout.width/height happened to be left by the last call — the scrollbox
  // vpH=33→2624 bug. Store + restore outputs like the multi-entry cache does.
  _lOutW = NaN;
  _lOutH = NaN;
  _hasL = false;
  _mW = NaN;
  _mH = NaN;
  _mWM = 0;
  _mHM = 0;
  _mOW = NaN;
  _mOH = NaN;
  _mOutW = NaN;
  _mOutH = NaN;
  _hasM = false;
  // Cached computeFlexBasis result. For clean children, basis only depends
  // on the container's inner dimensions — if those haven't changed, skip the
  // layoutNode(performLayout=false) recursion entirely. This is the hot path
  // for scroll: 500-message content container is dirty, its 499 clean
  // children each get measured ~20× as the dirty chain's measure/layout
  // passes cascade. Basis cache short-circuits at the child boundary.
  _fbBasis = NaN;
  _fbOwnerW = NaN;
  _fbOwnerH = NaN;
  _fbAvailMain = NaN;
  _fbAvailCross = NaN;
  _fbCrossMode = 0;
  // Generation at which _fbBasis was written. Dirty nodes from a PREVIOUS
  // generation have stale cache (subtree changed), but within the SAME
  // generation the cache is fresh — the dirty chain's measure→layout
  // cascade invokes computeFlexBasis ≥2^depth times per calculateLayout on
  // fresh-mounted items, and the subtree doesn't change between calls.
  // Gating on generation instead of isDirty_ lets fresh mounts (virtual
  // scroll) cache-hit after first compute: 105k visits → ~10k.
  _fbGen = -1;
  // Multi-entry layout cache — stores (inputs → computed w,h) so hits with
  // different inputs than _hasL can restore the right dimensions. Upstream
  // yoga uses 16; 4 covers Ink's dirty-chain depth. Packed as flat arrays
  // to avoid per-entry object allocs. Slot i uses indices [i*8, i*8+8) in
  // _cIn (aW,aH,wM,hM,oW,oH,fW,fH) and [i*2, i*2+2) in _cOut (w,h).
  _cIn = null;
  _cOut = null;
  _cGen = -1;
  _cN = 0;
  _cWr = 0;
  constructor(config) {
    this.style = defaultStyle();
    this.layout = {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      border: [0, 0, 0, 0],
      padding: [0, 0, 0, 0],
      margin: [0, 0, 0, 0]
    };
    this.parent = null;
    this.children = [];
    this.measureFunc = null;
    this.config = config ?? DEFAULT_CONFIG;
    this.isDirty_ = true;
    this.isReferenceBaseline_ = false;
    _yogaLiveNodes++;
  }
  // -- Tree
  insertChild(child, index) {
    child.parent = this;
    this.children.splice(index, 0, child);
    this.markDirty();
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parent = null;
      this.markDirty();
    }
  }
  getChild(index) {
    return this.children[index];
  }
  getChildCount() {
    return this.children.length;
  }
  getParent() {
    return this.parent;
  }
  // -- Lifecycle
  free() {
    this.parent = null;
    this.children = [];
    this.measureFunc = null;
    this._cIn = null;
    this._cOut = null;
    _yogaLiveNodes--;
  }
  freeRecursive() {
    for (const c of this.children) c.freeRecursive();
    this.free();
  }
  reset() {
    this.style = defaultStyle();
    this.children = [];
    this.parent = null;
    this.measureFunc = null;
    this.isDirty_ = true;
    this._hasAutoMargin = false;
    this._hasPosition = false;
    this._hasPadding = false;
    this._hasBorder = false;
    this._hasMargin = false;
    this._hasL = false;
    this._hasM = false;
    this._cN = 0;
    this._cWr = 0;
    this._fbBasis = NaN;
  }
  // -- Dirty tracking
  markDirty() {
    this.isDirty_ = true;
    if (this.parent && !this.parent.isDirty_) this.parent.markDirty();
  }
  isDirty() {
    return this.isDirty_;
  }
  hasNewLayout() {
    return true;
  }
  markLayoutSeen() {
  }
  // -- Measure function
  setMeasureFunc(fn) {
    this.measureFunc = fn;
    this.markDirty();
  }
  unsetMeasureFunc() {
    this.measureFunc = null;
    this.markDirty();
  }
  // -- Computed layout getters
  getComputedLeft() {
    return this.layout.left;
  }
  getComputedTop() {
    return this.layout.top;
  }
  getComputedWidth() {
    return this.layout.width;
  }
  getComputedHeight() {
    return this.layout.height;
  }
  getComputedRight() {
    const p = this.parent;
    return p ? p.layout.width - this.layout.left - this.layout.width : 0;
  }
  getComputedBottom() {
    const p = this.parent;
    return p ? p.layout.height - this.layout.top - this.layout.height : 0;
  }
  getComputedLayout() {
    return {
      left: this.layout.left,
      top: this.layout.top,
      right: this.getComputedRight(),
      bottom: this.getComputedBottom(),
      width: this.layout.width,
      height: this.layout.height
    };
  }
  getComputedBorder(edge) {
    return this.layout.border[physicalEdge(edge)];
  }
  getComputedPadding(edge) {
    return this.layout.padding[physicalEdge(edge)];
  }
  getComputedMargin(edge) {
    return this.layout.margin[physicalEdge(edge)];
  }
  // -- Style setters: dimensions
  setWidth(v) {
    this.style.width = parseDimension(v);
    this.markDirty();
  }
  setWidthPercent(v) {
    this.style.width = percentValue(v);
    this.markDirty();
  }
  setWidthAuto() {
    this.style.width = AUTO_VALUE;
    this.markDirty();
  }
  setHeight(v) {
    this.style.height = parseDimension(v);
    this.markDirty();
  }
  setHeightPercent(v) {
    this.style.height = percentValue(v);
    this.markDirty();
  }
  setHeightAuto() {
    this.style.height = AUTO_VALUE;
    this.markDirty();
  }
  setMinWidth(v) {
    this.style.minWidth = parseDimension(v);
    this.markDirty();
  }
  setMinWidthPercent(v) {
    this.style.minWidth = percentValue(v);
    this.markDirty();
  }
  setMinHeight(v) {
    this.style.minHeight = parseDimension(v);
    this.markDirty();
  }
  setMinHeightPercent(v) {
    this.style.minHeight = percentValue(v);
    this.markDirty();
  }
  setMaxWidth(v) {
    this.style.maxWidth = parseDimension(v);
    this.markDirty();
  }
  setMaxWidthPercent(v) {
    this.style.maxWidth = percentValue(v);
    this.markDirty();
  }
  setMaxHeight(v) {
    this.style.maxHeight = parseDimension(v);
    this.markDirty();
  }
  setMaxHeightPercent(v) {
    this.style.maxHeight = percentValue(v);
    this.markDirty();
  }
  // -- Style setters: flex
  setFlexDirection(dir) {
    this.style.flexDirection = dir;
    this.markDirty();
  }
  setFlexGrow(v) {
    this.style.flexGrow = v ?? 0;
    this.markDirty();
  }
  setFlexShrink(v) {
    this.style.flexShrink = v ?? 0;
    this.markDirty();
  }
  setFlex(v) {
    if (v === void 0 || isNaN(v)) {
      this.style.flexGrow = 0;
      this.style.flexShrink = 0;
    } else if (v > 0) {
      this.style.flexGrow = v;
      this.style.flexShrink = 1;
      this.style.flexBasis = pointValue(0);
    } else if (v < 0) {
      this.style.flexGrow = 0;
      this.style.flexShrink = -v;
    } else {
      this.style.flexGrow = 0;
      this.style.flexShrink = 0;
    }
    this.markDirty();
  }
  setFlexBasis(v) {
    this.style.flexBasis = parseDimension(v);
    this.markDirty();
  }
  setFlexBasisPercent(v) {
    this.style.flexBasis = percentValue(v);
    this.markDirty();
  }
  setFlexBasisAuto() {
    this.style.flexBasis = AUTO_VALUE;
    this.markDirty();
  }
  setFlexWrap(wrap) {
    this.style.flexWrap = wrap;
    this.markDirty();
  }
  // -- Style setters: alignment
  setAlignItems(a) {
    this.style.alignItems = a;
    this.markDirty();
  }
  setAlignSelf(a) {
    this.style.alignSelf = a;
    this.markDirty();
  }
  setAlignContent(a) {
    this.style.alignContent = a;
    this.markDirty();
  }
  setJustifyContent(j) {
    this.style.justifyContent = j;
    this.markDirty();
  }
  // -- Style setters: display / position / overflow
  setDisplay(d) {
    this.style.display = d;
    this.markDirty();
  }
  getDisplay() {
    return this.style.display;
  }
  setPositionType(t) {
    this.style.positionType = t;
    this.markDirty();
  }
  setPosition(edge, v) {
    this.style.position[edge] = parseDimension(v);
    this._hasPosition = hasAnyDefinedEdge(this.style.position);
    this.markDirty();
  }
  setPositionPercent(edge, v) {
    this.style.position[edge] = percentValue(v);
    this._hasPosition = true;
    this.markDirty();
  }
  setPositionAuto(edge) {
    this.style.position[edge] = AUTO_VALUE;
    this._hasPosition = true;
    this.markDirty();
  }
  setOverflow(o) {
    this.style.overflow = o;
    this.markDirty();
  }
  setDirection(d) {
    this.style.direction = d;
    this.markDirty();
  }
  setBoxSizing(_) {
  }
  // -- Style setters: spacing
  setMargin(edge, v) {
    const val = parseDimension(v);
    this.style.margin[edge] = val;
    if (val.unit === Unit.Auto) this._hasAutoMargin = true;
    else this._hasAutoMargin = hasAnyAutoEdge(this.style.margin);
    this._hasMargin = this._hasAutoMargin || hasAnyDefinedEdge(this.style.margin);
    this.markDirty();
  }
  setMarginPercent(edge, v) {
    this.style.margin[edge] = percentValue(v);
    this._hasAutoMargin = hasAnyAutoEdge(this.style.margin);
    this._hasMargin = true;
    this.markDirty();
  }
  setMarginAuto(edge) {
    this.style.margin[edge] = AUTO_VALUE;
    this._hasAutoMargin = true;
    this._hasMargin = true;
    this.markDirty();
  }
  setPadding(edge, v) {
    this.style.padding[edge] = parseDimension(v);
    this._hasPadding = hasAnyDefinedEdge(this.style.padding);
    this.markDirty();
  }
  setPaddingPercent(edge, v) {
    this.style.padding[edge] = percentValue(v);
    this._hasPadding = true;
    this.markDirty();
  }
  setBorder(edge, v) {
    this.style.border[edge] = v === void 0 ? UNDEFINED_VALUE : pointValue(v);
    this._hasBorder = hasAnyDefinedEdge(this.style.border);
    this.markDirty();
  }
  setGap(gutter, v) {
    this.style.gap[gutter] = parseDimension(v);
    this.markDirty();
  }
  setGapPercent(gutter, v) {
    this.style.gap[gutter] = percentValue(v);
    this.markDirty();
  }
  // -- Style getters (partial — only what tests need)
  getFlexDirection() {
    return this.style.flexDirection;
  }
  getJustifyContent() {
    return this.style.justifyContent;
  }
  getAlignItems() {
    return this.style.alignItems;
  }
  getAlignSelf() {
    return this.style.alignSelf;
  }
  getAlignContent() {
    return this.style.alignContent;
  }
  getFlexGrow() {
    return this.style.flexGrow;
  }
  getFlexShrink() {
    return this.style.flexShrink;
  }
  getFlexBasis() {
    return this.style.flexBasis;
  }
  getFlexWrap() {
    return this.style.flexWrap;
  }
  getWidth() {
    return this.style.width;
  }
  getHeight() {
    return this.style.height;
  }
  getOverflow() {
    return this.style.overflow;
  }
  getPositionType() {
    return this.style.positionType;
  }
  getDirection() {
    return this.style.direction;
  }
  // -- Unused API stubs (present for API parity)
  copyStyle(_) {
  }
  setDirtiedFunc(_) {
  }
  unsetDirtiedFunc() {
  }
  setIsReferenceBaseline(v) {
    this.isReferenceBaseline_ = v;
    this.markDirty();
  }
  isReferenceBaseline() {
    return this.isReferenceBaseline_;
  }
  setAspectRatio(_) {
  }
  getAspectRatio() {
    return NaN;
  }
  setAlwaysFormsContainingBlock(_) {
  }
  // -- Layout entry point
  calculateLayout(ownerWidth, ownerHeight, _direction) {
    _yogaNodesVisited = 0;
    _yogaMeasureCalls = 0;
    _yogaCacheHits = 0;
    _generation++;
    const w = ownerWidth === void 0 ? NaN : ownerWidth;
    const h = ownerHeight === void 0 ? NaN : ownerHeight;
    layoutNode(
      this,
      w,
      h,
      isDefined(w) ? MeasureMode.Exactly : MeasureMode.Undefined,
      isDefined(h) ? MeasureMode.Exactly : MeasureMode.Undefined,
      w,
      h,
      true
    );
    const mar = this.layout.margin;
    const posL = resolveValue(
      resolveEdgeRaw(this.style.position, EDGE_LEFT),
      isDefined(w) ? w : 0
    );
    const posT = resolveValue(
      resolveEdgeRaw(this.style.position, EDGE_TOP),
      isDefined(w) ? w : 0
    );
    this.layout.left = mar[EDGE_LEFT] + (isDefined(posL) ? posL : 0);
    this.layout.top = mar[EDGE_TOP] + (isDefined(posT) ? posT : 0);
    roundLayout(this, this.config.pointScaleFactor, 0, 0);
  }
}
const DEFAULT_CONFIG = createConfig();
const CACHE_SLOTS = 4;
function cacheWrite(node, aW, aH, wM, hM, oW, oH, fW, fH, wasDirty) {
  if (!node._cIn) {
    node._cIn = new Float64Array(CACHE_SLOTS * 8);
    node._cOut = new Float64Array(CACHE_SLOTS * 2);
  }
  if (wasDirty && node._cGen !== _generation) {
    node._cN = 0;
    node._cWr = 0;
  }
  const i = node._cWr++ % CACHE_SLOTS;
  if (node._cN < CACHE_SLOTS) node._cN = node._cWr;
  const o = i * 8;
  const cIn = node._cIn;
  cIn[o] = aW;
  cIn[o + 1] = aH;
  cIn[o + 2] = wM;
  cIn[o + 3] = hM;
  cIn[o + 4] = oW;
  cIn[o + 5] = oH;
  cIn[o + 6] = fW ? 1 : 0;
  cIn[o + 7] = fH ? 1 : 0;
  node._cOut[i * 2] = node.layout.width;
  node._cOut[i * 2 + 1] = node.layout.height;
  node._cGen = _generation;
}
function commitCacheOutputs(node, performLayout) {
  if (performLayout) {
    node._lOutW = node.layout.width;
    node._lOutH = node.layout.height;
  } else {
    node._mOutW = node.layout.width;
    node._mOutH = node.layout.height;
  }
}
let _generation = 0;
let _yogaNodesVisited = 0;
let _yogaMeasureCalls = 0;
let _yogaCacheHits = 0;
let _yogaLiveNodes = 0;
function getYogaCounters() {
  return {
    visited: _yogaNodesVisited,
    measured: _yogaMeasureCalls,
    cacheHits: _yogaCacheHits,
    live: _yogaLiveNodes
  };
}
function layoutNode(node, availableWidth, availableHeight, widthMode, heightMode, ownerWidth, ownerHeight, performLayout, forceWidth = false, forceHeight = false) {
  _yogaNodesVisited++;
  const style = node.style;
  const layout = node.layout;
  const sameGen = node._cGen === _generation && !performLayout;
  if (!node.isDirty_ || sameGen) {
    if (!node.isDirty_ && node._hasL && node._lWM === widthMode && node._lHM === heightMode && node._lFW === forceWidth && node._lFH === forceHeight && sameFloat(node._lW, availableWidth) && sameFloat(node._lH, availableHeight) && sameFloat(node._lOW, ownerWidth) && sameFloat(node._lOH, ownerHeight)) {
      _yogaCacheHits++;
      layout.width = node._lOutW;
      layout.height = node._lOutH;
      return;
    }
    if (node._cN > 0 && (sameGen || !node.isDirty_)) {
      const cIn = node._cIn;
      for (let i = 0; i < node._cN; i++) {
        const o = i * 8;
        if (cIn[o + 2] === widthMode && cIn[o + 3] === heightMode && cIn[o + 6] === (forceWidth ? 1 : 0) && cIn[o + 7] === (forceHeight ? 1 : 0) && sameFloat(cIn[o], availableWidth) && sameFloat(cIn[o + 1], availableHeight) && sameFloat(cIn[o + 4], ownerWidth) && sameFloat(cIn[o + 5], ownerHeight)) {
          layout.width = node._cOut[i * 2];
          layout.height = node._cOut[i * 2 + 1];
          _yogaCacheHits++;
          return;
        }
      }
    }
    if (!node.isDirty_ && !performLayout && node._hasM && node._mWM === widthMode && node._mHM === heightMode && sameFloat(node._mW, availableWidth) && sameFloat(node._mH, availableHeight) && sameFloat(node._mOW, ownerWidth) && sameFloat(node._mOH, ownerHeight)) {
      layout.width = node._mOutW;
      layout.height = node._mOutH;
      _yogaCacheHits++;
      return;
    }
  }
  const wasDirty = node.isDirty_;
  if (performLayout) {
    node._lW = availableWidth;
    node._lH = availableHeight;
    node._lWM = widthMode;
    node._lHM = heightMode;
    node._lOW = ownerWidth;
    node._lOH = ownerHeight;
    node._lFW = forceWidth;
    node._lFH = forceHeight;
    node._hasL = true;
    node.isDirty_ = false;
    if (wasDirty) node._hasM = false;
  } else {
    node._mW = availableWidth;
    node._mH = availableHeight;
    node._mWM = widthMode;
    node._mHM = heightMode;
    node._mOW = ownerWidth;
    node._mOH = ownerHeight;
    node._hasM = true;
    if (wasDirty) node._hasL = false;
  }
  const pad = layout.padding;
  const bor = layout.border;
  const mar = layout.margin;
  if (node._hasPadding) resolveEdges4Into(style.padding, ownerWidth, pad);
  else pad[0] = pad[1] = pad[2] = pad[3] = 0;
  if (node._hasBorder) resolveEdges4Into(style.border, ownerWidth, bor);
  else bor[0] = bor[1] = bor[2] = bor[3] = 0;
  if (node._hasMargin) resolveEdges4Into(style.margin, ownerWidth, mar);
  else mar[0] = mar[1] = mar[2] = mar[3] = 0;
  const paddingBorderWidth = pad[0] + pad[2] + bor[0] + bor[2];
  const paddingBorderHeight = pad[1] + pad[3] + bor[1] + bor[3];
  const styleWidth = forceWidth ? NaN : resolveValue(style.width, ownerWidth);
  const styleHeight = forceHeight ? NaN : resolveValue(style.height, ownerHeight);
  let width = availableWidth;
  let height = availableHeight;
  let wMode = widthMode;
  let hMode = heightMode;
  if (isDefined(styleWidth)) {
    width = styleWidth;
    wMode = MeasureMode.Exactly;
  }
  if (isDefined(styleHeight)) {
    height = styleHeight;
    hMode = MeasureMode.Exactly;
  }
  width = boundAxis(style, true, width, ownerWidth, ownerHeight);
  height = boundAxis(style, false, height, ownerWidth, ownerHeight);
  if (node.measureFunc && node.children.length === 0) {
    const innerW = wMode === MeasureMode.Undefined ? NaN : Math.max(0, width - paddingBorderWidth);
    const innerH = hMode === MeasureMode.Undefined ? NaN : Math.max(0, height - paddingBorderHeight);
    _yogaMeasureCalls++;
    const measured = node.measureFunc(innerW, wMode, innerH, hMode);
    node.layout.width = wMode === MeasureMode.Exactly ? width : boundAxis(
      style,
      true,
      (measured.width ?? 0) + paddingBorderWidth,
      ownerWidth,
      ownerHeight
    );
    node.layout.height = hMode === MeasureMode.Exactly ? height : boundAxis(
      style,
      false,
      (measured.height ?? 0) + paddingBorderHeight,
      ownerWidth,
      ownerHeight
    );
    commitCacheOutputs(node, performLayout);
    cacheWrite(
      node,
      availableWidth,
      availableHeight,
      widthMode,
      heightMode,
      ownerWidth,
      ownerHeight,
      forceWidth,
      forceHeight,
      wasDirty
    );
    return;
  }
  if (node.children.length === 0) {
    node.layout.width = wMode === MeasureMode.Exactly ? width : boundAxis(style, true, paddingBorderWidth, ownerWidth, ownerHeight);
    node.layout.height = hMode === MeasureMode.Exactly ? height : boundAxis(style, false, paddingBorderHeight, ownerWidth, ownerHeight);
    commitCacheOutputs(node, performLayout);
    cacheWrite(
      node,
      availableWidth,
      availableHeight,
      widthMode,
      heightMode,
      ownerWidth,
      ownerHeight,
      forceWidth,
      forceHeight,
      wasDirty
    );
    return;
  }
  const mainAxis = style.flexDirection;
  const crossAx = crossAxis(mainAxis);
  const isMainRow = isRow(mainAxis);
  const mainSize = isMainRow ? width : height;
  const crossSize = isMainRow ? height : width;
  const mainMode = isMainRow ? wMode : hMode;
  const crossMode = isMainRow ? hMode : wMode;
  const mainPadBorder = isMainRow ? paddingBorderWidth : paddingBorderHeight;
  const crossPadBorder = isMainRow ? paddingBorderHeight : paddingBorderWidth;
  const innerMainSize = isDefined(mainSize) ? Math.max(0, mainSize - mainPadBorder) : NaN;
  const innerCrossSize = isDefined(crossSize) ? Math.max(0, crossSize - crossPadBorder) : NaN;
  const gapMain = resolveGap(
    style,
    isMainRow ? Gutter.Column : Gutter.Row,
    innerMainSize
  );
  const flowChildren = [];
  const absChildren = [];
  collectLayoutChildren(node, flowChildren, absChildren);
  const ownerW = isDefined(width) ? width : NaN;
  const ownerH = isDefined(height) ? height : NaN;
  const isWrap = style.flexWrap !== Wrap.NoWrap;
  const gapCross = resolveGap(
    style,
    isMainRow ? Gutter.Row : Gutter.Column,
    innerCrossSize
  );
  for (const c of flowChildren) {
    c._flexBasis = computeFlexBasis(
      c,
      mainAxis,
      innerMainSize,
      innerCrossSize,
      crossMode,
      ownerW,
      ownerH
    );
  }
  const lines = [];
  if (!isWrap || !isDefined(innerMainSize) || flowChildren.length === 0) {
    for (const c of flowChildren) c._lineIndex = 0;
    lines.push(flowChildren);
  } else {
    let lineStart = 0;
    let lineLen = 0;
    for (let i = 0; i < flowChildren.length; i++) {
      const c = flowChildren[i];
      const hypo = boundAxis(c.style, isMainRow, c._flexBasis, ownerW, ownerH);
      const outer = Math.max(0, hypo) + childMarginForAxis(c, mainAxis, ownerW);
      const withGap = i > lineStart ? gapMain : 0;
      if (i > lineStart && lineLen + withGap + outer > innerMainSize) {
        lines.push(flowChildren.slice(lineStart, i));
        lineStart = i;
        lineLen = outer;
      } else {
        lineLen += withGap + outer;
      }
      c._lineIndex = lines.length;
    }
    lines.push(flowChildren.slice(lineStart));
  }
  const lineCount = lines.length;
  const isBaseline = isBaselineLayout(node, flowChildren);
  const lineConsumedMain = new Array(lineCount);
  const lineCrossSizes = new Array(lineCount);
  const lineMaxAscent = isBaseline ? new Array(lineCount).fill(0) : [];
  let maxLineMain = 0;
  let totalLinesCross = 0;
  for (let li = 0; li < lineCount; li++) {
    const line = lines[li];
    const lineGap = line.length > 1 ? gapMain * (line.length - 1) : 0;
    let lineBasis = lineGap;
    for (const c of line) {
      lineBasis += c._flexBasis + childMarginForAxis(c, mainAxis, ownerW);
    }
    let availMain = innerMainSize;
    if (!isDefined(availMain)) {
      const mainOwner = isMainRow ? ownerWidth : ownerHeight;
      const minM = resolveValue(
        isMainRow ? style.minWidth : style.minHeight,
        mainOwner
      );
      const maxM = resolveValue(
        isMainRow ? style.maxWidth : style.maxHeight,
        mainOwner
      );
      if (isDefined(maxM) && lineBasis > maxM - mainPadBorder) {
        availMain = Math.max(0, maxM - mainPadBorder);
      } else if (isDefined(minM) && lineBasis < minM - mainPadBorder) {
        availMain = Math.max(0, minM - mainPadBorder);
      }
    }
    resolveFlexibleLengths(
      line,
      availMain,
      lineBasis,
      isMainRow,
      ownerW,
      ownerH
    );
    let lineCross = 0;
    for (const c of line) {
      const cStyle = c.style;
      const childAlign = cStyle.alignSelf === Align.Auto ? style.alignItems : cStyle.alignSelf;
      const cMarginCross = childMarginForAxis(c, crossAx, ownerW);
      let childCrossSize = NaN;
      let childCrossMode = MeasureMode.Undefined;
      const resolvedCrossStyle = resolveValue(
        isMainRow ? cStyle.height : cStyle.width,
        isMainRow ? ownerH : ownerW
      );
      const crossLeadE = isMainRow ? EDGE_TOP : EDGE_LEFT;
      const crossTrailE = isMainRow ? EDGE_BOTTOM : EDGE_RIGHT;
      const hasCrossAutoMargin = c._hasAutoMargin && (isMarginAuto(cStyle.margin, crossLeadE) || isMarginAuto(cStyle.margin, crossTrailE));
      if (isDefined(resolvedCrossStyle)) {
        childCrossSize = resolvedCrossStyle;
        childCrossMode = MeasureMode.Exactly;
      } else if (childAlign === Align.Stretch && !hasCrossAutoMargin && !isWrap && isDefined(innerCrossSize) && crossMode === MeasureMode.Exactly) {
        childCrossSize = Math.max(0, innerCrossSize - cMarginCross);
        childCrossMode = MeasureMode.Exactly;
      } else if (!isWrap && isDefined(innerCrossSize)) {
        childCrossSize = Math.max(0, innerCrossSize - cMarginCross);
        childCrossMode = MeasureMode.AtMost;
      }
      const cw = isMainRow ? c._mainSize : childCrossSize;
      const ch = isMainRow ? childCrossSize : c._mainSize;
      layoutNode(
        c,
        cw,
        ch,
        isMainRow ? MeasureMode.Exactly : childCrossMode,
        isMainRow ? childCrossMode : MeasureMode.Exactly,
        ownerW,
        ownerH,
        performLayout,
        isMainRow,
        !isMainRow
      );
      c._crossSize = isMainRow ? c.layout.height : c.layout.width;
      lineCross = Math.max(lineCross, c._crossSize + cMarginCross);
    }
    if (isBaseline) {
      let maxAscent = 0;
      let maxDescent = 0;
      for (const c of line) {
        if (resolveChildAlign(node, c) !== Align.Baseline) continue;
        const mTop = resolveEdge(c.style.margin, EDGE_TOP, ownerW);
        const mBot = resolveEdge(c.style.margin, EDGE_BOTTOM, ownerW);
        const ascent = calculateBaseline(c) + mTop;
        const descent = c.layout.height + mTop + mBot - ascent;
        if (ascent > maxAscent) maxAscent = ascent;
        if (descent > maxDescent) maxDescent = descent;
      }
      lineMaxAscent[li] = maxAscent;
      if (maxAscent + maxDescent > lineCross) {
        lineCross = maxAscent + maxDescent;
      }
    }
    const mainLead = leadingEdge(mainAxis);
    const mainTrail = trailingEdge(mainAxis);
    let consumed = lineGap;
    for (const c of line) {
      const cm = c.layout.margin;
      consumed += c._mainSize + cm[mainLead] + cm[mainTrail];
    }
    lineConsumedMain[li] = consumed;
    lineCrossSizes[li] = lineCross;
    maxLineMain = Math.max(maxLineMain, consumed);
    totalLinesCross += lineCross;
  }
  const totalCrossGap = lineCount > 1 ? gapCross * (lineCount - 1) : 0;
  totalLinesCross += totalCrossGap;
  const isScroll = style.overflow === Overflow.Scroll;
  const contentMain = maxLineMain + mainPadBorder;
  const finalMainSize = mainMode === MeasureMode.Exactly ? mainSize : mainMode === MeasureMode.AtMost && isScroll ? Math.max(Math.min(mainSize, contentMain), mainPadBorder) : isWrap && lineCount > 1 && mainMode === MeasureMode.AtMost ? mainSize : contentMain;
  const contentCross = totalLinesCross + crossPadBorder;
  const finalCrossSize = crossMode === MeasureMode.Exactly ? crossSize : crossMode === MeasureMode.AtMost && isScroll ? Math.max(Math.min(crossSize, contentCross), crossPadBorder) : contentCross;
  node.layout.width = boundAxis(
    style,
    true,
    isMainRow ? finalMainSize : finalCrossSize,
    ownerWidth,
    ownerHeight
  );
  node.layout.height = boundAxis(
    style,
    false,
    isMainRow ? finalCrossSize : finalMainSize,
    ownerWidth,
    ownerHeight
  );
  commitCacheOutputs(node, performLayout);
  cacheWrite(
    node,
    availableWidth,
    availableHeight,
    widthMode,
    heightMode,
    ownerWidth,
    ownerHeight,
    forceWidth,
    forceHeight,
    wasDirty
  );
  if (!performLayout) return;
  const actualInnerMain = (isMainRow ? node.layout.width : node.layout.height) - mainPadBorder;
  const actualInnerCross = (isMainRow ? node.layout.height : node.layout.width) - crossPadBorder;
  const mainLeadEdgePhys = leadingEdge(mainAxis);
  const mainTrailEdgePhys = trailingEdge(mainAxis);
  const crossLeadEdgePhys = isMainRow ? EDGE_TOP : EDGE_LEFT;
  const crossTrailEdgePhys = isMainRow ? EDGE_BOTTOM : EDGE_RIGHT;
  const reversed = isReverse(mainAxis);
  const mainContainerSize = isMainRow ? node.layout.width : node.layout.height;
  const crossLead = pad[crossLeadEdgePhys] + bor[crossLeadEdgePhys];
  let lineCrossOffset = crossLead;
  let betweenLines = gapCross;
  const freeCross = actualInnerCross - totalLinesCross;
  if (lineCount === 1 && !isWrap && !isBaseline) {
    lineCrossSizes[0] = actualInnerCross;
  } else {
    const remCross = Math.max(0, freeCross);
    switch (style.alignContent) {
      case Align.FlexStart:
        break;
      case Align.Center:
        lineCrossOffset += freeCross / 2;
        break;
      case Align.FlexEnd:
        lineCrossOffset += freeCross;
        break;
      case Align.Stretch:
        if (lineCount > 0 && remCross > 0) {
          const add = remCross / lineCount;
          for (let i = 0; i < lineCount; i++) lineCrossSizes[i] += add;
        }
        break;
      case Align.SpaceBetween:
        if (lineCount > 1) betweenLines += remCross / (lineCount - 1);
        break;
      case Align.SpaceAround:
        if (lineCount > 0) {
          betweenLines += remCross / lineCount;
          lineCrossOffset += remCross / lineCount / 2;
        }
        break;
      case Align.SpaceEvenly:
        if (lineCount > 0) {
          betweenLines += remCross / (lineCount + 1);
          lineCrossOffset += remCross / (lineCount + 1);
        }
        break;
      default:
        break;
    }
  }
  const wrapReverse = style.flexWrap === Wrap.WrapReverse;
  const crossContainerSize = isMainRow ? node.layout.height : node.layout.width;
  let lineCrossPos = lineCrossOffset;
  for (let li = 0; li < lineCount; li++) {
    const line = lines[li];
    const lineCross = lineCrossSizes[li];
    const consumedMain = lineConsumedMain[li];
    const n = line.length;
    if (isWrap || crossMode !== MeasureMode.Exactly) {
      for (const c of line) {
        const cStyle = c.style;
        const childAlign = cStyle.alignSelf === Align.Auto ? style.alignItems : cStyle.alignSelf;
        const crossStyleDef = isDefined(
          resolveValue(
            isMainRow ? cStyle.height : cStyle.width,
            isMainRow ? ownerH : ownerW
          )
        );
        const hasCrossAutoMargin = c._hasAutoMargin && (isMarginAuto(cStyle.margin, crossLeadEdgePhys) || isMarginAuto(cStyle.margin, crossTrailEdgePhys));
        if (childAlign === Align.Stretch && !crossStyleDef && !hasCrossAutoMargin) {
          const cMarginCross = childMarginForAxis(c, crossAx, ownerW);
          const target = Math.max(0, lineCross - cMarginCross);
          if (c._crossSize !== target) {
            const cw = isMainRow ? c._mainSize : target;
            const ch = isMainRow ? target : c._mainSize;
            layoutNode(
              c,
              cw,
              ch,
              MeasureMode.Exactly,
              MeasureMode.Exactly,
              ownerW,
              ownerH,
              performLayout,
              isMainRow,
              !isMainRow
            );
            c._crossSize = target;
          }
        }
      }
    }
    let mainOffset = pad[mainLeadEdgePhys] + bor[mainLeadEdgePhys];
    let betweenMain = gapMain;
    let numAutoMarginsMain = 0;
    for (const c of line) {
      if (!c._hasAutoMargin) continue;
      if (isMarginAuto(c.style.margin, mainLeadEdgePhys)) numAutoMarginsMain++;
      if (isMarginAuto(c.style.margin, mainTrailEdgePhys)) numAutoMarginsMain++;
    }
    const freeMain = actualInnerMain - consumedMain;
    const remainingMain = Math.max(0, freeMain);
    const autoMarginMainSize = numAutoMarginsMain > 0 && remainingMain > 0 ? remainingMain / numAutoMarginsMain : 0;
    if (numAutoMarginsMain === 0) {
      switch (style.justifyContent) {
        case Justify.FlexStart:
          break;
        case Justify.Center:
          mainOffset += freeMain / 2;
          break;
        case Justify.FlexEnd:
          mainOffset += freeMain;
          break;
        case Justify.SpaceBetween:
          if (n > 1) betweenMain += remainingMain / (n - 1);
          break;
        case Justify.SpaceAround:
          if (n > 0) {
            betweenMain += remainingMain / n;
            mainOffset += remainingMain / n / 2;
          }
          break;
        case Justify.SpaceEvenly:
          if (n > 0) {
            betweenMain += remainingMain / (n + 1);
            mainOffset += remainingMain / (n + 1);
          }
          break;
      }
    }
    const effectiveLineCrossPos = wrapReverse ? crossContainerSize - lineCrossPos - lineCross : lineCrossPos;
    let pos = mainOffset;
    for (const c of line) {
      const cMargin = c.style.margin;
      const cLayoutMargin = c.layout.margin;
      let autoMainLead = false;
      let autoMainTrail = false;
      let autoCrossLead = false;
      let autoCrossTrail = false;
      let mMainLead;
      let mMainTrail;
      let mCrossLead;
      let mCrossTrail;
      if (c._hasAutoMargin) {
        autoMainLead = isMarginAuto(cMargin, mainLeadEdgePhys);
        autoMainTrail = isMarginAuto(cMargin, mainTrailEdgePhys);
        autoCrossLead = isMarginAuto(cMargin, crossLeadEdgePhys);
        autoCrossTrail = isMarginAuto(cMargin, crossTrailEdgePhys);
        mMainLead = autoMainLead ? autoMarginMainSize : cLayoutMargin[mainLeadEdgePhys];
        mMainTrail = autoMainTrail ? autoMarginMainSize : cLayoutMargin[mainTrailEdgePhys];
        mCrossLead = autoCrossLead ? 0 : cLayoutMargin[crossLeadEdgePhys];
        mCrossTrail = autoCrossTrail ? 0 : cLayoutMargin[crossTrailEdgePhys];
      } else {
        mMainLead = cLayoutMargin[mainLeadEdgePhys];
        mMainTrail = cLayoutMargin[mainTrailEdgePhys];
        mCrossLead = cLayoutMargin[crossLeadEdgePhys];
        mCrossTrail = cLayoutMargin[crossTrailEdgePhys];
      }
      const mainPos = reversed ? mainContainerSize - (pos + mMainLead) - c._mainSize : pos + mMainLead;
      const childAlign = c.style.alignSelf === Align.Auto ? style.alignItems : c.style.alignSelf;
      let crossPos = effectiveLineCrossPos + mCrossLead;
      const crossFree = lineCross - c._crossSize - mCrossLead - mCrossTrail;
      if (autoCrossLead && autoCrossTrail) {
        crossPos += Math.max(0, crossFree) / 2;
      } else if (autoCrossLead) {
        crossPos += Math.max(0, crossFree);
      } else if (autoCrossTrail) {
      } else {
        switch (childAlign) {
          case Align.FlexStart:
          case Align.Stretch:
            if (wrapReverse) crossPos += crossFree;
            break;
          case Align.Center:
            crossPos += crossFree / 2;
            break;
          case Align.FlexEnd:
            if (!wrapReverse) crossPos += crossFree;
            break;
          case Align.Baseline:
            if (isBaseline) {
              crossPos = effectiveLineCrossPos + lineMaxAscent[li] - calculateBaseline(c);
            }
            break;
          default:
            break;
        }
      }
      let relX = 0;
      let relY = 0;
      if (c._hasPosition) {
        const relLeft = resolveValue(
          resolveEdgeRaw(c.style.position, EDGE_LEFT),
          ownerW
        );
        const relRight = resolveValue(
          resolveEdgeRaw(c.style.position, EDGE_RIGHT),
          ownerW
        );
        const relTop = resolveValue(
          resolveEdgeRaw(c.style.position, EDGE_TOP),
          ownerW
        );
        const relBottom = resolveValue(
          resolveEdgeRaw(c.style.position, EDGE_BOTTOM),
          ownerW
        );
        relX = isDefined(relLeft) ? relLeft : isDefined(relRight) ? -relRight : 0;
        relY = isDefined(relTop) ? relTop : isDefined(relBottom) ? -relBottom : 0;
      }
      if (isMainRow) {
        c.layout.left = mainPos + relX;
        c.layout.top = crossPos + relY;
      } else {
        c.layout.left = crossPos + relX;
        c.layout.top = mainPos + relY;
      }
      pos += c._mainSize + mMainLead + mMainTrail + betweenMain;
    }
    lineCrossPos += lineCross + betweenLines;
  }
  for (const c of absChildren) {
    layoutAbsoluteChild(
      node,
      c,
      node.layout.width,
      node.layout.height,
      pad,
      bor
    );
  }
}
function layoutAbsoluteChild(parent, child, parentWidth, parentHeight, pad, bor) {
  const cs = child.style;
  const posLeft = resolveEdgeRaw(cs.position, EDGE_LEFT);
  const posRight = resolveEdgeRaw(cs.position, EDGE_RIGHT);
  const posTop = resolveEdgeRaw(cs.position, EDGE_TOP);
  const posBottom = resolveEdgeRaw(cs.position, EDGE_BOTTOM);
  const rLeft = resolveValue(posLeft, parentWidth);
  const rRight = resolveValue(posRight, parentWidth);
  const rTop = resolveValue(posTop, parentHeight);
  const rBottom = resolveValue(posBottom, parentHeight);
  const paddingBoxW = parentWidth - bor[0] - bor[2];
  const paddingBoxH = parentHeight - bor[1] - bor[3];
  let cw = resolveValue(cs.width, paddingBoxW);
  let ch = resolveValue(cs.height, paddingBoxH);
  if (!isDefined(cw) && isDefined(rLeft) && isDefined(rRight)) {
    cw = paddingBoxW - rLeft - rRight;
  }
  if (!isDefined(ch) && isDefined(rTop) && isDefined(rBottom)) {
    ch = paddingBoxH - rTop - rBottom;
  }
  layoutNode(
    child,
    cw,
    ch,
    isDefined(cw) ? MeasureMode.Exactly : MeasureMode.Undefined,
    isDefined(ch) ? MeasureMode.Exactly : MeasureMode.Undefined,
    paddingBoxW,
    paddingBoxH,
    true
  );
  const mL = resolveEdge(cs.margin, EDGE_LEFT, parentWidth);
  const mT = resolveEdge(cs.margin, EDGE_TOP, parentWidth);
  const mR = resolveEdge(cs.margin, EDGE_RIGHT, parentWidth);
  const mB = resolveEdge(cs.margin, EDGE_BOTTOM, parentWidth);
  const mainAxis = parent.style.flexDirection;
  const reversed = isReverse(mainAxis);
  const mainRow = isRow(mainAxis);
  const wrapReverse = parent.style.flexWrap === Wrap.WrapReverse;
  const alignment = cs.alignSelf === Align.Auto ? parent.style.alignItems : cs.alignSelf;
  let left;
  if (isDefined(rLeft)) {
    left = bor[0] + rLeft + mL;
  } else if (isDefined(rRight)) {
    left = parentWidth - bor[2] - rRight - child.layout.width - mR;
  } else if (mainRow) {
    const lead = pad[0] + bor[0];
    const trail = parentWidth - pad[2] - bor[2];
    left = reversed ? trail - child.layout.width - mR : justifyAbsolute(
      parent.style.justifyContent,
      lead,
      trail,
      child.layout.width
    ) + mL;
  } else {
    left = alignAbsolute(
      alignment,
      pad[0] + bor[0],
      parentWidth - pad[2] - bor[2],
      child.layout.width,
      wrapReverse
    ) + mL;
  }
  let top;
  if (isDefined(rTop)) {
    top = bor[1] + rTop + mT;
  } else if (isDefined(rBottom)) {
    top = parentHeight - bor[3] - rBottom - child.layout.height - mB;
  } else if (mainRow) {
    top = alignAbsolute(
      alignment,
      pad[1] + bor[1],
      parentHeight - pad[3] - bor[3],
      child.layout.height,
      wrapReverse
    ) + mT;
  } else {
    const lead = pad[1] + bor[1];
    const trail = parentHeight - pad[3] - bor[3];
    top = reversed ? trail - child.layout.height - mB : justifyAbsolute(
      parent.style.justifyContent,
      lead,
      trail,
      child.layout.height
    ) + mT;
  }
  child.layout.left = left;
  child.layout.top = top;
}
function justifyAbsolute(justify, leadEdge, trailEdge, childSize) {
  switch (justify) {
    case Justify.Center:
      return leadEdge + (trailEdge - leadEdge - childSize) / 2;
    case Justify.FlexEnd:
      return trailEdge - childSize;
    default:
      return leadEdge;
  }
}
function alignAbsolute(align, leadEdge, trailEdge, childSize, wrapReverse) {
  switch (align) {
    case Align.Center:
      return leadEdge + (trailEdge - leadEdge - childSize) / 2;
    case Align.FlexEnd:
      return wrapReverse ? leadEdge : trailEdge - childSize;
    default:
      return wrapReverse ? trailEdge - childSize : leadEdge;
  }
}
function computeFlexBasis(child, mainAxis, availableMain, availableCross, crossMode, ownerWidth, ownerHeight) {
  const sameGen = child._fbGen === _generation;
  if ((sameGen || !child.isDirty_) && child._fbCrossMode === crossMode && sameFloat(child._fbOwnerW, ownerWidth) && sameFloat(child._fbOwnerH, ownerHeight) && sameFloat(child._fbAvailMain, availableMain) && sameFloat(child._fbAvailCross, availableCross)) {
    return child._fbBasis;
  }
  const cs = child.style;
  const isMainRow = isRow(mainAxis);
  const basis = resolveValue(cs.flexBasis, availableMain);
  if (isDefined(basis)) {
    const b2 = Math.max(0, basis);
    child._fbBasis = b2;
    child._fbOwnerW = ownerWidth;
    child._fbOwnerH = ownerHeight;
    child._fbAvailMain = availableMain;
    child._fbAvailCross = availableCross;
    child._fbCrossMode = crossMode;
    child._fbGen = _generation;
    return b2;
  }
  const mainStyleDim = isMainRow ? cs.width : cs.height;
  const mainOwner = isMainRow ? ownerWidth : ownerHeight;
  const resolved = resolveValue(mainStyleDim, mainOwner);
  if (isDefined(resolved)) {
    const b2 = Math.max(0, resolved);
    child._fbBasis = b2;
    child._fbOwnerW = ownerWidth;
    child._fbOwnerH = ownerHeight;
    child._fbAvailMain = availableMain;
    child._fbAvailCross = availableCross;
    child._fbCrossMode = crossMode;
    child._fbGen = _generation;
    return b2;
  }
  const crossStyleDim = isMainRow ? cs.height : cs.width;
  const crossOwner = isMainRow ? ownerHeight : ownerWidth;
  let crossConstraint = resolveValue(crossStyleDim, crossOwner);
  let crossConstraintMode = isDefined(crossConstraint) ? MeasureMode.Exactly : MeasureMode.Undefined;
  if (!isDefined(crossConstraint) && isDefined(availableCross)) {
    crossConstraint = availableCross;
    crossConstraintMode = crossMode === MeasureMode.Exactly && isStretchAlign(child) ? MeasureMode.Exactly : MeasureMode.AtMost;
  }
  let mainConstraint = NaN;
  let mainConstraintMode = MeasureMode.Undefined;
  if (isMainRow && isDefined(availableMain) && hasMeasureFuncInSubtree(child)) {
    mainConstraint = availableMain;
    mainConstraintMode = MeasureMode.AtMost;
  }
  const mw = isMainRow ? mainConstraint : crossConstraint;
  const mh = isMainRow ? crossConstraint : mainConstraint;
  const mwMode = isMainRow ? mainConstraintMode : crossConstraintMode;
  const mhMode = isMainRow ? crossConstraintMode : mainConstraintMode;
  layoutNode(child, mw, mh, mwMode, mhMode, ownerWidth, ownerHeight, false);
  const b = isMainRow ? child.layout.width : child.layout.height;
  child._fbBasis = b;
  child._fbOwnerW = ownerWidth;
  child._fbOwnerH = ownerHeight;
  child._fbAvailMain = availableMain;
  child._fbAvailCross = availableCross;
  child._fbCrossMode = crossMode;
  child._fbGen = _generation;
  return b;
}
function hasMeasureFuncInSubtree(node) {
  if (node.measureFunc) return true;
  for (const c of node.children) {
    if (hasMeasureFuncInSubtree(c)) return true;
  }
  return false;
}
function resolveFlexibleLengths(children, availableInnerMain, totalFlexBasis, isMainRow, ownerW, ownerH) {
  const n = children.length;
  const frozen = new Array(n).fill(false);
  const initialFree = isDefined(availableInnerMain) ? availableInnerMain - totalFlexBasis : 0;
  for (let i = 0; i < n; i++) {
    const c = children[i];
    const clamped = boundAxis(c.style, isMainRow, c._flexBasis, ownerW, ownerH);
    const inflexible = !isDefined(availableInnerMain) || (initialFree >= 0 ? c.style.flexGrow === 0 : c.style.flexShrink === 0);
    if (inflexible) {
      c._mainSize = Math.max(0, clamped);
      frozen[i] = true;
    } else {
      c._mainSize = c._flexBasis;
    }
  }
  const unclamped = new Array(n);
  for (let iter = 0; iter <= n; iter++) {
    let frozenDelta = 0;
    let totalGrow = 0;
    let totalShrinkScaled = 0;
    let unfrozenCount = 0;
    for (let i = 0; i < n; i++) {
      const c = children[i];
      if (frozen[i]) {
        frozenDelta += c._mainSize - c._flexBasis;
      } else {
        totalGrow += c.style.flexGrow;
        totalShrinkScaled += c.style.flexShrink * c._flexBasis;
        unfrozenCount++;
      }
    }
    if (unfrozenCount === 0) break;
    let remaining = initialFree - frozenDelta;
    if (remaining > 0 && totalGrow > 0 && totalGrow < 1) {
      const scaled = initialFree * totalGrow;
      if (scaled < remaining) remaining = scaled;
    } else if (remaining < 0 && totalShrinkScaled > 0) {
      let totalShrink = 0;
      for (let i = 0; i < n; i++) {
        if (!frozen[i]) totalShrink += children[i].style.flexShrink;
      }
      if (totalShrink < 1) {
        const scaled = initialFree * totalShrink;
        if (scaled > remaining) remaining = scaled;
      }
    }
    let totalViolation = 0;
    for (let i = 0; i < n; i++) {
      if (frozen[i]) continue;
      const c = children[i];
      let t = c._flexBasis;
      if (remaining > 0 && totalGrow > 0) {
        t += remaining * c.style.flexGrow / totalGrow;
      } else if (remaining < 0 && totalShrinkScaled > 0) {
        t += remaining * (c.style.flexShrink * c._flexBasis) / totalShrinkScaled;
      }
      unclamped[i] = t;
      const clamped = Math.max(
        0,
        boundAxis(c.style, isMainRow, t, ownerW, ownerH)
      );
      c._mainSize = clamped;
      totalViolation += clamped - t;
    }
    if (totalViolation === 0) break;
    let anyFrozen = false;
    for (let i = 0; i < n; i++) {
      if (frozen[i]) continue;
      const v = children[i]._mainSize - unclamped[i];
      if (totalViolation > 0 && v > 0 || totalViolation < 0 && v < 0) {
        frozen[i] = true;
        anyFrozen = true;
      }
    }
    if (!anyFrozen) break;
  }
}
function isStretchAlign(child) {
  const p = child.parent;
  if (!p) return false;
  const align = child.style.alignSelf === Align.Auto ? p.style.alignItems : child.style.alignSelf;
  return align === Align.Stretch;
}
function resolveChildAlign(parent, child) {
  return child.style.alignSelf === Align.Auto ? parent.style.alignItems : child.style.alignSelf;
}
function calculateBaseline(node) {
  let baselineChild = null;
  for (const c of node.children) {
    if (c._lineIndex > 0) break;
    if (c.style.positionType === PositionType.Absolute) continue;
    if (c.style.display === Display.None) continue;
    if (resolveChildAlign(node, c) === Align.Baseline || c.isReferenceBaseline_) {
      baselineChild = c;
      break;
    }
    if (baselineChild === null) baselineChild = c;
  }
  if (baselineChild === null) return node.layout.height;
  return calculateBaseline(baselineChild) + baselineChild.layout.top;
}
function isBaselineLayout(node, flowChildren) {
  if (!isRow(node.style.flexDirection)) return false;
  if (node.style.alignItems === Align.Baseline) return true;
  for (const c of flowChildren) {
    if (c.style.alignSelf === Align.Baseline) return true;
  }
  return false;
}
function childMarginForAxis(child, axis, ownerWidth) {
  if (!child._hasMargin) return 0;
  const lead = resolveEdge(child.style.margin, leadingEdge(axis), ownerWidth);
  const trail = resolveEdge(child.style.margin, trailingEdge(axis), ownerWidth);
  return lead + trail;
}
function resolveGap(style, gutter, ownerSize) {
  let v = style.gap[gutter];
  if (v.unit === Unit.Undefined) v = style.gap[Gutter.All];
  const r = resolveValue(v, ownerSize);
  return isDefined(r) ? Math.max(0, r) : 0;
}
function boundAxis(style, isWidth, value, ownerWidth, ownerHeight) {
  const minV = isWidth ? style.minWidth : style.minHeight;
  const maxV = isWidth ? style.maxWidth : style.maxHeight;
  const minU = minV.unit;
  const maxU = maxV.unit;
  if (minU === 0 && maxU === 0) return value;
  const owner = isWidth ? ownerWidth : ownerHeight;
  let v = value;
  if (maxU === 1) {
    if (v > maxV.value) v = maxV.value;
  } else if (maxU === 2) {
    const m = maxV.value * owner / 100;
    if (m === m && v > m) v = m;
  }
  if (minU === 1) {
    if (v < minV.value) v = minV.value;
  } else if (minU === 2) {
    const m = minV.value * owner / 100;
    if (m === m && v < m) v = m;
  }
  return v;
}
function zeroLayoutRecursive(node) {
  for (const c of node.children) {
    c.layout.left = 0;
    c.layout.top = 0;
    c.layout.width = 0;
    c.layout.height = 0;
    c.isDirty_ = true;
    c._hasL = false;
    c._hasM = false;
    zeroLayoutRecursive(c);
  }
}
function collectLayoutChildren(node, flow, abs) {
  for (const c of node.children) {
    const disp = c.style.display;
    if (disp === Display.None) {
      c.layout.left = 0;
      c.layout.top = 0;
      c.layout.width = 0;
      c.layout.height = 0;
      zeroLayoutRecursive(c);
    } else if (disp === Display.Contents) {
      c.layout.left = 0;
      c.layout.top = 0;
      c.layout.width = 0;
      c.layout.height = 0;
      collectLayoutChildren(c, flow, abs);
    } else if (c.style.positionType === PositionType.Absolute) {
      abs.push(c);
    } else {
      flow.push(c);
    }
  }
}
function roundLayout(node, scale, absLeft, absTop) {
  if (scale === 0) return;
  const l = node.layout;
  const nodeLeft = l.left;
  const nodeTop = l.top;
  const nodeWidth = l.width;
  const nodeHeight = l.height;
  const absNodeLeft = absLeft + nodeLeft;
  const absNodeTop = absTop + nodeTop;
  const isText = node.measureFunc !== null;
  l.left = roundValue(nodeLeft, scale, false, isText);
  l.top = roundValue(nodeTop, scale, false, isText);
  const absRight = absNodeLeft + nodeWidth;
  const absBottom = absNodeTop + nodeHeight;
  const hasFracW = !isWholeNumber(nodeWidth * scale);
  const hasFracH = !isWholeNumber(nodeHeight * scale);
  l.width = roundValue(absRight, scale, isText && hasFracW, isText && !hasFracW) - roundValue(absNodeLeft, scale, false, isText);
  l.height = roundValue(absBottom, scale, isText && hasFracH, isText && !hasFracH) - roundValue(absNodeTop, scale, false, isText);
  for (const c of node.children) {
    roundLayout(c, scale, absNodeLeft, absNodeTop);
  }
}
function isWholeNumber(v) {
  const frac = v - Math.floor(v);
  return frac < 1e-4 || frac > 0.9999;
}
function roundValue(v, scale, forceCeil, forceFloor) {
  let scaled = v * scale;
  let frac = scaled - Math.floor(scaled);
  if (frac < 0) frac += 1;
  if (frac < 1e-4) {
    scaled = Math.floor(scaled);
  } else if (frac > 0.9999) {
    scaled = Math.ceil(scaled);
  } else if (forceCeil) {
    scaled = Math.ceil(scaled);
  } else if (forceFloor) {
    scaled = Math.floor(scaled);
  } else {
    scaled = Math.floor(scaled) + (frac >= 0.4999 ? 1 : 0);
  }
  return scaled / scale;
}
function parseDimension(v) {
  if (v === void 0) return UNDEFINED_VALUE;
  if (v === "auto") return AUTO_VALUE;
  if (typeof v === "number") {
    return Number.isFinite(v) ? pointValue(v) : UNDEFINED_VALUE;
  }
  if (typeof v === "string" && v.endsWith("%")) {
    return percentValue(parseFloat(v));
  }
  const n = parseFloat(v);
  return isNaN(n) ? UNDEFINED_VALUE : pointValue(n);
}
function physicalEdge(edge) {
  switch (edge) {
    case Edge.Left:
    case Edge.Start:
      return EDGE_LEFT;
    case Edge.Top:
      return EDGE_TOP;
    case Edge.Right:
    case Edge.End:
      return EDGE_RIGHT;
    case Edge.Bottom:
      return EDGE_BOTTOM;
    default:
      return EDGE_LEFT;
  }
}
const YOGA_INSTANCE = {
  Config: {
    create: createConfig,
    destroy() {
    }
  },
  Node: {
    create: (config) => new Node(config),
    createDefault: () => new Node(),
    createWithConfig: (config) => new Node(config),
    destroy() {
    }
  }
};
function loadYoga() {
  return Promise.resolve(YOGA_INSTANCE);
}
var yoga_layout_default = YOGA_INSTANCE;
export {
  Align,
  BoxSizing,
  Dimension,
  Direction,
  Display,
  Edge,
  Errata,
  ExperimentalFeature,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Node,
  Overflow,
  PositionType,
  Unit,
  Wrap,
  yoga_layout_default as default,
  getYogaCounters,
  loadYoga
};
