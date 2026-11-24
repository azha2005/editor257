"use strict";

// Exporta el plan como mapa de distritos disueltos, al estilo de los redistritadores:
// un relleno por distrito, borde blanco fino entre distritos y el número de cada uno.
// Los tramos de borde que comparten dos unidades del mismo distrito se cancelan. Los que
// quedan sueltos junto a otra unidad del mismo distrito (rendijas de la cobertura o el
// límite entre jurisdicciones unidas) también se tratan como internos.
// Con departamentos = true, cada distrito se parte en sus pedazos de departamento (al estilo de
// los mapas por condado recortados al distrito): cada pedazo lleva su propio color y entre
// pedazos del mismo distrito queda una línea más fina.

const exportTolerance = 30;  // unidades del mapa (metros Mercator): unos 20 a 25 m

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function nearUnit(unit, x, y, tolerance) {
  for (const ring of unit[5]) {
    const n = ring.length;
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n;
      if (distanceToSegment(x, y, ring[i], ring[i + 1], ring[j], ring[j + 1]) <= tolerance) return true;
    }
  }
  return false;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, n = ring.length; i < n; i += 2) {
    const j = (i + 2) % n;
    area += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
  }
  return area / 2;
}

// Encadena los tramos en polilíneas para achicar el archivo.
function chainLines(lines) {
  const ends = new Map();
  const keyOf = (x, y) => `${x} ${y}`;
  lines.forEach((line, i) => {
    for (const key of [keyOf(line[0], line[1]), keyOf(line[2], line[3])]) {
      if (!ends.has(key)) ends.set(key, []);
      ends.get(key).push(i);
    }
  });
  const used = new Uint8Array(lines.length);
  const paths = [];
  lines.forEach((line, start) => {
    if (used[start]) return;
    used[start] = 1;
    const chain = [keyOf(line[0], line[1]), keyOf(line[2], line[3])];
    for (const forward of [true, false]) {
      for (;;) {
        const tip = forward ? chain.at(-1) : chain[0];
        const next = (ends.get(tip) ?? []).find(i => !used[i]);
        if (next === undefined) break;
        used[next] = 1;
        const [x1, y1, x2, y2] = lines[next];
        const other = keyOf(x1, y1) === tip ? keyOf(x2, y2) : keyOf(x1, y1);
        if (other === tip) continue;
        if (forward) chain.push(other); else chain.unshift(other);
      }
    }
    paths.push(`M${chain.join(" ")}`);
  });
  return paths;
}

function exportarPlan({plan, map, fill, size = 1600, departamentos = false}) {
  const {ancho, alto} = plan.base;
  const scale = size / Math.max(ancho, alto);
  const width = Math.ceil(ancho * scale), height = Math.ceil(alto * scale);
  const inFrame = index => {
    const [left, top, right, bottom] = map.bounds[index];
    return right >= 0 && bottom >= 0 && left <= ancho && top <= alto;
  };
  const px = value => Math.round(value * scale * 10) / 10;

  // Pedazo de cada unidad: su distrito, o su distrito y su departamento.
  const pieceOf = index => departamentos ? `${plan.districts[index]}:${plan.units[index][7] ?? ""}` :
    String(plan.districts[index]);

  // Rellenos: todas las unidades de cada pedazo en un solo trazado.
  const fills = new Map();
  plan.units.forEach((unit, index) => {
    if (!inFrame(index)) return;
    const district = plan.districts[index];
    const piece = pieceOf(index);
    if (!fills.has(piece)) fills.set(piece, {district, indices: [], parts: []});
    const entry = fills.get(piece);
    entry.indices.push(index);
    const parts = entry.parts;
    for (const ring of unit[5]) {
      let last = "";
      const points = [];
      for (let i = 0; i < ring.length; i += 2) {
        const point = `${px(ring[i])} ${px(ring[i + 1])}`;
        if (point !== last) points.push(point);
        last = point;
      }
      if (points.length >= 3) parts.push(`M${points.join(" ")}Z`);
    }
  });

  // Bordes: tramos que no se repiten dentro del mismo pedazo. Los que separan dos pedazos del
  // mismo distrito son límites de departamento.
  const segments = new Map();
  plan.units.forEach((unit, index) => {
    if (!inFrame(index)) return;
    const district = plan.districts[index];
    const piece = pieceOf(index);
    for (const ring of unit[5]) {
      for (let i = 0, n = ring.length; i < n; i += 2) {
        const j = (i + 2) % n;
        const a = `${ring[i]},${ring[i + 1]}`, b = `${ring[j]},${ring[j + 1]}`;
        if (a === b) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        const seen = segments.get(key);
        if (!seen) segments.set(key, {district, piece, index, coords: [ring[i], ring[i + 1], ring[j], ring[j + 1]], twice: false});
        else if (seen.piece === piece) segments.delete(key);
        else {
          seen.twice = true;
          if (seen.district === district) seen.dept = true;
        }
      }
    }
  });
  const lines = [], deptLines = [];
  for (const segment of segments.values()) {
    const [ax, ay, bx, by] = segment.coords;
    let dept = Boolean(segment.dept);
    if (!segment.twice) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2, r = exportTolerance;
      let inner = false;
      for (const other of map.candidates([mx - r, my - r, mx + r, my + r])) {
        if (other === segment.index || plan.districts[other] !== segment.district ||
            !nearUnit(plan.units[other], mx, my, r)) continue;
        if (pieceOf(other) === segment.piece) { inner = true; break; }
        dept = true;
      }
      if (inner) continue;
    }
    // Sin distrito no hay recorte: lo no asignado queda como un solo bloque gris.
    if (dept && !segment.district) continue;
    (dept ? deptLines : lines).push([px(ax), px(ay), px(bx), px(by)]);
  }
  const paths = chainLines(lines), deptPaths = chainLines(deptLines);

  // Números: en la unidad más cercana al centro de área del distrito, siempre dentro de él.
  const centers = new Map();
  plan.units.forEach((unit, index) => {
    const district = plan.districts[index];
    if (!district || !inFrame(index)) return;
    const [left, top, right, bottom] = map.bounds[index];
    const area = Math.abs(unit[5].reduce((sum, ring) => sum + ringArea(ring), 0));
    const entry = centers.get(district) ?? {x: 0, y: 0, area: 0, members: []};
    entry.x += area * (left + right) / 2;
    entry.y += area * (top + bottom) / 2;
    entry.area += area;
    entry.members.push(index);
    centers.set(district, entry);
  });
  const fontSize = Math.max(12, Math.min(40, Math.sqrt(width * height / Math.max(1, centers.size)) / 9));
  const labels = [];
  for (const [district, entry] of [...centers].sort((a, b) => a[0] - b[0])) {
    const cx = entry.x / (entry.area || 1), cy = entry.y / (entry.area || 1);
    let best = entry.members[0], gap = Infinity;
    for (const index of entry.members) {
      const [left, top, right, bottom] = map.bounds[index];
      const d = Math.hypot((left + right) / 2 - cx, (top + bottom) / 2 - cy);
      if (d < gap) { gap = d; best = index; }
    }
    const [left, top, right, bottom] = map.bounds[best];
    // El número no supera el tamaño del distrito: en el conurbano se achica en vez de pisarse.
    const side = Math.sqrt(entry.area) * scale;
    const own = Math.min(fontSize, Math.max(3, side / (1 + String(district).length) * .9));
    const sized = own < fontSize ? ` font-size="${own.toFixed(1)}"` : "";
    labels.push(`<text x="${px((left + right) / 2)}" y="${px((top + bottom) / 2)}"${sized}>${district}</text>`);
  }

  const groups = [...fills.values()].sort((a, b) => a.district - b.district).map(({district, indices, parts}) => {
    const color = departamentos ? fill(district, indices) : fill(district);
    const dept = departamentos ? ` data-departamento="${plan.units[indices[0]][7] ?? ""}"` : "";
    return `<path data-distrito="${district}"${dept} fill="${color}" stroke="${color}" stroke-width="1" d="${parts.join("")}"/>`;
  });
  const lineWidth = Math.max(.8, size / 1000);
  const deptGroup = departamentos ? `
<g id="departments" fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="${(lineWidth * .45).toFixed(2)}">
<path d="${deptPaths.join("")}"/>
</g>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" stroke-linecap="round" stroke-linejoin="round">
<g id="districts" fill-rule="evenodd">
${groups.join("\n")}
</g>${deptGroup}
<g id="boundaries" fill="none" stroke="#ffffff" stroke-width="${lineWidth.toFixed(1)}">
<path d="${paths.join("")}"/>
</g>
<g id="labels" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="600" fill="black" text-anchor="middle" dominant-baseline="central">
${labels.join("\n")}
</g>
</svg>
`;
}

function svgToPng(svg, pixelRatio = 2) {
  return new Promise((resolve, reject) => {
    const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
    const ratio = Math.min(pixelRatio, 8192 / Math.max(w, h));
    const url = URL.createObjectURL(new Blob([svg], {type: "image/svg+xml"}));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo crear el PNG.")), "image/png");
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo dibujar el SVG.")); };
    image.src = url;
  });
}
