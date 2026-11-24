"use strict";

// Reparto de las bancas entre jurisdicciones (Ley 22.847, «ley Bignone»): un diputado cada
// 161.000 habitantes o fracción no menor de 80.500, más 3 por distrito, con un piso de 5 y sin
// que ningún distrito pierda las bancas que tenía en 1983. Cada variante prende o apaga esas
// reglas. Las ajustadas buscan el cociente que deja la Cámara en el total pedido: es el método
// del divisor de Webster (redondeo a la mitad, como la ley) aplicado a la parte proporcional.

const BANCAS_1983 = {
  "01": 25, "02": 70, "03": 5, "04": 18, "05": 7, "06": 7, "07": 5, "08": 9, "09": 5, "10": 6,
  "11": 5, "12": 5, "13": 10, "14": 7, "15": 5, "16": 5, "17": 7, "18": 6, "19": 5, "20": 5,
  "21": 19, "22": 7, "23": 9, "24": 5
};

const REPARTOS = [
  {id: "b257", nombre: "Bignone actualizado, sin garantía",
   detalle: "Censo 2022, cociente ajustado al total, +3 por distrito y piso de 5. Es la base del proyecto.",
   ajustado: true, mas: 3, piso: 5, garantia: false},
  {id: "b257g", nombre: "Bignone actualizado, con garantía",
   detalle: "Como el anterior, pero ningún distrito baja de las bancas que tiene desde 1983.",
   ajustado: true, mas: 3, piso: 5, garantia: true},
  {id: "blit", nombre: "Bignone literal con el censo 2022",
   detalle: "Uno cada 161.000 habitantes o fracción de 80.500, +3, piso de 5 y garantía. La Cámara crece.",
   cociente: 161000, mas: 3, piso: 5, garantia: true},
  {id: "vig", nombre: "Reparto vigente (1983)",
   detalle: "Las bancas que fija hoy la ley, con el censo de 1980 y la garantía de 1983.", fijo: BANCAS_1983},
  {id: "sinpiso", nombre: "Bignone sin piso",
   detalle: "Censo 2022, cociente ajustado al total y +3 por distrito, sin el piso de 5 ni la garantía.",
   ajustado: true, mas: 3, piso: 1, garantia: false},
  {id: "prop", nombre: "Proporcional puro",
   detalle: "Censo 2022 repartido por Webster, sin +3, sin piso ni garantía. Al menos un distrito por jurisdicción.",
   ajustado: true, mas: 0, piso: 1, garantia: false}
];

const repartoPorId = new Map(REPARTOS.map(item => [item.id, item]));

function repartir(regla, poblacion, total = 257) {
  const ids = Object.keys(poblacion);
  if (regla.fijo) return {...regla.fijo};
  const minimo = id => Math.max(regla.piso, regla.garantia ? BANCAS_1983[id] ?? 0 : 0);
  const bancas = (id, proporcional) => Math.max(proporcional + regla.mas, minimo(id));
  if (regla.cociente) {
    const q = regla.cociente;
    return Object.fromEntries(ids.map(id => {
      const p = poblacion[id];
      const proporcional = Math.floor(p / q) + (p % q >= q / 2 ? 1 : 0);
      return [id, bancas(id, proporcional)];
    }));
  }
  const piso = ids.reduce((sum, id) => sum + bancas(id, 0), 0);
  if (total < piso) throw new RangeError(`Con estas reglas la Cámara necesita al menos ${piso} bancas.`);
  const proporcional = Object.fromEntries(ids.map(id => [id, 0]));
  let suma = piso;
  while (suma < total) {
    let mejor = null;
    let prioridad = -1;
    for (const id of ids) {
      const valor = poblacion[id] / (proporcional[id] + .5);
      if (valor > prioridad) { prioridad = valor; mejor = id; }
    }
    const antes = bancas(mejor, proporcional[mejor]);
    proporcional[mejor]++;
    suma += bancas(mejor, proporcional[mejor]) - antes;
  }
  return Object.fromEntries(ids.map(id => [id, bancas(id, proporcional[id])]));
}

function minimoDeCamara(regla, poblacion) {
  if (!regla.ajustado) return null;
  return Object.keys(poblacion).reduce((sum, id) =>
    sum + Math.max(regla.mas, regla.piso, regla.garantia ? BANCAS_1983[id] ?? 0 : 0), 0);
}

if (typeof module !== "undefined") module.exports = {REPARTOS, repartir, minimoDeCamara, BANCAS_1983};
