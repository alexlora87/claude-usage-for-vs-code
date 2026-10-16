# Extensión de VSCode para ver el uso de Claude: guía para hacerla desde cero

Documento de planificación. Lo marcado como **(sin verificar)** sale de leer el repo `coramdeo643/my-claude-usage`, no de documentación oficial, y hay que confirmarlo antes de construir sobre ello.

## 1. Objetivo

Mostrar en la barra de estado de VSCode el uso del plan de Claude Code:

- Ventana de **5 horas** (sesión) y de **7 días** (semanal), con porcentaje usado y tiempo hasta el reinicio.
- **Vista por defecto** (compacta, con etiquetas y tiempo): `✦ Claude Usage 5h ◔ 32% · 0h 7m | 7d ◔ 4% · 6d 21h`.
- **Vista extendida** opcional (textos completos): `✦ Claude Usage Session (5hr) ◔ 32% · Resets in 0h 7m | Weekly (7 day) ◔ 4% · Resets in 6d 21h`.
- Avisos de color cuando se acerca al límite.

Fuera de alcance por ahora: desglose por agente/subagente (la API de uso no parece traerlo; ver sección 9).

## 2. Requisitos funcionales

| # | Requisito |
|---|---|
| F1 | Leer las credenciales OAuth de Claude Code ya instaladas; la extensión no pide login propio. |
| F2 | Consultar el uso cada N segundos (por defecto 120, rango 30-3600). |
| F3 | Mostrar % usado y tiempo restante de las ventanas 5h y 7d. |
| F4 | Color de advertencia: amarillo desde 70 %, rojo desde 90 %, según la peor de las dos ventanas. |
| F5 | Estados de error distinguibles: sin credenciales, límite de peticiones (429), sin conexión, cargando, error genérico. |
| F6 | Comando "Refresh" con atajo de teclado. |
| F7 | Setting `extendedView` (checkbox, apagado por defecto) que cambia de la vista por defecto a la extendida, y se aplica al instante, sin recargar. |
| F8 | Si la API no da la hora de reinicio, omitirla (no mostrar "Unknown"). |
| F9 | Si queda menos de 1 h en la ventana de 7 días, mostrar minutos y no `0d 0h`. |
| F10 | Tooltip con la hora exacta de reinicio de cada ventana (zona horaria local). |

## 3. Requisitos no funcionales

- **Varias ventanas de VSCode** no deben multiplicar las peticiones: una sola consulta compartida.
- **Resiliencia ante 429**: retroceso exponencial y mantener el último dato bueno visible, marcado como desactualizado (`~`).
- **Windows, macOS y Linux**: las credenciales viven en sitios distintos.
- **Sin telemetría** y sin enviar el token a ningún sitio salvo la API de Anthropic.
- **Mínimas dependencias** (cada una se aprueba aparte).

## 4. Fuente de datos

Basado en el repo de referencia **(sin verificar)**:

- `GET https://api.anthropic.com/api/oauth/usage`
- Encabezados: `Authorization: Bearer <accessToken>`, `anthropic-beta: oauth-2025-04-20`.
- Respaldo: `/api/usage`, solo si el primero responde 404, 405 o 501.
- Respuesta usada: un arreglo `limits`; cada elemento con `group` o `kind` (`session`; `weekly` / `weekly_all`), `percent` (0-100, **usado**) y `resets_at` (fecha ISO, puede faltar).
- La respuesta puede traer más campos, que el repo de referencia ignora.

**Primer paso del proyecto:** hacer una petición real y guardar un ejemplo de la respuesta (con valores personales enmascarados) para fijar el formato y escribir tests con él. No hay documentación oficial: el endpoint puede cambiar sin aviso.

## 5. Credenciales

Orden de búsqueda **(sin verificar en detalle)**:

1. `~/.claude/.credentials.json` (o la carpeta de `CLAUDE_CONFIG_DIR`), Windows y Linux.
2. Llavero de macOS, servicio `Claude Code-credentials`.
3. Variable `ANTHROPIC_API_KEY` como último recurso.

Reglas: leer solo lo necesario, no guardar el token en caché ni en logs, no mostrarlo nunca en mensajes de error.

## 6. Arquitectura propuesta

```
src/
  extension.ts          activación, comandos, escucha de configuración
  engine/
    credentials.ts      lectura de credenciales por plataforma
    usage_api.ts        petición HTTP y parseo a un tipo propio
    shared_cache.ts     caché en archivo entre ventanas de VSCode
    scheduler.ts        temporizador, frescura, retroceso ante 429
  controller/
    status_bar.ts       texto, color y tooltip
    format.ts           funciones puras de formato de tiempo y texto
  shared/types.ts
resources/              fuente de íconos (woff)
scripts/build_icons.js  generador de la fuente
```

Decisión clave: **mantener `format.ts` como funciones puras**, sin depender de `vscode`, para poder probarlas con tests unitarios.

## 7. Caché compartida y límites de peticiones

Valores del repo de referencia, como punto de partida **(sin verificar)**:

- Archivo de caché en la carpeta temporal del sistema, compartido por todas las ventanas.
- Una petición en curso a la vez (marca `inFlightUntil`), con cooldown tras un 429.
- Retroceso: base 60 s, máximo 15 min; leer `Retry-After` cuando exista (segundos o fecha HTTP).
- Dato desactualizado visible hasta 30 min antes de tratarlo como error.
- Considerar frescura: no consultar si el dato tiene menos de ~90 % del intervalo.

## 8. Interfaz

- **Barra de estado**: alineada a la derecha; clic ejecuta "Refresh".
- **Íconos**: la barra solo admite texto e íconos de fuente, no imágenes. Hace falta una fuente propia con 21 glifos de anillo y 21 de pie (pasos del 5 %), generada con `svg2ttf` y `ttf2woff`. Cada glifo va dentro de un contorno para que los valores bajos se vean.
- Si cambias los glifos, **renombra el archivo de fuente** (`...-v2.woff`): VSCode lo cachea por nombre.
- **Prefijo**: `$(sparkle)` (ícono integrado de VSCode) más el nombre de tu extensión.
- **Dos vistas** (ambas con etiquetas y tiempo hasta el reinicio):
  - Por defecto: `✦ Claude Usage 5h ◔ 32% · 0h 7m | 7d ◔ 4% · 6d 21h`
  - Extendida: `✦ Claude Usage Session (5hr) ◔ 32% · Resets in 0h 7m | Weekly (7 day) ◔ 4% · Resets in 6d 21h`
- Si falta la hora de reinicio, se omite junto con su texto (`· Resets in …`).
- **Tooltip mínimo en ambas vistas**: solo la **hora exacta de reinicio** de cada ventana, en la zona horaria local. El resto de la información ya está en el texto de la barra y no se repite (sin gráficos ni porcentajes):
  ```
  Session (5hr)    resets today at 18:45
  Weekly (7 day)   resets Fri, Oct 23 at 22:10
  ```
  Si una ventana no trae hora de reinicio, esa línea se omite; si ninguna la trae, no hay tooltip.
- **Tooltip en los estados de error** (recomendado, sin confirmar; ver decisión pendiente 7): el motivo y el tiempo de reintento.
- **Settings**: `refreshInterval`, `extendedView`.

## 9. Fuera de alcance, y por qué

El panel de `/usage` de Claude Code con porcentajes por subagente, por contexto >150k y por sesiones largas **no está confirmado en la API**. Un intento de consultar el endpoint devolvió 429 y no se pudo verificar. Antes de planear esa función hay que comprobar si la respuesta trae el desglose, o si habría que calcularlo leyendo los transcripts locales (`~/.claude/projects/*.jsonl`, formato interno sin documentar y con implicaciones de privacidad).

## 10. Dependencias (cada una necesita aprobación)

| Paquete | Tipo | Para qué |
|---|---|---|
| `typescript` | dev | compilar y comprobar tipos |
| `@types/vscode`, `@types/node` | dev | tipos |
| `esbuild` | dev | empaquetar la extensión |
| `@vscode/vsce` | dev (o `npx`) | empaquetar y publicar |
| `svg2ttf`, `ttf2woff` | dev | generar la fuente de íconos |
| `vitest` | dev | tests unitarios |

## 11. Pruebas

- **Unitarias**: formato de tiempo (incluido `<1 h` y reinicio ausente), parseo de la respuesta con un ejemplo real, cálculo de retroceso, umbrales de color.
- **Integración manual**: F5 en VSCode y `.vsix` local en las tres plataformas.
- Casos a probar a mano: sin credenciales, sin red, 429, dos ventanas de VSCode a la vez.

## 12. Licencia, nombre y marca

- Escribir todo el código desde cero, sin copiar del repo de referencia, evita obligaciones de licencia. Los datos de la API no tienen copyright. Si se reutiliza código, aplica su licencia MIT y su aviso.
- Elegir un nombre que **no parezca oficial de Anthropic**, y un logo propio que no imite el de Claude.
- **Riesgo del nombre elegido, "Claude Usage for VS Code"**: la extensión oficial de Anthropic se llama "Claude Code for VS Code". El patrón `Claude … for VS Code` se parece mucho, y "Claude" es una marca de Anthropic. Puede generar confusión o un reclamo de retirada en el Marketplace. Mitigaciones: añadir "Unofficial" al nombre o a la descripción, un aviso claro en el README ("not affiliated with Anthropic"), y no usar el logo ni los colores de Claude. Alternativas sin "Claude" al inicio: "Usage Meter for Claude Code", "Status Bar Usage for Claude". Revisar las pautas de marca de Anthropic antes de publicar; este documento no es asesoría legal.
- Publicar con licencia propia (por ejemplo MIT) y un `README` que explique de qué endpoint depende y que puede dejar de funcionar.

## 13. Publicación

1. Cuenta de Microsoft y organización en Azure DevOps.
2. Token personal (PAT) con permiso *Marketplace → Manage*.
3. Crear el **publisher** en la página de gestión del Marketplace.
4. `vsce login <publisher>` y luego `vsce publish`.
5. Open VSX: descartado por ahora (se publica solo en el Marketplace).
6. Preparar: `README` con capturas, `CHANGELOG`, icono 128×128, categoría, palabras clave, `repository`.

## 14. Plan por fases

| Fase | Contenido | Resultado |
|---|---|---|
| 0 | Repo nuevo, tooling, **ejemplo real de la respuesta de la API** | Formato confirmado |
| 1 | Credenciales + petición + mostrar `20%` en la barra | Mínimo funcional |
| 2 | Caché compartida y retroceso ante 429, estados de error | Robusto |
| 3 | Fuente de íconos, anillo y pie | Aspecto final |
| 4 | Setting y vista extendida, correcciones F8 y F9 | Paridad con la rama actual |
| 5 | Tests, README, capturas, empaquetado | Listo para publicar |
| 6 | Publicación en el Marketplace | Versión 1.0.0 |

## 15. Decisiones

### Tomadas

| # | Decisión |
|---|---|
| 1 | Nombre: **Claude Usage for VS Code**. Destino de publicación: **Visual Studio Marketplace**. |
| 1b | Identificador técnico: `claude-usage-vscode` (el ID final es `publisher.claude-usage-vscode`; es único por publisher, y su disponibilidad se confirma al crear el publisher). |
| 3 | **Las tres plataformas** (Windows, macOS, Linux) desde el día uno. |
| 4 | **Solo Marketplace**, sin Open VSX. |
| 5 | Idioma: **solo inglés** (README, textos de la barra y del tooltip). |
| 6 | Fuente de datos: **la misma que la extensión actual** (endpoint `/api/oauth/usage` y las credenciales de Claude Code, secciones 4 y 5). Se sigue validando con una respuesta real en la fase 0. |
| 7 | **Tooltip en los estados de error**, con el motivo y el tiempo de reintento. |
| 8 | Textos de la vista extendida en inglés: `Session (5hr)`, `Weekly (7 day)`, `Resets in`. |
| 9 | Hora exacta de reinicio en el tooltip, en **formato de 24 horas**. |
| 9b | Si falta más de 24 h para el reinicio, el tooltip añade el día de la semana y la fecha corta (por ejemplo `Fri, Oct 23 at 22:10`); si es menos de 24 h, `today at 18:45`. |
| 2 | Licencia: **MIT**, con el copyright a nombre de Alejandro Lora. |
| 1c | Publisher: nombre visible **Alejandro Lora**. |
| 1d | ID del publisher: **`alexlora87`** (se confirma que esté libre al crearlo). El ID completo de la extensión será `alexlora87.claude-usage-vscode`. |

### Pendientes

Ninguna decisión pendiente. Lo único por confirmar es que el ID `alexlora87` esté libre en el Marketplace, y eso se comprueba al crear el publisher.

## 16. Riesgos

- El endpoint no está documentado y puede cambiar o desaparecer.
- Los límites de peticiones (429) pueden bloquear al usuario si el retroceso está mal hecho.
- El formato de las credenciales y su ubicación pueden cambiar con versiones de Claude Code.
- Confusión de marca con Anthropic si el nombre o el logo se parecen a los oficiales.
