const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const filesToObfuscate = [
    {
        src: path.join(__dirname, 'main.js'),
        backup: path.join(__dirname, 'main.js.backup')
    },
    {
        src: path.join(__dirname, 'preload.js'),
        backup: path.join(__dirname, 'preload.js.backup')
    },
    {
        src: path.join(__dirname, 'libro', 'assets', 'js', 'app.js'),
        backup: path.join(__dirname, 'libro', 'assets', 'js', 'app.js.backup')
    }
];

const action = process.argv[2];

if (action === '--backup') {
    backupAndObfuscate();
} else if (action === '--restore') {
    restaurar();
} else if (action === '--build') {
    try {
        backupAndObfuscate();
        console.log('--- INICIANDO COMPILACIÓN CON ELECTRON-BUILDER ---');
        execSync('npx electron-builder --win', { stdio: 'inherit', shell: true });
        console.log('--- COMPILACIÓN FINALIZADA CON ÉXITO ---');
    } catch (err) {
        console.error('Error durante la compilación de electron-builder:', err);
    } finally {
        restaurar();
    }
} else {
    console.log('Uso: node obfuscate.js [--backup | --restore | --build]');
    process.exit(1);
}

function backupAndObfuscate() {
    console.log('--- INICIANDO PROCESO DE OFUSCACIÓN ---');
    try {
        const JavaScriptObfuscator = require('javascript-obfuscator');
        
        for (const file of filesToObfuscate) {
            if (!fs.existsSync(file.src)) {
                console.warn(`Archivo no encontrado para ofuscar: ${file.src}`);
                continue;
            }

            // 1. Crear copia de respaldo
            fs.copyFileSync(file.src, file.backup);
            console.log(`Respaldo creado: ${path.basename(file.backup)}`);

            // 2. Leer código fuente
            const originalCode = fs.readFileSync(file.src, 'utf8');

            // 3. Ofuscar
            console.log(`Ofuscando: ${path.basename(file.src)}...`);
            const obfuscationResult = JavaScriptObfuscator.obfuscate(originalCode, {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.75,
                deadCodeInjection: false,
                debugProtection: false,
                disableConsoleOutput: false,
                identifierNamesGenerator: 'hexadecimal',
                log: false,
                numbersToExpressions: true,
                renameGlobals: false,
                selfDefending: false,
                simplify: true,
                splitStrings: true,
                splitStringsChunkLength: 10,
                stringArray: true,
                stringArrayCallsTransform: true,
                stringArrayCallsTransformThreshold: 0.75,
                stringArrayEncoding: ['base64'],
                stringArrayIndexShift: true,
                stringArrayRotate: true,
                stringArrayShuffle: true,
                stringArraySingleQuaternion: true,
                stringArrayThreshold: 0.75,
                transformObjectKeys: false,
                unicodeEscapeSequence: false
            });

            // 4. Sobrescribir original con código ofuscado
            fs.writeFileSync(file.src, obfuscationResult.getObfuscatedCode(), 'utf8');
            console.log(`Archivo ofuscado escrito: ${path.basename(file.src)}`);
        }
        console.log('--- OFUSCACIÓN COMPLETADA CON ÉXITO ---');
    } catch (error) {
        console.error('Error durante la ofuscación:', error);
        restaurar();
        process.exit(1);
    }
}

function restaurar() {
    console.log('--- RESTAURANDO ARCHIVOS ORIGINALES ---');
    let restaurados = 0;
    for (const file of filesToObfuscate) {
        if (fs.existsSync(file.backup)) {
            fs.copyFileSync(file.backup, file.src);
            fs.unlinkSync(file.backup);
            console.log(`Restaurado: ${path.basename(file.src)}`);
            restaurados++;
        }
    }
    if (restaurados === 0) {
        console.log('No se encontraron copias de respaldo para restaurar.');
    } else {
        console.log('--- RESTAURACIÓN COMPLETADA ---');
    }
}
