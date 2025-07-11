// ffcompare.js

function _1(md) {
    return md`# Nasab2`;
}

// --- Robust, proven lineage extraction ---
function extractFullLineage(targetId, fullData) {
    const flat = fullData.flat ? fullData.flat() : fullData;
    const lookup = Object.fromEntries(flat.map(n => [n.id, n]));

    // Ancestors
    const ancestorSet = new Set();
    let toVisit = [targetId];
    while (toVisit.length) {
        const current = toVisit.pop();
        if (!ancestorSet.has(current)) {
            ancestorSet.add(current);
            const parents = lookup[current]?.parents || [];
            for (const p of parents) toVisit.push(p);
        }
    }
    ancestorSet.delete(targetId);

    // Descendants
    const childMap = {};
    for (const node of flat) {
        for (const p of node.parents || []) {
            if (!childMap[p]) childMap[p] = [];
            childMap[p].push(node.id);
        }
    }
    const descendantSet = new Set();
    toVisit = [targetId];
    while (toVisit.length) {
        const current = toVisit.pop();
        if (!descendantSet.has(current)) {
            descendantSet.add(current);
            const children = childMap[current] || [];
            for (const c of children) toVisit.push(c);
        }
    }
    descendantSet.delete(targetId);

    // Collect all nodes in this subgraph
    const nodeIDs = new Set([...ancestorSet, targetId, ...descendantSet]);
    const subgraph = flat.filter(n => nodeIDs.has(n.id));

    // Assign each node its relative generation (layer) for this lineage
    const genMap = new Map();
    genMap.set(targetId, 0);

    function assignAncestorLevels(id, level) {
        const parents = lookup[id]?.parents || [];
        for (const p of parents) {
            if (!genMap.has(p) || genMap.get(p) > level - 1) {
                genMap.set(p, level - 1);
                assignAncestorLevels(p, level - 1);
            }
        }
    }
    assignAncestorLevels(targetId, 0);

    function assignDescendantLevels(id, level) {
        const children = childMap[id] || [];
        for (const c of children) {
            if (!genMap.has(c) || genMap.get(c) < level + 1) {
                genMap.set(c, level + 1);
                assignDescendantLevels(c, level + 1);
            }
        }
    }
    assignDescendantLevels(targetId, 0);

    // Place each node in its layer by relative generation
    const layered = [];
    for (const n of subgraph) {
        const relGen = genMap.get(n.id);
        if (relGen === undefined) continue;
        if (!layered[relGen]) layered[relGen] = [];
        layered[relGen].push({ ...n }); // shallow copy
    }

    // Normalize: fill missing layers, shift so layer 0 is the root
    const minGen = Math.min(...genMap.values());
    const maxGen = Math.max(...genMap.values());
    const numLayers = maxGen - minGen + 1;
    const layers = Array.from({ length: numLayers }, (_, i) => []);

    for (let gen = minGen; gen <= maxGen; gen++) {
        (layered[gen] || []).forEach(node => {
            layers[gen - minGen].push(node);
        });
    }

    // Patch parents: only reference those in the extracted subgraph
    const idSet = new Set(subgraph.map(n => n.id));
    for (const level of layers) {
        for (const node of level) {
            node.parents = (node.parents || []).filter(p => idSet.has(p));
        }
    }

    return layers;
}

// --- Merges multiple lineages layer-by-layer ---
function mergeLineageLayers(listOfLayerArrays) {
    // Find the deepest number of layers among all lineages
    const maxLayers = Math.max(...listOfLayerArrays.map(layers => layers.length));
    const merged = [];

    for (let gen = 0; gen < maxLayers; gen++) {
        let allNodes = [];
        for (const layers of listOfLayerArrays) {
            if (layers[gen]) {
                allNodes = allNodes.concat(layers[gen]);
            }
        }
        // Deduplicate nodes by id
        const seen = new Set();
        const deduped = allNodes.filter(n => n && !seen.has(n.id) && seen.add(n.id));
        if (deduped.length) {
            merged.push(deduped);
        }
    }
    return merged;
}

// === UI ===
function _dropdown(fullData) {
    const flat = fullData.flat ? fullData.flat() : fullData;
    const sorted = [...flat].sort((a, b) => a.id.localeCompare(b.id, "en"));
    let layersList = [];
    let addedIds = new Set();

    // DOM STRUCTURE
    const section = document.createElement("section");
    section.className = "p-4 bg-white text-[#588B8B] rounded-xl shadow";
    const title = document.createElement("h2");
    title.className = "text-xl font-bold mb-2";
    

    // Dropdown
    const label = document.createElement("label");
    label.setAttribute("for", "lineage-select");
    label.className = "block font-semibold mb-1";
    label.textContent = "Select a Lineage:";

    const select = document.createElement("select");
    select.id = "lineage-select";
    select.className = "w-full mb-4 p-2 border border-gray-300 rounded";
    select.style.backgroundColor = "#F5F5F5";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = " ";
    select.appendChild(blank);

    for (const node of sorted) {
        const option = document.createElement("option");
        option.value = node.id;
        option.textContent = `${node.label} (${node.author}, d. ${node.death} AH)`;
        select.appendChild(option);
    }

    // Add Layer button
    const addBtn = document.createElement("button");
    addBtn.textContent = "Add Layer";
    addBtn.className = "ml-2 px-4 py-2 rounded shadow";
    addBtn.style.backgroundColor = "#588B8B";
    addBtn.style.color = "white";

    // Added lineages display
    const addedDiv = document.createElement("div");
    addedDiv.className = "mt-4 flex flex-wrap gap-2";

    function renderAddedLineages() {
        addedDiv.innerHTML = "";
        if (!layersList.length) {
            addedDiv.innerHTML = `<span class="text-gray-400 italic">No layers added.</span>`;
            return;
        }
        layersList.forEach((obj, idx) => {
            let selectedNode = flat.find(n => n.id === obj.selectedID);
            const badge = document.createElement("span");
            badge.className = "inline-flex items-center bg-[#588B8B] text-white px-3 py-1 rounded-full text-sm";
            badge.textContent = selectedNode ? selectedNode.label : obj.selectedID;
            // Remove X button
            const x = document.createElement("button");
            x.textContent = "×";
            x.className = "ml-2 bg-white text-[#588B8B] rounded-full px-2 py-0.5 border border-[#588B8B] text-xs";
            x.onclick = () => {
                addedIds.delete(obj.selectedID);
                layersList.splice(idx, 1);
                if (layersList.length) {
                    window.setFilteredData(mergeLineageLayers(layersList.map(obj => obj.layers)));
                } else {
                    const chartArea = document.getElementById("chart-area");
                    if (chartArea) chartArea.innerHTML = "";
                }
                renderAddedLineages();
                if (!layersList.length) select.value = "";
            };
            badge.appendChild(x);
            addedDiv.appendChild(badge);
        });
    }

    addBtn.onclick = e => {
        e.preventDefault();
        const selectedID = select.value;
        if (!selectedID || addedIds.has(selectedID)) return;
        const layers = extractFullLineage(selectedID, fullData);
        if (!layers || !layers.length || !layers.some(arr => arr.length)) return;
        layersList.push({ selectedID, layers });
        addedIds.add(selectedID);
        window.setFilteredData(mergeLineageLayers(layersList.map(obj => obj.layers)));
        renderAddedLineages();
    };

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Reset";
    resetBtn.className = "ml-2 px-4 py-2 rounded shadow";
    resetBtn.style.backgroundColor = "#588B8B";
    resetBtn.style.color = "white";
    resetBtn.onclick = () => {
        select.value = "";
        layersList = [];
        addedIds = new Set();
        const chartArea = document.getElementById("chart-area");
        if (chartArea) chartArea.innerHTML = "";
        renderAddedLineages();
    };

    renderAddedLineages();

    section.append(title, label, select, addBtn, resetBtn, addedDiv);

    const outer = document.createElement("div");
    outer.className = "max-w-7xl mx-auto";
    outer.appendChild(section);

    const chartContainer = document.querySelector("#chart-area");
    chartContainer?.parentNode?.insertBefore(outer, chartContainer);
}

// ========== Chart render and Observable runtime linkage (untouched) ==========
function _2(renderChart, data) {
    return (
        renderChart(data)
    )
}

function _3(md) { return (md`## Code`) }

function _renderChart(color, constructTangleLayout, _, svg, background_color, d3) {
    return (
        (data, options = {}) => {
            options.color ||= (d, i) => color(i);
            const tangleLayout = constructTangleLayout(_.cloneDeep(data), options);

            const svgWidth = tangleLayout.layout.width;
            const svgHeight = tangleLayout.layout.height;
            const labelClearance = 10;

            // Container setup
            const container = document.createElement("div");
            container.style.overflowX = "auto";
            container.style.overflowY = "hidden";
            container.style.maxWidth = "100%";
            container.style.display = "block";
            container.style.minWidth = "1280px"; // fallback safeguard
            container.style.width = `${svgWidth}px`;
            container.style.marginTop = "2rem";
            container.style.position = "relative";

            // SVG innerHTML
            container.innerHTML = `
    <svg width="${svgWidth}" height="${svgHeight}" style="background-color: ${background_color}">
      <style>
        text {
          font-family: 'Noto Sans', sans-serif;
          font-size: 16px;
          fill: #588B8B;
        }
        .node { stroke-linecap: round; }
        .link { fill: none; }
      </style>
      <g id="zoom-group">
        ${tangleLayout.bundles.map((b, i) => {
                const d = b.links.map(l => `
            M${l.xt} ${l.yt}
            L${l.xt + labelClearance} ${l.yt}
            L${l.xb - l.c1} ${l.yt}
            A${l.c1} ${l.c1} 90 0 1 ${l.xb} ${l.yt + l.c1}
            L${l.xb} ${l.ys - l.c2}
            A${l.c2} ${l.c2} 90 0 0 ${l.xb + l.c2} ${l.ys}
            L${l.xs} ${l.ys}
          `).join("");

                return `
            <path class="link" d="${d}" stroke="${background_color}" stroke-width="5"/>
            <path class="link" d="${d}" stroke="${options.color(b, i)}" stroke-width="2"/>
          `;
            }).join("")}
  
        ${tangleLayout.nodes.map(n => `
          <path class="selectable node" data-id="${n.id}" stroke="black" stroke-width="8"
                d="M${n.x} ${n.y - n.height / 2} L${n.x} ${n.y + n.height / 2}"/>
          <path class="node" stroke="white" stroke-width="4"
                d="M${n.x} ${n.y - n.height / 2} L${n.x} ${n.y + n.height / 2}"/>
          <text class="selectable" data-id="${n.id}" x="${n.x + 4}" y="${n.y - n.height / 2 - 4}" stroke="${background_color}" stroke-width="2">
            ${n.id}
            <title>Author: ${n.author} (d. ${n.death} AH)</title>
          </text>
          <text x="${n.x + 4}" y="${n.y - n.height / 2 - 4}" style="pointer-events: none;">${n.id}</text>
        `).join("")}
      </g>
    </svg>
  `;

            // D3 zoom controls and UI (unchanged)
            const svgEl = container.querySelector("svg");
            const zoomGroup = container.querySelector("#zoom-group");
            const d3svg = d3.select(svgEl);
            const d3g = d3.select(zoomGroup);

            let currentTransform = d3.zoomIdentity;

            const zoom = d3.zoom()
                .scaleExtent([0.05, 4])
                .filter(function (event) {
                    return event.type === "wheel"
                        ? event.ctrlKey || event.metaKey
                        : true;
                })
                .on("zoom", (event) => {
                    d3g.attr("transform", event.transform);
                    currentTransform = event.transform;
                });

            d3svg.call(zoom);

            // Zoom controls
            const controls = document.createElement("div");
            controls.style.position = "absolute";
            controls.style.top = "20px";
            controls.style.right = "32px";
            controls.style.display = "flex";
            controls.style.gap = "8px";
            controls.style.zIndex = "10";
            controls.style.pointerEvents = "none";

            const buttonStyle = `
    background-color: #588B8B;
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1.25rem;
    box-shadow: 0 1px 6px rgba(88,139,139,0.09);
    pointer-events: auto;
    padding: 0;
  `;

            const minusBtn = document.createElement("button");
            minusBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="display:block;margin:auto;" xmlns="http://www.w3.org/2000/svg">
          <circle cx="9" cy="9" r="9" fill="#588B8B"/>
          <rect x="4.5" y="8.25" width="9" height="1.5" rx="0.75" fill="#fff"/>
        </svg>`;
            minusBtn.style = buttonStyle;

            const plusBtn = document.createElement("button");
            plusBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="display:block;margin:auto;" xmlns="http://www.w3.org/2000/svg">
          <circle cx="9" cy="9" r="9" fill="#588B8B"/>
          <rect x="4.5" y="8.25" width="9" height="1.5" rx="0.75" fill="#fff"/>
          <rect x="8.25" y="4.5" width="1.5" height="9" rx="0.75" fill="#fff"/>
        </svg>`;
            plusBtn.style = buttonStyle;

            controls.appendChild(minusBtn);
            controls.appendChild(plusBtn);
            container.appendChild(controls);

            function zoomAtPoint(factor) {
                const containerRect = container.getBoundingClientRect();
                const svgRect = svgEl.getBoundingClientRect();
                const scrollLeft = container.scrollLeft;
                const scrollTop = container.scrollTop;
                const cx = scrollLeft + container.clientWidth / 2;
                const cy = scrollTop + container.clientHeight / 2;
                const pt = [cx, cy];
                let transform = d3.zoomTransform(svgEl);
                let svgPoint = transform.invert(pt);
                let newK = Math.max(0.3, Math.min(4, transform.k * factor));
                let newTransform = d3.zoomIdentity
                    .translate(transform.x, transform.y)
                    .scale(newK);
                let newScreenPoint = newTransform.apply(svgPoint);
                newTransform = newTransform.translate(cx - newScreenPoint[0], cy - newScreenPoint[1]);
                d3svg.transition().duration(300).call(zoom.transform, newTransform);
            }

            minusBtn.onclick = (e) => {
                e.preventDefault();
                zoomAtPoint(1 / 1.2);
            };
            plusBtn.onclick = (e) => {
                e.preventDefault();
                zoomAtPoint(1.2);
            };

            const resetBtn = document.createElement("button");
            resetBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 18 18" style="display:block;margin:auto;" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="9" cy="9" r="9" fill="#588B8B"/>
            <rect x="8.25" y="4.5" width="1.5" height="9" rx="0.75" fill="#fff" transform="rotate(45 9 9)"/>
            <rect x="8.25" y="4.5" width="1.5" height="9" rx="0.75" fill="#fff" transform="rotate(-45 9 9)"/>
          </svg>
        `;
            resetBtn.style = buttonStyle;
            resetBtn.title = "Reset zoom";
            controls.appendChild(resetBtn);

            resetBtn.onclick = (e) => {
                e.preventDefault();
                d3svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
            };

            return container;
        }
    )
}

function _fullData() {
    return fetch("../jsons/commentaries_observable_nested.json")
        .then(res => {
            if (!res.ok) throw new Error(`Failed to load JSON: ${res.status}`);
            return res.json();
        });
}
function _data(fullData) { return fullData }
function _constructTangleLayout(d3) {
    // [identical to your working version in explore]
    return (
        (levels, options = {}) => {
            levels.forEach((l, i) => l.forEach(n => (n.level = i)));
            var nodes = levels.reduce((a, x) => a.concat(x), []);
            var nodes_index = {};
            nodes.forEach(d => (nodes_index[d.id] = d));
            nodes.forEach(d => {
                d.parents = (d.parents === undefined ? [] : d.parents).map(
                    p => nodes_index[p]
                );
            });
            levels.forEach((l, i) => {
                var index = {};
                l.forEach(n => {
                    if (n.parents.length == 0) return;
                    var id = n.parents.map(d => d.id).sort().join('-X-');
                    if (id in index) {
                        index[id].parents = index[id].parents.concat(n.parents);
                    } else {
                        index[id] = { id: id, parents: n.parents.slice(), level: i, span: i - d3.min(n.parents, p => p.level) };
                    }
                    n.bundle = index[id];
                });
                l.bundles = Object.keys(index).map(k => index[k]);
                l.bundles.forEach((b, i) => (b.i = i));
            });
            var links = [];
            nodes.forEach(d => {
                d.parents.forEach(p =>
                    links.push({ source: d, bundle: d.bundle, target: p })
                );
            });
            var bundles = levels.reduce((a, x) => a.concat(x.bundles), []);
            bundles.forEach(b =>
                b.parents.forEach(p => {
                    if (p.bundles_index === undefined) p.bundles_index = {};
                    if (!(b.id in p.bundles_index)) p.bundles_index[b.id] = [];
                    p.bundles_index[b.id].push(b);
                })
            );
            nodes.forEach(n => {
                if (n.bundles_index !== undefined) {
                    n.bundles = Object.keys(n.bundles_index).map(k => n.bundles_index[k]);
                } else {
                    n.bundles_index = {};
                    n.bundles = [];
                }
                n.bundles.sort((a, b) => d3.descending(d3.max(a, d => d.span), d3.max(b, d => d.span)));
                n.bundles.forEach((b, i) => (b.i = i));
            });
            links.forEach(l => {
                if (l.bundle.links === undefined) l.bundle.links = [];
                l.bundle.links.push(l);
            });
            // layout constants (unchanged)
            const padding = 8;
            const node_height = 22;
            const node_width = 70;
            const bundle_width = 14;
            const level_y_padding = 16;
            const metro_d = 4;
            const min_family_height = 22;
            const generationSpacing = 250;
            const bundleClearance = 485;
            const labelPadding = 800;
            const baseGenerationSpacing = 425;
            const minContentWidth = 1280;
            options.c ||= 16;
            const c = options.c;
            options.bigc ||= node_width + c;
            nodes.forEach(
                n => (n.height = (Math.max(1, n.bundles.length) - 1) * metro_d)
            );
            var x_offset = padding;
            var y_offset = padding;
            if (levels.length === 1 && levels[0].length === 1) {
                const n = levels[0][0];
                n.x = minContentWidth / 2;
                n.y = 100;
            } else {
                levels.forEach(l => {
                    x_offset += l.bundles.length * bundle_width + baseGenerationSpacing;
                    y_offset += level_y_padding;
                    l.forEach((n, i) => {
                        n.x = n.level * generationSpacing + x_offset;
                        n.y = node_height + y_offset + n.height / 2;
                        y_offset += node_height + n.height;
                    });
                });
            }
            var i = 0;
            levels.forEach(l => {
                l.bundles.forEach(b => {
                    b.x =
                        d3.max(b.parents, d => d.x) +
                        node_width +
                        (l.bundles.length - 1 - b.i) * bundle_width + bundleClearance;
                    b.y = i * node_height;
                });
                i += l.length;
            });
            links.forEach(l => {
                l.xt = l.target.x;
                l.yt =
                    l.target.y +
                    l.target.bundles_index[l.bundle.id].i * metro_d -
                    (l.target.bundles.length * metro_d) / 2 +
                    metro_d / 2;
                l.xb = l.bundle.x;
                l.yb = l.bundle.y;
                l.xs = l.source.x;
                l.ys = l.source.y;
            });
            // compress vertical space
            var y_negative_offset = 0;
            levels.forEach(l => {
                y_negative_offset +=
                    -min_family_height +
                    d3.min(l.bundles, b =>
                        d3.min(b.links, link => link.ys - 2 * c - (link.yt + c))
                    ) || 0;
                l.forEach(n => (n.y -= y_negative_offset));
            });
            links.forEach(l => {
                l.yt =
                    l.target.y +
                    l.target.bundles_index[l.bundle.id].i * metro_d -
                    (l.target.bundles.length * metro_d) / 2 +
                    metro_d / 2;
                l.ys = l.source.y;
                l.c1 = l.source.level - l.target.level > 1 ? Math.min(options.bigc, l.xb - l.xt, l.yb - l.yt) - c : c;
                l.c2 = c;
            });
            var layout = {
                width: Math.max(
                    d3.max(nodes, n => n.x + node_width + labelPadding),
                    d3.max(bundles, b => b.x + bundle_width), minContentWidth
                ) + 2 * padding,
                height: Math.max(
                    d3.max(nodes, n => n.y + node_height / 2),
                    d3.max(bundles, b => b.y ?? 0)
                ) + 15 * padding,
                node_height,
                node_width,
                bundle_width,
                level_y_padding,
                metro_d
            };
            return { levels, nodes, nodes_index, links, bundles, layout };
        }
    )
}
function _color(d3) { return d3.scaleOrdinal(d3.schemeDark2) }
function _background_color() { return 'white' }
function _9(md) { return (md`## Dependencies`) } // hidden
function _d3(require) {
    return require('d3-scale', 'd3-scale-chromatic', 'd3-array', 'd3-selection', 'd3-zoom');
}
function __(require) { return require("lodash") }

// ========== Observable Runtime Boilerplate ==========
export default function define(runtime, observer) {
    const main = runtime.module();

    main.variable(observer("title")).define(["md"], _1);
    main.variable(observer("codeHeader")).define(["md"], _3);
    main.variable(observer("renderChart")).define("renderChart", ["color", "constructTangleLayout", "_", "svg", "background_color", "d3"], _renderChart);
    main.value("renderChart").then(fn => window.renderChart = fn);

    main.variable(observer("fullData")).define("fullData", _fullData);
    main.value("fullData").then(_dropdown);

    main.variable(observer("constructTangleLayout")).define("constructTangleLayout", ["d3"], _constructTangleLayout);
    main.variable(observer("color")).define("color", ["d3"], _color);
    main.variable(observer("background_color")).define("background_color", _background_color);
    main.variable(observer("depsHeader")).define(["md"], _9);
    main.variable(observer("d3")).define("d3", ["require"], _d3);
    main.variable(observer("_")).define("_", ["require"], __);

    return main;
}

// === Chart updating: identical to explore, dyslexia mode included ===
window.setFilteredData = function (newData) {
    const chartArea = document.querySelector("#chart-area");
    if (chartArea) chartArea.innerHTML = "";
    const chart = window.renderChart(newData);
    document.querySelector("#chart-area")?.appendChild(chart);

    // If dyslexia mode is on, set the font
    if (document.body.classList.contains("dyslexic-mode")) {
        chart.style.fontFamily = "'OpenDyslexic', sans-serif";
        const svg = chart.querySelector("svg");
        if (svg) svg.style.fontFamily = "'OpenDyslexic', sans-serif";
        svg?.querySelectorAll("text").forEach(el => {
            el.style.fontFamily = "'OpenDyslexic', sans-serif";
        });
    }
};
  