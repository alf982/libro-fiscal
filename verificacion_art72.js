/**
 * verificacion_art72.js
 * Script de verificación completa: mapea todos los IDs del Art. 72 HTML
 * contra los `setElementValue` del JS para detectar campos sin conectar.
 */

const fs = require('fs');

const HTML_FILE = 'libro/index.html';
const JS_FILE   = 'libro/assets/js/app.js';

const htmlContent = fs.readFileSync(HTML_FILE, 'utf-8');
const jsContent   = fs.readFileSync(JS_FILE, 'utf-8');

// ──────────────────────────────────────────────────────────────────────────────
// 1. Extraer todos los IDs con sufijo -art72 del HTML
// ──────────────────────────────────────────────────────────────────────────────
const idRegex = /id="([^"]*-art72[^"]*)"/g;
const htmlArt72Ids = new Set();
let m;
while ((m = idRegex.exec(htmlContent)) !== null) {
    htmlArt72Ids.add(m[1]);
}

// Extraer también el id del header: report-header-empresa-art72, report-header-rut-art72, report-period-title-art72
const genericArt72Regex = /id="([^"]+art72[^"]*)"/g;
const htmlAllArt72 = new Set();
while ((m = genericArt72Regex.exec(htmlContent)) !== null) {
    htmlAllArt72.add(m[1]);
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. Para cada ID del Art. 72 en HTML, deducir el ID base (sin -art72 al final)
//    y verificar que existe un setElementValue / getElementById para él.
// ──────────────────────────────────────────────────────────────────────────────

// setElementValue('f30-v-ajuste-tax', ...) → twins: f30-v-ajuste-tax  y  f30-v-ajuste-tax-art72
// Los IDs que empiezan con 'report-header-' o 'report-period-' son escritos directamente en generarForma30SENIAT

const DIRECTLY_WRITTEN = new Set([
    'report-header-empresa-art72',
    'report-header-rut-art72',
    'report-period-title-art72',
]);

// Extraer todos los IDs base usados en setElementValue(...)
const setValueRegex = /setElementValue\('([^']+)'/g;
const setValueIds = new Set();
while ((m = setValueRegex.exec(jsContent)) !== null) {
    setValueIds.add(m[1]);
}

// También recopilar los getElementById directos para los art72 inputs (event listeners)
const getElemRegex = /getElementById\('([^']+art72[^']*)'\)/g;
const directGetIds = new Set();
while ((m = getElemRegex.exec(jsContent)) !== null) {
    directGetIds.add(m[1]);
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. Comprobar cada ID Art. 72 del HTML
// ──────────────────────────────────────────────────────────────────────────────

const results = [];
let ok = 0, missing = 0;

htmlAllArt72.forEach(art72Id => {
    if (DIRECTLY_WRITTEN.has(art72Id)) {
        // These are explicitly set with getElementById in generarForma30SENIAT
        const written = jsContent.includes(`'${art72Id}'`) || jsContent.includes(`"${art72Id}"`);
        results.push({ id: art72Id, baseId: '(directo)', status: written ? 'OK' : 'MISSING', detail: written ? 'Escrito directamente en generarForma30SENIAT' : '¡NO encontrado en app.js!' });
        written ? ok++ : missing++;
        return;
    }

    // Deduce base ID: remove trailing '-art72'
    const baseId = art72Id.endsWith('-art72') ? art72Id.slice(0, -'-art72'.length) : art72Id;

    // Check if setElementValue is called with the base ID
    const coveredBySetValue = setValueIds.has(baseId);
    // Check if it's an input wired directly with addEventListener
    const coveredByListener = directGetIds.has(art72Id);

    if (coveredBySetValue || coveredByListener) {
        const detail = coveredBySetValue 
            ? `setElementValue('${baseId}', ...) → escribe también en -art72` 
            : `Listener directo: addEventListener en ${art72Id}`;
        results.push({ id: art72Id, baseId, status: 'OK', detail });
        ok++;
    } else {
        results.push({ id: art72Id, baseId, status: 'MISSING', detail: `¡${baseId} NO aparece en setElementValue ni en listeners!` });
        missing++;
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. También verificar que todos los setElementValue tengan su twin -art72 en HTML
// ──────────────────────────────────────────────────────────────────────────────

const orphanSetValues = [];
setValueIds.forEach(baseId => {
    if (!baseId.startsWith('f30-')) return; // Solo campos de la F30
    const expectedArt72 = baseId + '-art72';
    if (!htmlAllArt72.has(expectedArt72)) {
        orphanSetValues.push(expectedArt72);
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Mostrar resultados
// ──────────────────────────────────────────────────────────────────────────────

console.log('');
console.log('══════════════════════════════════════════════════════════');
console.log('  VERIFICACIÓN COMPLETA - CAMPOS ART. 72 vs APP.JS');
console.log('══════════════════════════════════════════════════════════');

// Ordenar: MISSING primero
results.sort((a, b) => a.status === 'MISSING' ? -1 : 1);

results.forEach(r => {
    const icon = r.status === 'OK' ? '✓' : '✗';
    console.log(`  [${r.status}] ${icon}  ID HTML: "${r.id}"`);
    if (r.status === 'MISSING') {
        console.log(`         ↳ Base ID: "${r.baseId}"`);
        console.log(`         ↳ ${r.detail}`);
        console.log('');
    }
});

console.log('');
console.log(`  Total IDs Art. 72 en HTML : ${htmlAllArt72.size}`);
console.log(`  OK (conectados)            : ${ok}`);
console.log(`  MISSING (desconectados)    : ${missing}`);

if (orphanSetValues.length > 0) {
    console.log('');
    console.log('══════════════════════════════════════════════════════════');
    console.log('  SETEMENTVALUE EN JS SIN GEMELO -art72 EN HTML');
    console.log('══════════════════════════════════════════════════════════');
    orphanSetValues.forEach(id => {
        console.log(`  [FALTA EN HTML] "${id}"`);
    });
}

console.log('');
console.log('══════════════════════════════════════════════════════════');
if (missing === 0 && orphanSetValues.length === 0) {
    console.log('  ✓ TODOS LOS CAMPOS ESTÁN CORRECTAMENTE CONECTADOS');
} else {
    console.log(`  ✗ SE ENCONTRARON ${missing + orphanSetValues.length} CAMPOS SIN CONECTAR — VER DETALLES ARRIBA`);
}
console.log('══════════════════════════════════════════════════════════');
console.log('');
