# Guía de Procedimientos para Modificar el Código del Sistema

Esta guía describe el flujo de trabajo estándar y los procedimientos obligatorios que debes seguir cuando necesites realizar cambios en el código del sistema de **Libro Fiscal SENIAT**.

---

## 🛠️ Flujo de Trabajo del Desarrollador

El flujo de trabajo se divide en tres etapas principales: **Edición en Desarrollo**, **Verificación de Lógica (Tests)**, y **Compilación y Ofuscación para Distribución**.

```
[1. Modificar Código Limpio] ──► [2. Ejecutar Pruebas Unitarias] ──► [3. Compilar en Producción]
   (main.js, app.js, etc.)             (npm run test)                     (npm run dist)
```

### 1. Modificación de Código (Desarrollo Limpio)
* **Regra Fundamental**: Siempre edita los archivos de código limpio en tu espacio de trabajo. Estos son:
  - [main.js](file:///c:/laragon/www/libro-fiscal/main.js): Proceso principal de Electron, base de datos SQLite y validaciones de hardware (MAC).
  - [preload.js](file:///c:/laragon/www/libro-fiscal/preload.js): Puente seguro de comunicación IPC.
  - [app.js](file:///c:/laragon/www/libro-fiscal/libro/assets/js/app.js): Lógica de negocio del frontend (cálculos de IVA, Forma 30, inventario, reportes, asientos contables).
  - [index.html](file:///c:/laragon/www/libro-fiscal/libro/index.html) e [index.css](file:///c:/laragon/www/libro-fiscal/libro/assets/css/styles.css): Estructura e interfaz visual.
* **Inicio del entorno local**: Para levantar el sistema y probar los cambios visuales y funcionales en tiempo real, ejecuta el archivo batch:
  ```bash
  iniciar.bat
  ```
  *(O en su defecto, abre una consola de comandos `cmd` en la raíz del proyecto y ejecuta `npm start`)*.

---

### 2. Verificación y Pruebas Unitarias (`npm run test`)
Si realizas modificaciones a las fórmulas de cálculo del IVA, estandarización de R.I.F., compensación de excedentes, o distribución de la Forma 30, debes ejecutar el script de pruebas automatizado para evitar regresiones:

* Abre tu terminal en la raíz del proyecto y ejecuta:
  ```bash
  npm run test
  ```
* Este comando ejecuta las pruebas lógicas descritas en [test_logic.js](file:///c:/laragon/www/libro-fiscal/test_logic.js) y debe retornar:
  ```
  - Pruebas Pasadas: 10
  - Pruebas Fallidas: 0
  ```
* Si agregas nuevas funcionalidades críticas (ej. un nuevo cálculo de impuesto o una nueva regla contable), es una buena práctica añadir el correspondiente caso de prueba en [test_logic.js](file:///c:/laragon/www/libro-fiscal/test_logic.js).

---

### 3. Compilación y Ofuscación Automática para Distribución (`npm run dist`)
Para evitar ingeniería inversa, robo de código o saltos en la verificación de licencias (MAC), **nunca compiles directamente usando `electron-builder` en seco**. En su lugar, usa el pipeline seguro configurado:

* Para generar el instalador final `.exe`, ejecuta:
  ```bash
  npm run dist
  ```
* Este script (`obfuscate.js --build`) ejecuta automáticamente el siguiente pipeline:
  1. **Resguardo (Backup)**: Copia temporalmente tus archivos originales y limpios (`main.js`, `preload.js`, `app.js`) a archivos `.backup`.
  2. **Ofuscación Activa**: Aplica reglas de ofuscación avanzadas (sustitución hexadecimal, encriptación base64 de cadenas, aplanamiento de flujo de control) sobre los archivos originales de desarrollo.
  3. **Empaquetado**: Ejecuta `electron-builder` empaquetando el código ofuscado dentro del archivo `.asar` y genera el instalador en `dist/Libro Fiscal SENIAT Setup 1.0.0.exe`.
  4. **Restauración**: Restaura automáticamente tus archivos JS originales y limpios desde las copias de seguridad `.backup` y elimina los temporales de ofuscación.

#### ⚠️ Recuperación ante Fallos en la Compilación
Si el proceso de compilación falla a mitad de camino y observas que tu código fuente local en el editor contiene código ofuscado o ilegible (no editable), ejecuta el siguiente comando para restablecer tus archivos de desarrollo limpios:
```bash
npm run restore
```
*(Este comando restaurará los archivos a partir de los `.backup` resguardados).*

---

## 🔒 Control de Versión (Git)
Antes de realizar un cambio importante, te sugerimos seguir estos pasos con Git:
1. Crea una rama de desarrollo para tu característica: `git checkout -b feature/nueva-funcionalidad`.
2. Realiza tus modificaciones en limpio y pruébalas en modo desarrollo.
3. Corre las pruebas unitarias: `npm run test`.
4. Realiza el commit de tus cambios: `git commit -am "feat: descripción de mi cambio"`.
5. Si vas a generar una compilación de entrega, ejecuta `npm run dist` y Git se mantendrá limpio con tu código editable original (ya que el compilador restaura los archivos limpios al terminar).
