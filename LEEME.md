# Distrito 257

Abrí `index.html` en un navegador moderno. Si usás el ZIP, extraelo completo
primero. El mapa, las cifras y el editor funcionan sin conexión y sin servidor.

1. Elegí una jurisdicción, una geografía y una elección. En radios, el punto
   de partida es el plan neutral de 257 que procura mantener juntos los
   circuitos. El modo con los polígonos de circuito arranca vacío.
2. Elegí un distrito de la lista y hacé clic o arrastrá con **Pintar**. Con
   **Circuito vinculado**, cada radio tocado lleva consigo todo su grupo. Para
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
- Fuera de la cobertura geolocalizada, el modo electoral queda sin voto.
  Los distritos con cobertura parcial muestran sus votos disponibles
  en la ficha y quedan fuera del recuento de ganadores. Se puede elegir
  aparte **Reparto por circuito**, con cobertura nacional y el método
  de distribuir por población censal dentro de cada circuito.

En la geografía de circuitos, Diputados 2025 usa los positivos observados
donde existe cobertura. El resto de las elecciones está adaptado a los
límites de 2025. La población por radio es la del Censo 2022 en viviendas
particulares. La de circuito se estima escalando el padrón.

El recuento de fragmentos usa segmentos de borde compartidos en la geometría base,
entre polígonos individuales. Las conexiones por punto o por puente quedan fuera.
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

