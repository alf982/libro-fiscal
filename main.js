const { app, BrowserWindow, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

let mainWindow;
let db;
let isLicenseValid = true;

const SECRET_KEY = crypto.scryptSync('LibroFiscalSeniatSecretPass', 'salt_seniat_123', 32);
const IV = Buffer.alloc(16, 0); // IV estático para consistencia local

function getDeviceMac() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const netInterface of interfaces[name]) {
            if (!netInterface.internal && netInterface.mac && netInterface.mac !== '00:00:00:00:00:00') {
                return netInterface.mac.toUpperCase();
            }
        }
    }
    return null;
}

function registerLicense() {
    const macLocal = getDeviceMac();
    if (!macLocal) {
        console.error('Error: No se detectó dirección MAC física.');
        return false;
    }

    let licensePath;
    if (app.isPackaged) {
        licensePath = path.join(path.dirname(process.execPath), 'identificador_equipo.lic');
    } else {
        licensePath = path.join(__dirname, 'identificador_equipo.lic');
    }
    console.log('Registrando licencia en:', licensePath);

    try {
        const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, IV);
        let encrypted = cipher.update(macLocal, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        fs.writeFileSync(licensePath, encrypted, 'utf8');
        console.log('Registro de dispositivo inicializado exitosamente.');
        return true;
    } catch (err) {
        console.error('Error al registrar dispositivo:', err);
        return false;
    }
}

function verifyLicense() {
    if (!app.isPackaged) {
        console.log('Modo desarrollo: omitiendo validación de licencia.');
        isLicenseValid = true;
        return;
    }

    const macLocal = getDeviceMac();
    if (!macLocal) {
        console.error('Error: No se detectó dirección MAC física.');
        isLicenseValid = false;
        return;
    }

    const licensePath = path.join(path.dirname(process.execPath), 'identificador_equipo.lic');
    console.log('Ruta de archivo de licencia:', licensePath);

    if (!fs.existsSync(licensePath)) {
        console.warn('Licencia inválida: El archivo de licencia no existe.');
        isLicenseValid = false;
        return;
    }

    try {
        const encryptedMac = fs.readFileSync(licensePath, 'utf8').trim();
        const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, IV);
        let decrypted = decipher.update(encryptedMac, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        if (decrypted === macLocal) {
            console.log('Licencia verificada: Acceso concedido.');
            isLicenseValid = true;
        } else {
            console.warn('Licencia inválida: La MAC registrada no coincide con este equipo.');
            isLicenseValid = false;
        }
    } catch (err) {
        console.error('Error al validar licencia del dispositivo:', err);
        isLicenseValid = false;
    }
}

function initDatabase() {
    // Definir la ruta de la base de datos según el entorno
    let dbDir;
    if (app.isPackaged) {
        dbDir = path.join(app.getPath('userData'), 'libro');
    } else {
        dbDir = path.join(__dirname, 'libro');
    }

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'libro_fiscal.sqlite');
    console.log('Inicializando SQLite en:', dbPath);

    db = new DatabaseSync(dbPath);

    // Habilitar claves foráneas
    db.exec("PRAGMA foreign_keys = ON;");

    // Crear tablas principales
    db.exec(`
        CREATE TABLE IF NOT EXISTS config (
            theme TEXT DEFAULT 'dark',
            iva_rate REAL DEFAULT 16.0,
            active_beneficiary_id INTEGER
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS beneficiarios (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            tax_id TEXT NOT NULL,
            especial TEXT DEFAULT 'no',
            retenciones_anteriores REAL DEFAULT 0.0
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS contactos (
            id INTEGER,
            beneficiary_id INTEGER,
            tax_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            especial TEXT DEFAULT 'no',
            email TEXT,
            phone TEXT,
            address TEXT,
            PRIMARY KEY (id, beneficiary_id),
            FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS compras (
            id INTEGER,
            beneficiary_id INTEGER,
            type TEXT NOT NULL,
            date TEXT NOT NULL,
            doc_type TEXT NOT NULL,
            doc_afectado TEXT,
            doc_number TEXT NOT NULL,
            control_number TEXT NOT NULL,
            contact_id INTEGER NOT NULL,
            is_import_export INTEGER DEFAULT 0,
            base_exenta REAL DEFAULT 0.0,
            base_general REAL DEFAULT 0.0,
            tax_general REAL DEFAULT 0.0,
            base_reducida REAL DEFAULT 0.0,
            tax_reducida REAL DEFAULT 0.0,
            base_adicional REAL DEFAULT 0.0,
            tax_adicional REAL DEFAULT 0.0,
            net_amount REAL DEFAULT 0.0,
            tax_amount REAL DEFAULT 0.0,
            total_amount REAL DEFAULT 0.0,
            has_retention INTEGER DEFAULT 0,
            retention_pct REAL DEFAULT 0.0,
            retention_amount REAL DEFAULT 0.0,
            retention_number TEXT,
            retention_date TEXT,
            status TEXT DEFAULT 'Pagado',
            notes TEXT,
            export_form_d TEXT,
            import_expediente TEXT,
            nota_debito TEXT,
            nota_credito TEXT,
            sin_credito REAL DEFAULT 0.0,
            retencion_terceros REAL DEFAULT 0.0,
            iva_percibido_aduana REAL DEFAULT 0.0,
            PRIMARY KEY (id, beneficiary_id),
            FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS ventas (
            id INTEGER,
            beneficiary_id INTEGER,
            type TEXT NOT NULL,
            date TEXT NOT NULL,
            doc_type TEXT NOT NULL,
            doc_afectado TEXT,
            doc_number TEXT NOT NULL,
            control_number TEXT NOT NULL,
            contact_id INTEGER NOT NULL,
            is_import_export INTEGER DEFAULT 0,
            base_exenta REAL DEFAULT 0.0,
            base_general REAL DEFAULT 0.0,
            tax_general REAL DEFAULT 0.0,
            base_reducida REAL DEFAULT 0.0,
            tax_reducida REAL DEFAULT 0.0,
            base_adicional REAL DEFAULT 0.0,
            tax_adicional REAL DEFAULT 0.0,
            net_amount REAL DEFAULT 0.0,
            tax_amount REAL DEFAULT 0.0,
            total_amount REAL DEFAULT 0.0,
            has_retention INTEGER DEFAULT 0,
            retention_pct REAL DEFAULT 0.0,
            retention_amount REAL DEFAULT 0.0,
            retention_number TEXT,
            retention_date TEXT,
            status TEXT DEFAULT 'Pagado',
            notes TEXT,
            fiscal_machine TEXT,
            control_z TEXT,
            export_form_d TEXT,
            nota_debito TEXT,
            nota_credito TEXT,
            iva_percibido_comprador REAL DEFAULT 0.0,
            ventas_terceros_total REAL DEFAULT 0.0,
            ventas_terceros_exentas REAL DEFAULT 0.0,
            ventas_terceros_gravadas REAL DEFAULT 0.0,
            PRIMARY KEY (id, beneficiary_id),
            FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS ajustes_periodo (
            beneficiary_id INTEGER,
            period TEXT NOT NULL,
            quincena TEXT NOT NULL,
            debito_ajuste REAL DEFAULT 0.0,
            debito_exonerado REAL DEFAULT 0.0,
            credito_ajuste REAL DEFAULT 0.0,
            excedente_anterior REAL DEFAULT 0.0,
            credito_ajuste_tax REAL DEFAULT 0.0,
            PRIMARY KEY (beneficiary_id, period, quincena),
            FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS inventario_articulos (
            id INTEGER,
            beneficiary_id INTEGER,
            code TEXT NOT NULL,
            description TEXT NOT NULL,
            unit TEXT DEFAULT 'Unidad',
            initial_stock REAL DEFAULT 0.0,
            initial_cost REAL DEFAULT 0.0,
            PRIMARY KEY (id, beneficiary_id),
            FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS inventario_movimientos (
            id INTEGER,
            beneficiary_id INTEGER,
            article_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            doc_type TEXT NOT NULL,
            doc_number TEXT NOT NULL,
            qty REAL DEFAULT 0.0,
            unit_cost REAL DEFAULT 0.0,
            total_cost REAL DEFAULT 0.0,
            notes TEXT,
            PRIMARY KEY (id, beneficiary_id),
            FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE,
            FOREIGN KEY (article_id, beneficiary_id) REFERENCES inventario_articulos(id, beneficiary_id) ON DELETE CASCADE
        );
    `);

    // Migración condicional: Eliminar restricción PRIMARY KEY antigua de asientos_manuales
    try {
        const tableInfo = db.prepare("PRAGMA table_info(asientos_manuales)").all();
        const hasPrimaryKey = tableInfo.some(col => col.pk > 0);
        if (hasPrimaryKey) {
            console.log("Migrando tabla asientos_manuales: eliminando restricción PRIMARY KEY antigua.");
            db.exec("DROP TABLE asientos_manuales;");
        }
    } catch (e) {
        // La tabla no existe o error, no hacer nada
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS asientos_manuales (
            id INTEGER,
            beneficiary_id INTEGER,
            date TEXT NOT NULL,
            concept TEXT NOT NULL,
            account TEXT NOT NULL,
            debe REAL DEFAULT 0.0,
            haber REAL DEFAULT 0.0,
            FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS cuentas_contables (
            code TEXT NOT NULL,
            beneficiary_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            PRIMARY KEY (code, beneficiary_id),
            FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS balances_guardados (
            id INTEGER,
            beneficiary_id INTEGER,
            type TEXT NOT NULL,
            date TEXT NOT NULL,
            notes TEXT,
            data TEXT NOT NULL,
            PRIMARY KEY (id, beneficiary_id),
            FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
        );
    `);

    // Migraciones automáticas ante bases de datos SQLite preexistentes
    const migrations = {
        ajustes_periodo: [
            { col: 'excedente_anterior', def: 'REAL DEFAULT 0.0' },
            { col: 'credito_ajuste_tax', def: 'REAL DEFAULT 0.0' }
        ],
        compras: [
            { col: 'export_form_d', def: 'TEXT' },
            { col: 'import_expediente', def: 'TEXT' },
            { col: 'nota_debito', def: 'TEXT' },
            { col: 'nota_credito', def: 'TEXT' },
            { col: 'sin_credito', def: 'REAL DEFAULT 0.0' },
            { col: 'retencion_terceros', def: 'REAL DEFAULT 0.0' },
            { col: 'iva_percibido_aduana', def: 'REAL DEFAULT 0.0' }
        ],
        ventas: [
            { col: 'fiscal_machine', def: 'TEXT' },
            { col: 'control_z', def: 'TEXT' },
            { col: 'export_form_d', def: 'TEXT' },
            { col: 'nota_debito', def: 'TEXT' },
            { col: 'nota_credito', def: 'TEXT' },
            { col: 'iva_percibido_comprador', def: 'REAL DEFAULT 0.0' },
            { col: 'ventas_terceros_total', def: 'REAL DEFAULT 0.0' },
            { col: 'ventas_terceros_exentas', def: 'REAL DEFAULT 0.0' },
            { col: 'ventas_terceros_gravadas', def: 'REAL DEFAULT 0.0' }
        ]
    };

    for (const [table, columns] of Object.entries(migrations)) {
        for (const item of columns) {
            try {
                db.exec(`ALTER TABLE ${table} ADD COLUMN ${item.col} ${item.def};`);
            } catch (e) {
                // Falla si la columna ya existe, lo cual es el comportamiento esperado
            }
        }
    }
}

function loadData() {
    try {
        // Cargar config global
        const configRow = db.prepare("SELECT * FROM config LIMIT 1").get();
        const config = {
            ivaRate: 16.0,
            theme: 'dark'
        };
        let activeBeneficiaryId = null;

        if (configRow) {
            config.theme = configRow.theme || 'dark';
            config.ivaRate = parseFloat(configRow.iva_rate) || 16.0;
            activeBeneficiaryId = configRow.active_beneficiary_id ? parseInt(configRow.active_beneficiary_id) : null;
        }

        // Cargar beneficiarios
        const beneficiariosRows = db.prepare("SELECT * FROM beneficiarios").all();
        const beneficiarios = [];

        for (const bRow of beneficiariosRows) {
            const bId = parseInt(bRow.id);

            // Compras
            const comprasRows = db.prepare("SELECT * FROM compras WHERE beneficiary_id = ?").all(bId);
            const compras = comprasRows.map(c => ({
                id: parseInt(c.id),
                type: c.type,
                date: c.date,
                doc_type: c.doc_type,
                doc_afectado: c.doc_afectado || '',
                doc_number: c.doc_number,
                control_number: c.control_number || '',
                contact_id: parseInt(c.contact_id),
                is_import_export: Boolean(c.is_import_export),
                base_exenta: parseFloat(c.base_exenta) || 0.0,
                base_general: parseFloat(c.base_general) || 0.0,
                tax_general: parseFloat(c.tax_general) || 0.0,
                base_reducida: parseFloat(c.base_reducida) || 0.0,
                tax_reducida: parseFloat(c.tax_reducida) || 0.0,
                base_adicional: parseFloat(c.base_adicional) || 0.0,
                tax_adicional: parseFloat(c.tax_adicional) || 0.0,
                net_amount: parseFloat(c.net_amount) || 0.0,
                tax_amount: parseFloat(c.tax_amount) || 0.0,
                total_amount: parseFloat(c.total_amount) || 0.0,
                has_retention: Boolean(c.has_retention),
                retention_pct: parseFloat(c.retention_pct) || 0.0,
                retention_amount: parseFloat(c.retention_amount) || 0.0,
                retention_number: c.retention_number || '',
                retention_date: c.retention_date || '',
                status: c.status || 'Pagado',
                notes: c.notes || '',
                export_form_d: c.export_form_d || '',
                import_expediente: c.import_expediente || '',
                nota_debito: c.nota_debito || '',
                nota_credito: c.nota_credito || '',
                sin_credito: parseFloat(c.sin_credito) || 0.0,
                retencion_terceros: parseFloat(c.retencion_terceros) || 0.0,
                iva_percibido_aduana: parseFloat(c.iva_percibido_aduana) || 0.0
            }));

            // Ventas
            const ventasRows = db.prepare("SELECT * FROM ventas WHERE beneficiary_id = ?").all(bId);
            const ventas = ventasRows.map(v => ({
                id: parseInt(v.id),
                type: v.type,
                date: v.date,
                doc_type: v.doc_type,
                doc_afectado: v.doc_afectado || '',
                doc_number: v.doc_number,
                control_number: v.control_number || '',
                contact_id: parseInt(v.contact_id),
                is_import_export: Boolean(v.is_import_export),
                base_exenta: parseFloat(v.base_exenta) || 0.0,
                base_general: parseFloat(v.base_general) || 0.0,
                tax_general: parseFloat(v.tax_general) || 0.0,
                base_reducida: parseFloat(v.base_reducida) || 0.0,
                tax_reducida: parseFloat(v.tax_reducida) || 0.0,
                base_adicional: parseFloat(v.base_adicional) || 0.0,
                tax_adicional: parseFloat(v.tax_adicional) || 0.0,
                net_amount: parseFloat(v.net_amount) || 0.0,
                tax_amount: parseFloat(v.tax_amount) || 0.0,
                total_amount: parseFloat(v.total_amount) || 0.0,
                has_retention: Boolean(v.has_retention),
                retention_pct: parseFloat(v.retention_pct) || 0.0,
                retention_amount: parseFloat(v.retention_amount) || 0.0,
                retention_number: v.retention_number || '',
                retention_date: v.retention_date || '',
                status: v.status || 'Pagado',
                notes: v.notes || '',
                fiscal_machine: v.fiscal_machine || '',
                control_z: v.control_z || '',
                export_form_d: v.export_form_d || '',
                nota_debito: v.nota_debito || '',
                nota_credito: v.nota_credito || '',
                iva_percibido_comprador: parseFloat(v.iva_percibido_comprador) || 0.0,
                ventas_terceros_total: parseFloat(v.ventas_terceros_total) || 0.0,
                ventas_terceros_exentas: parseFloat(v.ventas_terceros_exentas) || 0.0,
                ventas_terceros_gravadas: parseFloat(v.ventas_terceros_gravadas) || 0.0
            }));

            // Contactos
            const contactosRows = db.prepare("SELECT * FROM contactos WHERE beneficiary_id = ?").all(bId);
            const contactos = contactosRows.map(co => ({
                id: parseInt(co.id),
                tax_id: co.tax_id,
                name: co.name,
                type: co.type,
                especial: co.especial || 'no',
                email: co.email || '',
                phone: co.phone || '',
                address: co.address || ''
            }));

            // Ajustes
            const ajustesRows = db.prepare("SELECT * FROM ajustes_periodo WHERE beneficiary_id = ?").all(bId);
            const ajustes = ajustesRows.map(a => ({
                period: a.period,
                quincena: a.quincena,
                debito_ajuste: parseFloat(a.debito_ajuste) || 0.0,
                debito_exonerado: parseFloat(a.debito_exonerado) || 0.0,
                credito_ajuste: parseFloat(a.credito_ajuste) || 0.0,
                excedente_anterior: parseFloat(a.excedente_anterior) || 0.0,
                credito_ajuste_tax: parseFloat(a.credito_ajuste_tax) || 0.0
            }));

            // Artículos de Inventario
            const articulosRows = db.prepare("SELECT * FROM inventario_articulos WHERE beneficiary_id = ?").all(bId);
            const articulos = articulosRows.map(a => ({
                id: parseInt(a.id),
                code: a.code,
                description: a.description,
                unit: a.unit || 'Unidad',
                initial_stock: parseFloat(a.initial_stock) || 0.0,
                initial_cost: parseFloat(a.initial_cost) || 0.0
            }));

            // Movimientos de Inventario
            const movimientosRows = db.prepare("SELECT * FROM inventario_movimientos WHERE beneficiary_id = ?").all(bId);
            const movimientos = movimientosRows.map(m => ({
                id: parseInt(m.id),
                article_id: parseInt(m.article_id),
                date: m.date,
                type: m.type,
                doc_type: m.doc_type,
                doc_number: m.doc_number,
                qty: parseFloat(m.qty) || 0.0,
                unit_cost: parseFloat(m.unit_cost) || 0.0,
                total_cost: parseFloat(m.total_cost) || 0.0,
                notes: m.notes || ''
            }));

            // Asientos manuales
            const asientosRows = db.prepare("SELECT * FROM asientos_manuales WHERE beneficiary_id = ?").all(bId);
            const asientos_manuales = asientosRows.map(as => ({
                id: parseInt(as.id),
                date: as.date,
                concept: as.concept,
                account: as.account,
                debe: parseFloat(as.debe) || 0.0,
                haber: parseFloat(as.haber) || 0.0
            }));

            // Cuentas contables
            const cuentasRows = db.prepare("SELECT * FROM cuentas_contables WHERE beneficiary_id = ?").all(bId);
            const cuentas_contables = cuentasRows.map(c => ({
                code: c.code,
                name: c.name
            }));

            // Balances Guardados
            let balances_guardados = [];
            try {
                const balancesRows = db.prepare("SELECT * FROM balances_guardados WHERE beneficiary_id = ?").all(bId);
                balances_guardados = balancesRows.map(bg => ({
                    id: parseInt(bg.id),
                    type: bg.type,
                    date: bg.date,
                    notes: bg.notes || '',
                    data: JSON.parse(bg.data)
                }));
            } catch (e) {
                console.error("Error cargando balances_guardados en loadData:", e);
            }

            beneficiarios.push({
                id: bId,
                name: bRow.name,
                tax_id: bRow.tax_id,
                especial: bRow.especial || 'no',
                retencionesAnteriores: parseFloat(bRow.retenciones_anteriores) || 0.0,
                compras: compras,
                ventas: ventas,
                contactos: contactos,
                ajustes: ajustes,
                articulos: articulos,
                movimientos: movimientos,
                asientos_manuales: asientos_manuales,
                cuentas_contables: cuentas_contables,
                balances_guardados: balances_guardados
            });
        }

        return {
            activeBeneficiaryId: activeBeneficiaryId,
            beneficiarios: beneficiarios,
            config: config
        };
    } catch (e) {
        console.error("Error cargando base de datos en main.js:", e);
        throw e;
    }
}

function saveData(data) {
    if (!data || !data.beneficiarios) {
        throw new Error('Formato de datos no válido para guardado');
    }

    try {
        db.exec("BEGIN TRANSACTION;");

        // Limpiar todas las tablas
        db.exec("DELETE FROM config;");
        db.exec("DELETE FROM beneficiarios;");
        db.exec("DELETE FROM compras;");
        db.exec("DELETE FROM ventas;");
        db.exec("DELETE FROM contactos;");
        db.exec("DELETE FROM ajustes_periodo;");
        db.exec("DELETE FROM inventario_articulos;");
        db.exec("DELETE FROM inventario_movimientos;");
        db.exec("DELETE FROM asientos_manuales;");
        db.exec("DELETE FROM cuentas_contables;");
        db.exec("DELETE FROM balances_guardados;");

        // Guardar configuración global
        const insertConfig = db.prepare("INSERT INTO config (theme, iva_rate, active_beneficiary_id) VALUES (?, ?, ?)");
        insertConfig.run(
            data.config?.theme || 'dark',
            parseFloat(data.config?.ivaRate) || 16.0,
            data.activeBeneficiaryId || null
        );

        // Declaraciones preparadas
        const insertB = db.prepare("INSERT INTO beneficiarios (id, name, tax_id, especial, retenciones_anteriores) VALUES (?, ?, ?, ?, ?)");
        
        const insertC = db.prepare(`
            INSERT INTO compras (
                id, beneficiary_id, type, date, doc_type, doc_afectado, doc_number, control_number, contact_id, 
                is_import_export, base_exenta, base_general, tax_general, base_reducida, tax_reducida, 
                base_adicional, tax_adicional, net_amount, tax_amount, total_amount, has_retention, 
                retention_pct, retention_amount, retention_number, retention_date, status, notes, 
                export_form_d, import_expediente, nota_debito, nota_credito, sin_credito, retencion_terceros, iva_percibido_aduana
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertV = db.prepare(`
            INSERT INTO ventas (
                id, beneficiary_id, type, date, doc_type, doc_afectado, doc_number, control_number, contact_id, 
                is_import_export, base_exenta, base_general, tax_general, base_reducida, tax_reducida, 
                base_adicional, tax_adicional, net_amount, tax_amount, total_amount, has_retention, 
                retention_pct, retention_amount, retention_number, retention_date, status, notes, 
                fiscal_machine, control_z, export_form_d, nota_debito, nota_credito, iva_percibido_comprador, 
                ventas_terceros_total, ventas_terceros_exentas, ventas_terceros_gravadas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertCo = db.prepare(`
            INSERT INTO contactos (id, beneficiary_id, tax_id, name, type, especial, email, phone, address) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertA = db.prepare(`
            INSERT INTO ajustes_periodo (beneficiary_id, period, quincena, debito_ajuste, debito_exonerado, credito_ajuste, excedente_anterior, credito_ajuste_tax) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertArt = db.prepare(`
            INSERT INTO inventario_articulos (id, beneficiary_id, code, description, unit, initial_stock, initial_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMov = db.prepare(`
            INSERT INTO inventario_movimientos (id, beneficiary_id, article_id, date, type, doc_type, doc_number, qty, unit_cost, total_cost, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertAsientos = db.prepare(`
            INSERT INTO asientos_manuales (id, beneficiary_id, date, concept, account, debe, haber)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertCuentas = db.prepare(`
            INSERT INTO cuentas_contables (code, beneficiary_id, name)
            VALUES (?, ?, ?)
        `);

        const insertBG = db.prepare(`
            INSERT INTO balances_guardados (id, beneficiary_id, type, date, notes, data)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const b of data.beneficiarios) {
            const bId = parseInt(b.id);
            insertB.run(
                bId,
                b.name,
                b.tax_id,
                b.especial || 'no',
                parseFloat(b.retencionesAnteriores) || 0.0
            );

            // Compras
            if (b.compras && Array.isArray(b.compras)) {
                for (const c of b.compras) {
                    insertC.run(
                        parseInt(c.id),
                        bId,
                        c.type,
                        c.date,
                        c.doc_type,
                        c.doc_afectado || '',
                        c.doc_number,
                        c.control_number || '',
                        parseInt(c.contact_id),
                        c.is_import_export ? 1 : 0,
                        parseFloat(c.base_exenta) || 0.0,
                        parseFloat(c.base_general) || 0.0,
                        parseFloat(c.tax_general) || 0.0,
                        parseFloat(c.base_reducida) || 0.0,
                        parseFloat(c.tax_reducida) || 0.0,
                        parseFloat(c.base_adicional) || 0.0,
                        parseFloat(c.tax_adicional) || 0.0,
                        parseFloat(c.net_amount) || 0.0,
                        parseFloat(c.tax_amount) || 0.0,
                        parseFloat(c.total_amount) || 0.0,
                        c.has_retention ? 1 : 0,
                        parseFloat(c.retention_pct) || 0.0,
                        parseFloat(c.retention_amount) || 0.0,
                        c.retention_number || '',
                        c.retention_date || '',
                        c.status || 'Pagado',
                        c.notes || '',
                        c.export_form_d || '',
                        c.import_expediente || '',
                        c.nota_debito || '',
                        c.nota_credito || '',
                        parseFloat(c.sin_credito) || 0.0,
                        parseFloat(c.retencion_terceros) || 0.0,
                        parseFloat(c.iva_percibido_aduana) || 0.0
                    );
                }
            }

            // Ventas
            if (b.ventas && Array.isArray(b.ventas)) {
                for (const v of b.ventas) {
                    insertV.run(
                        parseInt(v.id),
                        bId,
                        v.type,
                        v.date,
                        v.doc_type,
                        v.doc_afectado || '',
                        v.doc_number,
                        v.control_number || '',
                        parseInt(v.contact_id),
                        v.is_import_export ? 1 : 0,
                        parseFloat(v.base_exenta) || 0.0,
                        parseFloat(v.base_general) || 0.0,
                        parseFloat(v.tax_general) || 0.0,
                        parseFloat(v.base_reducida) || 0.0,
                        parseFloat(v.tax_reducida) || 0.0,
                        parseFloat(v.base_adicional) || 0.0,
                        parseFloat(v.tax_adicional) || 0.0,
                        parseFloat(v.net_amount) || 0.0,
                        parseFloat(v.tax_amount) || 0.0,
                        parseFloat(v.total_amount) || 0.0,
                        v.has_retention ? 1 : 0,
                        parseFloat(v.retention_pct) || 0.0,
                        parseFloat(v.retention_amount) || 0.0,
                        v.retention_number || '',
                        v.retention_date || '',
                        v.status || 'Pagado',
                        v.notes || '',
                        v.fiscal_machine || '',
                        v.control_z || '',
                        v.export_form_d || '',
                        v.nota_debito || '',
                        v.nota_credito || '',
                        parseFloat(v.iva_percibido_comprador) || 0.0,
                        parseFloat(v.ventas_terceros_total) || 0.0,
                        parseFloat(v.ventas_terceros_exentas) || 0.0,
                        parseFloat(v.ventas_terceros_gravadas) || 0.0
                    );
                }
            }

            // Contactos
            if (b.contactos && Array.isArray(b.contactos)) {
                for (const co of b.contactos) {
                    insertCo.run(
                        parseInt(co.id),
                        bId,
                        co.tax_id,
                        co.name,
                        co.type,
                        co.especial || 'no',
                        co.email || '',
                        co.phone || '',
                        co.address || ''
                    );
                }
            }

            // Ajustes
            if (b.ajustes && Array.isArray(b.ajustes)) {
                for (const a of b.ajustes) {
                    insertA.run(
                        bId,
                        a.period,
                        a.quincena,
                        parseFloat(a.debito_ajuste) || 0.0,
                        parseFloat(a.debito_exonerado) || 0.0,
                        parseFloat(a.credito_ajuste) || 0.0,
                        parseFloat(a.excedente_anterior) || 0.0,
                        parseFloat(a.credito_ajuste_tax) || 0.0
                    );
                }
            }

            // Articulos de Inventario
            if (b.articulos && Array.isArray(b.articulos)) {
                for (const art of b.articulos) {
                    insertArt.run(
                        parseInt(art.id),
                        bId,
                        art.code,
                        art.description,
                        art.unit || 'Unidad',
                        parseFloat(art.initial_stock) || 0.0,
                        parseFloat(art.initial_cost) || 0.0
                    );
                }
            }

            // Movimientos de Inventario
            if (b.movimientos && Array.isArray(b.movimientos)) {
                for (const mov of b.movimientos) {
                    insertMov.run(
                        parseInt(mov.id),
                        bId,
                        parseInt(mov.article_id),
                        mov.date,
                        mov.type,
                        mov.doc_type,
                        mov.doc_number,
                        parseFloat(mov.qty) || 0.0,
                        parseFloat(mov.unit_cost) || 0.0,
                        parseFloat(mov.total_cost) || 0.0,
                        mov.notes || ''
                    );
                }
            }

            // Asientos manuales
            if (b.asientos_manuales && Array.isArray(b.asientos_manuales)) {
                for (const as of b.asientos_manuales) {
                    insertAsientos.run(
                        parseInt(as.id),
                        bId,
                        as.date,
                        as.concept,
                        as.account,
                        parseFloat(as.debe) || 0.0,
                        parseFloat(as.haber) || 0.0
                    );
                }
            }

            // Cuentas contables
            if (b.cuentas_contables && Array.isArray(b.cuentas_contables)) {
                for (const c of b.cuentas_contables) {
                    insertCuentas.run(
                        c.code,
                        bId,
                        c.name
                    );
                }
            }

            // Balances Guardados
            if (b.balances_guardados && Array.isArray(b.balances_guardados)) {
                for (const bg of b.balances_guardados) {
                    insertBG.run(
                        parseInt(bg.id),
                        bId,
                        bg.type,
                        bg.date,
                        bg.notes || '',
                        JSON.stringify(bg.data)
                    );
                }
            }
        }

        db.exec("COMMIT;");
        return { success: true };
    } catch (e) {
        db.exec("ROLLBACK;");
        console.error("Error al escribir datos en SQLite desde Electron:", e);
        throw e;
    }
}

function createWindow() {
    verifyLicense();
    initDatabase();

    const preloadPath = path.join(__dirname, 'preload.js');
    console.log('Cargando script de preload desde:', preloadPath);

    const iconPath = path.join(__dirname, 'libro', 'assets', 'icon.png');
    const appIcon = nativeImage.createFromPath(iconPath);

    mainWindow = new BrowserWindow({
        width: 1300,
        height: 850,
        icon: appIcon,
        backgroundColor: '#111827', // Fondo oscuro coincidente con styles.css para evitar parpadeo blanco
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Desactivar menú por defecto para un look premium y despejado
    mainWindow.setMenuBarVisibility(false);

    // Cargar la app web local o pantalla de bloqueo según corresponda
    if (isLicenseValid) {
        mainWindow.loadFile(path.join(__dirname, 'libro', 'index.html'));
    } else {
        mainWindow.loadFile(path.join(__dirname, 'libro', 'bloqueo.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Configurar llamadas IPC
ipcMain.handle('db:load', async () => {
    if (!isLicenseValid) {
        throw new Error("Aplicación bloqueada: licencia inválida.");
    }
    return loadData();
});

ipcMain.handle('db:save', async (event, data) => {
    if (!isLicenseValid) {
        throw new Error("Aplicación bloqueada: licencia inválida.");
    }
    return saveData(data);
});

ipcMain.handle('get-mac', async () => {
    return getDeviceMac();
});

ipcMain.handle('print-to-pdf', async (event, filenamePrefix = 'Forma_30_SENIAT', options = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    try {
        const printOptions = {
            pageSize: options.pageSize || 'Letter',
            printBackground: options.printBackground !== undefined ? options.printBackground : true,
            margins: options.margins || {
                marginType: 'none'
            },
            landscape: options.landscape || false
        };
        const data = await win.webContents.printToPDF(printOptions);
        const tempPath = path.join(app.getPath('temp'), `${filenamePrefix}_${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, data);
        await shell.openPath(tempPath);
        return { success: true };
    } catch (error) {
        console.error('Error al generar PDF en Electron:', error);
        throw error;
    }
});

app.whenReady().then(() => {
    // Verificar si se solicita registro de licencia por parámetro (para el instalador)
    if (process.argv.includes('--register')) {
        console.log('Ejecutando registro de licencia silencioso...');
        const success = registerLicense();
        if (success) {
            console.log('Licencia registrada con éxito.');
        } else {
            console.error('Error al registrar la licencia.');
        }
        app.quit();
        return;
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
