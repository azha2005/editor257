# Distrito 257

Abrí `index.html` en un navegador moderno. Si usás el ZIP, extraelo completo
primero. El mapa, las cifras y el editor funcionan sin conexión y sin servidor.

1. Elegí una jurisdicción, una geografía y una elección. En radios, el punto
   de partida es el plan neutral de 257 que procura mantener juntos los
   circuitos. El modo con los polígonos de circuito arranca vacío.
2. Elegí un distrito de la lista y hacé clic o arrastrá con **Pintar**. Con
   **Circuito vinculado**, cada radio tocado lleva consigo todo su grupo. Con
   **Departamento** (partido en Buenos Aires, comuna en CABA) se pinta el
   departamento entero, en radios o en circuitos: los radios usan su código
   INDEC 2022 y cada circuito va al departamento donde vive la mayor parte de
   su población. Al pasar el cursor se resalta el contorno de lo que tomaría
   el pincel (la unidad, el circuito o el departamento) y aparece el nombre. Para
   sacar del plan una unidad, elegí **Borrar**. La rueda controla el zoom y
   **Mover** permite desplazar el mapa o seleccionar el distrito bajo el cursor.
3. **Deshacer** y **Rehacer** operan por trazo completo. **Inicio del plan**
   lleva a la base o permite empezar en blanco. Ambos cambios se pueden deshacer.
4. El editor intenta guardar el trabajo en el navegador. Usá **Guardar plan**
   para descargar una copia en JSON y **Abrir plan** para recuperarla.

**Bloquear**, en la ficha del distrito, protege sus unidades y evita que
se le agreguen otras. El pincel, el borrador y el reinicio respetan los
bloqueos. Si deshacer, rehacer o abrir un archivo cambiara un distrito
bloqueado, primero hay que desbloquearlo. El guardado local y el JSON
conservan los bloqueos. Los JSON anteriores abren normalmente.

**Revisar plan** permite resaltar y centrar las unidades sin asignar. También
lista los distritos vacíos, con más de un fragmento o con un desvío poblacional
superior al 2 %. La cabecera muestra cuántos distritos son contiguos
y el listado se actualiza al terminar cada trazo. Elegí un distrito de la
lista para ubicarlo en el mapa. El botón **Claro** / **Oscuro** cambia
el tema y recuerda la elección en el navegador.

Dentro de **Revisar plan**, **Ubicar fragmentos y enclaves** centra el mapa
en la primera ubicación y permite recorrer las demás. El marcador señala
la pieza separada y la nota indica su radio o circuito. Los fragmentos
se enumeran por superficie, después de la pieza principal. Se marca como
enclave un componente rodeado por una sola asignación distinta, con el
borde cerrado en las capas seleccionadas.

Dentro de cada jurisdicción también se recuperan bordes paralelos de al
menos 8 m en la proyección del mapa cuando sus trazados difieren hasta
25 cm. Los restos de hasta 4 m² en esa proyección se agrupan con una
pieza mayor de su misma unidad si queda a un metro o menos. Estos
ajustes operan sobre la revisión y conservan las asignaciones del JSON.

**Color del mapa → Vista de exportación** muestra el mismo dibujo que
sale en el SVG y el PNG. Conserva el color de la vista que estaba activa
y el selector **Solo distritos / Con departamentos**. Usá **Mover** y
el zoom para inspeccionar la vista. **Pintar** o **Borrar** vuelve a la
vista editable.

**Reparto y uniones**, debajo de los selectores, cambia cuántos distritos
tiene cada jurisdicción. Los repartos siguen la Ley 22.847 («ley Bignone»)
con el Censo 2022: un diputado cada 161.000 habitantes o fracción de 80.500,
más 3 por distrito, piso de 5 y garantía de las bancas de 1983.

- **Bignone actualizado, sin garantía** (el de partida): cociente ajustado
  para que la Cámara sume el total pedido, con +3 y piso de 5.
- **Bignone actualizado, con garantía**: además, nadie baja de sus bancas de 1983.
- **Bignone literal con el censo 2022**: cociente fijo de 161.000; la Cámara
  pasa a 361.
- **Reparto vigente (1983)**: las bancas de hoy.
- **Bignone sin piso**: cociente ajustado y +3, sin piso de 5 ni garantía.
- **Proporcional puro**: Webster sobre el censo, sin +3, piso ni garantía,
  con al menos un distrito por jurisdicción.

Las variantes ajustadas aceptan otro tamaño de Cámara. También se puede fijar
a mano el número de distritos de la jurisdicción abierta. Cada número de
distritos guarda su propio plan; solo el de la base del proyecto arranca
dibujado, los demás arrancan vacíos.

**Unir jurisdicciones** abre varias en un solo mapa, por ejemplo CABA y
Buenos Aires, con distritos que pueden cruzar el límite. La unión recibe la
suma de las bancas de sus miembros y la población ideal es el promedio de
toda la unión. Las fuerzas se unen por nombre. Entre jurisdicciones son
vecinas las piezas a menos de unos 20 m con al menos 30 m de borde en común:
las capas provinciales no comparten vértices exactos en la General Paz y el
Riachuelo.

**Armá tu propia provincia** (o **tu propio AMBA**) cambia lo que se pinta:
en vez de distritos, provincias nuevas. Cada jurisdicción marcada arranca
como su propia provincia; se repinta para recortar otras y se pueden sumar
más en el campo de arriba. Con una sola marcada, se parte. La tabla muestra
la población de cada provincia nueva y las bancas que le tocarían con el
reparto elegido, recalculado junto con el resto del país (el reparto vigente
de 1983 es una tabla fija y no aplica). En la geografía de circuitos, la
población se escala al censo de las jurisdicciones de origen. Las provincias
nuevas no tienen bancas de 1983 que garantizar.

**Exportar SVG** y **Exportar PNG** dibujan cada distrito (o provincia) como
una sola figura con el color del mapa, borde blanco y su número, sobre
fondo transparente. El número se achica en los distritos chicos para no
pisarse. Con **Con departamentos**, cada distrito (o provincia nueva) se
parte en sus pedazos de departamento, como los mapas por condado recortados
al distrito: cada pedazo lleva el color de su propio resultado y una línea
blanca más fina lo separa de los otros pedazos del mismo distrito. Los
departamentos partidos entre dos distritos quedan como dos pedazos.

En pantallas táctiles, un dedo pinta (o mueve, con **Mover**) y dos dedos
acercan y desplazan el mapa; si el primer dedo ya había empezado a pintar,
ese trazo se descarta. El selector **Distrito** junto a las herramientas
elige el distrito activo sin bajar hasta la lista.

En **Color del mapa**, **Voto por unidad** colorea los radios o circuitos
según su propio resultado. **Lean del plan** usa ese voto como fondo para
las unidades sin asignar y el resultado acumulado para las asignadas.
El distrito cambia de color durante el trazo. Los tonos más fuertes indican
un margen mayor sobre la segunda fuerza, en puntos porcentuales.

El reparto fija un distrito uninominal por banca, dentro de cada provincia o
CABA. La estimación por radio que abre por defecto viene de los atlas del
proyecto. Cubre los 3.820 radios de CABA y los 23.901 de los 135 partidos
bonaerenses. El empalme conserva por código los valores de los 18.101
radios de los atlas AMBA y extiende el mismo método a 9.620 radios en
95 partidos.

- Para Diputados 2025, se usa la variante principal del atlas AMBA, de
  los votos por local de octubre de 2025 a los radios, por distancia
  inversa al cuadrado dentro del partido o comuna. Los locales sin punto
  válido conservan el punto de respaldo del atlas. Para el resto de la
  provincia se usan los puntos de octubre de `mapas/superficiePBA2025/locales_superficie.csv`
  y el cruce mesa a local de DINE, con los votos de todas las listas. Dos
  locales del archivo de superficie usan un punto de respaldo de partido.
- Para la general y el balotaje de 2023 se usan los archivos de la serie
  AMBA. En esas elecciones se parte de los votos por circuito y se usan
  locales y pesos de electores de 2025 como referencia retrospectiva.
  Si no hay un local usable, el reparto parte de un punto del circuito.
  El control detalla los circuitos con respaldo en los 95 partidos. Los votos
  se calculan con los valores fraccionarios de los atlas; solo se
  redondean al mostrar el recuento.
- Cuando ninguna jurisdicción seleccionada tiene cobertura de locales,
  el editor usa **Reparto por circuito**. Este método tiene cobertura nacional
  y distribuye los votos por población censal dentro de cada circuito.
  En una unión con cobertura parcial, se puede elegir cualquiera de los dos
  métodos. Con locales geolocalizados, los distritos que incluyen radios fuera
  de cobertura muestran los votos disponibles y quedan fuera del recuento
  de ganadores.

Para las otras 22 provincias se usa la misma función de reparto IDW de la
serie AMBA que en la ampliación bonaerense. Cada local reparte su aporte
entre los radios de su departamento por distancia inversa al cuadrado,
con distancia mínima de 25 m y el mismo corte de un voto. En 2025 se
agrupan las mesas y listas del provisorio de la DINE por local y circuito.
Los puntos del sigE de la CNE se cotejan por distrito, sección, rango de
mesas e identidad del establecimiento. El Mapa Educativo Nacional aporta
puntos precisos cuando se confirma la escuela dentro o junto al circuito.
Si no se verifica el local, su aporte parte de un punto del circuito o,
cuando falta el polígono, del departamento.

Para 2023 se usan los votos provisorios de cada circuito y se ponderan los
locales de 2025 que caen en su polígono por cantidad de electores, igual que
en la ampliación bonaerense. Se usan los límites aproximados disponibles
para 2023. Si falta el polígono, se busca el mismo código dentro de la misma
sección en 2025. El control provincial separa las distintas fuentes de
ubicación y registra los departamentos sin datos por elección.

Fuentes de la ampliación nacional:

- [Resultados por mesa y padrón de locales de la DINE](https://datos.mininterior.gob.ar/dataset/elecciones_legislativas_2025).
- [Locales de votación 2025 del sigE de la CNE](https://www.padron.gov.ar/cne_sige/), archivo `datos_oficiales/2025/sige_locales/<distrito>.geojson` obtenido con `api/download_layer.php?layer=distrito_<distrito>.locales_votacion_2025&format=geojson`.
- [Mapa Educativo Nacional](https://mapa.educacion.gob.ar/mapa-interactivo), capa WFS `publico:establecimiento_educativo` guardada como `datos_oficiales/2025/sige_locales/escuelas_mapa_educativo.geojson`.
- [Resultados provisorios 2023 de la DINE](https://datos.mininterior.gob.ar/dataset/resultados-provisionales-elecciones-2023), agregados en `transferencias/circ_2023p.pkl` y `transferencias/circ_2023b.pkl`.

`control_locales.json` registra totales por lista, radios con cobertura y
votos según el tipo de punto utilizado para cada provincia ampliada.

En la geografía de circuitos, Diputados 2025 usa los positivos observados
donde existe cobertura. El resto de las elecciones está adaptado a los
límites de 2025. La población por radio es la del Censo 2022 en viviendas
particulares. La de circuito se estima escalando el padrón.

La continuidad usa tramos de borde y superficies compartidas. Una isla
se cuenta junto con la parte de su circuito en una masa de tierra mayor,
siempre que tengan la misma asignación. Para islas identificadas en la
cartografía del IGN se busca además un destino con la misma asignación
en el departamento o la jurisdicción de origen. Se vincula una sola pieza
por masa de tierra y asignación, así que un corte dentro de una misma
isla o en el continente sigue contando. En geografía de radios se usa el
vínculo aproximado de la base con los circuitos. Los enclaves se comprueban
sobre los bordes geográficos.

La fuente nacional de islas es la capa poligonal **Isla** del [IGN](https://www.ign.gob.ar/capas-sig/).
Para regenerar, guardá la descarga WFS de `ign:areas_de_zona_costera_BA030`
en formato `shape-zip` y EPSG:4326 como
`geometria/cartografia_argentina/ign_actual/isla.zip`. El constructor
identifica las piezas mayormente superpuestas con una isla del IGN.
Entre jurisdicciones se admite una pequeña diferencia entre trazados
cuando los bordes corren juntos a lo largo de un tramo. Un contacto por
esquina o un puente no cuenta como borde compartido.
Las líneas del mapa se simplifican
para dibujar más rápido y detectar la unidad bajo el pincel. Las asignaciones y
las cuentas conservan todos los identificadores, población y votos fuente.

Para regenerar desde el paquete de QGIS, ejecutá `construir.py` con el Python
de Mosaic. El constructor escribe la carpeta `outputs/editor_uninominal` y su
ZIP. Con `--con-datos-existentes` vuelve a empaquetar la interfaz sin recalcular
la geometría, y actualiza las estimaciones desde
`mapas/mapaAMBA2025radios/asignacion_idw.pkl`,
`mapas/serieAMBA2005_2023radios/asignacion_2023pres.pkl` y
`mapas/serieAMBA2005_2023radios/asignacion_2023bal.pkl`.
El módulo `pba.py` añade los 95 partidos y comprueba la conservación de
votos por partido y lista. `control_pba.json` resume el resultado.

