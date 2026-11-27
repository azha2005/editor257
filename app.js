"use strict";

const $ = id => document.getElementById(id);
// El empaquetado sella los archivos con ?v=… para que la caché no mezcle datos de dos versiones.
const assetVersion = new URL(document.currentScript.src).searchParams.get("v") ?? "";
const number = value => formatInt.format(value);
const percentage = value => formatDecimal.format(value);
const pct = value => `${percentage(value)} %`;
let carve = false;
const districtName = district => district ? `${carve ? "Provincia" : "Distrito"} ${district}` : "Sin asignar";
const css = getComputedStyle(document.documentElement);
const color = name => css.getPropertyValue(`--${name}`).trim();
const palette = color("districts").split(",").map(item => item.trim());
function readMapColors() {
  return {
    water: color("water"), grid: color("grid"), boundary: color("boundary"),
    departmentLine: color("department-line"), departmentHalo: color("department-halo"),
    hover: color("hover"), hoverFill: color("hover-fill"),
    district: district => district ? palette[(district - 1) % palette.length] : color("unassigned")
  };
}
let colors = readMapColors();

const controls = ["province", "mode", "election", "group", "brush", "map-view", "download", "reset",
  "seats", "export-lines", "export-svg", "export-png", "reparto", "camara", "seat-count", "seat-default", "join-apply", "join-amba", "join-clear", "active-district", "carve-amba", "carve-apply"];
const displayModes = new Set(["assignment", "unit", "lean", "unassigned", "export"]);
const pending = new Map();
const localPlans = new Map();
const atlases = new Map();
const bases = new Map();
const borders = new Map();
let catalog = new Map();
let members = ["01"];
let repartoId = "b257";
let camara = 257;
let seatsCustom = null;
let seatTable = {};
let plan;
let election;
let view = "assignment";
let exportBasis = "assignment";
let exportPreview = null;
let voteMethod = "geo";
let lean = null;
let active = 1;
let tool = "paint";
let brushPreference = "one";
const visitedPlanSizes = new Map();
let switching = false;
let rows = [];
const pageSize = 7;
let page = 0;
let frame = 0;
let displayCompleteResults = false;
let saveMessage = "Guardado en este navegador";
let blockedStroke = false;
let overviewCounts = null;
let reviewedCounts = null;
let locatedCounts = null;
let reviewLocations = [];

const map = new MapaDistritos($("canvas"), {
  style: mapStyle,
  tool: () => tool,
  enabled: () => !switching,
  brush: () => Number($("brush").value),
  begin: () => {
    blockedStroke = false;
    plan.begin();
  },
  cancel: message => {
    if (plan.abort()) $("activity").textContent = message;
    redraw();
  },
  paint: (indices, type) => {
    const keys = new Set();
    const units = [];
    for (const index of indices) {
      const group = brushGroup(index);
      if (keys.has(group.key)) continue;
      keys.add(group.key);
      units.push(...group.indices);
    }
    const target = type === "erase" ? 0 : active;
    blockedStroke ||= units.some(index => !plan.allowsChange(plan.districts[index], target));
    if (plan.paint(units, target)) redraw();
  },
  end: () => {
    const changed = plan.end();
    const note = blockedStroke ? " Los distritos bloqueados se respetaron." : "";
    if (changed) saveChange(`${number(changed)} ${changed === 1 ? "unidad editada" : "unidades editadas"}.${note}`);
    else {
      if (blockedStroke) $("activity").textContent = "El trazo toca un distrito bloqueado.";
      redraw();
    }
  },
  hover: showHover,
  hoverGroup: index => tool === "pan" ? null : brushGroup(index),
  inspect: index => {
    const district = plan.districts[index];
    if (district) chooseDistrict(district);
    else $("activity").textContent = `Unidad ${plan.units[index][0]} sin asignar`;
  },
  scale: pxPerMetre => {
    const aim = 90 / pxPerMetre;
    const order = 10 ** Math.floor(Math.log10(aim));
    const meters = ([5, 2, 1].find(step => step * order <= aim) ?? 1) * order;
    $("scale-label").textContent = meters >= 1000 ? `${number(meters / 1000)} km` : `${number(meters)} m`;
    $("scale").querySelector("i").style.width = `${meters * pxPerMetre}px`;
  }
});

// Lo que toma el pincel desde una unidad: ella sola, su circuito vinculado o su departamento.
function brushGroup(index) {
  const mode = $("group").value;
  const unit = plan.units[index];
  if (mode === "dept" && unit[7] !== undefined) return {key: `d${unit[7]}`, indices: plan.deptGroups.get(unit[7])};
  if (mode === "group" && plan.base.modo === "radios") return {key: `c${unit[1]}`, indices: plan.groups.get(unit[1])};
  return {key: `u${index}`, indices: [index]};
}

function make(tag, text = "", className = "") {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function labelThemeToggle() {
  const light = document.documentElement.dataset.theme === "dark";
  $("theme-toggle").textContent = light ? "Claro" : "Oscuro";
  $("theme-toggle").setAttribute("aria-label", light ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
}

$("theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("tema", root.dataset.theme); } catch {}
  labelThemeToggle();
  colors = readMapColors();
  if (plan) {
    refreshView();
    redraw();
  } else map.request();
});
labelThemeToggle();

function mapStyle() {
  if (view === "export") return {...colors, preview: true};
  if (view === "unassigned") {
    const assigned = color("review-assigned");
    const unassigned = color("review-unassigned");
    return {...colors, active: 0, fill: (_, district) => district ? assigned : unassigned};
  }
  if (view === "assignment" || !lean) return colors;
  if (view === "unit") return {...colors, fill: index => lean.unitFill[index]};
  const districtFill = lean.districts(plan).map(result => lean.shade(result));
  return {
    ...colors,
    active,
    fill: (index, district) => district ? districtFill[district] : lean.contextFill[index]
  };
}

function showHover(index) {
  const unit = plan?.units[index];
  if (!unit) { $("hover").textContent = ""; return; }
  const kind = plan.base.modo === "radios" ? "Radio" : "Circuito";
  const district = plan.districts[index];
  const info = [`${kind} ${unit[0]}`, plan.base.deptos?.[unit[7]], `${number(unit[2])} hab.`, districtName(district)]
    .filter(Boolean);
  if (tool !== "pan" && $("group").value !== "one") {
    const {indices} = brushGroup(index);
    const label = $("group").value === "group" ? `Circuito vinculado ${unit[1]}` : "Grupo del pincel";
    info.push(`${label} · ${number(indices.length)} ${indices.length === 1 ? "unidad" : "unidades"}`);
  }
  if (plan.locked.has(district)) info.push("Bloqueado");
  if (lean) {
    const result = view === "lean" && district ?
      lean.district(plan.totals[district], plan.method) : lean.unitVotes[index];
    info.push(lean.title(result));
  }
  $("hover").textContent = info.join(" / ");
}

function legendChip(text, fill) {
  const chip = make("span", "", "legend-chip");
  const swatch = make("i", "", "swatch");
  swatch.style.backgroundColor = fill;
  chip.append(swatch, document.createTextNode(text));
  return chip;
}

function refreshView() {
  const key = $("lean-key");
  key.hidden = view !== "lean" && view !== "unit";
  lean = key.hidden ? null : new LeanElectoral(plan, election, {
    paper: color("surface"), alternate: palette, blank: color("unassigned"),
    tie: color("lean-tie"), missing: color("lean-uncovered")
  });
  if (lean) {
    $("lean-description").textContent = view === "lean" ?
      "Las unidades sin asignar muestran su voto. Las asignadas muestran el resultado acumulado del distrito." :
      "Cada unidad muestra su propio resultado electoral, aunque ya esté asignada.";
    const demo = lean.legend[0]?.ramp ?? marginLevels.map(() => color("lean-tie"));
    $("lean-margins").replaceChildren(make("strong", "Margen sobre el segundo"),
      ...marginLevels.map((level, i) => legendChip(level.label, demo[i])),
      legendChip("Empate", lean.theme.tie), legendChip("Sin votos", lean.theme.blank));
    if (plan.method === "geo" && plan.voteRows.some(row => row === null)) {
      $("lean-margins").append(legendChip(view === "lean" ? "Cobertura parcial o ausente" : "Fuera de cobertura",
        lean.theme.missing));
    }
    const parties = lean.legend.map(party => legendChip(party.name, party.hex));
    $("lean-parties").replaceChildren(...parties.slice(0, 5));
    if (parties.length > 5) {
      const details = make("details");
      const rest = make("div", "", "legend-items");
      rest.append(...parties.slice(5));
      details.append(make("summary", "Más fuerzas"), rest);
      $("lean-parties").append(details);
    }
  }
  showHover(map.hoverIndex);
}

function setControls(enabled) {
  for (const id of controls) $(id).disabled = !enabled;
  $("department-lines").disabled = !enabled || view === "export";
  $("radio-source").disabled = !enabled || !plan?.base.geolocalizados;
  $("open").disabled = !enabled;
  $("lock-district").disabled = !enabled;
  $("find-unassigned").disabled = !enabled || !plan?.totals[0].units;
  $("locate-fragments").disabled = !enabled || !plan?.base.lugaresPartes;
  $("undo").disabled = !enabled || !plan?.history.length;
  $("redo").disabled = !enabled || !plan?.future.length;
  $("camara").disabled = !enabled || !repartoPorId.get(repartoId)?.ajustado;
  $("seat-default").disabled = !enabled || seatsCustom === null;
  $("join-clear").disabled = !enabled || members.length === 1;
}

// Cada número de distritos tiene su propio plan guardado; el de la base conserva la clave original.
function saveKey(base) {
  if (base.tipo === "provincias") return `distrito257/${base.id}/${base.modo}/provincias/${base.bancas}`;
  const suffix = base.bancas === base.bancasBase ? "" : `/${base.bancas}`;
  return `distrito257/${base.id}/${base.modo}${suffix}`;
}

function planSizeKey(id, carving) {
  return `${id}/${carving ? "provincias" : "distritos"}`;
}

function rememberPlanSize() {
  visitedPlanSizes.set(planSizeKey(plan.base.id, carve), seatsCustom);
}

function restore(base) {
  const key = saveKey(base);
  try {
    const raw = localPlans.get(key) ?? localStorage.getItem(key);
    if (!raw) return null;
    return PlanDistritos.readLocal(base, JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveChange(message) {
  const key = saveKey(plan.base);
  const value = JSON.stringify(plan.serializeLocal());
  localPlans.set(key, value);
  try {
    localStorage.setItem(key, value);
    saveMessage = "Guardado en este navegador";
  } catch {
    saveMessage = "Guardado solo en esta sesión";
    message += ". Descargá el plan para conservarlo.";
  }
  $("save-status").textContent = saveMessage;
  $("activity").textContent = message;
  redraw();
}

window.recibirBase = base => pending.get(`${base.id}-${base.modo}`)?.(base);
window.recibirLocales = atlas => pending.get(`${atlas.id}-locales`)?.(atlas);
window.recibirFronteras = data => pending.get(`fronteras-${data.modo}`)?.(data);
window.recibirLimitesCensales = data => pending.get("limites-censales")?.(data);

let departmentRequest;
$("department-lines").addEventListener("click", async event => {
  const button = event.currentTarget;
  map.showDepartments = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(map.showDepartments));
  if (map.showDepartments && !map.departmentBoundaries) {
    try {
      map.departmentBoundaries = await (departmentRequest ??= getScript("limites-censales"));
    } catch (error) {
      departmentRequest = null;
      map.showDepartments = false;
      button.setAttribute("aria-pressed", "false");
      $("activity").textContent = error.message;
    }
  }
  map.request();
});

async function getBase(id, mode) {
  const key = `${id}-${mode}`;
  if (!bases.has(key)) {
    const base = await getScript(key);
    base.bancasBase = base.bancas;
    base.geolocalizados = catalog.get(id).geolocalizados;
    base.miembros = [{id, desde: 0, hasta: base.unidades.length}];
    bases.set(key, base);
  }
  return bases.get(key);
}

async function getBorders(mode) {
  if (!borders.has(mode)) borders.set(mode, await getScript(`fronteras-${mode}`));
  return borders.get(mode);
}

// Unión de listas por nombre: cada jurisdicción trae su propio orden de fuerzas.
function mergeElections(lists) {
  const ids = lists[0].map(item => item.id).filter(id => lists.every(list => list.some(item => item.id === id)));
  const maps = lists.map(() => []);
  const elecciones = [];
  let width = 0;
  for (const id of ids) {
    const found = lists.map(list => list.find(item => item.id === id));
    const names = [];
    const tints = [];
    found.forEach(item => item.partidos.forEach((name, i) => {
      if (!names.includes(name)) { names.push(name); tints.push(item.colores?.[i]); }
    }));
    found.forEach((item, m) => item.partidos.forEach((name, i) => {
      maps[m][item.desde + i] = width + names.indexOf(name);
    }));
    const {colores, ...rest} = found[0];
    elecciones.push({...rest, desde: width, partidos: names, ...(tints.some(Boolean) ? {colores: tints} : {})});
    width += names.length;
  }
  return {elecciones, maps, width};
}

function remapVotes(row, map, width) {
  if (!row) return row;
  const out = new Array(width).fill(0);
  row.forEach((votes, i) => { if (map[i] !== undefined) out[map[i]] += votes; });
  return out;
}

const earthRadius = 6378137;

function mergeBases(list, {pares: pairs, contactos: contacts = []}) {
  const left = Math.min(...list.map(base => base.origen[0]));
  const top = Math.max(...list.map(base => base.origen[1]));
  const merged = mergeElections(list.map(base => base.elecciones));
  const total = list.reduce((sum, base) => sum + base.unidades.length, 0);
  const unidades = [], vecinos = [], partesExtra = [], pieces = new Map(), miembros = [];
  const pieceCount = total + list.reduce((sum, base) => sum + (base.partesExtra?.length ?? 0), 0);
  const locations = list.every(base => base.lugaresPartes) ? new Float64Array(3 * pieceCount) : null;
  const boxes = [], islands = [], exterior = new Map();
  let units = 0, extras = 0, districts = 0, ancho = 0, alto = 0;
  list.forEach((base, m) => {
    const dx = Math.round(base.origen[0] - left), dy = Math.round(top - base.origen[1]);
    const n = base.unidades.length, u0 = units, e0 = extras, d0 = districts;
    const piece = i => i < n ? u0 + i : total + e0 + i - n;
    for (const unit of base.unidades) {
      unidades.push([unit[0], unit[1], unit[2], unit[3] ? unit[3] + d0 : 0,
        remapVotes(unit[4], merged.maps[m], merged.width),
        unit[5].map(ring => ring.map((value, k) => value + (k % 2 ? dy : dx))), unit[6], unit[7]]);
    }
    for (const value of base.vecinos) vecinos.push(piece(value));
    for (const owner of base.partesExtra ?? []) partesExtra.push(owner + u0);
    for (const id of base.partesInsulares ?? []) islands.push(piece(id));
    if (locations) {
      for (let i = 0; i < base.lugaresPartes.length; i += 3) {
        const offset = 3 * piece(i / 3);
        locations[offset] = base.lugaresPartes[i] + dx;
        locations[offset + 1] = base.lugaresPartes[i + 1] + dy;
        locations[offset + 2] = base.lugaresPartes[i + 2];
      }
      for (const [id, x1, y1, x2, y2] of base.cajasPartes) {
        boxes.push([piece(id), x1 + dx, y1 + dy, x2 + dx, y2 + dy]);
      }
      for (const [id, length] of base.exteriorPartes) exterior.set(piece(id), length);
    }
    pieces.set(base.id, piece);
    miembros.push({id: base.id, desde: u0, hasta: u0 + n});
    units += n;
    extras += (base.partesExtra ?? []).length;
    districts += base.bancas;
    ancho = Math.max(ancho, dx + base.ancho);
    alto = Math.max(alto, dy + base.alto);
  });
  for (let i = 0; i < pairs.length; i += 4) {
    const a = pieces.get(pairs[i]), b = pieces.get(pairs[i + 2]);
    if (a && b) {
      const first = a(pairs[i + 1]), second = b(pairs[i + 3]);
      vecinos.push(first, second);
      const shared = contacts[i / 4];
      if (shared) {
        for (const id of [first, second]) exterior.set(id, (exterior.get(id) ?? 0) - shared);
      }
    }
  }
  const middle = 2 * Math.atan(Math.exp((top - alto / 2) / earthRadius)) - Math.PI / 2;
  return {
    id: list.map(base => base.id).join("+"), modo: list[0].modo, nombre: unionName(list.map(base => base.id)),
    bancas: districts, bancasBase: districts, version: list.map(base => base.version).join("+"),
    origen: [left, top], ancho, alto, escala: Math.cos(middle), elecciones: merged.elecciones,
    unidades, vecinos, partesExtra, miembros, deptos: Object.assign({}, ...list.map(base => base.deptos)),
    lugaresPartes: locations, cajasPartes: boxes, exteriorPartes: [...exterior].filter(([, length]) => length > 1e-8),
    partesInsulares: islands,
    geolocalizados: list.reduce((sum, base) => sum + base.geolocalizados, 0)
  };
}

function unionName(ids) {
  if (ids.length === 1) return catalog.get(ids[0]).nombre;
  return ids.map(id => id === "01" ? "CABA" : catalog.get(id).nombre).join(" + ");
}

async function getJurisdiction(ids, mode) {
  if (ids.length === 1) return getBase(ids[0], mode);
  const key = `${ids.join("+")}-${mode}`;
  if (!bases.has(key)) {
    const list = [];
    for (const id of ids) list.push(await getBase(id, mode));
    bases.set(key, mergeBases(list, await getBorders(mode)));
  }
  return bases.get(key);
}

function getScript(key) {
  return new Promise((resolve, reject) => {
    const script = make("script");
    const clean = () => {
      script.remove();
      pending.delete(key);
    };
    pending.set(key, base => { clean(); resolve(base); });
    script.addEventListener("error", () => {
      clean();
      reject(new Error("No se encontró la capa. Conservá la carpeta datos junto al HTML."));
    }, {once: true});
    script.addEventListener("load", () => {
      if (pending.has(key)) {
        clean();
        reject(new Error("La capa no se pudo leer."));
      }
    }, {once: true});
    script.src = `datos/${key}.js?v=${assetVersion}`;
    document.head.append(script);
  });
}

async function getAtlas(ids) {
  const key = ids.join("+");
  if (atlases.has(key)) return atlases.get(key);
  const list = [];
  for (const id of ids) {
    if (!catalog.get(id).geolocalizados) continue;
    if (!atlases.has(id)) atlases.set(id, await getScript(`${id}-locales`));
    list.push(atlases.get(id));
  }
  if (ids.length === 1 || !list.length) return list[0] ?? null;
  const merged = mergeElections(list.map(atlas => atlas.elecciones));
  const votos = {};
  const sinCobertura = {};
  list.forEach((atlas, m) => {
    for (const [code, row] of Object.entries(atlas.votos)) votos[code] = remapVotes(row, merged.maps[m], merged.width);
    for (const [id, codes] of Object.entries(atlas.sinCobertura ?? {})) (sinCobertura[id] ??= []).push(...codes);
  });
  atlases.set(key, {id: key, elecciones: merged.elecciones, votos, sinCobertura});
  return atlases.get(key);
}

// Bancas de cada jurisdicción según el reparto elegido; una unión suma las de sus miembros.
function computeSeats() {
  const regla = repartoPorId.get(repartoId);
  const poblacion = Object.fromEntries([...catalog.values()].map(item => [item.id, item.poblacion]));
  seatTable = repartir(regla, poblacion, camara);
}

const defaultSeats = ids => ids.reduce((sum, id) => sum + seatTable[id], 0);
// En «provincias nuevas» la cantidad es de provincias: por defecto, una por jurisdicción (al menos dos).
const defaultCount = ids => carve ? Math.max(2, ids.length) : defaultSeats(ids);

// Bancas de las provincias nuevas: el reparto elegido, con ellas en lugar de sus jurisdicciones de origen.
// La población de circuitos (estimada por padrón) se escala al censo de las jurisdicciones unidas.
function carveSeats() {
  const regla = repartoPorId.get(repartoId);
  if (!carve || !plan || regla.fijo) return null;
  const census = members.reduce((sum, id) => sum + catalog.get(id).poblacion, 0);
  const factor = plan.population ? census / plan.population : 1;
  const poblacion = {};
  for (const item of catalog.values()) if (!members.includes(item.id)) poblacion[item.id] = item.poblacion;
  for (let p = 1; p <= plan.base.bancas; p++) {
    if (plan.totals[p].pop > 0) poblacion[`p${p}`] = Math.round(plan.totals[p].pop * factor);
  }
  try { return repartir(regla, poblacion, camara); } catch { return null; }
}

function updateElection(previous) {
  const alternatives = plan.elections;
  $("election").replaceChildren(...alternatives.map(item => new Option(item.nombre, item.id)));
  election = alternatives.find(item => item.id === previous) ?? alternatives[0];
  plan.selectElection(election.id);
  $("election").value = election.id;
}

function showJurisdiction(ids) {
  const select = $("province");
  select.querySelector("option[data-union]")?.remove();
  if (ids.length > 1) {
    const option = new Option(unionName(ids), ids.join("+"));
    option.dataset.union = "";
    select.prepend(option);
  }
  select.value = ids.join("+");
  document.querySelectorAll("#join-list input").forEach(box => { box.checked = ids.includes(box.value); });
}

// Unidades de la jurisdicción (o unión), con la cantidad de distritos fijada por el reparto o a mano.
// Solo hay plan de partida cuando la cantidad coincide con la de la base del proyecto.
async function load(ids, mode, savedPlan = null) {
  ids = [...new Set(ids)].sort();
  if (switching || !ids.length || !ids.every(id => catalog.has(id)) || !["radios", "circuitos"].includes(mode)) return;
  if (map.gesture) {
    $("province").value = plan.base.id;
    $("mode").value = plan.base.modo;
    return;
  }
  switching = true;
  setControls(false);
  $("map-message").hidden = false;
  $("map-message").textContent = `Cargando ${unionName(ids)}…`;
  try {
    const source = await getJurisdiction(ids, mode);
    const wanted = Math.round(seatsCustom ?? defaultCount(ids));
    const seats = Math.max(1, Math.min(wanted, source.unidades.length, 9999));
    let base = seats === source.bancas ? source : {...source, bancas: seats};
    let initial = seats === source.bancasBase ? null : new Uint16Array(source.unidades.length);
    if (carve) {
      base = {...source, bancas: seats, tipo: "provincias"};
      initial = new Uint16Array(source.unidades.length);
      source.miembros.forEach((member, k) => initial.fill(Math.min(k + 1, seats), member.desde, member.hasta));
    }
    const imported = savedPlan ? PlanDistritos.read(base, savedPlan) : null;
    if (imported && plan && saveKey(plan.base) === saveKey(base)) {
      plan.importAssignments(imported);
      rememberPlanSize();
      saveChange("Plan abierto. Podés deshacer el cambio.");
      $("map-message").hidden = true;
      return true;
    }
    const stored = restore(base);
    const previous = election?.id;
    const method = mode === "radios" && base.geolocalizados ? voteMethod : "circuit";
    const atlas = method === "geo" ? await getAtlas(ids) : null;
    const next = new PlanDistritos(base, stored, method, atlas, initial);
    if (imported) next.importAssignments(imported);
    plan = next;
    members = ids;
    active = 1;
    page = 0;
    showJurisdiction(ids);
    $("mode").value = mode;
    $("radio-source-label").hidden = mode !== "radios";
    $("radio-source").value = method;
    $("group").options[0].textContent = mode === "radios" ? "Un radio" : "Un circuito";
    $("group").options[1].hidden = mode === "circuitos";
    $("group").options[1].disabled = mode === "circuitos";
    $("group").value = mode === "circuitos" && brushPreference === "group" ? "one" : brushPreference;
    $("group").options[2].textContent = ids.every(id => id === "01") ? "Una comuna" :
      ids.every(id => id === "02") ? "Un partido" : ids.every(id => ["01", "02"].includes(id)) ? "Partido o comuna" :
      ids.includes("02") || ids.includes("01") ? "Departamento, partido o comuna" : "Un departamento";
    updateElection(previous);
    $("map-view").value = view;
    $("quota").textContent = number(plan.quota);
    $("seats").value = base.bancas;
    $("seats").max = Math.min(9999, base.unidades.length);
    $("map-name").textContent = base.nombre;
    const kind = mode === "radios" ? "radios censales" : "circuitos electorales";
    $("map-layer").textContent = `${number(plan.units.length)} ${kind}`;
    $("map-message").hidden = true;
    $("activity").textContent = "Elegí un distrito y pintá en el mapa.";
    $("save-status").textContent = stored ? "Plan recuperado" : carve ? "Provincias de origen" :
      initial ? "Plan en blanco" : "Base del proyecto";
    $("ledger-title").textContent = carve ? "Provincias nuevas" : "Distritos";
    $("th-unit").textContent = carve ? "Provincia" : "Distrito";
    $("th-dev").textContent = carve ? "Bancas" : "Desvío";
    $("quota-label").textContent = carve ? "Población media" : "Población ideal";
    $("seats-label").textContent = carve ? "Provincias nuevas" : "Distritos del plan";
    $("export-lines").options[0].textContent = carve ? "Solo provincias" : "Solo distritos";
    displayCompleteResults = false;
    makeRows();
    refreshView();
    map.show(plan);
    if (view === "export") setTool("pan");
    if (imported) saveChange("Plan abierto y guardado en este navegador.");
    redraw();
    paintApportion();
    setLocation();
    rememberPlanSize();
    return true;
  } catch (error) {
    if (plan) {
      showJurisdiction(members);
      $("mode").value = plan.base.modo;
      $("map-message").hidden = true;
    } else {
      $("map-message").textContent = error.message;
    }
    $("activity").textContent = error.message;
    return false;
  } finally {
    switching = false;
    setControls(Boolean(plan));
    $("province").disabled = false;
    $("mode").disabled = false;
  }
}

function setLocation() {
  const fragment = new URLSearchParams({
    provincia: plan.base.id, unidad: plan.base.modo, eleccion: election.id, vista: view, estimacion: voteMethod
  });
  if (carve) fragment.set("armar", "provincias");
  if (view === "export" && exportBasis !== "assignment") fragment.set("colorExport", exportBasis);
  if (repartoId !== "b257") fragment.set("reparto", repartoId);
  if (camara !== 257 && repartoPorId.get(repartoId).ajustado) fragment.set("camara", camara);
  if (seatsCustom !== null) fragment.set("distritos", plan.base.bancas);
  try { history.replaceState(null, "", `#${fragment}`); }
  catch { /* El origen file:// puede restringir el historial. */ }
}

function chooseDistrict(district) {
  active = district;
  $("active-district").value = district;
  page = Math.floor((district - 1) / pageSize);
  displayCompleteResults = false;
  redraw();
}

function makeRows() {
  rows = [];
  const fragment = document.createDocumentFragment();
  for (let district = 1; district <= plan.base.bancas; district++) {
    const tr = make("tr");
    const button = make("button");
    button.type = "button";
    button.setAttribute("aria-label", `Distrito ${district}`);
    const swatch = make("span", "", "swatch");
    swatch.style.backgroundColor = colors.district(district);
    const lock = make("span", "Bloq.", "lock-label");
    lock.title = "Distrito bloqueado";
    button.append(swatch, make("span", districtName(district)), lock);
    button.addEventListener("click", () => chooseDistrict(district));
    const label = make("td");
    label.append(button);
    const pop = make("td");
    const dev = make("td");
    tr.append(label, pop, dev);
    fragment.append(tr);
    rows.push({tr, button, swatch, lock, pop, dev});
  }
  $("districts").replaceChildren(fragment);
  $("active-district").replaceChildren(...rows.map((_, i) => new Option(districtName(i + 1), i + 1)));
  $("active-district").value = active;
}

function paintRows() {
  const from = page * pageSize;
  const to = Math.min(rows.length, from + pageSize);
  $("prev-page").disabled = from === 0;
  $("next-page").disabled = to === rows.length;
  $("page-range").textContent = `${from + 1} a ${to} de ${rows.length}`;
  const carved = carve ? carveSeats() : null;
  rows.forEach(({tr, button, swatch, lock, pop, dev}, index) => {
    tr.hidden = index < from || index >= to;
    const district = index + 1;
    const locked = plan.locked.has(district);
    lock.hidden = !locked;
    button.setAttribute("aria-label", `${districtName(district)}${locked ? ", bloqueado" : ""}`);
    const total = plan.totals[district];
    tr.classList.toggle("active", district === active);
    button.setAttribute("aria-pressed", String(district === active));
    const result = view === "lean" && lean ? lean.district(total, plan.method) : null;
    swatch.style.backgroundColor = result ? lean.shade(result) : colors.district(district);
    swatch.title = result ? lean.title(result) : "";
    pop.textContent = total.units ? number(total.pop) : "—";
    const deviation = plan.quota ? 100 * (total.pop / plan.quota - 1) : 0;
    if (carve) {
      dev.textContent = carved?.[`p${district}`] !== undefined ? number(carved[`p${district}`]) : "—";
      dev.classList.remove("warning");
      return;
    }
    dev.textContent = total.units ? `${deviation > .05 ? "+" : ""}${pct(deviation)}` : "—";
    dev.classList.toggle("warning", total.units > 0 && Math.abs(deviation) > 2);
  });
}

function paintSummary() {
  const leftover = plan.totals[0];
  const assigned = plan.population ? 100 * (plan.population - leftover.pop) / plan.population : 0;
  $("assigned").value = assigned;
  $("pop-meter").textContent = `${pct(assigned)} asignada`;
  $("unassigned").textContent = leftover.units ?
    `Sin asignar: ${number(leftover.pop)} hab. en ${number(leftover.units)} unidades` :
    `${number(plan.population)} habitantes en el plan`;
  $("vote-coverage").hidden = plan.base.modo !== "radios";
  if (plan.method === "geo") {
    const n = plan.coveredVotes;
    $("vote-coverage").textContent = `${election.metodo}: ${number(n)} de ${number(plan.units.length)} radios con estimación.`;
  } else {
    $("vote-coverage").textContent = "Estimación por radio con reparto por población dentro del circuito.";
  }
  paintSeatSummary();
}

function paintSeatSummary() {
  const wins = new Uint32Array(election.partidos.length);
  let empty = 0, missing = 0, blank = 0, tied = 0;
  for (let district = 1; district <= plan.base.bancas; district++) {
    const record = plan.totals[district];
    const result = districtLeader(record, plan.method, election);
    if (!record.units) empty++;
    else if (result.missing) missing++;
    else if (!result.total) blank++;
    else if (result.winner < 0) tied++;
    else wins[result.winner]++;
  }
  const entries = election.partidos.map((name, index) =>
    [name, wins[index], partyColor(election, index, palette)]).sort((a, b) => b[1] - a[1]);
  entries.push(
    ["Empate", tied, color("lean-tie")],
    ["Cobertura parcial o ausente", missing, color("lean-uncovered")],
    ["Sin votos", blank, color("unassigned")],
    [carve ? "Vacías" : "Vacíos", empty, color("rule")],
  );

  const bar = [], labels = [];
  for (const [name, count, fill] of entries) {
    if (!count) continue;
    const segment = make("span");
    segment.style.backgroundColor = fill;
    segment.style.flexGrow = count;
    segment.title = `${name} · ${number(count)}`;
    bar.push(segment);
    const label = make("li");
    const swatch = make("span", "", "seat-swatch");
    swatch.setAttribute("aria-hidden", "true");
    swatch.style.backgroundColor = fill;
    label.append(swatch, make("span", name), make("strong", number(count)));
    labels.push(label);
  }
  const count = plan.base.bancas;
  const territory = carve ? (count === 1 ? "provincia" : "provincias") : (count === 1 ? "distrito" : "distritos");
  $("seat-total").textContent = `${number(count)} ${territory}`;
  $("seat-bar").replaceChildren(...bar);
  $("seat-labels").replaceChildren(...labels);
  $("seat-summary").hidden = false;
}

function paintInspector() {
  const record = plan.totals[active];
  $("district-title").textContent = districtName(active);
  $("fit-district").disabled = !record.units;
  const locked = plan.locked.has(active);
  $("lock-district").disabled = switching || Boolean(plan.stroke);
  $("lock-district").textContent = locked ? "Desbloquear" : "Bloquear";
  $("lock-district").setAttribute("aria-label", `${locked ? "Desbloquear" : "Bloquear"} ${districtName(active)}`);
  const components = plan.stroke ? null : plan.componentCounts()[active];
  $("district-meta").textContent = !record.units ? "Todavía no tiene unidades." :
    `${number(record.units)} ${record.units === 1 ? "unidad" : "unidades"}` +
    (components === 1 ? " · Contiguo" : components > 1 ? ` · No contiguo (${number(components)} fragmentos)` : "");
  $("district-meta").classList.toggle("warning", components > 1);
  const {winner, total, ordered, margin} = plan.results(active, election);
  const container = $("results");
  const partial = plan.method === "geo" && record.missing > 0;
  if (!total) {
    const reason = partial ? `Sin votos geolocalizados. Radios fuera de cobertura: ${number(record.missing)}.` :
      "Sin votos en la base para esta elección.";
    container.replaceChildren(make("p", record.units ? reason : "Pintá en el mapa para sumar población y votos.", "result-note"));
    return;
  }
  const desc = winner ? `${winner.name} +${percentage(margin)} pp` : "Empate en el primer puesto";
  const headline = make("p", partial ? `Votos cubiertos: ${desc}` : desc, "result-summary");
  const notes = [];
  if (plan.method === "geo") {
    notes.push("Estimación con locales geolocalizados");
    if (partial) notes.push(`${number(record.missing)} radios fuera de cobertura (${number(record.missingPop)} hab.)`);
  } else if (plan.base.modo === "radios") notes.push("Estimación por reparto dentro del circuito");
  else if (election.id !== "25") notes.push("Votos de 2023 adaptados");
  else if (record.missing) notes.push(`${number(record.missing)} circuitos fuera de la cobertura`);
  const voteCount = [`${number(total)} votos en la base`, ...notes].join(" / ");
  const rows = ordered.filter(entry => entry.votes > 0).map(entry => {
    const row = make("div", "", "result-row");
    row.append(make("strong", entry.name), make("span", number(entry.votes)), make("span", pct(100 * entry.votes / total)));
    return row;
  });
  container.replaceChildren(headline, make("p", voteCount, "result-note"), ...rows.slice(0, 4));
  if (rows.length > 4) {
    const more = make("details");
    more.open = displayCompleteResults;
    more.addEventListener("toggle", () => { if (more.isConnected) displayCompleteResults = more.open; });
    more.append(make("summary", "Ver todas las fuerzas", "result-note"), ...rows.slice(4));
    container.append(more);
  }
}

function paintReview() {
  $("find-unassigned").disabled = switching || !plan.totals[0].units;
  if (plan.stroke) return;
  const counts = plan.componentCounts();
  if (counts !== overviewCounts) {
    overviewCounts = counts;
    let contiguous = 0, fragmented = 0, empty = 0;
    for (const n of counts.subarray(1)) {
      if (n === 1) contiguous++;
      else if (n > 1) fragmented++;
      else empty++;
    }
    $("contiguity-overview").textContent = `${number(contiguous)}/${number(plan.base.bancas)} contiguos`;
    $("contiguity-overview").classList.toggle("warning", fragmented > 0);
    $("contiguity-status").textContent = carve ?
      `${number(contiguous)} contiguas · ${number(fragmented)} fragmentadas · ${number(empty)} vacías` :
      `${number(contiguous)} contiguos · ${number(fragmented)} fragmentados · ${number(empty)} vacíos`;
  }
  if (!$("plan-review").open) return;
  if (!$("fragment-locator").hidden) updateLocationList(counts);
  if (counts === reviewedCounts) return;
  reviewedCounts = counts;
  const items = [];
  for (let i = 1; i <= plan.base.bancas; i++) {
    const {units, pop} = plan.totals[i];
    const issues = [];
    if (!units) issues.push(carve ? "Vacía" : "Vacío");
    if (counts[i] > 1) issues.push(`${number(counts[i])} fragmentos`);
    const diff = plan.quota ? 100 * (pop / plan.quota - 1) : 0;
    if (units && !carve && Math.abs(diff) > 2) issues.push(`Desvío ${diff > 0 ? "+" : ""}${pct(diff)}`);
    if (!issues.length) continue;
    const row = make("li");
    const button = make("button", districtName(i));
    button.type = "button";
    button.addEventListener("click", () => {
      chooseDistrict(i);
      if (view === "unassigned") selectView("assignment");
      map.fit(i);
    });
    row.append(button, make("span", issues.join(" · ")));
    items.push(row);
  }
  $("review-issues").replaceChildren(...items);
  const entity = carve ? (items.length === 1 ? "provincia" : "provincias") :
    (items.length === 1 ? "distrito" : "distritos");
  $("review-status").textContent = items.length ? `${number(items.length)} ${entity} para revisar` :
    carve ? "Todas las provincias tienen un solo fragmento." :
      "Todos los distritos tienen un solo fragmento y un desvío de hasta el 2 %.";
}

function updateLocationList(counts) {
  if (counts === locatedCounts) return;
  locatedCounts = counts;
  map.clearReviewLocation();
  reviewLocations = plan.reviewLocations();
  const select = $("fragment-choice");
  select.replaceChildren(new Option("Elegí una ubicación", ""),
    ...reviewLocations.map(({district, fragment, host, area}, i) => {
      const labels = [fragment ? `Fragmento ${number(fragment)}` : "", host ? `Enclave en ${districtName(host)}` : ""];
      const size = area >= 1e5 ? `${percentage(area / 1e6)} km²` : `${number(area)} m²`;
      return new Option([districtName(district), ...labels.filter(Boolean), size].join(" · "), i);
    }));
  select.disabled = !reviewLocations.length;
  const fragments = reviewLocations.filter(item => item.fragment).length;
  const enclaves = reviewLocations.filter(item => item.host).length;
  $("fragment-location").textContent = reviewLocations.length ?
    `${number(fragments)} ${fragments === 1 ? "fragmento separado" : "fragmentos separados"} · ${number(enclaves)} ${enclaves === 1 ? "enclave" : "enclaves"}` :
    "El plan no tiene fragmentos separados ni enclaves en la cartografía cargada.";
}

function locateReviewSelection() {
  const value = $("fragment-choice").value;
  const location = value === "" ? null : reviewLocations[Number(value)];
  if (!location || switching || map.gesture || !plan || plan.stroke) return;
  chooseDistrict(location.district);
  if (view === "unassigned") selectView("assignment");
  map.locateParts(location);
  const unit = plan.units[plan.pieceOwners[location.anchor]];
  const code = plan.base.modo === "radios" ? "Radio" : "Circuito";
  const department = plan.base.deptos?.[unit[7]];
  $("fragment-location").textContent = [`${code} ${unit[0]}`, department].filter(Boolean).join(" · ");
  $("canvas").scrollIntoView({block: "nearest"});
}

function redraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!plan) return;
    paintRows();
    paintSummary();
    paintInspector();
    paintReview();
    showHover(map.hoverIndex);
    $("undo").disabled = !plan.history.length || Boolean(plan.stroke);
    $("redo").disabled = !plan.future.length || Boolean(plan.stroke);
    updateExportPreview();
    map.request();
  });
}

function setTool(next) {
  if (map.gesture) return;
  if (view === "export" && next !== "pan") selectView(exportBasis);
  tool = next;
  $("canvas").dataset.tool = next;
  document.querySelectorAll("button[data-tool]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.tool === next));
  });
  showHover(map.hoverIndex);
  map.request();
}

$("group").addEventListener("change", () => {
  brushPreference = $("group").value;
  showHover(map.hoverIndex);
  map.request();
});

function timeTravel(action) {
  if (!plan || plan.stroke || switching) return;
  const n = plan[action]();
  if (n) saveChange(action === "undo" ? "Edición deshecha" : "Edición rehecha");
  else if (plan[action === "undo" ? "history" : "future"].length) {
    $("activity").textContent = "El cambio incluye un distrito bloqueado. Desbloquealo para continuar.";
  }
}

function download() {
  if (!plan || plan.stroke) return;
  const blob = new Blob([JSON.stringify(plan.serialize(), null, 2) + "\n"], {type: "application/json"});
  saveBlob(blob, `distrito257-${plan.base.id}-${plan.base.modo}.json`);
  $("activity").textContent = "Plan exportado como JSON";
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = make("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

// Colores de la exportación: los del mapa, siempre sobre papel blanco.
function exportFill(mode = view === "export" ? exportBasis : view) {
  const empty = "#e6e6e6";
  if (mode === "lean" || mode === "unit") {
    const paper = new LeanElectoral(plan, election, {
      paper: "#ffffff", alternate: palette, blank: empty, tie: "#bbbeb8", missing: "#d8e0dd"
    });
    const results = paper.districts(plan);
    const width = plan.voteRows.find(row => row)?.length ?? 0;
    // Con indices, el color es el del pedazo (un departamento recortado al distrito), no el del distrito.
    return (district, indices) => {
      if (!district) return empty;
      if (!indices) return paper.shade(results[district]);
      const votes = new Float64Array(width);
      let missing = false;
      for (const index of indices) {
        const row = plan.voteRows[index];
        if (!row) { missing = true; continue; }
        for (let i = 0; i < width; i++) votes[i] += row[i];
      }
      return paper.shade(paper.district({votes, missing}, plan.method));
    };
  }
  return district => district ? palette[(district - 1) % palette.length] : empty;
}

function updateExportPreview() {
  if (view !== "export") {
    exportPreview = null;
    map.exportImage = null;
    return;
  }
  const departamentos = $("export-lines").value === "dept";
  const key = exportKey();
  if (exportPreview && sameExport(exportPreview.key, key)) return;
  const preview = {key};
  exportPreview = preview;
  map.exportImage = null;
  $("activity").textContent = "Preparando la vista de exportación…";
  const current = () => exportPreview === preview && view === "export" && sameExport(key, exportKey());
  setTimeout(async () => {
    if (!current()) return;
    try {
      preview.svg = exportarPlan({plan, map, fill: exportFill(), departamentos});
      const image = await loadSvgImage(preview.svg);
      if (!current()) return;
      map.exportImage = {image, scale: exportSize / Math.max(plan.base.ancho, plan.base.alto)};
      $("activity").textContent = "Vista de exportación. Elegí Pintar o Borrar para editar.";
      map.request();
    } catch (error) {
      if (current()) $("activity").textContent = error.message;
    }
  }, 20);
}

function exportKey() {
  return [plan, plan.componentCounts(), plan.voteRows, election.id, view, exportBasis, $("export-lines").value];
}

function sameExport(first, second) {
  return first.every((value, i) => value === second[i]);
}

async function exportMap(format) {
  if (!plan || plan.stroke || switching || map.gesture) return;
  const source = plan;
  const key = exportKey();
  const departamentos = $("export-lines").value === "dept";
  const {id, modo, bancas} = source.base;
  const filename = `distrito257-${id}-${modo}-${bancas}${departamentos ? "-deptos" : ""}.${format}`;
  $("activity").textContent = "Preparando la exportación…";
  await new Promise(resolve => setTimeout(resolve, 30));
  if (switching || plan.stroke || map.gesture || !sameExport(key, exportKey())) {
    if (plan === source && !switching) $("activity").textContent = "El mapa cambió antes de exportar. Volvé a intentar.";
    return;
  }
  try {
    if (view === "export") updateExportPreview();
    const previewSvg = view === "export" ? exportPreview?.svg : null;
    const svg = previewSvg ?? exportarPlan({plan, map, fill: exportFill(), departamentos});
    const blob = format === "svg" ? new Blob([svg], {type: "image/svg+xml"}) : await svgToPng(svg);
    saveBlob(blob, filename);
    if (plan === source && !switching) $("activity").textContent = `Mapa exportado en ${format.toUpperCase()}.`;
  } catch (error) {
    if (plan === source && !switching) $("activity").textContent = error.message;
  }
}

function buildApportionControls(data) {
  $("reparto").replaceChildren(...REPARTOS.map(item => new Option(item.nombre, item.id)));
  $("join-list").replaceChildren(...data.map(item => {
    const label = make("label");
    const box = make("input");
    box.type = "checkbox";
    box.value = item.id;
    label.append(box, document.createTextNode(item.nombre));
    return label;
  }));
}

function paintApportion() {
  const regla = repartoPorId.get(repartoId);
  const total = Object.values(seatTable).reduce((sum, n) => sum + n, 0);
  $("reparto").value = repartoId;
  $("camara").value = total;
  $("camara").disabled = switching || !regla.ajustado;
  const poblacion = Object.fromEntries([...catalog.values()].map(item => [item.id, item.poblacion]));
  $("camara").min = minimoDeCamara(regla, poblacion) ?? 1;
  const own = defaultCount(members);
  $("seat-count").value = plan.base.bancas;
  $("seat-count").max = Math.min(9999, plan.units.length);
  $("seat-default").disabled = switching || seatsCustom === null;
  $("seat-default").textContent = `Usar el reparto (${number(own)})`;
  $("join-clear").disabled = switching || members.length === 1;
  const custom = carve ? ` · ${number(plan.base.bancas)} provincias nuevas` :
    seatsCustom === null ? "" : ` · ${number(plan.base.bancas)} distritos a mano`;
  $("apportion-summary").textContent = `${regla.nombre} · Cámara de ${number(total)}${custom}`;
  const minimum = $("camara").min > 1 ? ` Mínimo de la Cámara con estas reglas: ${number($("camara").min)}.` : "";
  const fixed = carve && regla.fijo ? " Es una tabla fija: para las provincias nuevas elegí otro reparto." : "";
  $("reparto-detail").textContent = regla.detalle + minimum + fixed + (carve ? "" :
    plan.base.bancas === plan.base.bancasBase ? "" : " Con este número de distritos no hay plan de partida: el mapa arranca vacío.");
  const carved = carveSeats();
  const table = carved ?? seatTable;
  const cells = [];
  if (carved) {
    for (let p = 1; p <= plan.base.bancas; p++) {
      const cell = make("div", "", "member");
      cell.append(make("span", districtName(p)), make("span", carved[`p${p}`] === undefined ? "—" : number(carved[`p${p}`])));
      cells.push(cell);
    }
  }
  for (const item of catalog.values()) {
    if (carved && members.includes(item.id)) continue;
    const cell = make("div", "", members.includes(item.id) ? "member" : "");
    cell.append(make("span", item.nombre), make("span", number(table[item.id])));
    cells.push(cell);
  }
  const sum = make("div", "", "total");
  sum.append(make("span", "Total"), make("span", number(Object.values(table).reduce((a, b) => a + b, 0))));
  $("reparto-table").replaceChildren(...cells, sum);
}

// Un cambio de reparto recarga solo si cambia la cantidad de distritos de lo que está abierto.
function applySeats() {
  if (!plan) return;
  const wanted = seatsCustom ?? defaultCount(members);
  if (wanted !== plan.base.bancas) load(members, plan.base.modo);
  else { rememberPlanSize(); paintApportion(); setLocation(); redraw(); }
}

$("reparto").addEventListener("change", () => {
  if (switching || !repartoPorId.has($("reparto").value)) return;
  const previous = repartoId;
  repartoId = $("reparto").value;
  try { computeSeats(); }
  catch {
    const regla = repartoPorId.get(repartoId);
    const poblacion = Object.fromEntries([...catalog.values()].map(item => [item.id, item.poblacion]));
    camara = minimoDeCamara(regla, poblacion) ?? camara;
    try { computeSeats(); } catch { repartoId = previous; computeSeats(); }
  }
  applySeats();
});
$("camara").addEventListener("change", () => {
  const value = Math.round(Number($("camara").value));
  const previous = camara;
  if (!Number.isFinite(value) || value < 1 || value > 5000) { paintApportion(); return; }
  camara = value;
  try { computeSeats(); }
  catch (error) {
    camara = previous;
    computeSeats();
    $("activity").textContent = error.message;
  }
  applySeats();
});
$("seat-count").addEventListener("change", () => {
  const value = Math.round(Number($("seat-count").value));
  if (!plan || !Number.isFinite(value) || value < 1) { if (plan) paintApportion(); return; }
  seatsCustom = value === defaultCount(members) ? null : value;
  applySeats();
});
$("seats").addEventListener("change", () => {
  const value = Math.round(Number($("seats").value));
  if (!plan || !Number.isFinite(value) || value < 1) { if (plan) $("seats").value = plan.base.bancas; return; }
  seatsCustom = value === defaultCount(members) ? null : value;
  applySeats();
});
$("seat-default").addEventListener("click", () => { seatsCustom = null; applySeats(); });
$("join-apply").addEventListener("click", () => {
  const ids = [...document.querySelectorAll("#join-list input:checked")].map(box => box.value);
  if (!ids.length) { $("activity").textContent = "Marcá al menos una jurisdicción."; return; }
  switchTo(ids, false);
});
$("join-amba").addEventListener("click", () => switchTo(["01", "02"], false));
$("join-clear").addEventListener("click", () => switchTo([members[0]], false));
$("carve-amba").addEventListener("click", () => switchTo(["01", "02"], true));
$("carve-apply").addEventListener("click", () => {
  const ids = [...document.querySelectorAll("#join-list input:checked")].map(box => box.value);
  if (!ids.length) { $("activity").textContent = "Marcá al menos una jurisdicción."; return; }
  switchTo(ids, true);
});

// Cambia de jurisdicciones o de modo; si la carga falla, vuelve al estado anterior.
async function switchTo(ids, carving) {
  if (switching) return;
  const id = [...new Set(ids)].sort().join("+");
  if (plan && id === plan.base.id && carving === carve) return;
  const previous = {carve, seatsCustom};
  carve = carving;
  seatsCustom = visitedPlanSizes.get(planSizeKey(id, carving)) ?? null;
  if (!await load(ids, plan?.base.modo ?? "radios")) ({carve, seatsCustom} = previous);
}
$("active-district").addEventListener("change", () => chooseDistrict(Number($("active-district").value)));

$("province").addEventListener("change", () => {
  const ids = $("province").value.split("+");
  if (ids.join("+") === members.join("+")) return;
  switchTo(ids, carve);
});
$("mode").addEventListener("change", () => load(members, $("mode").value));
$("radio-source").addEventListener("change", async () => {
  if (switching || !plan?.base.geolocalizados || map.gesture) return;
  const next = $("radio-source").value;
  if (!["geo", "circuit"].includes(next) || next === plan.method) return;
  switching = true;
  setControls(false);
  $("map-message").hidden = false;
  $("map-message").textContent = "Cargando la estimación…";
  try {
    const atlas = next === "geo" ? await getAtlas(members) : null;
    plan.useVotes(next, atlas);
    voteMethod = next;
    updateElection(election.id);
    displayCompleteResults = false;
    refreshView();
    setLocation();
    redraw();
  } catch (error) {
    $("radio-source").value = plan.method;
    $("activity").textContent = error.message;
  } finally {
    $("map-message").hidden = true;
    switching = false;
    setControls(true);
  }
});
$("election").addEventListener("change", () => {
  election = plan.elections.find(item => item.id === $("election").value);
  plan.selectElection(election.id);
  displayCompleteResults = false;
  refreshView();
  setLocation();
  redraw();
});
function selectView(next) {
  if (!plan || !displayModes.has(next)) return;
  if (map.gesture) { $("map-view").value = view; return; }
  if (next === "export" && view !== "export") {
    exportBasis = view === "lean" || view === "unit" ? view : "assignment";
  }
  view = next;
  if (view === "export") setTool("pan");
  $("map-view").value = next;
  $("department-lines").disabled = switching || view === "export";
  refreshView();
  setLocation();
  redraw();
}
$("map-view").addEventListener("change", () => selectView($("map-view").value));
$("export-lines").addEventListener("change", redraw);
document.querySelectorAll("button[data-tool]").forEach(button => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});
$("undo").addEventListener("click", () => timeTravel("undo"));
$("redo").addEventListener("click", () => timeTravel("redo"));
$("prev-page").addEventListener("click", () => { page = Math.max(0, page - 1); redraw(); });
$("next-page").addEventListener("click", () => {
  page = Math.min(Math.ceil(rows.length / pageSize) - 1, page + 1);
  redraw();
});
$("zoom-in").addEventListener("click", () => map.zoom(1.45));
$("zoom-out").addEventListener("click", () => map.zoom(1 / 1.45));
$("fit").addEventListener("click", () => map.fit());
$("fit-district").addEventListener("click", () => map.fit(active));
$("lock-district").addEventListener("click", () => {
  if (!plan || switching || map.gesture || plan.stroke) return;
  const unlocked = plan.locked.delete(active);
  if (!unlocked) plan.locked.add(active);
  saveChange(`${districtName(active)} ${unlocked ? "desbloqueado" : "bloqueado"}.`);
});
$("plan-review").addEventListener("toggle", () => {
  if (plan) paintReview();
});
$("locate-fragments").addEventListener("click", () => {
  if (!plan || switching || map.gesture || plan.stroke) return;
  $("fragment-locator").hidden = false;
  updateLocationList(plan.componentCounts());
  if (!$("fragment-choice").value && reviewLocations.length) $("fragment-choice").value = "0";
  locateReviewSelection();
});
$("fragment-choice").addEventListener("change", locateReviewSelection);
$("find-unassigned").addEventListener("click", () => {
  if (!plan || switching || map.gesture || !plan.totals[0].units) return;
  selectView("unassigned");
  map.fit(0);
});
$("reset").addEventListener("click", () => {
  $("reset-dialog").returnValue = "cancel";
  $("reset-dialog").querySelector("button[value='initial']").hidden = !plan?.initial.some(Boolean);
  $("reset-dialog").showModal();
});
$("reset-dialog").addEventListener("close", () => {
  const action = $("reset-dialog").returnValue;
  if (!plan || action === "cancel") return;
  const state = action === "blank" ? new Uint16Array(plan.units.length) : plan.initial;
  const protectedUnits = !plan.preservesLocks(state);
  const changed = plan.replace(state);
  const note = protectedUnits ? " Los distritos bloqueados se respetaron." : "";
  if (changed) saveChange((action === "blank" ? "Se quitaron las asignaciones editables." : "Se restauraron las asignaciones editables.") + note);
  else if (protectedUnits) $("activity").textContent = "Solo quedan cambios en distritos bloqueados.";
});
$("download").addEventListener("click", download);
$("export-svg").addEventListener("click", () => exportMap("svg"));
$("export-png").addEventListener("click", () => exportMap("png"));
$("open").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async () => {
  const file = $("file").files[0];
  $("file").value = "";
  if (!file) return;
  try {
    const saved = JSON.parse(await file.text());
    const ids = typeof saved?.jurisdiccion === "string" ? saved.jurisdiccion.split("+") : [];
    if (saved?.formato !== "257-plan-local-v1" || !ids.length || !ids.every(id => catalog.has(id)) ||
        !["radios", "circuitos"].includes(saved.unidad) || !Number.isInteger(saved.bancas)) throw new Error();
    const previous = {carve, seatsCustom};
    carve = saved.tipo === "provincias";
    seatsCustom = saved.bancas === defaultCount(ids) ? null : saved.bancas;
    if (!await load(ids, saved.unidad, saved)) ({carve, seatsCustom} = previous);
  } catch {
    $("activity").textContent = "El archivo no es un plan de Distrito 257.";
  }
});
document.addEventListener("keydown", event => {
  if (!plan || event.target.closest?.("select, input, dialog, summary") || event.altKey) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
    event.preventDefault();
    timeTravel(key === "y" || event.shiftKey ? "redo" : "undo");
  } else if (!event.ctrlKey && !event.metaKey && ["v", "p", "e"].includes(key)) {
    setTool({v: "pan", p: "paint", e: "erase"}[key]);
  }
});

window.recibirCatalogo = data => {
  catalog = new Map(data.map(item => [item.id, item]));
  $("province").replaceChildren(...data.map(item => new Option(item.nombre, item.id)));
  buildApportionControls(data);
  const location = new URLSearchParams(window.location.hash.slice(1));
  const requested = (location.get("provincia") ?? "").split("+");
  const ids = requested.every(id => catalog.has(id)) ? requested : ["01"];
  const mode = location.get("unidad") === "circuitos" ? "circuitos" : "radios";
  if (repartoPorId.has(location.get("reparto"))) repartoId = location.get("reparto");
  const chamber = Number(location.get("camara"));
  if (Number.isInteger(chamber) && chamber > 0) camara = chamber;
  try { computeSeats(); } catch { camara = 257; repartoId = "b257"; computeSeats(); }
  carve = location.get("armar") === "provincias";
  const custom = Number(location.get("distritos"));
  if (Number.isInteger(custom) && custom > 0 && custom !== defaultCount(ids)) seatsCustom = custom;
  const requestedView = location.get("vista");
  view = displayModes.has(requestedView) ? requestedView : "assignment";
  const requestedColor = location.get("colorExport");
  exportBasis = ["lean", "unit"].includes(requestedColor) ? requestedColor : "assignment";
  voteMethod = location.get("estimacion") === "circuit" ? "circuit" : "geo";
  election = {id: location.get("eleccion")};
  load(ids, mode);
};
