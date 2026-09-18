// Script de Pruebas Lógicas Contables y Fiscales para Libro Fiscal SENIAT
// Se ejecuta bajo Node.js para validar la exactitud matemática y de negocio

const assert = require('assert');

// --- CÓDIGO EXTRAÍDO Y ADAPTADO DEL SISTEMA ---

function formatearRif(val, tipoDoc = 'RIF') {
    let clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length === 0) return '';
    
    let prefix = clean.charAt(0);
    let numbers = '';
    
    if (/^[VEJGPC]$/.test(prefix)) {
        numbers = clean.slice(1);
    } else {
        prefix = (tipoDoc === 'CEDULA') ? 'V' : 'J';
        numbers = clean;
    }
    
    numbers = numbers.replace(/[^0-9]/g, '');
    
    if (numbers.length === 0) {
        return prefix + '-';
    }
    
    if (tipoDoc === 'CEDULA') {
        return prefix + '-' + numbers.slice(0, 8);
    } else {
        if (numbers.length <= 8) {
            return prefix + '-' + numbers;
        } else {
            let base = numbers.slice(0, 8);
            let verifier = numbers.slice(8, 9);
            return prefix + '-' + base + '-' + verifier;
        }
    }
}

function calcularTotalesCompra({ baseExenta = 0, sinCredito = 0, baseGeneral = 0, baseReducida = 0, baseAdicional = 0, hasRetention = false, retentionPct = 75, customPct = 0 }) {
    // Calcular IVAs redondeando a 2 decimales
    const ivaGen = Math.round(baseGeneral * 0.16 * 100) / 100;
    const ivaRed = Math.round(baseReducida * 0.08 * 100) / 100;
    const ivaAdic = Math.round(baseAdicional * 0.31 * 100) / 100;

    const totalFactura = Math.round((baseExenta + sinCredito + baseGeneral + ivaGen + baseReducida + ivaRed + baseAdicional + ivaAdic) * 100) / 100;
    const totalIva = ivaGen + ivaRed + ivaAdic;

    let retentionAmount = 0;
    if (hasRetention) {
        let pct = retentionPct;
        if (retentionPct === 'otro') pct = customPct;
        retentionAmount = Math.round(totalIva * (pct / 100) * 100) / 100;
    }

    return {
        ivaGeneral: baseGeneral > 0 ? ivaGen : 0,
        ivaReducida: baseReducida > 0 ? ivaRed : 0,
        ivaAdicional: baseAdicional > 0 ? ivaAdic : 0,
        totalIva,
        totalFactura,
        retentionAmount
    };
}

function consolidarForma30({ compras, ventas, ajustesPeriodo, retencionesAnteriores = 0 }) {
    // 1. Débitos Fiscales (Ventas)
    let vExentaBase = 0;
    let vExportBase = 0;
    let vGenBase = 0, vGenTax = 0;
    let vRedBase = 0, vRedTax = 0;
    let vAdicBase = 0, vAdicTax = 0;

    ventas.forEach(v => {
        const factor = v.doc_type === 'Nota Crédito' ? -1 : 1;
        if (v.is_import_export) {
            vExportBase += (v.total_amount || 0) * factor;
        } else {
            vExentaBase += (v.base_exenta || 0) * factor;
            vGenBase += (v.base_general || 0) * factor; vGenTax += (v.tax_general || 0) * factor;
            vRedBase += (v.base_reducida || 0) * factor; vRedTax += (v.tax_reducida || 0) * factor;
            vAdicBase += (v.base_adicional || 0) * factor; vAdicTax += (v.tax_adicional || 0) * factor;
        }
    });

    const vTotalTax = vGenTax + vRedTax + vAdicTax;
    const vTotalFinalTax = Math.max(0, vTotalTax + (ajustesPeriodo.debito_ajuste || 0) - (ajustesPeriodo.debito_exonerado || 0));

    // 2. Créditos Fiscales (Compras)
    let cExentaBase = 0;
    let cImportExentaBase = 0;
    let cGenBase = 0, cGenTax = 0;
    let cImportGenBase = 0, cImportGenTax = 0;
    let cAdicBase = 0, cAdicTax = 0;
    let cImportAdicBase = 0, cImportAdicTax = 0;
    let cRedBase = 0, cRedTax = 0;
    let cImportRedBase = 0, cImportRedTax = 0;

    compras.forEach(c => {
        const factor = c.doc_type === 'Nota Crédito' ? -1 : 1;
        if (c.is_import_export) {
            cImportExentaBase += ((c.base_exenta || 0) + (c.sin_credito || 0)) * factor;
            cImportGenBase += (c.base_general || 0) * factor; cImportGenTax += (c.tax_general || 0) * factor;
            cImportRedBase += (c.base_reducida || 0) * factor; cImportRedTax += (c.tax_reducida || 0) * factor;
            cImportAdicBase += (c.base_adicional || 0) * factor; cImportAdicTax += (c.tax_adicional || 0) * factor;
        } else {
            cExentaBase += ((c.base_exenta || 0) + (c.sin_credito || 0)) * factor;
            cGenBase += (c.base_general || 0) * factor; cGenTax += (c.tax_general || 0) * factor;
            cRedBase += (c.base_reducida || 0) * factor; cRedTax += (c.tax_reducida || 0) * factor;
            cAdicBase += (c.base_adicional || 0) * factor; cAdicTax += (c.tax_adicional || 0) * factor;
        }
    });

    const cTotalTax = cGenTax + cImportGenTax + cRedTax + cImportRedTax + cAdicTax + cImportAdicTax;
    const cTotalFinalTax = Math.max(0, cTotalTax + (ajustesPeriodo.excedente_anterior || 0) + (ajustesPeriodo.credito_ajuste_tax || 0));

    // 3. Autoliquidación
    let totalCuotaTributaria = 0;
    let excedenteMesSiguiente = 0;

    const diff = vTotalFinalTax - cTotalFinalTax;
    if (diff > 0) {
        totalCuotaTributaria = diff;
    } else {
        excedenteMesSiguiente = Math.abs(diff);
    }

    // Retenciones
    const retencionesPeriodoVal = ventas.reduce((acc, curr) => acc + (curr.retention_amount || 0), 0);
    const totalRetencionesVal = retencionesAnteriores + retencionesPeriodoVal;

    const retencionesDescontadasVal = Math.min(totalCuotaTributaria, totalRetencionesVal);
    const saldoRetencionesNoAplicadoVal = totalRetencionesVal - retencionesDescontadasVal;

    const subtotalDespuesRetencionesVal = totalCuotaTributaria - retencionesDescontadasVal;

    // Percepciones
    const percepcionesAduanaCompras = compras.reduce((acc, curr) => acc + (curr.iva_percibido_aduana || 0), 0);
    const percepcionesCompradorVentas = ventas.reduce((acc, curr) => acc + (curr.iva_percibido_comprador || 0), 0);
    const totalPercepcionesVal = percepcionesAduanaCompras + percepcionesCompradorVentas;

    const percepcionesDescontadasVal = Math.min(subtotalDespuesRetencionesVal, totalPercepcionesVal);
    const totalPagarFinalVal = subtotalDespuesRetencionesVal - percepcionesDescontadasVal;

    return {
        totalDebito: vTotalFinalTax,
        totalCredito: cTotalFinalTax,
        cuotaTributaria: totalCuotaTributaria,
        excedenteSiguiente: excedenteMesSiguiente,
        retencionesDescontadas: retencionesDescontadasVal,
        retencionesSobrantes: saldoRetencionesNoAplicadoVal,
        totalPagarFinal: totalPagarFinalVal
    };
}

// --- SUITE DE PRUEBAS ---

console.log("=========================================================");
console.log("INICIANDO SUITE DE PRUEBAS LÓGICAS - LIBRO FISCAL SENIAT");
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

// 1. Pruebas de Contribuyentes (R.I.F.)
ejecutarPrueba("CONT-01: Sintaxis R.I.F. Persona Jurídica", () => {
    assert.strictEqual(formatearRif("j123456789"), "J-12345678-9");
    assert.strictEqual(formatearRif("j-12345678-9"), "J-12345678-9");
});

ejecutarPrueba("CONT-01: Sintaxis R.I.F. Persona Natural", () => {
    assert.strictEqual(formatearRif("V-15678901-2"), "V-15678901-2");
    assert.strictEqual(formatearRif("v156789012"), "V-15678901-2");
});

ejecutarPrueba("CONT-01: Formato Cédula", () => {
    assert.strictEqual(formatearRif("15678901", "CEDULA"), "V-15678901");
});

// 2. Pruebas de Compras e IVA
ejecutarPrueba("COMP-01: Consistencia matemática de totales", () => {
    const res = calcularTotalesCompra({ baseGeneral: 100 });
    assert.strictEqual(res.ivaGeneral, 16.00);
    assert.strictEqual(res.totalFactura, 116.00);
});

ejecutarPrueba("COMP-02: Múltiples alícuotas", () => {
    const res = calcularTotalesCompra({
        baseExenta: 200,
        baseGeneral: 1000,
        baseReducida: 500
    });
    // IVA Gen = 160.00, IVA Red = 40.00
    assert.strictEqual(res.ivaGeneral, 160.00);
    assert.strictEqual(res.ivaReducida, 40.00);
    assert.strictEqual(res.totalFactura, 1900.00);
});

ejecutarPrueba("COMP-03: Retención del 75%", () => {
    const res = calcularTotalesCompra({
        baseGeneral: 1000,
        hasRetention: true,
        retentionPct: 75
    });
    // Total IVA = 160. Retención = 120.
    assert.strictEqual(res.retentionAmount, 120.00);
});

ejecutarPrueba("COMP-04: Retención del 100%", () => {
    const res = calcularTotalesCompra({
        baseGeneral: 1000,
        hasRetention: true,
        retentionPct: 100
    });
    // Total IVA = 160. Retención = 160.
    assert.strictEqual(res.retentionAmount, 160.00);
});

// 3. Pruebas de Declaración de IVA (Forma 30)
ejecutarPrueba("F30-01: Excedente de Crédito Fiscal", () => {
    const ventas = [{ base_general: 6250, tax_general: 1000, total_amount: 7250, doc_type: 'Factura' }]; // IVA Débito = 1000
    const compras = [{ base_general: 9375, tax_general: 1500, total_amount: 10875, doc_type: 'Factura' }]; // IVA Crédito = 1500
    
    const f30 = consolidarForma30({
        compras,
        ventas,
        ajustesPeriodo: {}
    });

    assert.strictEqual(f30.totalDebito, 1000);
    assert.strictEqual(f30.totalCredito, 1500);
    assert.strictEqual(f30.cuotaTributaria, 0);
    assert.strictEqual(f30.excedenteSiguiente, 500);
});

ejecutarPrueba("F30-02: Consumo de excedente anterior e impuesto a pagar", () => {
    const ventas = [{ base_general: 12500, tax_general: 2000, total_amount: 14500, doc_type: 'Factura' }]; // IVA Débito = 2000
    const compras = [{ base_general: 6250, tax_general: 1000, total_amount: 7250, doc_type: 'Factura' }]; // IVA Crédito = 1000
    
    const f30 = consolidarForma30({
        compras,
        ventas,
        ajustesPeriodo: { excedente_anterior: 600 }
    });

    // Crédito final = 1000 + 600 = 1600.
    // Cuota = 2000 - 1600 = 400.
    assert.strictEqual(f30.totalDebito, 2000);
    assert.strictEqual(f30.totalCredito, 1600);
    assert.strictEqual(f30.cuotaTributaria, 400);
    assert.strictEqual(f30.excedenteSiguiente, 0);
    assert.strictEqual(f30.totalPagarFinal, 400);
});

ejecutarPrueba("F30-03: Compensación con retenciones", () => {
    const ventas = [
        { base_general: 12500, tax_general: 2000, total_amount: 14500, doc_type: 'Factura', retention_amount: 600 } // Retención periodo = 600
    ];
    const compras = [];
    
    const f30 = consolidarForma30({
        compras,
        ventas,
        ajustesPeriodo: {},
        retencionesAnteriores: 1000 // Retenciones acumuladas = 1000
    });

    // Cuota tributaria = 2000. Total Retenciones = 1600.
    // Descontadas = 1600. Pagar = 400. Sobrantes = 0.
    assert.strictEqual(f30.cuotaTributaria, 2000);
    assert.strictEqual(f30.retencionesDescontadas, 1600);
    assert.strictEqual(f30.retencionesSobrantes, 0);
    assert.strictEqual(f30.totalPagarFinal, 400);
});

console.log("\n=========================================================");
console.log("RESUMEN DE RESULTADOS DE PRUEBAS:");
console.log(`- Pruebas Pasadas: ${pruebasPasadas}`);
console.log(`- Pruebas Fallidas: ${pruebasFallidas}`);
console.log("=========================================================");
if (pruebasFallidas > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
