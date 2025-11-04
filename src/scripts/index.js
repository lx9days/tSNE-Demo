import 'core-js/stable';
import 'regenerator-runtime/runtime';
import '../styles/index.scss';
import * as d3 from 'd3';
import Libra from 'libra-vis';
import mnistData from '../data/mnist_tsne.json';

// constants
const MARGIN = { top: 30, right: 80, bottom: 40, left: 60 };
const WIDTH = 500 - MARGIN.left - MARGIN.right;
const HEIGHT = 400 - MARGIN.top - MARGIN.bottom;
const FIELD_X = "x";
const FIELD_Y = "y";
const FIELD_COLOR = "label";

// shared state
let data = [];
let x = null;
let y = null;
let color = null;

// dynamic field selection (updated by UI)
let currentFields = { xField: FIELD_X, yField: FIELD_Y, colorField: FIELD_COLOR, imageField: null };

// UI elements
let fileInput, xFieldSelect, yFieldSelect, colorFieldSelect, imageFieldSelect, renderBtn, resetBtn, statusEl, rowCountEl;

function $(id) {
  return document.getElementById(id);
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || '';
}

function setRowCount(n) {
  if (rowCountEl) rowCountEl.textContent = String(n || 0);
}

function clearSVG() {
  const root = document.querySelector('#LibraPlayground');
  if (root) root.innerHTML = '';
}

function clearSelect(selectEl, placeholderText) {
  if (!selectEl) return;
  while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = placeholderText || '请选择字段';
  selectEl.appendChild(opt);
  selectEl.value = '';
}

function populateSelect(selectEl, options) {
  if (!selectEl) return;
  const frag = document.createDocumentFragment();
  options.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    frag.appendChild(opt);
  });
  selectEl.appendChild(frag);
}

function inferFieldTypes(rows) {
  if (!rows || !rows.length) return {};
  const keysSet = new Set();
  rows.forEach((row) => {
    Object.keys(row).forEach((k) => keysSet.add(k));
  });
  const types = {};
  keysSet.forEach((k) => {
    let sawValue = false;
    let allNumeric = true;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][k];
      if (v === null || v === undefined || v === '') continue; // ignore empties
      sawValue = true;
      const num = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
      if (!Number.isFinite(num)) { allNumeric = false; break; }
    }
    types[k] = sawValue && allNumeric ? 'number' : 'string';
  });
  return types;
}

function uniqueValues(rows, field) {
  const set = new Set();
  rows.forEach((d) => {
    const v = d[field];
    if (v != null) set.add(v);
  });
  const arr = Array.from(set);
  if (arr.length && typeof arr[0] === 'number') arr.sort((a, b) => a - b);
  return arr;
}

async function loadData() {
  // import 本地 JSON，避免 devserver 路径 404
  data = mnistData;
}

function renderStaticVisualization() {
  // append the svg object to the body of the page
  const svg = d3
    .select("#LibraPlayground")
    .append("svg")
    .attr(
      "width",
      WIDTH + MARGIN.left + MARGIN.right
    )
    .attr(
      "height",
      HEIGHT + MARGIN.top + MARGIN.bottom
    )
    .attr("viewbox", `0 0 ${WIDTH} ${HEIGHT}`)
    .append("g")
    .attr(
      "transform",
      "translate(" + MARGIN.left + "," + MARGIN.top + ")"
    );

  const extentX = [0, d3.max(data, (d) => d[FIELD_X])];
  const extentY = [0, d3.max(data, (d) => d[FIELD_Y])];

  // Add X axis
  x = d3
    .scaleLinear()
    .domain(extentX)
    .range([0, WIDTH])
    .nice()
    .clamp(true);

  // Add Y axis
  y = d3
    .scaleLinear()
    .domain(extentY)
    .nice()
    .range([0, HEIGHT])
    .clamp(true);

  // Add Legend
  const categories = uniqueValues(data, FIELD_COLOR);

  color = d3
    .scaleOrdinal()
    .domain(categories)
    .range(d3.schemeTableau10);
  svg
    .append("g")
    .call((g) =>
      g
        .append("text")
        .text(FIELD_COLOR)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("x", WIDTH + MARGIN.right / 2)
        .attr("y", -MARGIN.top / 2)
    )
    .call((g) =>
      g
        .append("g")
        .selectAll("g")
        .data(categories)
        .join("g")
        .call((g) => {
          g.append("circle")
            .attr("fill", (d) => color(d))
            .attr("cx", WIDTH + 10)
            .attr("cy", (_, i) => i * 20)
            .attr("r", 5);
        })
        .call((g) => {
          g.append("text")
            .text((d) => d)
            .attr("font-size", "12px")
            .attr("x", WIDTH + 20)
            .attr("y", (_, i) => i * 20 + 5);
        })
    );
}

async function main() {
  await loadData();
  renderStaticVisualization();
  const mainLayer = renderMainVisualization();
  mountInteraction(mainLayer);
}

function renderMainVisualization() {
  // Find the SVG element on page
  const svg = d3.select("#LibraPlayground svg");

  // Create the main layer
  const mainLayer = Libra.Layer.initialize("D3Layer", {
    name: "mainLayer",
    width: WIDTH,
    height: HEIGHT,
    offset: { x: MARGIN.left, y: MARGIN.top },
    container: svg.node(),
  });
  const g = d3.select(mainLayer.getGraphic());

  // Draw points code from the input static visualization
  g.selectAll("circle")
    .data(data)
    .join("circle")
    .attr("class", "mark")
    .attr("cx", (d) => x(d[FIELD_X]))
    .attr("cy", (d) => y(d[FIELD_Y]))
    .attr("fill", (d) => color(d[FIELD_COLOR]))
    .attr("fill-opacity", 0.7)
    .attr("r", 3);

  return mainLayer;
}

async function mountInteraction(layer) {
  // Attach HoverInstrument to the main layer
Libra.Interaction.build({
    inherit: "HoverInstrument",
    layers: [layer],
    sharedVar: {
      tooltip: {
        image: (d) => d.image,
        offset: {
          x: -70 - MARGIN.left,
          y: -100 - MARGIN.top,
        },
      },
    },
  });
    Libra.Interaction.build({
    inherit: "ClickInstrument",
    layers: [layer],
    remove: [
      {
        find: "SelectionTransformer",
      },
    ],
    insert: [
      {
        find: "SelectionService",
        flow: [
          {
            comp: "FilterService",
            sharedVar: {
              fields: ["label"],
            },
          },
          {
            comp: "SelectionTransformer",
            layer: layer.getLayerFromQueue("selectionLayer"),
          },
        ],
      },
    ],
    sharedVar: {
      highlightColor: (d) => color(d[FIELD_COLOR]),
    },
  });
  await Libra.createHistoryTrrack();
}

main();

// dynamic rendering and UI binding
function renderVisualizationDynamic(dataset, fields) {
  clearSVG();
  const { xField, yField, colorField } = fields;
  const svg = d3
    .select("#LibraPlayground")
    .append("svg")
    .attr(
      "width",
      WIDTH + MARGIN.left + MARGIN.right
    )
    .attr(
      "height",
      HEIGHT + MARGIN.top + MARGIN.bottom
    )
    .attr("viewbox", `0 0 ${WIDTH} ${HEIGHT}`)
    .append("g")
    .attr(
      "transform",
      "translate(" + MARGIN.left + "," + MARGIN.top + ")"
    );

  const extentX = d3.extent(dataset, (d) => +d[xField]);
  const extentY = d3.extent(dataset, (d) => +d[yField]);

  x = d3
    .scaleLinear()
    .domain(extentX)
    .range([0, WIDTH])
    .nice()
    .clamp(true);

  y = d3
    .scaleLinear()
    .domain(extentY)
    .nice()
    .range([0, HEIGHT])
    .clamp(true);

  const categories = uniqueValues(dataset, colorField);
  color = d3.scaleOrdinal().domain(categories).range(d3.schemeTableau10);

  const legend = svg.append("g");
  legend
    .append("text")
    .text(colorField)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("font-weight", "bold")
    .attr("x", WIDTH + MARGIN.right / 2)
    .attr("y", -MARGIN.top / 2);
  legend
    .append("g")
    .selectAll("g")
    .data(categories)
    .join("g")
    .call((g) => {
      g.append("circle")
        .attr("fill", (d) => color(d))
        .attr("cx", WIDTH + 10)
        .attr("cy", (_, i) => i * 20)
        .attr("r", 5);
    })
    .call((g) => {
      g.append("text")
        .text((d) => d)
        .attr("font-size", "12px")
        .attr("x", WIDTH + 20)
        .attr("y", (_, i) => i * 20 + 5);
    });

  // Draw points
  const mainLayer = Libra.Layer.initialize("D3Layer", {
    name: "mainLayer",
    width: WIDTH,
    height: HEIGHT,
    offset: { x: MARGIN.left, y: MARGIN.top },
    container: d3.select("#LibraPlayground svg").node(),
  });
  const g = d3.select(mainLayer.getGraphic());

  g.selectAll("circle")
    .data(dataset)
    .join("circle")
    .attr("class", "mark")
    .attr("cx", (d) => x(+d[xField]))
    .attr("cy", (d) => y(+d[yField]))
    .attr("fill", (d) => color(d[colorField]))
    .attr("fill-opacity", 0.7)
    .attr("r", 3);

  // Interaction
  Libra.Interaction.build({
    inherit: "HoverInstrument",
    layers: [mainLayer],
    sharedVar: {
      tooltip: {
        image: (d) => d.image,
        offset: {
          x: -70 - MARGIN.left,
          y: -100 - MARGIN.top,
        },
      },
    },
  });
    Libra.Interaction.build({
    inherit: "ClickInstrument",
    layers: [mainLayer],
    remove: [
      {
        find: "SelectionTransformer",
      },
    ],
    insert: [
      {
        find: "SelectionService",
        flow: [
          {
            comp: "FilterService",
            sharedVar: {
              fields: ["label"],
            },
          },
          {
            comp: "SelectionTransformer",
            layer: mainLayer.getLayerFromQueue("selectionLayer"),
          },
        ],
      },
    ],
    sharedVar: {
      highlightColor: (d) => color(d[FIELD_COLOR]),
    },
  });
  
}

function bindUI() {
  fileInput = $("fileInput");
  xFieldSelect = $("xField");
  yFieldSelect = $("yField");
  colorFieldSelect = $("colorField");
  imageFieldSelect = $("imageField");
  renderBtn = $("renderBtn");
  resetBtn = $("resetBtn");
  statusEl = $("status");
  rowCountEl = $("rowCount");

  clearSelect(xFieldSelect, "X 字段");
  clearSelect(yFieldSelect, "Y 字段");
  clearSelect(colorFieldSelect, "颜色字段");
  clearSelect(imageFieldSelect, "图片字段");
  if (renderBtn) renderBtn.disabled = true;
  setStatus("请选择数据文件或使用默认示例");
  setRowCount(data.length || 0);

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        let parsed = [];
        if (/\.csv$/i.test(file.name)) {
          parsed = d3.csvParse(text);
        } else {
          const json = JSON.parse(text);
          parsed = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
        }
        if (!parsed.length) throw new Error("未解析到数据行");
        data = parsed;
        const types = inferFieldTypes(parsed);
        const allKeys = Object.keys(types);
        const numericFields = allKeys.filter((k) => types[k] === "number");
        const stringFields = allKeys.filter((k) => types[k] === "string");

        clearSelect(xFieldSelect, "X 字段");
        clearSelect(yFieldSelect, "Y 字段");
        clearSelect(colorFieldSelect, "颜色字段");
        clearSelect(imageFieldSelect, "图片字段");
        populateSelect(xFieldSelect, numericFields.length ? numericFields : allKeys);
        populateSelect(yFieldSelect, numericFields.length ? numericFields : allKeys);
        populateSelect(colorFieldSelect, allKeys);
        populateSelect(imageFieldSelect, stringFields);

        // auto-select defaults if present
        const prefer = (sel, name) => {
          if (!sel) return false;
          const opt = Array.from(sel.options).find((o) => o.value === name);
          if (opt) sel.value = name;
          return !!opt;
        };
        if (!prefer(xFieldSelect, FIELD_X) && xFieldSelect.options.length > 1) xFieldSelect.selectedIndex = 1;
        if (!prefer(yFieldSelect, FIELD_Y) && yFieldSelect.options.length > 1) yFieldSelect.selectedIndex = 1;
        if (!prefer(colorFieldSelect, FIELD_COLOR) && colorFieldSelect.options.length > 1) colorFieldSelect.selectedIndex = 1;
        const imgCandidates = ["image", "img", "url", "picture"];
        const imgAuto = imgCandidates.find((n) => stringFields.includes(n));
        if (imgAuto) imageFieldSelect.value = imgAuto;

        currentFields.xField = xFieldSelect.value || FIELD_X;
        currentFields.yField = yFieldSelect.value || FIELD_Y;
        currentFields.colorField = colorFieldSelect.value || FIELD_COLOR;
        currentFields.imageField = imageFieldSelect.value || null;

        setRowCount(data.length);
        setStatus("数据已加载，选择字段后点击“渲染”。");
        if (renderBtn) renderBtn.disabled = !(currentFields.xField && currentFields.yField && currentFields.colorField);
      } catch (err) {
        console.error(err);
        setStatus("解析失败：" + err.message);
        setRowCount(0);
        if (renderBtn) renderBtn.disabled = true;
      }
    });
  }

  if (xFieldSelect) xFieldSelect.addEventListener("change", () => { currentFields.xField = xFieldSelect.value; if (renderBtn) renderBtn.disabled = !(currentFields.xField && currentFields.yField && currentFields.colorField); });
  if (yFieldSelect) yFieldSelect.addEventListener("change", () => { currentFields.yField = yFieldSelect.value; if (renderBtn) renderBtn.disabled = !(currentFields.xField && currentFields.yField && currentFields.colorField); });
  if (colorFieldSelect) colorFieldSelect.addEventListener("change", () => { currentFields.colorField = colorFieldSelect.value; if (renderBtn) renderBtn.disabled = !(currentFields.xField && currentFields.yField && currentFields.colorField); });
  if (imageFieldSelect) imageFieldSelect.addEventListener("change", () => { currentFields.imageField = imageFieldSelect.value || null; });

  if (renderBtn) {
    renderBtn.addEventListener("click", () => {
      if (!(currentFields.xField && currentFields.yField && currentFields.colorField)) {
        setStatus("请先选择 X/Y/颜色 字段");
        return;
      }
      renderVisualizationDynamic(data, currentFields);
      setStatus("渲染完成");
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (fileInput) fileInput.value = ""; // 允许重新选择同一文件触发 change
      clearSelect(xFieldSelect, "X 字段");
      clearSelect(yFieldSelect, "Y 字段");
      clearSelect(colorFieldSelect, "颜色字段");
      clearSelect(imageFieldSelect, "图片字段");
      if (renderBtn) renderBtn.disabled = true;
      setStatus("已清空，请选择数据文件");
      setRowCount(0);
      clearSVG();
      // reset state
      currentFields = { xField: FIELD_X, yField: FIELD_Y, colorField: FIELD_COLOR, imageField: null };
    });
  }
}

// bind UI after initial render
document.addEventListener('DOMContentLoaded', () => {
  try { bindUI(); } catch (e) { console.error(e); }
});