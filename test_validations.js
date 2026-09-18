// Suite de Pruebas de Validaciones Contables y Fiscales para Libro Fiscal SENIAT
// Se ejecuta bajo Node.js para verificar todas las reglas del Plan de Implementación

const assert = require('assert');

// ==========================================================================
// 1. EXTRACTED LOGICAL VALIDATION FUNCTIONS
// ==========================================================================

function validarFormatoRif(taxId) {
    if (!taxId) return false;
    const rifRegex = /^[VEJGPC]-[0-9]{8}-[0-9]$/;
    const cedulaRegex = /^[VE]-[0-9]{6,8}$/;
    return rifRegex.test(taxId) || cedulaRegex.test(taxId);
}

function validarFacturaCompra(payload, existingCompras, config) {
    const {
        id, date, doc_type, doc_afectado, doc_number, control_number, contact_id, total_amount,
        base_general, tax_general, base_reducida, tax_reducida, base_adicional, tax_adicional,
        has_retention, retention_date
    } = payload;

    // Campos obligatorios
    if (!date || !doc_number || !control_number || !contact_id || (total_amount <= 0 && doc_type === 'Factura')) {
        return { valid: false, error: 'Completa los campos requeridos de la factura fiscal.' };
    }

    // 1. Facturas Duplicadas
    const existeDuplicada = existingCompras.some(c => 
        c.contact_id === contact_id && 
        c.doc_number.toLowerCase() === doc_number.toLowerCase() && 
        c.id !== parseInt(id || -1)
    );
    if (existeDuplicada) {
        return { valid: false, error: `Ya existe una factura registrada con el N° ${doc_number} para este proveedor.` };
    }

    // 2. Fechas Coherentes (Fecha futura y fecha de retención posterior)
    const hoyStr = new Date().toISOString().substring(0, 10);
    if (date > hoyStr) {
        return { valid: false, error: 'La fecha de la factura no puede ser superior a la fecha actual.' };
    }
    if (has_retention && retention_date < date) {
        return { valid: false, error: 'La fecha de retención no puede ser anterior a la fecha de emisión de la factura.' };
    }

    // 3. Coherencia Matemática del IVA
    if (((base_general || 0) > 0 && (tax_general || 0) === 0) || ((base_general || 0) === 0 && (tax_general || 0) > 0)) {
        return { valid: false, error: 'Incoherencia en alícuota general: no puede haber base imponible sin impuesto general de IVA o viceversa.' };
    }
    if (((base_reducida || 0) > 0 && (tax_reducida || 0) === 0) || ((base_reducida || 0) === 0 && (tax_reducida || 0) > 0)) {
        return { valid: false, error: 'Incoherencia en alícuota reducida: comprueba la base y su respectivo IVA (8%).' };
    }
    if (((base_adicional || 0) > 0 && (tax_adicional || 0) === 0) || ((base_adicional || 0) === 0 && (tax_adicional || 0) > 0)) {
        return { valid: false, error: 'Incoherencia en alícuota adicional: comprueba la base y su respectivo IVA (31%).' };
    }

    // 4. Contribuyente Especial vs Ordinario en Compras
    if (has_retention && config.empresaContribuyente !== 'especial') {
        return { valid: false, error: 'La empresa actual está configurada como Contribuyente Ordinario. No se permite realizar retenciones de IVA en compras.' };
    }

    // 5. Ajustes (Notas de Crédito / Débito)
    if (doc_type === 'Nota Crédito' || doc_type === 'Nota Débito') {
        if (!doc_afectado) {
            return { valid: false, error: 'Debe seleccionar la Factura Afectada para registrar la nota.' };
        }
        const originalInvoice = existingCompras.find(c => 
            String(c.doc_number).trim() === String(doc_afectado).trim()
        );
        if (!originalInvoice) {
            return { valid: false, error: `No se encontró la Factura Afectada N° ${doc_afectado} en los registros de compras para aplicar el ajuste.` };
        }
    }

    return { valid: true };
}

function validarFacturaVenta(payload, existingVentas, contactos) {
    const {
        id, date, doc_type, doc_afectado, doc_number, control_number, contact_id, total_amount,
        base_general, tax_general, base_reducida, tax_reducida, base_adicional, tax_adicional,
        has_retention, retention_date
    } = payload;

    // Campos obligatorios
    if (!date || !doc_number || !control_number || !contact_id || (total_amount <= 0 && doc_type === 'Factura')) {
        return { valid: false, error: 'Completa los campos requeridos de la factura fiscal.' };
    }

    // 1. Fechas Coherentes (Fecha futura y fecha de retención posterior)
    const hoyStr = new Date().toISOString().substring(0, 10);
    if (date > hoyStr) {
        return { valid: false, error: 'La fecha de la factura no puede ser superior a la fecha actual.' };
    }
    if (has_retention && retention_date < date) {
        return { valid: false, error: 'La fecha de retención no puede ser anterior a la fecha de emisión de la factura.' };
    }

    // 2. Coherencia Matemática del IVA
    if (((base_general || 0) > 0 && (tax_general || 0) === 0) || ((base_general || 0) === 0 && (tax_general || 0) > 0)) {
        return { valid: false, error: 'Incoherencia en alícuota general: no puede haber base imponible de venta sin su IVA o viceversa.' };
    }
    if (((base_reducida || 0) > 0 && (tax_reducida || 0) === 0) || ((base_reducida || 0) === 0 && (tax_reducida || 0) > 0)) {
        return { valid: false, error: 'Incoherencia en alícuota reducida en ventas: comprueba la base y su respectivo IVA (8%).' };
    }
    if (((base_adicional || 0) > 0 && (tax_adicional || 0) === 0) || ((base_adicional || 0) === 0 && (tax_adicional || 0) > 0)) {
        return { valid: false, error: 'Incoherencia en alícuota adicional en ventas: comprueba la base y su respectivo IVA (31%).' };
    }

    // 3. Cliente Contribuyente Especial en Ventas
    if (has_retention) {
        const clienteObj = contactos.find(c => c.id === contact_id);
        if (clienteObj && clienteObj.especial !== 'si') {
            return { valid: false, error: 'El cliente seleccionado no es Contribuyente Especial. No se pueden recibir retenciones de IVA de clientes ordinarios.' };
        }
    }

    // 4. Ajustes (Notas de Crédito / Débito)
    if (doc_type === 'Nota Crédito' || doc_type === 'Nota Débito') {
        if (!doc_afectado) {
            return { valid: false, error: 'Debe seleccionar la Factura Afectada para registrar la nota.' };
        }
        const originalInvoice = existingVentas.find(v => 
            String(v.doc_number).trim() === String(doc_afectado).trim()
        );
        if (!originalInvoice) {
            return { valid: false, error: `No se encontró la Factura Afectada N° ${doc_afectado} en los registros de ventas para aplicar el ajuste.` };
        }
    }

    return { valid: true };
}

function validarCuentaContable(code, name, originalCode, existingCuentas) {
    if (!code || !name) {
        return { valid: false, error: 'Por favor completa todos los campos obligatorios.' };
    }

    if (originalCode) {
        if (code !== originalCode && existingCuentas.some(c => c.code === code)) {
            return { valid: false, error: `El código de cuenta ${code} ya está registrado en el catálogo.` };
        }
    } else {
        if (existingCuentas.some(c => c.code === code)) {
            return { valid: false, error: `El código de cuenta ${code} ya está registrado en el catálogo.` };
        }
    }

    return { valid: true };
}

function validarEliminacionCuentaContable(code, existingAsientos) {
    const enUso = existingAsientos.some(as => as.account === code);
    if (enUso) {
        return { valid: false, error: `No se puede eliminar la cuenta ${code} porque tiene asientos contables o facturas asociadas.` };
    }
    return { valid: true };
}

function validarAsientoManual(payload) {
    const { date, concept, cuentaDebe, cuentaHaber, monto } = payload;

    if (!date || !concept || !cuentaDebe || !cuentaHaber || (monto || 0) <= 0) {
        return { valid: false, error: 'Por favor, rellene todos los campos obligatorios.' };
    }

    if (cuentaDebe === cuentaHaber) {
        return { valid: false, error: 'La cuenta de cargo (Debe) y abono (Haber) no pueden ser la misma.' };
    }

    return { valid: true };
}

// ==========================================================================
// 2. SUITE DE PRUEBAS
// ==========================================================================

console.log("=========================================================");
console.log("INICIANDO SUITE DE PRUEBAS DE VALIDACIONES LÓGICAS");
console.log("=========================================================\n");

let pruebasPasadas = 0;
let pruebasFallidas = 0;

function ejecutarPrueba(nombre, fn) {
    try {
        fn();
        console.log(`[OK] ${nombre}`);
        pruebasPasadas++;
    } catch (err) {
        console.error(`[FAIL] ${nombre}`);
        console.error(err);
        pruebasFallidas++;
    }
}

// --- CATEGORÍA 1: RIF / CÉDULA ---
ejecutarPrueba("1. RIF válido de Persona Jurídica", () => {
    assert.strictEqual(validarFormatoRif("J-12345678-9"), true);
});
ejecutarPrueba("2. RIF válido de Persona Natural", () => {
    assert.strictEqual(validarFormatoRif("V-12345678-9"), true);
});
ejecutarPrueba("3. Cédula válida de Persona Natural", () => {
    assert.strictEqual(validarFormatoRif("V-12345678"), true);
});
ejecutarPrueba("4. RIF inválido (sin guiones)", () => {
    assert.strictEqual(validarFormatoRif("J123456789"), false);
});
ejecutarPrueba("5. RIF inválido (letras en número)", () => {
    assert.strictEqual(validarFormatoRif("J-12A45678-9"), false);
});

// --- CATEGORÍA 2: LIBRO DE COMPRAS ---
const configEspecial = { empresaContribuyente: 'especial' };
const configOrdinario = { empresaContribuyente: 'ordinario' };
const comprasBase = [
    { id: 1, contact_id: 10, doc_number: 'FAC-001', doc_type: 'Factura' }
];

ejecutarPrueba("6. Compra válida", () => {
    const payload = {
        date: '2026-06-01', doc_type: 'Factura', doc_number: 'FAC-002', control_number: 'CON-002',
        contact_id: 10, total_amount: 116.00, base_general: 100, tax_general: 16
    };
    const res = validarFacturaCompra(payload, comprasBase, configEspecial);
    assert.strictEqual(res.valid, true);
});

ejecutarPrueba("7. Compra rechazada por campos obligatorios faltantes", () => {
    const payload = {
        date: '', doc_type: 'Factura', doc_number: 'FAC-002', control_number: '',
        contact_id: 10, total_amount: 0
    };
    const res = validarFacturaCompra(payload, comprasBase, configEspecial);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("Completa los campos requeridos"));
});

ejecutarPrueba("8. Compra rechazada por factura duplicada", () => {
    const payload = {
        date: '2026-06-01', doc_type: 'Factura', doc_number: 'FAC-001', control_number: 'CON-001',
        contact_id: 10, total_amount: 116.00
    };
    const res = validarFacturaCompra(payload, comprasBase, configEspecial);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("Ya existe una factura registrada"));
});

ejecutarPrueba("9. Compra rechazada por fecha futura", () => {
    const payload = {
        date: '2030-12-31', doc_type: 'Factura', doc_number: 'FAC-003', control_number: 'CON-003',
        contact_id: 10, total_amount: 116.00
    };
    const res = validarFacturaCompra(payload, comprasBase, configEspecial);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("superior a la fecha actual"));
});

ejecutarPrueba("10. Compra rechazada por fecha de retención anterior a la emisión", () => {
    const payload = {
        date: '2026-06-10', doc_type: 'Factura', doc_number: 'FAC-003', control_number: 'CON-003',
        contact_id: 10, total_amount: 116.00, has_retention: true, retention_date: '2026-06-09'
    };
    const res = validarFacturaCompra(payload, comprasBase, configEspecial);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("anterior a la fecha de emisión"));
});

ejecutarPrueba("11. Compra rechazada por incoherencia en IVA General (Base sin IVA)", () => {
    const payload = {
        date: '2026-06-10', doc_type: 'Factura', doc_number: 'FAC-003', control_number: 'CON-003',
        contact_id: 10, total_amount: 116.00, base_general: 100, tax_general: 0
    };
    const res = validarFacturaCompra(payload, comprasBase, configEspecial);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("Incoherencia en alícuota general"));
});

ejecutarPrueba("12. Compra rechazada por retención de IVA siendo ordinario", () => {
    const payload = {
        date: '2026-06-10', doc_type: 'Factura', doc_number: 'FAC-003', control_number: 'CON-003',
        contact_id: 10, total_amount: 116.00, has_retention: true, retention_date: '2026-06-10'
    };
    const res = validarFacturaCompra(payload, comprasBase, configOrdinario);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("Ordinario. No se permite realizar retenciones"));
});

ejecutarPrueba("13. Nota de crédito rechazada por no seleccionar factura afectada", () => {
    const payload = {
        date: '2026-06-10', doc_type: 'Nota Crédito', doc_number: 'NC-001', control_number: 'CON-003',
        contact_id: 10, total_amount: 50.00, doc_afectado: ''
    };
    const res = validarFacturaCompra(payload, comprasBase, configEspecial);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("Debe seleccionar la Factura Afectada"));
});

ejecutarPrueba("14. Nota de crédito rechazada por factura afectada inexistente", () => {
    const payload = {
        date: '2026-06-10', doc_type: 'Nota Crédito', doc_number: 'NC-001', control_number: 'CON-003',
        contact_id: 10, total_amount: 50.00, doc_afectado: 'FAC-999'
    };
    const res = validarFacturaCompra(payload, comprasBase, configEspecial);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("No se encontró la Factura Afectada"));
});

// --- CATEGORÍA 3: LIBRO DE VENTAS ---
const contactosVenta = [
    { id: 100, name: 'Cliente Especial', especial: 'si' },
    { id: 200, name: 'Cliente Ordinario', especial: 'no' }
];
const ventasBase = [
    { id: 1, contact_id: 100, doc_number: 'FAC-V001', doc_type: 'Factura' }
];

ejecutarPrueba("15. Venta válida con retención (cliente especial)", () => {
    const payload = {
        date: '2026-06-10', doc_type: 'Factura', doc_number: 'FAC-V002', control_number: 'CON-V002',
        contact_id: 100, total_amount: 116.00, base_general: 100, tax_general: 16,
        has_retention: true, retention_date: '2026-06-10'
    };
    const res = validarFacturaVenta(payload, ventasBase, contactosVenta);
    assert.strictEqual(res.valid, true);
});

ejecutarPrueba("16. Venta rechazada por retención de cliente ordinario", () => {
    const payload = {
        date: '2026-06-10', doc_type: 'Factura', doc_number: 'FAC-V003', control_number: 'CON-V003',
        contact_id: 200, total_amount: 116.00, base_general: 100, tax_general: 16,
        has_retention: true, retention_date: '2026-06-10'
    };
    const res = validarFacturaVenta(payload, ventasBase, contactosVenta);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("El cliente seleccionado no es Contribuyente Especial"));
});

// --- CATEGORÍA 4: CONTABILIDAD Y CATÁLOGO DE CUENTAS ---
const cuentasBase = [
    { code: '1.1.01', name: 'Caja Chica' }
];
const asientosBase = [
    { id: 1, account: '1.1.01', debe: 100, haber: 0 }
];

ejecutarPrueba("17. Guardar cuenta válida en catálogo", () => {
    const res = validarCuentaContable('1.1.02', 'Banco Nacional', '', cuentasBase);
    assert.strictEqual(res.valid, true);
});

ejecutarPrueba("18. Rechazar código de cuenta duplicado", () => {
    const res = validarCuentaContable('1.1.01', 'Caja Duplicada', '', cuentasBase);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("ya está registrado"));
});

ejecutarPrueba("19. Rechazar eliminación de cuenta con asientos asociados", () => {
    const res = validarEliminacionCuentaContable('1.1.01', asientosBase);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("No se puede eliminar la cuenta"));
});

ejecutarPrueba("20. Permitir eliminación de cuenta sin asientos", () => {
    const res = validarEliminacionCuentaContable('1.1.02', asientosBase);
    assert.strictEqual(res.valid, true);
});

ejecutarPrueba("21. Asiento manual válido", () => {
    const payload = {
        date: '2026-06-10', concept: 'Apertura de caja',
        cuentaDebe: '1.1.01', cuentaHaber: '1.1.02', monto: 1000
    };
    const res = validarAsientoManual(payload);
    assert.strictEqual(res.valid, true);
});

ejecutarPrueba("22. Asiento manual con la misma cuenta en Debe y Haber", () => {
    const payload = {
        date: '2026-06-10', concept: 'Error de cuenta',
        cuentaDebe: '1.1.01', cuentaHaber: '1.1.01', monto: 1000
    };
    const res = validarAsientoManual(payload);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes("no pueden ser la misma"));
});

// ==========================================================================
// RESUMEN
// ==========================================================================
console.log("\n=========================================================");
console.log("RESUMEN DE PRUEBAS DE VALIDACIÓN:");
console.log(`- Pasadas: ${pruebasPasadas}`);
console.log(`- Fallidas: ${pruebasFallidas}`);
console.log("=========================================================");

if (pruebasFallidas > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
