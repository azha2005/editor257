"use strict";

const voteEpsilon = 1e-8;

class PlanDistritos {
  constructor(base, saved = null, method = "circuit", atlas = null, initial = null) {
    this.base = base;
    this.units = base.unidades;
    this.index = new Map(this.units.map((unit, i) => [unit[0], i]));
    this.groups = new Map();
    const extra = base.partesExtra ?? [];
    this.pieceOwners = Uint32Array.from({length: this.units.length + extra.length},
      (_, i) => i < this.units.length ? i : extra[i - this.units.length]);
    this.neighbors = Array.from(this.pieceOwners, () => []);
    for (let i = 0; i < base.vecinos.length; i += 2) {
      const a = base.vecinos[i];
      const b = base.vecinos[i + 1];
      this.neighbors[a].push(b);
      this.neighbors[b].push(a);
    }
    this.districts = initial ? Uint16Array.from(initial) : new Uint16Array(this.units.map(unit => unit[3]));
    this.initial = this.districts.slice();
    if (saved) this.districts.set(saved.assignments);
    this.locked = new Set(saved?.locked);
    this.contiguity = null;
    this.history = [];
    this.future = [];
    this.stroke = null;
    this.population = this.units.reduce((sum, unit) => sum + unit[2], 0);
    this.quota = this.population / base.bancas;
    this.deptGroups = new Map();
    this.units.forEach((unit, index) => {
      if (!this.groups.has(unit[1])) this.groups.set(unit[1], []);
      this.groups.get(unit[1]).push(index);
      if (unit[7] === undefined) return;
      if (!this.deptGroups.has(unit[7])) this.deptGroups.set(unit[7], []);
      this.deptGroups.get(unit[7]).push(index);
    });
    this.useVotes(method, atlas);
  }

  useVotes(method, atlas = null) {
    this.method = method;
    this.atlas = atlas;
    this.elections = method === "geo" && atlas ? atlas.elecciones : this.base.elecciones;
    this.selectElection(this.voteElection, true);
  }

  selectElection(election, rebuild = false) {
    const previous = this.voteElection;
    this.voteElection = election;
    const missing = this.atlas?.sinCobertura ?? {};
    if (!rebuild && (election === previous || !(missing[election] || missing[previous]))) return;
    const excluded = new Set(missing[election]);
    this.voteRows = this.units.map(unit => this.method === "geo" ?
      (excluded.has(unit[0]) ? null : this.atlas?.votos[unit[0]] ?? null) : unit[4]);
    this.coveredVotes = this.voteRows.reduce((count, row) => count + Number(row !== null), 0);
    const fields = this.elections.reduce((sum, election) => sum + election.partidos.length, 0);
    this.totals = Array.from({length: this.base.bancas + 1}, () => ({
      units: 0, pop: 0, votes: new Float64Array(fields), missing: 0, missingPop: 0
    }));
    this.districts.forEach((district, index) => this.add(index, district, 1));
  }

  add(index, district, sign) {
    const total = this.totals[district];
    const [, , pop, , , , covered] = this.units[index];
    const votes = this.voteRows[index];
    total.units += sign;
    total.pop += sign * pop;
    if (votes === null || covered === false) {
      total.missing += sign;
      total.missingPop += sign * pop;
    }
    votes?.forEach((votesForParty, p) => { total.votes[p] += sign * votesForParty; });
    if (!total.units) total.votes.fill(0);
  }

  allowsChange(before, after) {
    return before === after || !(this.locked.has(before) || this.locked.has(after));
  }

  assign(index, district) {
    const old = this.districts[index];
    if (old === district || !this.allowsChange(old, district)) return false;
    this.add(index, old, -1);
    this.add(index, district, 1);
    this.districts[index] = district;
    this.contiguity = null;
    return true;
  }

  preservesLocks(assignments) {
    return !this.locked.size || this.districts.every((district, index) => this.allowsChange(district, assignments[index]));
  }

  begin() {
    this.stroke = new Map();
  }

  paint(indices, district) {
    let changed = false;
    for (const index of indices) {
      const old = this.districts[index];
      if (this.assign(index, district)) {
        const first = this.stroke.get(index)?.before ?? old;
        this.stroke.set(index, {index, before: first, after: district});
        changed = true;
      }
    }
    return changed;
  }

  end() {
    if (!this.stroke) return 0;
    const changes = [...this.stroke.values()].filter(item => item.before !== item.after);
    this.stroke = null;
    if (!changes.length) return 0;
    this.history.push(changes);
    if (this.history.length > 100) this.history.shift();
    this.future = [];
    return changes.length;
  }

  // Descarta el trazo en curso sin dejarlo en el historial (un segundo dedo pasa a mover el mapa).
  abort() {
    if (!this.stroke) return 0;
    const changes = [...this.stroke.values()];
    this.stroke = null;
    changes.forEach(item => this.assign(item.index, item.before));
    return changes.length;
  }

  undo() {
    const changes = this.history.at(-1);
    if (!changes) return 0;
    if (changes.some(({before, after}) => !this.allowsChange(before, after))) return 0;
    this.history.pop();
    changes.forEach(item => this.assign(item.index, item.before));
    this.future.push(changes);
    return changes.length;
  }

  redo() {
    const changes = this.future.at(-1);
    if (!changes) return 0;
    if (changes.some(({before, after}) => !this.allowsChange(before, after))) return 0;
    this.future.pop();
    changes.forEach(item => this.assign(item.index, item.after));
    this.history.push(changes);
    return changes.length;
  }

  replace(districts) {
    this.begin();
    districts.forEach((district, index) => this.paint([index], district));
    return this.end();
  }

  importAssignments(saved) {
    if (!this.preservesLocks(saved.assignments)) {
      throw new Error("El archivo cambia distritos bloqueados. Desbloquealos para abrirlo.");
    }
    this.replace(saved.assignments);
    for (const district of saved.locked) this.locked.add(district);
  }

  results(district, election) {
    const record = this.totals[district];
    const ordered = election.partidos.map((name, p) => ({
      name, votes: Math.max(0, record.votes[election.desde + p])
    }));
    ordered.sort((a, b) => b.votes - a.votes);
    const sum = ordered.reduce((sum, party) => sum + party.votes, 0);
    const total = sum > voteEpsilon ? sum : 0;
    const winner = total && ordered[0].votes - (ordered[1]?.votes ?? 0) > voteEpsilon ? ordered[0] : null;
    const margin = winner ? 100 * (winner.votes - (ordered[1]?.votes ?? 0)) / total : null;
    return {ordered, total, winner, margin};
  }

  componentCounts() {
    return this.components().counts;
  }

  circuitLandmasses() {
    if (this.landmasses) return this.landmasses;
    const roots = new Int32Array(this.pieceOwners.length).fill(-1);
    const areas = [];
    const locations = this.base.lugaresPartes;
    for (let i = 0; i < roots.length; i++) {
      if (roots[i] >= 0) continue;
      const root = areas.length;
      const queue = [i];
      let area = 0;
      roots[i] = root;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const piece = queue[cursor];
        area += locations?.[3 * piece + 2] ?? 1;
        for (const other of this.neighbors[piece]) {
          if (roots[other] >= 0) continue;
          roots[other] = root;
          queue.push(other);
        }
      }
      areas.push(area);
    }
    const primary = new Map();
    const split = new Set();
    const ranks = new Int32Array(areas.length);
    const ordered = [...areas.keys()].sort((a, b) => areas[b] - areas[a] || a - b);
    ordered.forEach((root, rank) => { ranks[root] = rank; });
    for (let piece = 0; piece < roots.length; piece++) {
      const circuit = this.units[this.pieceOwners[piece]][1];
      if (!circuit) continue;
      const root = roots[piece];
      const before = primary.get(circuit);
      if (before === root) continue;
      if (before !== undefined) split.add(circuit);
      if (before === undefined || ranks[root] < ranks[before]) primary.set(circuit, root);
    }
    for (const circuit of primary.keys()) if (!split.has(circuit)) primary.delete(circuit);
    const islandAreas = new Float64Array(areas.length);
    for (const piece of this.base.partesInsulares ?? []) {
      islandAreas[roots[piece]] += locations?.[3 * piece + 2] ?? 1;
    }
    const islands = new Set(ordered.filter(root => islandAreas[root] > areas[root] / 2));
    this.landmasses = {roots, ranks, primary, islands};
    return this.landmasses;
  }

  joinCircuitIslands(groups, geography) {
    const {roots, ranks, primary, islands} = geography;
    if (groups.length < 2 || (!primary.size && !islands.size)) return groups;
    const locations = this.base.lugaresPartes;
    const circuits = new Map(), departments = new Map(), provinces = new Map(), representatives = new Map();
    const share = (map, key, area) => { if (key) map.set(key, (map.get(key) ?? 0) + area); };
    const prefer = (map, key, index, root, area) => {
      const prior = map.get(key);
      if (!prior || ranks[root] < ranks[prior.root] || (root === prior.root && area > prior.area)) {
        map.set(key, {index, root, area});
      }
    };
    const affiliations = groups.map((pieces, index) => {
      const root = roots[pieces[0]];
      const onMain = new Map();
      const onIsland = new Map();
      const byDepartment = new Map();
      const byProvince = new Map();
      let localCircuit = false;
      let size = 0;
      for (const piece of pieces) {
        const unit = this.units[this.pieceOwners[piece]];
        const circuit = unit[1];
        const area = locations?.[3 * piece + 2] ?? 1;
        size += area;
        const mainland = primary.get(circuit);
        if (mainland !== undefined) share(root === mainland ? onMain : onIsland, circuit, area);
        if (circuit && (mainland === undefined || root === mainland)) localCircuit = true;
        if (islands.size) {
          share(byDepartment, unit[7], area);
          share(byProvince, circuit?.slice(0, 2), area);
        }
      }
      for (const [key, area] of onMain) prefer(circuits, key, index, root, area);
      for (const [key, area] of byDepartment) prefer(departments, key, index, root, area);
      for (const [key, area] of byProvince) prefer(provinces, key, index, root, area);
      prefer(representatives, root, index, root, size);
      return {root, onIsland, byDepartment, byProvince, localCircuit};
    });
    const targetFor = (shares, candidates, root) => {
      let target;
      let best = 0;
      for (const [key, area] of shares) {
        const anchor = candidates.get(key);
        if (anchor && ranks[anchor.root] < ranks[root] && area > best) {
          target = anchor.index;
          best = area;
        }
      }
      return target;
    };
    // Se conecta una sola pieza por masa de tierra y asignación. Esto conserva
    // los cortes de un distrito dentro de una misma isla o en el continente.
    const parent = affiliations.map(({root, onIsland, byDepartment, byProvince, localCircuit}, index) => {
      if (representatives.get(root).index !== index) return index;
      const circuit = targetFor(onIsland, circuits, root);
      if (circuit !== undefined) return circuit;
      if (!localCircuit || !islands.has(root)) return index;
      return targetFor(byDepartment, departments, root) ?? targetFor(byProvince, provinces, root) ?? index;
    });
    const joined = new Map();
    groups.forEach((pieces, index) => {
      let target = index;
      while (parent[target] !== target) target = parent[target];
      if (!joined.has(target)) joined.set(target, []);
      joined.get(target).push(pieces);
    });
    return [...joined.values()].map(parts => parts.length === 1 ? parts[0] : parts.flat());
  }

  components() {
    if (this.contiguity) return this.contiguity;
    const visited = new Uint8Array(this.pieceOwners.length);
    const counts = new Uint32Array(this.base.bancas + 1);
    const groups = Array.from(counts, () => []);
    for (let i = 0; i < this.pieceOwners.length; i++) {
      const district = this.districts[this.pieceOwners[i]];
      if (visited[i] || !district) continue;
      const queue = [i];
      visited[i] = 1;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        for (const next of this.neighbors[queue[cursor]]) {
          if (!visited[next] && this.districts[this.pieceOwners[next]] === district) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
      groups[district].push(queue);
    }
    const geography = this.circuitLandmasses();
    const connected = groups.map(parts => this.joinCircuitIslands(parts, geography));
    connected.forEach((parts, district) => { counts[district] = parts.length; });
    this.contiguity = {counts, groups: connected, geographicGroups: groups};
    return this.contiguity;
  }

  reviewLocations() {
    const locations = this.base.lugaresPartes;
    if (!locations) return [];
    const exterior = new Set(this.base.exteriorPartes.map(([id]) => id));
    const result = [];
    const {groups, geographicGroups} = this.components();
    const describe = (pieces, district) => {
      let area = 0;
      let anchor = pieces[0];
      for (const piece of pieces) {
        const size = locations[3 * piece + 2];
        area += size;
        if (size > locations[3 * anchor + 2]) anchor = piece;
      }
      return {district, pieces, area, anchor};
    };
    groups.forEach((parts, district) => {
      const ranked = parts.map(pieces => describe(pieces, district)).sort((a, b) => b.area - a.area);
      const fragments = new Map(ranked.slice(1).map((component, index) =>
        [component.pieces, {...component, fragment: index + 1, host: null}]));
      const enclaves = [];
      for (const pieces of geographicGroups[district]) {
        let host = null;
        let enclosed = true;
        for (const piece of pieces) {
          if (exterior.has(piece)) { enclosed = false; break; }
          for (const other of this.neighbors[piece]) {
            const neighbor = this.districts[this.pieceOwners[other]];
            if (neighbor === district) continue;
            if (!neighbor || (host !== null && neighbor !== host)) { enclosed = false; break; }
            host = neighbor;
          }
          if (!enclosed) break;
        }
        if (enclosed && host) {
          const fragment = fragments.get(pieces);
          if (fragment) fragment.host = host;
          else enclaves.push({...describe(pieces, district), fragment: 0, host});
        }
      }
      result.push(...fragments.values(), ...enclaves);
    });
    return result;
  }

  serialize() {
    return {
      formato: "257-plan-local-v1", jurisdiccion: this.base.id, unidad: this.base.modo,
      ...(this.base.tipo ? {tipo: this.base.tipo} : {}),
      version: this.base.version, bancas: this.base.bancas,
      bloqueados: [...this.locked].sort((a, b) => a - b),
      asignaciones: this.units.map((unit, i) => [unit[0], this.districts[i]])
    };
  }

  // Copia local compacta: el orden de las unidades lo fija la versión de la base.
  serializeLocal() {
    const {asignaciones, ...rest} = this.serialize();
    return {...rest, valores: Array.from(this.districts)};
  }

  static readLocal(base, stored) {
    if (!Array.isArray(stored?.valores)) return PlanDistritos.read(base, stored);
    const asignaciones = base.unidades.map((unit, i) => [unit[0], stored.valores[i]]);
    return PlanDistritos.read(base, {...stored, asignaciones});
  }

  static read(base, document) {
    if (!document || document.formato !== "257-plan-local-v1" ||
        document.jurisdiccion !== base.id || document.unidad !== base.modo || document.tipo !== base.tipo ||
        document.version !== base.version || document.bancas !== base.bancas ||
        !Array.isArray(document.asignaciones) || document.asignaciones.length !== base.unidades.length) {
      throw new Error("El archivo no coincide con esta versión de la base.");
    }
    const valid = new Map();
    for (const row of document.asignaciones) {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" ||
          valid.has(row[0]) || !Number.isInteger(row[1]) || row[1] < 0 || row[1] > base.bancas) {
        throw new Error("El archivo contiene asignaciones inválidas.");
      }
      valid.set(row[0], row[1]);
    }
    const locked = Object.hasOwn(document, "bloqueados") ? document.bloqueados : [];
    if (!Array.isArray(locked) || new Set(locked).size !== locked.length ||
        locked.some(district => !Number.isInteger(district) || district < 1 || district > base.bancas)) {
      throw new Error("El archivo contiene bloqueos inválidos.");
    }
    const assignments = base.unidades.map(([id]) => {
      if (!valid.has(id)) throw new Error("El archivo omite unidades de esta base.");
      return valid.get(id);
    });
    return {assignments, locked};
  }
}
