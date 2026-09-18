/**
 * ==========================================================================
 * LOGICA DE NEGOCIO: LIBRO FISCAL Y DECLARACIÓN FORMA 30 SENIAT (VENEZUELA)
 * ==========================================================================
 */

// Estado Inicial y Estructura de Datos para Venezuela (v4)
let state = {
    activeBeneficiaryId: null,
    beneficiarios: [],
    compras: [],
    ventas: [],
    contactos: [],
    articulos: [],
    movimientos: [],
    asientos_manuales: [],
    cuentas_contables: [],
    balances_guardados: [],
    config: {
        ivaRate: 16, // Alícuota general estándar actual
        theme: 'dark',
        empresaName: 'Mi Empresa C.A.',
        empresaRut: 'J-12345678-9',
        empresaContribuyente: 'especial', // 'especial' o 'ordinario'
        retencionesAnteriores: 0 // Retenciones acumuladas de periodos anteriores
    }
};

// Clave única para persistencia
const STORAGE_KEY = 'libro_compras_ventas_data_v4';

// Catálogo de Cuentas Contables por defecto (SENIAT Venezuela)
const CUENTAS_CATALOGO = {
    '1.1.01': 'Caja y Bancos',
    '1.1.02': 'Cuentas por Cobrar',
    '1.1.03': 'Retenciones de IVA por Cobrar',
    '1.1.04': 'Crédito Fiscal IVA',
    '1.1.05': 'Caja Chica',
    '1.1.06': 'Inventario de Mercancías',
    '2.1.01': 'Cuentas por Pagar',
    '2.1.02': 'Retenciones de IVA por Pagar',
    '2.1.03': 'Débito Fiscal IVA',
    '3.1.01': 'Capital Social',
    '4.1.01': 'Ingresos por Ventas',
    '5.1.01': 'Gastos de Operación / Compras',
    '5.1.02': 'Gastos no Deducibles',
    '5.1.03': 'Costo de Ventas'
};

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async () => {
    await inicializarDatos();
    configurarEventos();
    renderAll();
});

// --- PERSISTENCIA Y ESTADO ---

function getActiveBeneficiary() {
    if (!state.beneficiarios) state.beneficiarios = [];
    return state.beneficiarios.find(b => b.id === state.activeBeneficiaryId) || state.beneficiarios[0];
}

function syncBeneficiarioActivo() {
    if (!state.beneficiarios) state.beneficiarios = [];
    if (state.activeBeneficiaryId === null && state.beneficiarios.length > 0) {
        state.activeBeneficiaryId = state.beneficiarios[0].id;
    }
    const active = state.beneficiarios.find(b => b.id === state.activeBeneficiaryId);
    if (active) {
        active.compras = state.compras || [];
        active.ventas = state.ventas || [];
        active.contactos = state.contactos || [];
        active.articulos = state.articulos || [];
        active.movimientos = state.movimientos || [];
        active.asientos_manuales = state.asientos_manuales || [];
        active.cuentas_contables = state.cuentas_contables || [];
        active.balances_guardados = state.balances_guardados || [];
    }
}

function seleccionarBeneficiario(id) {
    // Sincronizar datos del beneficiario actual antes de cambiar
    syncBeneficiarioActivo();
    
    state.activeBeneficiaryId = id;
    const active = state.beneficiarios.find(b => b.id === id);
    if (active) {
        state.compras = active.compras || [];
        state.ventas = active.ventas || [];
        state.contactos = active.contactos || [];
        state.articulos = active.articulos || [];
        state.movimientos = active.movimientos || [];
        state.asientos_manuales = active.asientos_manuales || [];
        state.cuentas_contables = active.cuentas_contables || [];
        state.balances_guardados = active.balances_guardados || [];

        state.config.empresaName = active.name;
        state.config.empresaRut = active.tax_id;
        state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
        state.config.retencionesAnteriores = active.retencionesAnteriores || 0;
    }
    guardarDatos();
    renderAll();
    
    // Forzar actualización de reportes si estamos en la vista de reportes
    const activeTab = document.querySelector('.nav-item.active');
    if (activeTab && activeTab.getAttribute('data-section') === 'reportes') {
        generarForma30SENIAT();
    }
}

async function inicializarDatos() {
    let cargadoSQLite = false;
    try {
        let data;
        if (window.electronAPI) {
            data = await window.electronAPI.loadData();
        } else {
            const res = await fetch('api.php?action=load');
            if (res.ok) {
                data = await res.json();
            }
        }

        if (data && data.beneficiarios) {
            state = data;
            
            // Si la base de datos de SQLite está completamente vacía (limpia), inicializar una por defecto
            if (state.beneficiarios.length === 0) {
                const defaultBeneficiary = {
                    id: Date.now(),
                    name: 'Nueva Empresa S.A.',
                    tax_id: 'J-00000000-0',
                    especial: 'no',
                    retencionesAnteriores: 0,
                    compras: [],
                    ventas: [],
                    contactos: [],
                    articulos: [],
                    movimientos: [],
                    asientos_manuales: [],
                    balances_guardados: [],
                    cuentas_contables: Object.keys(CUENTAS_CATALOGO).map(code => ({
                        code: code,
                        name: CUENTAS_CATALOGO[code]
                    }))
                };
                state.beneficiarios = [defaultBeneficiary];
                state.activeBeneficiaryId = defaultBeneficiary.id;
            }
            
            // Asegurar integridad de nodos de configuración global
            if (!state.config) {
                state.config = {
                    ivaRate: 16,
                    theme: 'dark'
                };
            }
            if (!state.config.ivaRate) state.config.ivaRate = 16;
            if (!state.config.theme) state.config.theme = 'dark';
            
            // Asegurar que activeBeneficiaryId sea válido
            if (!state.activeBeneficiaryId || !state.beneficiarios.find(b => b.id === state.activeBeneficiaryId)) {
                state.activeBeneficiaryId = state.beneficiarios[0].id;
            }
            
            // Montar los datos del beneficiario activo
            const active = state.beneficiarios.find(b => b.id === state.activeBeneficiaryId);
            state.compras = active.compras || [];
            state.ventas = active.ventas || [];
            state.contactos = active.contactos || [];
            state.articulos = active.articulos || [];
            state.movimientos = active.movimientos || [];
            state.asientos_manuales = active.asientos_manuales || [];
            state.cuentas_contables = active.cuentas_contables || [];
            state.balances_guardados = active.balances_guardados || [];
            
            // Migrar catálogo: añadir cuentas nuevas del catálogo si faltan en el beneficiario (migración no destructiva)
            if (!Array.isArray(state.cuentas_contables)) state.cuentas_contables = [];
            const codigosExistentes = new Set(state.cuentas_contables.map(c => c.code));
            let cuentasMigradas = false;
            Object.keys(CUENTAS_CATALOGO).forEach(code => {
                if (!codigosExistentes.has(code)) {
                    state.cuentas_contables.push({ code, name: CUENTAS_CATALOGO[code] });
                    cuentasMigradas = true;
                }
            });
            if (cuentasMigradas) {
                active.cuentas_contables = [...state.cuentas_contables];
            }

            state.config.empresaName = active.name;
            state.config.empresaRut = active.tax_id;
            state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
            state.config.retencionesAnteriores = active.retencionesAnteriores || 0;
            
            // Sincronizar respaldo en localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            cargadoSQLite = true;
            actualizarIndicadorBaseDatos(true, window.electronAPI ? 'Electron (SQLite)' : 'SQLite Local');
            mostrarNotificacion(window.electronAPI ? 'Datos cargados vía Electron SQLite.' : 'Datos cargados de base de datos SQLite.', 'success');
        }
    } catch (e) {
        console.warn('Backend SQLite no disponible. Cargando desde almacenamiento local del navegador.', e);
    }

    if (!cargadoSQLite) {
        inicializarDatosDesdeLocalStorage();
    }

    // Aplicar Tema
    document.documentElement.setAttribute('data-theme', state.config.theme || 'dark');
}

function inicializarDatosDesdeLocalStorage() {
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        try {
            state = JSON.parse(localData);
            
            // Migración desde formato de base de datos antiguo (sin beneficiarios)
            if (!state.beneficiarios) {
                const oldBeneficiary = {
                    id: Date.now(),
                    name: (state.config && state.config.empresaName) || 'Mi Empresa C.A.',
                    tax_id: (state.config && state.config.empresaRut) || 'J-12345678-9',
                    especial: (state.config && state.config.empresaContribuyente === 'especial') ? 'si' : 'no',
                    retencionesAnteriores: (state.config && state.config.retencionesAnteriores) || 0,
                    compras: state.compras || [],
                    ventas: state.ventas || [],
                    contactos: state.contactos || [],
                    articulos: state.articulos || [],
                    movimientos: state.movimientos || []
                };
                state.beneficiarios = [oldBeneficiary];
                state.activeBeneficiaryId = oldBeneficiary.id;
                
                // Limpiar variables del raíz
                delete state.compras;
                delete state.ventas;
                delete state.contactos;
                delete state.articulos;
                delete state.movimientos;
            }
            
            // Asegurar integridad de nodos de configuración global
            if (!state.config) {
                state.config = {
                    ivaRate: 16,
                    theme: 'dark'
                };
            }
            if (!state.config.ivaRate) state.config.ivaRate = 16;
            if (!state.config.theme) state.config.theme = 'dark';
            
            if (state.beneficiarios.length === 0) {
                cargarDatosDemoVenezuela();
            } else {
                // Asegurar que activeBeneficiaryId sea válido
                if (!state.activeBeneficiaryId || !state.beneficiarios.find(b => b.id === state.activeBeneficiaryId)) {
                    state.activeBeneficiaryId = state.beneficiarios[0].id;
                }
                
                // Montar los datos del beneficiario activo
                const active = state.beneficiarios.find(b => b.id === state.activeBeneficiaryId);
                state.compras = active.compras || [];
                state.ventas = active.ventas || [];
                state.contactos = active.contactos || [];
                state.articulos = active.articulos || [];
                state.movimientos = active.movimientos || [];
                state.asientos_manuales = active.asientos_manuales || [];
                state.cuentas_contables = active.cuentas_contables || [];
                state.balances_guardados = active.balances_guardados || [];
                
                // Migrar catálogo: añadir cuentas nuevas si faltan (migración no destructiva para actualizaciones)
                if (!Array.isArray(state.cuentas_contables)) state.cuentas_contables = [];
                const codigosExistentesLS = new Set(state.cuentas_contables.map(c => c.code));
                let cuentasMigradasLS = false;
                Object.keys(CUENTAS_CATALOGO).forEach(code => {
                    if (!codigosExistentesLS.has(code)) {
                        state.cuentas_contables.push({ code, name: CUENTAS_CATALOGO[code] });
                        cuentasMigradasLS = true;
                    }
                });
                if (cuentasMigradasLS) {
                    active.cuentas_contables = [...state.cuentas_contables];
                    setTimeout(() => { guardarDatos(); }, 100);
                }
                
                state.config.empresaName = active.name;
                state.config.empresaRut = active.tax_id;
                state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
                state.config.retencionesAnteriores = active.retencionesAnteriores || 0;
            }
            actualizarIndicadorBaseDatos(false);
            mostrarNotificacion('Datos cargados de almacenamiento LocalStorage.', 'info');
        } catch (e) {
            console.error('Error parseando datos fiscales locales, cargando vacíos', e);
            cargarEstadoVacio();
        }
    } else {
        cargarDatosDemoVenezuela();
        mostrarNotificacion('Datos de prueba venezolanos cargados.', 'success');
    }
}

async function guardarDatos() {
    syncBeneficiarioActivo();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    actualizarIndicadorBaseDatos(false);
    
    // Guardar en la base de datos SQLite
    try {
        if (window.electronAPI) {
            const res = await window.electronAPI.saveData(state);
            if (res && res.success) {
                actualizarIndicadorBaseDatos(true, 'Electron (SQLite)');
            }
        } else {
            const response = await fetch('api.php?action=save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(state)
            });
            if (response.ok) {
                const res = await response.json();
                if (res.success) {
                    actualizarIndicadorBaseDatos(true, 'SQLite Local');
                }
            }
        }
    } catch (e) {
        console.warn('No se pudo guardar en la base de datos SQLite. Se mantiene guardado local en el navegador.', e);
    }
}

function cargarEstadoVacio() {
    const defaultBeneficiary = {
        id: Date.now(),
        name: 'Nueva Empresa S.A.',
        tax_id: 'J-00000000-0',
        especial: 'no',
        retencionesAnteriores: 0,
        compras: [],
        ventas: [],
        contactos: [],
        articulos: [],
        movimientos: [],
        asientos_manuales: [],
        balances_guardados: [],
        cuentas_contables: Object.keys(CUENTAS_CATALOGO).map(code => ({
            code: code,
            name: CUENTAS_CATALOGO[code]
        }))
    };
    
    state = {
        activeBeneficiaryId: defaultBeneficiary.id,
        beneficiarios: [defaultBeneficiary],
        config: {
            ivaRate: 16,
            theme: 'dark'
        }
    };
    
    // Montar variables de estado activo
    state.compras = defaultBeneficiary.compras;
    state.ventas = defaultBeneficiary.ventas;
    state.contactos = defaultBeneficiary.contactos;
    state.articulos = defaultBeneficiary.articulos;
    state.movimientos = defaultBeneficiary.movimientos;
    state.asientos_manuales = defaultBeneficiary.asientos_manuales;
    state.cuentas_contables = defaultBeneficiary.cuentas_contables;
    state.balances_guardados = defaultBeneficiary.balances_guardados;
    state.config.empresaName = defaultBeneficiary.name;
    state.config.empresaRut = defaultBeneficiary.tax_id;
    state.config.empresaContribuyente = defaultBeneficiary.especial === 'si' ? 'especial' : 'ordinario';
    state.config.retencionesAnteriores = defaultBeneficiary.retencionesAnteriores;
    
    guardarDatos();
}

function cargarDatosDemoVenezuela() {
    state.config = {
        ivaRate: 16,
        theme: 'dark',
        empresaName: 'Corporación Inversiones del Caribe C.A.',
        empresaRut: 'J-30567890-1',
        empresaContribuyente: 'especial',
        retencionesAnteriores: 2450.50
    };

    // Proveedores y Clientes con R.I.F. venezolano
    state.contactos = [
        { id: 1, tax_id: 'J-00123456-7', name: 'Compañía Anónima Nacional Teléfonos de Venezuela (CANTV)', type: 'proveedor', especial: 'si', email: 'facturacion@cantv.com.ve', phone: '0212-5001111', address: 'Av. Libertador, Edif. Administrativo CANTV, Caracas' },
        { id: 2, tax_id: 'J-31405020-0', name: 'Distribuidora Mayorista Alimentos de Oriente C.A.', type: 'proveedor', especial: 'no', email: 'ventas@alioriente.com', phone: '0281-2824050', address: 'Zona Industrial Los Montones, Barcelona' },
        { id: 3, tax_id: 'J-40987654-3', name: 'Corporación Siderúrgica Alfa C.A. (Cliente Especial)', type: 'cliente', especial: 'si', email: 'adquisiciones@corp-alfa.com.ve', phone: '0286-9614030', address: 'Av. Norte-Sur 3, Zona Industrial Matanzas, Puerto Ordaz' },
        { id: 4, tax_id: 'V-15678901-2', name: 'Pedro José Rodríguez (Cliente General)', type: 'cliente', especial: 'no', email: 'pedro.rodriguez@gmail.com', phone: '0414-8023145', address: 'Urb. Lechería, Av. Principal, Casa N° 12, Lechería' },
        { id: 5, tax_id: 'J-30456789-0', name: 'Importaciones y Tecnología del Norte C.A.', type: 'proveedor', especial: 'no', email: 'ventas@importnorte.com', phone: '0241-8321040', address: 'C.C. Free Market, Local 45, Valencia' },
        { id: 6, tax_id: 'J-32104050-6', name: 'Comercializadora Agropecuaria Los Llanos C.A.', type: 'cliente', especial: 'si', email: 'finanzas@agro-llanos.com', phone: '0246-4312233', address: 'Calle Páez, Local 4, San Juan de los Morros' }
    ];

    const hoy = new Date();
    const mesActual = hoy.toISOString().substring(0, 7); // YYYY-MM
    const mesAnteriorDate = new Date();
    mesAnteriorDate.setMonth(hoy.getMonth() - 1);
    const mesAnterior = mesAnteriorDate.toISOString().substring(0, 7);

    // Registro de compras con alícuotas y retenciones
    state.compras = [
        {
            id: 1, type: 'compra', date: `${mesAnterior}-05`, doc_type: 'Factura', doc_number: '10984', control_number: '00-023456', contact_id: 1,
            is_import_export: false,
            base_exenta: 0, base_general: 12000, tax_general: 1920, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 12000, tax_amount: 1920, total_amount: 13920,
            has_retention: true, retention_pct: 75, retention_amount: 1440, retention_number: '2026040001', retention_date: `${mesAnterior}-05`,
            status: 'Pagado', notes: 'Servicio de telefonía e internet'
        },
        {
            id: 2, type: 'compra', date: `${mesAnterior}-18`, doc_type: 'Factura', doc_number: '8902', control_number: '00-410293', contact_id: 2,
            is_import_export: false,
            base_exenta: 3500, base_general: 25000, tax_general: 4000, base_reducida: 5000, tax_reducida: 400, base_adicional: 0, tax_adicional: 0,
            net_amount: 30000, tax_amount: 4400, total_amount: 37900,
            has_retention: true, retention_pct: 75, retention_amount: 3300, retention_number: '2026040002', retention_date: `${mesAnterior}-18`,
            status: 'Pagado', notes: 'Compra de productos de consumo masivo'
        },
        {
            id: 3, type: 'compra', date: `${mesActual}-03`, doc_type: 'Factura', doc_number: '4390', control_number: '00-019483', contact_id: 5,
            is_import_export: true, // Importación
            base_exenta: 0, base_general: 45000, tax_general: 7200, base_reducida: 0, tax_reducida: 0, base_adicional: 10000, tax_adicional: 3100,
            net_amount: 55000, tax_amount: 10300, total_amount: 65300,
            has_retention: false, retention_pct: 75, retention_amount: 0, retention_number: '', retention_date: '',
            status: 'Pagado', notes: 'Importación de equipos de computación y lujo'
        },
        {
            id: 4, type: 'compra', date: `${mesActual}-10`, doc_type: 'Factura', doc_number: '11005', control_number: '00-023477', contact_id: 1,
            is_import_export: false,
            base_exenta: 0, base_general: 15000, tax_general: 2400, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 15000, tax_amount: 2400, total_amount: 17400,
            has_retention: true, retention_pct: 75, retention_amount: 1800, retention_number: '2026050001', retention_date: `${mesActual}-10`,
            status: 'Pagado', notes: 'Servicio de internet mes actual'
        },
        {
            id: 5, type: 'compra', date: `${mesActual}-18`, doc_type: 'Factura', doc_number: '9211', control_number: '00-410889', contact_id: 2,
            is_import_export: false,
            base_exenta: 2000, base_general: 18000, tax_general: 2880, base_reducida: 4000, tax_reducida: 320, base_adicional: 0, tax_adicional: 0,
            net_amount: 22000, tax_amount: 3200, total_amount: 27200,
            has_retention: true, retention_pct: 75, retention_amount: 2400, retention_number: '2026050002', retention_date: `${mesActual}-18`,
            status: 'Pendiente', notes: 'Compra de provisiones mayoristas'
        }
    ];

    // Registro de ventas con alícuotas y retenciones recibidas de clientes contribuyentes especiales
    state.ventas = [
        {
            id: 1, type: 'venta', date: `${mesAnterior}-08`, doc_type: 'Factura', doc_number: '00201', control_number: '00-000101', contact_id: 3,
            is_import_export: false,
            base_exenta: 0, base_general: 80000, tax_general: 12800, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 80000, tax_amount: 12800, total_amount: 92800,
            has_retention: true, retention_pct: 75, retention_amount: 9600, retention_number: 'RET-2026-0043', retention_date: `${mesAnterior}-10`,
            status: 'Pagado', notes: 'Distribución de repuestos metalúrgicos'
        },
        {
            id: 2, type: 'venta', date: `${mesAnterior}-22`, doc_type: 'Factura', doc_number: '00202', control_number: '00-000102', contact_id: 4,
            is_import_export: false,
            base_exenta: 1000, base_general: 15000, tax_general: 2400, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 15000, tax_amount: 2400, total_amount: 18400,
            has_retention: false, retention_pct: 75, retention_amount: 0, retention_number: '', retention_date: '',
            status: 'Pagado', notes: 'Venta a persona natural'
        },
        {
            id: 3, type: 'venta', date: `${mesActual}-04`, doc_type: 'Factura', doc_number: '00203', control_number: '00-000103', contact_id: 3,
            is_import_export: false,
            base_exenta: 0, base_general: 95000, tax_general: 15200, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 95000, tax_amount: 15200, total_amount: 110200,
            has_retention: true, retention_pct: 75, retention_amount: 11400, retention_number: 'RET-2026-0089', retention_date: `${mesActual}-06`,
            status: 'Pagado', notes: 'Entrega de material de construcción estructural'
        },
        {
            id: 4, type: 'venta', date: `${mesActual}-12`, doc_type: 'Factura', doc_number: '00204', control_number: '00-000104', contact_id: 6,
            is_import_export: false,
            base_exenta: 5000, base_general: 60000, tax_general: 9600, base_reducida: 12000, tax_reducida: 960, base_adicional: 0, tax_adicional: 0,
            net_amount: 72000, tax_amount: 10560, total_amount: 87560,
            has_retention: true, retention_pct: 75, retention_amount: 7920, retention_number: 'RET-AGRO-8820', retention_date: `${mesActual}-14`,
            status: 'Pagado', notes: 'Despacho agroindustrial'
        },
        {
            id: 5, type: 'venta', date: `${mesActual}-19`, doc_type: 'Factura', doc_number: '00205', control_number: '00-000105', contact_id: 4,
            is_import_export: false,
            base_exenta: 0, base_general: 18000, tax_general: 2880, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 18000, tax_amount: 2880, total_amount: 20880,
            has_retention: false, retention_pct: 75, retention_amount: 0, retention_number: '', retention_date: '',
            status: 'Pagado', notes: 'Venta de insumos menores'
        }
    ];

    // Materiales de Inventario de demostración
    state.articulos = [
        { id: 1, code: 'MAT-101', description: 'Lámina de Acero Galvanizado 2.0mm', unit: 'Metro', initial_stock: 50, initial_cost: 120.00 },
        { id: 2, code: 'MAT-102', description: 'Perfil Tubular Estructural 2x1"', unit: 'Unidad', initial_stock: 120, initial_cost: 75.00 },
        { id: 3, code: 'MAT-103', description: 'Cemento Gris Portland Tipo I', unit: 'Saco', initial_stock: 200, initial_cost: 45.00 }
    ];

    // Movimientos de Inventario de demostración (Entrada y Salida)
    state.movimientos = [
        { id: 1, article_id: 1, date: `${mesAnterior}-05`, type: 'Entrada', doc_type: 'Factura', doc_number: '10984', qty: 20, unit_cost: 125.00, total_cost: 2500.00, notes: 'Ingreso por compra al proveedor CANTV' },
        { id: 2, article_id: 1, date: `${mesAnterior}-12`, type: 'Salida', doc_type: 'Nota de Entrega', doc_number: 'NE-0051', qty: 15, unit_cost: 120.00, total_cost: 1800.00, notes: 'Despacho de material para obra en Lechería' },
        { id: 3, article_id: 2, date: `${mesAnterior}-18`, type: 'Entrada', doc_type: 'Factura', doc_number: '8902', qty: 50, unit_cost: 78.00, total_cost: 3900.00, notes: 'Compra lote de perfiles a Alimentos Oriente' },
        { id: 4, article_id: 2, date: `${mesActual}-04`, type: 'Salida', doc_type: 'Factura', doc_number: '00203', qty: 30, unit_cost: 75.88, total_cost: 2276.40, notes: 'Venta material estructural a Corporación Alfa' },
        { id: 5, article_id: 3, date: `${mesActual}-08`, type: 'Ajuste-', doc_type: 'Ajuste Interno', doc_number: 'AJ-0012', qty: 5, unit_cost: 45.00, total_cost: 225.00, notes: 'Merma por rotura de sacos de cemento en almacén' }
    ];

    // Estructurar en state.beneficiarios
    const demoBeneficiary = {
        id: 1,
        name: state.config.empresaName,
        tax_id: state.config.empresaRut,
        especial: state.config.empresaContribuyente === 'especial' ? 'si' : 'no',
        retencionesAnteriores: state.config.retencionesAnteriores,
        compras: state.compras || [],
        ventas: state.ventas || [],
        contactos: state.contactos || [],
        articulos: state.articulos || [],
        movimientos: state.movimientos || [],
        asientos_manuales: [],
        balances_guardados: [],
        cuentas_contables: Object.keys(CUENTAS_CATALOGO).map(code => ({
            code: code,
            name: CUENTAS_CATALOGO[code]
        }))
    };
    
    state.beneficiarios = [demoBeneficiary];
    state.activeBeneficiaryId = demoBeneficiary.id;
    
    // Limpiar variables a nivel de raíz
    state.config = {
        ivaRate: 16,
        theme: state.config.theme || 'dark'
    };
    
    // Volver a montar
    state.compras = demoBeneficiary.compras;
    state.ventas = demoBeneficiary.ventas;
    state.contactos = demoBeneficiary.contactos;
    state.articulos = demoBeneficiary.articulos;
    state.movimientos = demoBeneficiary.movimientos;
    state.asientos_manuales = demoBeneficiary.asientos_manuales;
    state.cuentas_contables = demoBeneficiary.cuentas_contables;
    state.balances_guardados = demoBeneficiary.balances_guardados;
    state.config.empresaName = demoBeneficiary.name;
    state.config.empresaRut = demoBeneficiary.tax_id;
    state.config.empresaContribuyente = demoBeneficiary.especial === 'si' ? 'especial' : 'ordinario';
    state.config.retencionesAnteriores = demoBeneficiary.retencionesAnteriores;

    guardarDatos();
}

// --- EVENTOS Y TRIGGERS CONTABLES ---

function configurarEventos() {
    let isAutofillingCompra = false;
    let isAutofillingVenta = false;
    // Formateadores automáticos de R.I.F. / Cédula Venezolana
    const inputContactoTax = document.getElementById('contacto-tax-id');
    const inputBeneficiarioTax = document.getElementById('beneficiario-tax-id');
    const selectContacto = document.getElementById('contacto-documento-tipo');
    const selectBeneficiario = document.getElementById('beneficiario-documento-tipo');

    if (inputContactoTax) {
        inputContactoTax.addEventListener('input', aplicarFormatoRif);
        inputContactoTax.addEventListener('blur', aplicarFormatoRif);
    }
    if (inputBeneficiarioTax) {
        inputBeneficiarioTax.addEventListener('input', aplicarFormatoRif);
        inputBeneficiarioTax.addEventListener('blur', aplicarFormatoRif);
    }
    if (selectContacto) {
        selectContacto.addEventListener('change', () => {
            const input = document.getElementById('contacto-tax-id');
            if (input) {
                input.value = formatearRif(input.value, selectContacto.value);
            }
        });
    }
    if (selectBeneficiario) {
        selectBeneficiario.addEventListener('change', () => {
            const input = document.getElementById('beneficiario-tax-id');
            if (input) {
                input.value = formatearRif(input.value, selectBeneficiario.value);
            }
        });
    }

    // Navegación Sidebar (SPA tabs)
    document.querySelectorAll('.nav-item button').forEach(button => {
        button.addEventListener('click', (e) => {
            const parent = button.parentElement;
            const targetSection = parent.getAttribute('data-section');
            
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            parent.classList.add('active');
            
            document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
            document.getElementById(`${targetSection}-section`).classList.add('active');
            
            document.querySelector('.sidebar').classList.remove('active');

            // Actualizar títulos en el encabezado
            const headerTitle = document.getElementById('header-section-title');
            const headerSubtitle = document.getElementById('header-section-subtitle');
            
            if (targetSection === 'dashboard') {
                headerTitle.innerText = 'Contabilidad SENIAT';
                headerSubtitle.innerText = 'Libros Fiscales y Consolidado de IVA para Forma 30';
                renderGraficos();
            } else if (targetSection === 'compras') {
                headerTitle.innerText = 'Libro de Compras';
                headerSubtitle.innerText = 'Registro y Control de Compras Nacionales e Importaciones';
            } else if (targetSection === 'ventas') {
                headerTitle.innerText = 'Libro de Ventas';
                headerSubtitle.innerText = 'Registro y Control de Ventas Nacionales y Exportaciones';
            } else if (targetSection === 'contactos') {
                headerTitle.innerText = 'Clientes / Proveedores';
                headerSubtitle.innerText = 'Directorio Fiscal y R.I.F. de Terceros';
            } else if (targetSection === 'reportes') {
                headerTitle.innerText = 'Declaración del IVA (Forma 30)';
                headerSubtitle.innerText = 'Mapeo oficial de casillas para la declaración fiscal quincenal/mensual';
                generarForma30SENIAT();
            } else if (targetSection === 'beneficiarios') {
                headerTitle.innerText = 'Beneficiarios / Empresas';
                headerSubtitle.innerText = 'Gestión de Entidades Fiscales Registradas';
                renderTablaBeneficiarios();
            } else if (targetSection === 'inventario') {
                headerTitle.innerText = 'Libro de Control de Inventario';
                headerSubtitle.innerText = 'Movimiento de Entrada y Salida de Materiales y Mercancías';
                renderInventario();
            } else if (targetSection === 'diario') {
                headerTitle.innerText = 'Libro Diario Contable';
                headerSubtitle.innerText = 'Asientos contables ordenados cronológicamente por partida doble';
                renderLibroDiario();
            } else if (targetSection === 'mayor') {
                headerTitle.innerText = 'Libro Mayor Contable';
                headerSubtitle.innerText = 'Movimientos y saldo progresivo por cuenta contable';
                renderLibroMayor();
            } else if (targetSection === 'configuracion') {
                headerTitle.innerText = 'Configuraciones Contables';
                headerSubtitle.innerText = 'Perfil corporativo, mantenimiento de datos y copias de seguridad';
            } else if (targetSection === 'balances') {
                headerTitle.innerText = 'Libro de Inventario y Balances';
                headerSubtitle.innerText = 'Bloques de Inventario Inicial y Cierre de Ejercicio según el SENIAT';
                cargarHistoricoBalancesSelect();
                cargarBloqueSeleccionado();
            }
        });
    });

    // Toggle Sidebar Movil
    document.querySelector('.menu-toggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('active');
    });

    // Filtros de Libros
    document.getElementById('buscar-compras').addEventListener('input', filtrarCompras);
    document.getElementById('filtro-mes-compras').addEventListener('change', filtrarCompras);
    document.getElementById('filtro-periodo-compras').addEventListener('change', filtrarCompras);
    
    document.getElementById('buscar-ventas').addEventListener('input', filtrarVentas);
    document.getElementById('filtro-mes-ventas').addEventListener('change', filtrarVentas);
    document.getElementById('filtro-periodo-ventas').addEventListener('change', filtrarVentas);
    
    document.getElementById('buscar-contactos').addEventListener('input', filtrarContactos);
    document.getElementById('filtro-tipo-contactos').addEventListener('change', filtrarContactos);

    // Filtros de Inventario y Submit
    const buscarArticulosInput = document.getElementById('buscar-articulos');
    if (buscarArticulosInput) {
        buscarArticulosInput.addEventListener('input', filtrarArticulos);
    }
    const formArt = document.getElementById('form-articulo');
    if (formArt) {
        formArt.addEventListener('submit', guardarArticulo);
    }
    const formMov = document.getElementById('form-movimiento');
    if (formMov) {
        formMov.addEventListener('submit', guardarMovimiento);
    }

    // Filtro de Beneficiarios
    document.getElementById('buscar-beneficiarios').addEventListener('input', filtrarBeneficiarios);

    // Selector de Beneficiario Activo en Sidebar
    document.getElementById('select-beneficiario-activo').addEventListener('change', (e) => {
        const id = parseInt(e.target.value);
        seleccionarBeneficiario(id);
    });

    // --- AUTOMATIC SHOW/HIDE (TOGGLES DE CAMPOS CONDICIONALES) ---
    const compraDocType = document.getElementById('compra-doc-type');
    const compraNotasFields = document.getElementById('compra-notas-fields');
    const compraNotaDebitoGroup = document.getElementById('compra-nota-debito-group');
    const compraNotaCreditoGroup = document.getElementById('compra-nota-credito-group');
    const compraDocAfectado = document.getElementById('compra-doc-afectado');

    window.toggleCompraNotasFields = function() {
        const type = compraDocType.value;
        const docNumLabel = document.querySelector('label[for="compra-doc-number"]');
        const montoAjusteLabel = document.getElementById('compra-monto-ajuste-label');
        
        // Ocultar los campos redundantes duplicados siempre
        if (compraNotaCreditoGroup) compraNotaCreditoGroup.style.display = 'none';
        if (compraNotaDebitoGroup) compraNotaDebitoGroup.style.display = 'none';
        
        if (type === 'Nota Crédito') {
            compraNotasFields.style.display = 'grid';
            compraDocAfectado.required = true;
            if (docNumLabel) docNumLabel.innerText = 'N° Nota de Crédito *';
            if (montoAjusteLabel) montoAjusteLabel.innerText = 'Monto a Restar / Ajuste (Bs.) *';
        } else if (type === 'Nota Débito') {
            compraNotasFields.style.display = 'grid';
            compraDocAfectado.required = true;
            if (docNumLabel) docNumLabel.innerText = 'N° Nota de Débito *';
            if (montoAjusteLabel) montoAjusteLabel.innerText = 'Monto a Adicionar / Ajuste (Bs.) *';
        } else {
            compraNotasFields.style.display = 'none';
            compraDocAfectado.required = false;
            if (docNumLabel) docNumLabel.innerText = 'N° de Factura *';
        }
    };
    compraDocType.addEventListener('change', window.toggleCompraNotasFields);

    const compraTerritorialidad = document.getElementById('compra-territorialidad');
    const compraImportFields = document.getElementById('compra-import-fields');
    window.toggleCompraImportFields = function() {
        if (compraTerritorialidad.value === 'importacion') {
            compraImportFields.style.display = 'grid';
        } else {
            compraImportFields.style.display = 'none';
        }
    };
    compraTerritorialidad.addEventListener('change', window.toggleCompraImportFields);

    const ventaDocType = document.getElementById('venta-doc-type');
    const ventaNotasFields = document.getElementById('venta-notas-fields');
    const ventaNotaDebitoGroup = document.getElementById('venta-nota-debito-group');
    const ventaNotaCreditoGroup = document.getElementById('venta-nota-credito-group');
    const ventaDocAfectado = document.getElementById('venta-doc-afectado');

    window.toggleVentaNotasFields = function() {
        const type = ventaDocType.value;
        const docNumLabel = document.querySelector('label[for="venta-doc-number"]');
        const montoAjusteLabel = document.getElementById('venta-monto-ajuste-label');
        
        // Ocultar los campos redundantes duplicados siempre
        if (ventaNotaCreditoGroup) ventaNotaCreditoGroup.style.display = 'none';
        if (ventaNotaDebitoGroup) ventaNotaDebitoGroup.style.display = 'none';
        
        if (type === 'Nota Crédito') {
            ventaNotasFields.style.display = 'grid';
            ventaDocAfectado.required = true;
            if (docNumLabel) docNumLabel.innerText = 'N° Nota de Crédito *';
            if (montoAjusteLabel) montoAjusteLabel.innerText = 'Monto a Restar / Ajuste (Bs.) *';
        } else if (type === 'Nota Débito') {
            ventaNotasFields.style.display = 'grid';
            ventaDocAfectado.required = true;
            if (docNumLabel) docNumLabel.innerText = 'N° Nota de Débito *';
            if (montoAjusteLabel) montoAjusteLabel.innerText = 'Monto a Adicionar / Ajuste (Bs.) *';
        } else {
            ventaNotasFields.style.display = 'none';
            ventaDocAfectado.required = false;
            if (docNumLabel) docNumLabel.innerText = 'N° de Factura *';
        }
    };
    ventaDocType.addEventListener('change', window.toggleVentaNotasFields);

    const ventaTerritorialidad = document.getElementById('venta-territorialidad');
    const ventaExportFields = document.getElementById('venta-export-fields');
    window.toggleVentaExportFields = function() {
        if (ventaTerritorialidad.value === 'exportacion') {
            ventaExportFields.style.display = 'grid';
        } else {
            ventaExportFields.style.display = 'none';
        }
    };
    ventaTerritorialidad.addEventListener('change', window.toggleVentaExportFields);

    const ventaIsFiscal = document.getElementById('venta-is-fiscal-printer');
    window.actualizarCamposFiscalesVenta = function() {
        const isFiscal = document.getElementById('venta-is-fiscal-printer').checked;
        const ventaFiscalBox = document.getElementById('venta-fiscal-printer-box');
        const normalInvoiceRow = document.getElementById('venta-normal-invoice-row');
        const inputDoc = document.getElementById('venta-doc-number');
        const inputCtrl = document.getElementById('venta-control-number');
        const inputFiscalInicio = document.getElementById('venta-fiscal-inicio');
        const inputFiscalFinal = document.getElementById('venta-fiscal-final');
        const selectCliente = document.getElementById('venta-cliente');

        if (isFiscal) {
            if (ventaFiscalBox) ventaFiscalBox.classList.add('active');
            if (normalInvoiceRow) normalInvoiceRow.style.display = 'none';
            if (inputDoc) inputDoc.removeAttribute('required');
            if (inputCtrl) inputCtrl.removeAttribute('required');
            if (inputFiscalInicio) inputFiscalInicio.setAttribute('required', 'required');
            if (inputFiscalFinal) inputFiscalFinal.setAttribute('required', 'required');

            // Asegurar que exista el contacto RESUMEN DIARIO DE VENTAS
            let resumenCli = state.contactos.find(c => c.tax_id === 'V-00000000-0' && c.type === 'cliente');
            if (!resumenCli) {
                const nuevoId = state.contactos.length > 0 ? Math.max(...state.contactos.map(c => c.id)) + 1 : 1;
                resumenCli = {
                    id: nuevoId,
                    tax_id: 'V-00000000-0',
                    name: 'RESUMEN DIARIO DE VENTAS',
                    type: 'cliente',
                    especial: 'no',
                    email: '',
                    phone: '',
                    address: 'CONSUMIDORES FINALES'
                };
                state.contactos.push(resumenCli);
                guardarDatos();
                renderSelectoresContactos();
            }

            if (selectCliente) {
                selectCliente.value = resumenCli.id;
                selectCliente.disabled = true;
                selectCliente.style.opacity = '0.7';
            }

            // Lógica de autoincremento para un registro nuevo (venta-id vacío)
            const ventaId = document.getElementById('venta-id').value;
            if (!ventaId) {
                const salesWithZ = state.ventas.filter(v => v.fiscal_machine || v.control_z);
                if (salesWithZ.length > 0) {
                    salesWithZ.sort((a, b) => b.id - a.id);
                    const lastZSale = salesWithZ[0];
                    if (lastZSale) {
                        const serialInput = document.getElementById('venta-fiscal-machine');
                        const zControlInput = document.getElementById('venta-control-z');
                        
                        if (serialInput && !serialInput.value) {
                            serialInput.value = lastZSale.fiscal_machine || '';
                        }
                        
                        if (zControlInput && !zControlInput.value && lastZSale.control_z) {
                            const parsedZ = parseInt(lastZSale.control_z, 10);
                            if (!isNaN(parsedZ)) {
                                zControlInput.value = String(parsedZ + 1).padStart(lastZSale.control_z.length, '0');
                            }
                        }
                        
                        if (inputFiscalInicio && !inputFiscalInicio.value && lastZSale.control_number) {
                            const parsedFinal = parseInt(lastZSale.control_number, 10);
                            if (!isNaN(parsedFinal)) {
                                inputFiscalInicio.value = String(parsedFinal + 1).padStart(lastZSale.control_number.length, '0');
                            }
                        }
                    }
                }
            }
        } else {
            if (ventaFiscalBox) ventaFiscalBox.classList.remove('active');
            if (normalInvoiceRow) normalInvoiceRow.style.display = 'grid';
            if (inputDoc) inputDoc.setAttribute('required', 'required');
            if (inputCtrl) inputCtrl.setAttribute('required', 'required');
            if (inputFiscalInicio) inputFiscalInicio.removeAttribute('required');
            if (inputFiscalFinal) inputFiscalFinal.removeAttribute('required');

            if (selectCliente) {
                selectCliente.disabled = false;
                selectCliente.style.opacity = '1';
                const resumenCli = state.contactos.find(c => c.tax_id === 'V-00000000-0' && c.type === 'cliente');
                if (resumenCli && selectCliente.value === resumenCli.id.toString()) {
                    selectCliente.value = '';
                }
            }
        }
    };
    ventaIsFiscal.addEventListener('change', window.actualizarCamposFiscalesVenta);

    const ventaIsTerceros = document.getElementById('venta-is-terceros');
    const ventaTercerosBox = document.getElementById('venta-terceros-box');
    ventaIsTerceros.addEventListener('change', () => {
        if (ventaIsTerceros.checked) {
            ventaTercerosBox.classList.add('active');
        } else {
            ventaTercerosBox.classList.remove('active');
        }
    });

    // --- AUTO-CÁLCULOS MULTI-ALÍCUOTA Y RETENCIONES ---

    // Compras Triggers
    const cExenta = document.getElementById('compra-base-exenta');
    const cSinCredito = document.getElementById('compra-sin-credito');
    const cGeneral = document.getElementById('compra-base-general');
    const cIvaGeneral = document.getElementById('compra-iva-general');
    const cReducida = document.getElementById('compra-base-reducida');
    const cIvaReducida = document.getElementById('compra-iva-reducida');
    const cAdicional = document.getElementById('compra-base-adicional');
    const cIvaAdicional = document.getElementById('compra-iva-adicional');
    const cTotal = document.getElementById('compra-total');
    
    const cHasRet = document.getElementById('compra-has-retention');
    const cRetBox = document.getElementById('compra-retention-box');
    const cRetPct = document.getElementById('compra-retention-pct');
    const cRetPctCustom = document.getElementById('compra-retention-pct-custom');
    const cRetPctCustomGroup = document.getElementById('compra-ret-pct-custom-group');
    const cRetAmount = document.getElementById('compra-retention-amount');

    function recalcularTotalesCompra() {
        const baseExenta = parseFloat(cExenta.value) || 0;
        const sinCredito = parseFloat(cSinCredito.value) || 0;
        const baseGeneral = parseFloat(cGeneral.value) || 0;
        const baseReducida = parseFloat(cReducida.value) || 0;
        const baseAdicional = parseFloat(cAdicional.value) || 0;

        // Calcular IVAs
        const ivaGen = Math.round(baseGeneral * 0.16 * 100) / 100;
        const ivaRed = Math.round(baseReducida * 0.08 * 100) / 100;
        const ivaAdic = Math.round(baseAdicional * 0.31 * 100) / 100;

        cIvaGeneral.value = baseGeneral > 0 ? ivaGen.toFixed(2) : '';
        cIvaReducida.value = baseReducida > 0 ? ivaRed.toFixed(2) : '';
        cIvaAdicional.value = baseAdicional > 0 ? ivaAdic.toFixed(2) : '';

        // Calcular Total Factura (incluye compras sin derecho a crédito)
        const totalFactura = baseExenta + sinCredito + baseGeneral + ivaGen + baseReducida + ivaRed + baseAdicional + ivaAdic;
        cTotal.value = totalFactura > 0 ? totalFactura.toFixed(2) : '';

        // Recalcular Retención si aplica
        if (cHasRet.checked) {
            const totalIva = ivaGen + ivaRed + ivaAdic;
            let pct = 75;
            if (cRetPct.value === '100') pct = 100;
            else if (cRetPct.value === 'otro') pct = parseFloat(cRetPctCustom.value) || 0;

            const retVal = Math.round(totalIva * (pct / 100) * 100) / 100;
            cRetAmount.value = retVal > 0 ? retVal.toFixed(2) : '';
        }

        // Sincronizar con el campo de Monto a Ajustar (si existe y no es el elemento activo actual donde escribe el usuario)
        const compraMontoAjuste = document.getElementById('compra-monto-ajuste');
        if (compraMontoAjuste && document.activeElement !== compraMontoAjuste) {
            compraMontoAjuste.value = cTotal.value;
        }
    }

    cExenta.addEventListener('input', recalcularTotalesCompra);
    cSinCredito.addEventListener('input', recalcularTotalesCompra);
    cGeneral.addEventListener('input', recalcularTotalesCompra);
    cReducida.addEventListener('input', recalcularTotalesCompra);
    cAdicional.addEventListener('input', recalcularTotalesCompra);

    const compraMontoAjuste = document.getElementById('compra-monto-ajuste');
    if (compraMontoAjuste) {
        compraMontoAjuste.addEventListener('input', (e) => {
            const totalVal = parseFloat(e.target.value) || 0;
            const rate = (state.config.ivaRate || 16) / 100;
            const baseGen = totalVal / (1 + rate);
            
            // Limpiar otros campos, solo establecer base general
            cExenta.value = '';
            cSinCredito.value = '';
            cGeneral.value = totalVal > 0 ? baseGen.toFixed(2) : '';
            cReducida.value = '';
            cAdicional.value = '';
            
            // Recalcular
            recalcularTotalesCompra();
        });
    }
    
    cHasRet.addEventListener('change', () => {
        if (cHasRet.checked) {
            cRetBox.classList.add('active');
            const docDate = document.getElementById('compra-date').value;
            if (docDate) document.getElementById('compra-retention-date').value = docDate;
        } else {
            cRetBox.classList.remove('active');
            cRetAmount.value = '';
            document.getElementById('compra-retention-number').value = '';
            document.getElementById('compra-retention-date').value = '';
            document.getElementById('compra-retencion-terceros').value = '';
        }
        recalcularTotalesCompra();
    });

    cRetPct.addEventListener('change', () => {
        if (cRetPct.value === 'otro') {
            cRetPctCustomGroup.style.display = 'block';
        } else {
            cRetPctCustomGroup.style.display = 'none';
        }
        recalcularTotalesCompra();
    });
    cRetPctCustom.addEventListener('input', recalcularTotalesCompra);

    // Ventas Triggers
    const vExenta = document.getElementById('venta-base-exenta');
    const vGeneral = document.getElementById('venta-base-general');
    const vIvaGeneral = document.getElementById('venta-iva-general');
    const vReducida = document.getElementById('venta-base-reducida');
    const vIvaReducida = document.getElementById('venta-iva-reducida');
    const vAdicional = document.getElementById('venta-base-adicional');
    const vIvaAdicional = document.getElementById('venta-iva-adicional');
    const vTotal = document.getElementById('venta-total');
    
    const vHasRet = document.getElementById('venta-has-retention');
    const vRetBox = document.getElementById('venta-retention-box');
    const vRetPct = document.getElementById('venta-retention-pct');
    const vRetPctCustom = document.getElementById('venta-retention-pct-custom');
    const vRetPctCustomGroup = document.getElementById('venta-ret-pct-custom-group');
    const vRetAmount = document.getElementById('venta-retention-amount');

    function recalcularTotalesVenta() {
        const baseExenta = parseFloat(vExenta.value) || 0;
        const baseGeneral = parseFloat(vGeneral.value) || 0;
        const baseReducida = parseFloat(vReducida.value) || 0;
        const baseAdicional = parseFloat(vAdicional.value) || 0;

        // Calcular IVAs
        const ivaGen = Math.round(baseGeneral * 0.16 * 100) / 100;
        const ivaRed = Math.round(baseReducida * 0.08 * 100) / 100;
        const ivaAdic = Math.round(baseAdicional * 0.31 * 100) / 100;

        vIvaGeneral.value = baseGeneral > 0 ? ivaGen.toFixed(2) : '';
        vIvaReducida.value = baseReducida > 0 ? ivaRed.toFixed(2) : '';
        vIvaAdicional.value = baseAdicional > 0 ? ivaAdic.toFixed(2) : '';

        // Calcular Total Factura
        const totalFactura = baseExenta + baseGeneral + ivaGen + baseReducida + ivaRed + baseAdicional + ivaAdic;
        vTotal.value = totalFactura > 0 ? totalFactura.toFixed(2) : '';

        // Recalcular Retención si aplica
        if (vHasRet.checked) {
            const totalIva = ivaGen + ivaRed + ivaAdic;
            let pct = 75;
            if (vRetPct.value === '100') pct = 100;
            else if (vRetPct.value === 'otro') pct = parseFloat(vRetPctCustom.value) || 0;

            const retVal = Math.round(totalIva * (pct / 100) * 100) / 100;
            vRetAmount.value = retVal > 0 ? retVal.toFixed(2) : '';
        }

        // Sincronizar con el campo de Monto a Ajustar (si existe y no es el elemento activo actual donde escribe el usuario)
        const ventaMontoAjuste = document.getElementById('venta-monto-ajuste');
        if (ventaMontoAjuste && document.activeElement !== ventaMontoAjuste) {
            ventaMontoAjuste.value = vTotal.value;
        }
    }

    vExenta.addEventListener('input', recalcularTotalesVenta);
    vGeneral.addEventListener('input', recalcularTotalesVenta);
    vReducida.addEventListener('input', recalcularTotalesVenta);
    vAdicional.addEventListener('input', recalcularTotalesVenta);

    const ventaMontoAjuste = document.getElementById('venta-monto-ajuste');
    if (ventaMontoAjuste) {
        ventaMontoAjuste.addEventListener('input', (e) => {
            const totalVal = parseFloat(e.target.value) || 0;
            const rate = (state.config.ivaRate || 16) / 100;
            const baseGen = totalVal / (1 + rate);
            
            // Limpiar otros campos, solo establecer base general
            vExenta.value = '';
            vGeneral.value = totalVal > 0 ? baseGen.toFixed(2) : '';
            vReducida.value = '';
            vAdicional.value = '';
            
            // Recalcular
            recalcularTotalesVenta();
        });
    }
    
    vHasRet.addEventListener('change', () => {
        if (vHasRet.checked) {
            vRetBox.classList.add('active');
            const docDate = document.getElementById('venta-date').value;
            if (docDate) document.getElementById('venta-retention-date').value = docDate;
        } else {
            vRetBox.classList.remove('active');
            vRetAmount.value = '';
            document.getElementById('venta-retention-number').value = '';
            document.getElementById('venta-retention-date').value = '';
            document.getElementById('venta-iva-percibido-comprador').value = '';
        }
        recalcularTotalesVenta();
    });

    vRetPct.addEventListener('change', () => {
        if (vRetPct.value === 'otro') {
            vRetPctCustomGroup.style.display = 'block';
        } else {
            vRetPctCustomGroup.style.display = 'none';
        }
        recalcularTotalesVenta();
    });
    vRetPctCustom.addEventListener('input', recalcularTotalesVenta);

    // --- AUTOCOMPLETADO POR R.I.F. (Tax ID) ---
    document.getElementById('contacto-tax-id').addEventListener('blur', (e) => {
        const rif = e.target.value.trim().toUpperCase();
        const existente = state.contactos.find(c => c.tax_id.replace(/[- ]/g, '').toLowerCase() === rif.replace(/[- ]/g, '').toLowerCase());
        if (existente) {
            document.getElementById('contacto-name').value = existente.name;
            document.getElementById('contacto-email').value = existente.email || '';
            document.getElementById('contacto-phone').value = existente.phone || '';
            document.getElementById('contacto-address').value = existente.address || '';
            document.getElementById('contacto-type').value = existente.type;
            document.getElementById('contacto-especial').value = existente.especial || 'no';
            mostrarNotificacion(`R.I.F. existente. Se cargó la información de: ${existente.name}`, 'info');
        }
    });

    // Auto-detectar si el cliente/proveedor es Agente de Retención y sugerir check, y actualizar facturas afectadas
    document.getElementById('compra-proveedor').addEventListener('change', (e) => {
        const contactId = parseInt(e.target.value);
        if (contactId === -1) {
            abrirModalContacto('proveedor');
            e.target.value = "";
            return;
        }
        
        if (!isAutofillingCompra) {
            const docAfectadoVal = document.getElementById('compra-doc-afectado').value;
            actualizarFacturasAfectadasCompra(docAfectadoVal);
        }
        
        const prov = state.contactos.find(c => c.id === contactId);
        if (prov) {
            if (state.config.empresaContribuyente === 'especial') {
                cHasRet.checked = true;
                cRetBox.classList.add('active');
                recalcularTotalesCompra();
            }
        }
    });

    document.getElementById('venta-cliente').addEventListener('change', (e) => {
        const contactId = parseInt(e.target.value);
        if (contactId === -1) {
            abrirModalContacto('cliente');
            e.target.value = "";
            return;
        }
        
        if (!isAutofillingVenta) {
            const docAfectadoVal = document.getElementById('venta-doc-afectado').value;
            actualizarFacturasAfectadasVenta(docAfectadoVal);
        }
        
        const cliente = state.contactos.find(c => c.id === contactId);
        if (cliente && cliente.especial === 'si') {
            vHasRet.checked = true;
            vRetBox.classList.add('active');
            recalcularTotalesVenta();
            mostrarNotificacion(`El cliente ${cliente.name} es Contribuyente Especial. Se activó la sección de Retención de IVA.`, 'info');
        } else {
            vHasRet.checked = false;
            vRetBox.classList.remove('active');
            recalcularTotalesVenta();
        }
    });

    document.getElementById('compra-doc-afectado').addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '__manual__') {
            const num = prompt('Ingrese el número de la factura afectada:');
            if (num && num.trim() !== '') {
                const valClean = num.trim();
                const select = e.target;
                
                // Limpiar opciones manuales previas
                for (let i = select.options.length - 1; i >= 0; i--) {
                    if (select.options[i].classList.contains('temp-manual-option')) {
                        select.remove(i);
                    }
                }
                
                const opt = document.createElement('option');
                opt.value = valClean;
                opt.innerText = `Factura N° ${valClean} (Manual)`;
                opt.selected = true;
                opt.classList.add('temp-manual-option');
                select.insertBefore(opt, select.lastElementChild);
            } else {
                e.target.value = '';
            }
        } else if (val && val !== '') {
            // Buscar factura original en state.compras (tolerancia a strings y números enteros con ceros iniciales)
            const originalInvoice = state.compras.find(c => 
                String(c.doc_number).trim() === String(val).trim() || 
                (parseInt(c.doc_number, 10) === parseInt(val, 10) && !isNaN(parseInt(c.doc_number, 10)) && !isNaN(parseInt(val, 10)))
            );
            if (originalInvoice) {
                isAutofillingCompra = true;
                try {
                    // 1. Rellenar proveedor
                    const provSelect = document.getElementById('compra-proveedor');
                    provSelect.value = originalInvoice.contact_id;
                    
                    // 2. Disparar evento change de proveedor para actualizar retenciones, etc.
                    provSelect.dispatchEvent(new Event('change'));
                    
                    const docType = document.getElementById('compra-doc-type').value;
                    const esNota = docType === 'Nota Crédito' || docType === 'Nota Débito';

                    if (esNota) {
                        // Para notas, no copiar los montos de la factura general al formulario (dejar vacíos para ingresar solo el ajuste)
                        document.getElementById('compra-base-exenta').value = '';
                        document.getElementById('compra-sin-credito').value = '';
                        document.getElementById('compra-base-general').value = '';
                        document.getElementById('compra-base-reducida').value = '';
                        document.getElementById('compra-base-adicional').value = '';
                        document.getElementById('compra-iva-general').value = '';
                        document.getElementById('compra-iva-reducida').value = '';
                        document.getElementById('compra-iva-adicional').value = '';
                        document.getElementById('compra-total').value = '';
                        if (document.getElementById('compra-monto-ajuste')) {
                            document.getElementById('compra-monto-ajuste').value = '';
                        }
                    } else {
                        // 3. Rellenar los montos/bases para edición de factura ordinaria
                        document.getElementById('compra-base-exenta').value = originalInvoice.base_exenta || 0;
                        document.getElementById('compra-sin-credito').value = originalInvoice.sin_credito || 0;
                        document.getElementById('compra-base-general').value = originalInvoice.base_general || 0;
                        document.getElementById('compra-base-reducida').value = originalInvoice.base_reducida || 0;
                        document.getElementById('compra-base-adicional').value = originalInvoice.base_adicional || 0;
                    }
                    
                    // default control number from original invoice
                    document.getElementById('compra-control-number').value = originalInvoice.control_number || '';
                    
                    if (!esNota) {
                        // Recalcular los IVAs y total de la factura
                        recalcularTotalesCompra();
                    }
                } finally {
                    isAutofillingCompra = false;
                }
            }
        }
    });

    document.getElementById('venta-doc-afectado').addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '__manual__') {
            const num = prompt('Ingrese el número de la factura afectada:');
            if (num && num.trim() !== '') {
                const valClean = num.trim();
                const select = e.target;
                
                // Limpiar opciones manuales previas
                for (let i = select.options.length - 1; i >= 0; i--) {
                    if (select.options[i].classList.contains('temp-manual-option')) {
                        select.remove(i);
                    }
                }
                
                const opt = document.createElement('option');
                opt.value = valClean;
                opt.innerText = `Factura N° ${valClean} (Manual)`;
                opt.selected = true;
                opt.classList.add('temp-manual-option');
                select.insertBefore(opt, select.lastElementChild);
            } else {
                e.target.value = '';
            }
        } else if (val && val !== '') {
            // Buscar factura original en state.ventas (tolerancia a strings y números enteros con ceros iniciales)
            const originalInvoice = state.ventas.find(v => 
                String(v.doc_number).trim() === String(val).trim() || 
                (parseInt(v.doc_number, 10) === parseInt(val, 10) && !isNaN(parseInt(v.doc_number, 10)) && !isNaN(parseInt(val, 10)))
            );
            if (originalInvoice) {
                isAutofillingVenta = true;
                try {
                    // 1. Rellenar cliente
                    const cliSelect = document.getElementById('venta-cliente');
                    cliSelect.value = originalInvoice.contact_id;
                    
                    // 2. Disparar evento change de cliente para actualizar retenciones, etc.
                    cliSelect.dispatchEvent(new Event('change'));
                    
                    const docType = document.getElementById('venta-doc-type').value;
                    const esNota = docType === 'Nota Crédito' || docType === 'Nota Débito';

                    if (esNota) {
                        // Para notas, no copiar los montos de la factura general al formulario (dejar vacíos para ingresar solo el ajuste)
                        document.getElementById('venta-base-exenta').value = '';
                        document.getElementById('venta-base-general').value = '';
                        document.getElementById('venta-base-reducida').value = '';
                        document.getElementById('venta-base-adicional').value = '';
                        document.getElementById('venta-iva-general').value = '';
                        document.getElementById('venta-iva-reducida').value = '';
                        document.getElementById('venta-iva-adicional').value = '';
                        document.getElementById('venta-total').value = '';
                        if (document.getElementById('venta-monto-ajuste')) {
                            document.getElementById('venta-monto-ajuste').value = '';
                        }
                    } else {
                        // 3. Rellenar los montos/bases para edición de factura ordinaria
                        document.getElementById('venta-base-exenta').value = originalInvoice.base_exenta || 0;
                        document.getElementById('venta-base-general').value = originalInvoice.base_general || 0;
                        document.getElementById('venta-base-reducida').value = originalInvoice.base_reducida || 0;
                        document.getElementById('venta-base-adicional').value = originalInvoice.base_adicional || 0;
                    }
                    
                    // default control number from original invoice
                    document.getElementById('venta-control-number').value = originalInvoice.control_number || '';
                    
                    if (!esNota) {
                        // Recalcular los IVAs y total de la factura
                        recalcularTotalesVenta();
                    }
                } finally {
                    isAutofillingVenta = false;
                }
            }
        }
    });

    // --- CONFIGURACIÓN TEMA Y DEMO ---

    document.getElementById('btn-toggle-theme').addEventListener('click', () => {
        state.config.theme = state.config.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', state.config.theme);
        guardarDatos();
    });

    document.getElementById('btn-cargar-demo').addEventListener('click', () => {
        if (tieneDatosRegistrados()) {
            mostrarNotificacion('No se pueden cargar los datos de prueba porque ya existen registros activos en el sistema (compras, ventas, contactos o empresas). Si realmente deseas cargar la demostración, debes usar primero el botón "Limpiar Datos".', 'error');
            return;
        }
        if (confirm('¿Restablecer y cargar los datos de prueba de Venezuela? Se borrará lo que tengas registrado.')) {
            cargarDatosDemoVenezuela();
            renderAll();
            mostrarNotificacion('Datos de prueba venezolanos cargados con éxito.', 'success');
        }
    });

    document.getElementById('btn-limpiar-datos').addEventListener('click', () => {
        if (!tieneDatosRegistrados()) {
            mostrarNotificacion('No hay datos cargados en el sistema para borrar.', 'info');
            return;
        }
        if (confirm('¡Peligro! Esto vaciará toda la contabilidad por completo.')) {
            cargarEstadoVacio();
            renderAll();
            mostrarNotificacion('Contabilidad vaciada. Empezando de cero.', 'warning');
        }
    });

    // Respaldos JSON
    document.getElementById('btn-exportar-json').addEventListener('click', exportarJSON);
    document.getElementById('btn-importar-json').addEventListener('click', () => {
        document.getElementById('input-file-importar').click();
    });
    document.getElementById('input-file-importar').addEventListener('change', importarJSON);

    // Listeners de los Ajustes F30
    document.getElementById('f30-v-ajuste-tax').addEventListener('change', (e) => {
        updateF30Ajuste('debito_ajuste', parseFloat(e.target.value) || 0);
    });
    document.getElementById('f30-v-exonerado-tax').addEventListener('change', (e) => {
        updateF30Ajuste('debito_exonerado', parseFloat(e.target.value) || 0);
    });
    document.getElementById('f30-c-excedente-anterior').addEventListener('change', (e) => {
        updateF30Ajuste('excedente_anterior', parseFloat(e.target.value) || 0);
    });
    document.getElementById('f30-c-ajuste-tax').addEventListener('change', (e) => {
        updateF30Ajuste('credito_ajuste_tax', parseFloat(e.target.value) || 0);
    });

    // Listeners de Ajustes F30 Art. 72
    const vAjusteTaxArt72 = document.getElementById('f30-v-ajuste-tax-art72');
    if (vAjusteTaxArt72) {
        vAjusteTaxArt72.addEventListener('change', (e) => {
            updateF30Ajuste('debito_ajuste', parseFloat(e.target.value) || 0);
        });
    }
    const vExoneradoTaxArt72 = document.getElementById('f30-v-exonerado-tax-art72');
    if (vExoneradoTaxArt72) {
        vExoneradoTaxArt72.addEventListener('change', (e) => {
            updateF30Ajuste('debito_exonerado', parseFloat(e.target.value) || 0);
        });
    }
    const cExcedenteAnteriorArt72 = document.getElementById('f30-c-excedente-anterior-art72');
    if (cExcedenteAnteriorArt72) {
        cExcedenteAnteriorArt72.addEventListener('change', (e) => {
            updateF30Ajuste('excedente_anterior', parseFloat(e.target.value) || 0);
        });
    }
    const cAjusteTaxArt72 = document.getElementById('f30-c-ajuste-tax-art72');
    if (cAjusteTaxArt72) {
        cAjusteTaxArt72.addEventListener('change', (e) => {
            updateF30Ajuste('credito_ajuste_tax', parseFloat(e.target.value) || 0);
        });
    }

    // Listeners del Libro Diario
    const buscarDiario = document.getElementById('buscar-diario');
    if (buscarDiario) {
        buscarDiario.addEventListener('input', renderLibroDiario);
    }
    const filtroMesDiario = document.getElementById('filtro-mes-diario');
    if (filtroMesDiario) {
        filtroMesDiario.addEventListener('change', renderLibroDiario);
    }
    const filtroPeriodoDiario = document.getElementById('filtro-periodo-diario');
    if (filtroPeriodoDiario) {
        filtroPeriodoDiario.addEventListener('change', renderLibroDiario);
    }
    const formAsiento = document.getElementById('form-asiento-manual');
    if (formAsiento) {
        formAsiento.addEventListener('submit', guardarAsientoManual);
    }
}

// --- RENDERIZADORES DE UI ---

function renderAll() {
    renderKPIs();
    renderGraficos();
    renderSelectoresContactos();
    renderTablaCompras();
    renderTablaVentas();
    renderTablaContactos();
    renderSelectoresBeneficiarios();
    renderTablaBeneficiarios();
    renderInventario();
    
    // Renderizar indicador de empresa activa en cabecera
    const active = getActiveBeneficiary();
    const activeHeaderEl = document.getElementById('active-company-header');
    if (activeHeaderEl && active) {
        activeHeaderEl.innerHTML = `<svg style="width:16px;height:16px;stroke:var(--color-success);stroke-width:2;fill:none;" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg><span style="color:var(--text-secondary); font-weight:normal;">Empresa:</span> <span style="color:var(--color-success);">${active.tax_id} | ${active.name}</span>`;
    }
    
    // Configuración general cargada
    
    // Inicializar mes del reporte y quincena
    const inputReporteMes = document.getElementById('reporte-mes-select');
    if (inputReporteMes && !inputReporteMes.value) {
        inputReporteMes.value = new Date().toISOString().substring(0, 7);
    }
    const inputReportePeriodo = document.getElementById('reporte-periodo-select');
    if (inputReportePeriodo && !inputReportePeriodo.value) {
        inputReportePeriodo.value = 'completo';
    }

    const inputDiarioMes = document.getElementById('filtro-mes-diario');
    if (inputDiarioMes && !inputDiarioMes.value) {
        inputDiarioMes.value = new Date().toISOString().substring(0, 7);
    }
    const inputDiarioPeriodo = document.getElementById('filtro-periodo-diario');
    if (inputDiarioPeriodo && !inputDiarioPeriodo.value) {
        inputDiarioPeriodo.value = 'completo';
    }

    const inputMayorMes = document.getElementById('filtro-mes-mayor');
    if (inputMayorMes && !inputMayorMes.value) {
        inputMayorMes.value = new Date().toISOString().substring(0, 7);
    }
    const inputMayorPeriodo = document.getElementById('filtro-periodo-mayor');
    if (inputMayorPeriodo && !inputMayorPeriodo.value) {
        inputMayorPeriodo.value = 'completo';
    }

    renderSelectoresCuentas();
    renderLibroDiario();
    renderLibroMayor();
}

// KPIs
function renderKPIs() {
    const hoy = new Date();
    const mesActual = hoy.toISOString().substring(0, 7);
    
    // Filtrar mes actual
    const comprasMes = state.compras.filter(c => c.date.startsWith(mesActual));
    const ventasMes = state.ventas.filter(v => v.date.startsWith(mesActual));

    const totalVentas = ventasMes.reduce((acc, curr) => {
        const factor = curr.doc_type === 'Nota Crédito' ? -1 : 1;
        return acc + ((curr.total_amount || 0) * factor);
    }, 0);
    const totalCompras = comprasMes.reduce((acc, curr) => {
        const factor = curr.doc_type === 'Nota Crédito' ? -1 : 1;
        return acc + ((curr.total_amount || 0) * factor);
    }, 0);

    const ivaDebito = ventasMes.reduce((acc, curr) => {
        const factor = curr.doc_type === 'Nota Crédito' ? -1 : 1;
        const totalIva = (curr.tax_general || 0) + (curr.tax_reducida || 0) + (curr.tax_adicional || 0);
        return acc + (totalIva * factor);
    }, 0);
    const ivaCredito = comprasMes.reduce((acc, curr) => {
        const factor = curr.doc_type === 'Nota Crédito' ? -1 : 1;
        const totalIva = (curr.tax_general || 0) + (curr.tax_reducida || 0) + (curr.tax_adicional || 0);
        return acc + (totalIva * factor);
    }, 0);

    const retRecibidas = ventasMes.reduce((acc, curr) => {
        const factor = curr.doc_type === 'Nota Crédito' ? -1 : 1;
        return acc + ((curr.retention_amount || 0) * factor);
    }, 0);
    const retEmitidas = comprasMes.reduce((acc, curr) => {
        const factor = curr.doc_type === 'Nota Crédito' ? -1 : 1;
        return acc + ((curr.retention_amount || 0) * factor);
    }, 0);

    // Balance estimado: IVA Débito - IVA Crédito - Retenciones Recibidas
    const balanceEstimado = ivaDebito - ivaCredito - retRecibidas;

    // Rellenar UI
    document.getElementById('kpi-ventas-val').innerText = formatearMoneda(totalVentas);
    document.getElementById('kpi-compras-val').innerText = formatearMoneda(totalCompras);
    document.getElementById('kpi-ret-recibidas-val').innerText = formatearMoneda(retRecibidas);
    document.getElementById('kpi-ret-emitidas-val').innerText = formatearMoneda(retEmitidas);

    const kpiNetoCard = document.getElementById('kpi-neto-card');
    const kpiNetoVal = document.getElementById('kpi-neto-val');
    const kpiNetoSub = document.getElementById('kpi-neto-sub');

    kpiNetoCard.className = 'kpi-card kpi-neto';
    if (balanceEstimado >= 0) {
        kpiNetoCard.classList.add('saldo-pagar');
        kpiNetoVal.innerText = formatearMoneda(balanceEstimado);
        kpiNetoSub.innerText = 'IVA Neto estimado a pagar al SENIAT';
    } else {
        kpiNetoCard.classList.add('saldo-favor');
        kpiNetoVal.innerText = formatearMoneda(Math.abs(balanceEstimado));
        kpiNetoSub.innerText = 'Saldo fiscal estimado a favor';
    }
}

// Gráficos (Chart.js)
let chartInstance = null;
function renderGraficos() {
    const ctx = document.getElementById('chart-dashboard');
    if (!ctx) return;

    const meses = [];
    const comprasPorMes = [];
    const ventasPorMes = [];
    
    const hoy = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(hoy.getMonth() - i);
        const mesStr = d.toISOString().substring(0, 7);
        meses.push(formatearMesNombre(mesStr));
        
        const totalC = state.compras
            .filter(c => c.date.startsWith(mesStr))
            .reduce((acc, curr) => acc + curr.total_amount, 0);
            
        const totalV = state.ventas
            .filter(v => v.date.startsWith(mesStr))
            .reduce((acc, curr) => acc + curr.total_amount, 0);
            
        comprasPorMes.push(totalC);
        ventasPorMes.push(totalV);
    }

    if (window.Chart) {
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? '#374151' : '#e2e8f0';
        const textColor = isDark ? '#9ca3af' : '#475569';

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: meses,
                datasets: [
                    {
                        label: 'Ventas (Bs.)',
                        data: ventasPorMes,
                        backgroundColor: '#f43f5e',
                        borderRadius: 6
                    },
                    {
                        label: 'Compras (Bs.)',
                        data: comprasPorMes,
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { family: 'Outfit', size: 11 } } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'Outfit' } } },
                    y: {
                        grid: { color: gridColor },
                        ticks: { 
                            color: textColor, 
                            font: { family: 'Outfit' },
                            callback: function(value) { return 'Bs.' + value.toLocaleString(); }
                        }
                    }
                }
            }
        });
    } else {
        // Fallback offline CSS charts
        ctx.parentElement.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-secondary); text-align:center;">
                <p>Gráficos consolidados offline (sin CDN).</p>
                <div style="display:flex; gap:16px; margin-top:20px; align-items:flex-end; height:120px;">
                    ${ventasPorMes.map((v, idx) => {
                        const max = Math.max(...ventasPorMes, ...comprasPorMes) || 1;
                        const pctV = (v / max) * 100;
                        const pctC = (comprasPorMes[idx] / max) * 100;
                        return `
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <div style="display:flex; align-items:flex-end; gap:4px; height:100px;">
                                    <div style="background:#f43f5e; width:15px; height:${pctV}px; border-radius:3px;" title="Ventas: Bs.${v.toLocaleString()}"></div>
                                    <div style="background:#10b981; width:15px; height:${pctC}px; border-radius:3px;" title="Compras: Bs.${comprasPorMes[idx].toLocaleString()}"></div>
                                </div>
                                <span style="font-size:10px; margin-top:4px;">${meses[idx].substring(0,3)}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
}

// Selectores de Contactos en Modales
function renderSelectoresContactos() {
    const provSelect = document.getElementById('compra-proveedor');
    const cliSelect = document.getElementById('venta-cliente');
    
    if (!provSelect || !cliSelect) return;

    // Proveedores
    const proveedores = state.contactos.filter(c => c.type === 'proveedor');
    let provHTML = '<option value="" disabled selected>Seleccione un Proveedor...</option>';
    proveedores.forEach(p => {
        provHTML += `<option value="${p.id}">${p.tax_id} | ${p.name}</option>`;
    });
    provHTML += '<option value="-1" style="color:var(--color-primary); font-weight:600;">+ Agregar Nuevo Proveedor...</option>';
    provSelect.innerHTML = provHTML;
    
    // Clientes
    const clientes = state.contactos.filter(c => c.type === 'cliente');
    let cliHTML = '<option value="" disabled selected>Seleccione un Cliente...</option>';
    clientes.forEach(c => {
        cliHTML += `<option value="${c.id}">${c.tax_id} | ${c.name}</option>`;
    });
    cliHTML += '<option value="-1" style="color:var(--color-primary); font-weight:600;">+ Agregar Nuevo Cliente...</option>';
    cliSelect.innerHTML = cliHTML;
}

function actualizarFacturasAfectadasCompra(selectedDocAfectado = '') {
    const provSelect = document.getElementById('compra-proveedor');
    const afectadoSelect = document.getElementById('compra-doc-afectado');
    if (!afectadoSelect || !provSelect) return;

    const contactId = parseInt(provSelect.value) || 0;
    
    // 1. Intentar filtrar las facturas de este proveedor específico (cualquier documento base que no sea una Nota de Crédito/Débito)
    let facturas = state.compras.filter(c => Number(c.contact_id) === Number(contactId) && c.doc_type && !c.doc_type.toLowerCase().includes('nota'));
    let esFallback = false;

    // 2. Si no hay facturas para este proveedor, listar TODAS las del sistema como fallback inteligente
    if (facturas.length === 0) {
        facturas = state.compras.filter(c => c.doc_type && !c.doc_type.toLowerCase().includes('nota'));
        esFallback = true;
    }
    
    let html = '<option value="" disabled selected>Seleccione la Factura Afectada...</option>';
    
    let encontrado = false;
    facturas.forEach(f => {
        const selected = String(f.doc_number).trim() === String(selectedDocAfectado).trim() ? 'selected' : '';
        if (String(f.doc_number).trim() === String(selectedDocAfectado).trim()) encontrado = true;
        
        // Obtener el nombre del proveedor
        const prov = state.contactos.find(con => Number(con.id) === Number(f.contact_id));
        const provLabel = prov ? prov.name : 'Proveedor Desconocido';
        const formattedAmount = (Number(f.total_amount) || 0).toFixed(2);
        
        if (esFallback) {
            html += `<option value="${f.doc_number}" ${selected}>Factura N° ${f.doc_number} [${provLabel}] (Fecha: ${f.date}, Total: ${formattedAmount} Bs.)</option>`;
        } else {
            html += `<option value="${f.doc_number}" ${selected}>Factura N° ${f.doc_number} (Fecha: ${f.date}, Total: ${formattedAmount} Bs.)</option>`;
        }
    });
    
    // Si hay un valor seleccionado anterior pero no está en la lista de facturas de la base de datos
    if (selectedDocAfectado && !encontrado) {
        html += `<option value="${selectedDocAfectado}" selected class="temp-manual-option">Factura N° ${selectedDocAfectado} (Valor previo)</option>`;
    }
    
    html += '<option value="__manual__" style="color:var(--color-primary); font-weight:600;">+ Ingresar Número Manualmente...</option>';
    afectadoSelect.innerHTML = html;
}

function actualizarFacturasAfectadasVenta(selectedDocAfectado = '') {
    const cliSelect = document.getElementById('venta-cliente');
    const afectadoSelect = document.getElementById('venta-doc-afectado');
    if (!afectadoSelect || !cliSelect) return;

    const contactId = parseInt(cliSelect.value) || 0;
    
    // 1. Intentar filtrar las facturas de este cliente específico (cualquier documento base que no sea una Nota de Crédito/Débito)
    let facturas = state.ventas.filter(v => Number(v.contact_id) === Number(contactId) && v.doc_type && !v.doc_type.toLowerCase().includes('nota'));
    let esFallback = false;

    // 2. Si no hay facturas para este cliente, listar TODAS las del sistema como fallback inteligente
    if (facturas.length === 0) {
        facturas = state.ventas.filter(v => v.doc_type && !v.doc_type.toLowerCase().includes('nota'));
        esFallback = true;
    }
    
    let html = '<option value="" disabled selected>Seleccione la Factura Afectada...</option>';
    
    let encontrado = false;
    facturas.forEach(f => {
        const selected = String(f.doc_number).trim() === String(selectedDocAfectado).trim() ? 'selected' : '';
        if (String(f.doc_number).trim() === String(selectedDocAfectado).trim()) encontrado = true;
        
        // Obtener el nombre del cliente
        const cliente = state.contactos.find(con => Number(con.id) === Number(f.contact_id));
        const cliLabel = cliente ? cliente.name : 'Cliente Desconocido';
        const formattedAmount = (Number(f.total_amount) || 0).toFixed(2);
        
        if (esFallback) {
            html += `<option value="${f.doc_number}" ${selected}>Factura N° ${f.doc_number} [${cliLabel}] (Fecha: ${f.date}, Total: ${formattedAmount} Bs.)</option>`;
        } else {
            html += `<option value="${f.doc_number}" ${selected}>Factura N° ${f.doc_number} (Fecha: ${f.date}, Total: ${formattedAmount} Bs.)</option>`;
        }
    });
    
    // Si hay un valor seleccionado anterior pero no está en la lista de facturas
    if (selectedDocAfectado && !encontrado) {
        html += `<option value="${selectedDocAfectado}" selected class="temp-manual-option">Factura N° ${selectedDocAfectado} (Valor previo)</option>`;
    }
    
    html += '<option value="__manual__" style="color:var(--color-primary); font-weight:600;">+ Ingresar Número Manualmente...</option>';
    afectadoSelect.innerHTML = html;
}

// Listado Libro de Compras
function renderTablaCompras(filtradas = null) {
    const tbody = document.getElementById('tabla-compras-body');
    if (!tbody) return;

    const datos = filtradas || state.compras;
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="21" class="text-center text-muted">No se encontraron registros de compras.</td></tr>';
        return;
    }

    const ordenadas = [...datos].sort((a, b) => new Date(b.date) - new Date(a.date));
    let html = '';
    ordenadas.forEach((c, idx) => {
        const prov = state.contactos.find(con => con.id === c.contact_id);
        const provNombre = prov ? prov.name : '<span class="text-muted">Desconocido</span>';
        const provRut = prov ? prov.tax_id : '';
        
        const operNum = ordenadas.length - idx;

        html += `
            <tr>
                <td>${operNum}</td>
                <td>${formatearFechaISOaUI(c.date)}</td>
                <td><span class="font-semibold">${provRut}</span></td>
                <td>
                    <div style="max-width:180px; white-space:normal; line-height:1.2; word-break:break-word;" title="${provNombre}">${provNombre}</div>
                </td>
                <td>
                    <div style="font-size:0.8rem; font-weight:600;">Forma D: ${c.export_form_d || '-'}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Exp: ${c.import_expediente || '-'}</div>
                </td>
                <td><span class="font-semibold">${c.doc_type === 'Factura' ? c.doc_number : '-'}</span></td>
                <td>${c.control_number || '-'}</td>
                <td>${c.nota_debito || (c.doc_type === 'Nota Débito' ? c.doc_number : '-')}</td>
                <td>${c.nota_credito || (c.doc_type === 'Nota Crédito' ? c.doc_number : '-')}</td>
                <td>${c.doc_afectado || '-'}</td>
                <td class="text-right font-semibold">${formatearMoneda(c.total_amount)}</td>
                <td class="text-right">${formatearMoneda(c.base_exenta || 0)}</td>
                <td class="text-right">${formatearMoneda(c.sin_credito || 0)}</td>
                <td class="text-right">${formatearMoneda(c.base_general || 0)}</td>
                <td class="text-right">${formatearMoneda(c.tax_general || 0)}</td>
                <td class="text-right" style="font-size:0.8rem; color:var(--text-secondary);">
                    Base: ${formatearMoneda((c.base_reducida || 0) + (c.base_adicional || 0))}<br>
                    IVA: ${formatearMoneda((c.tax_reducida || 0) + (c.tax_adicional || 0))}
                </td>
                <td class="text-right text-danger font-semibold">${c.has_retention ? formatearMoneda(c.retention_amount) : '-'}</td>
                <td class="text-right">${c.retencion_terceros ? formatearMoneda(c.retencion_terceros) : '-'}</td>
                <td class="text-right">${c.iva_percibido_aduana ? formatearMoneda(c.iva_percibido_aduana) : '-'}</td>
                <td>
                    <div style="font-size:0.8rem; font-weight:600;">${c.retention_number || '-'}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary);">${c.retention_date ? formatearFechaISOaUI(c.retention_date) : ''}</div>
                </td>
                <td>
                    <div class="flex gap-8">
                        <button class="btn btn-secondary btn-icon-only" onclick="editarTransaccion('compra', ${c.id})" title="Editar">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-icon-only" onclick="eliminarTransaccion('compra', ${c.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// Listado Libro de Ventas
function renderTablaVentas(filtradas = null) {
    const tbody = document.getElementById('tabla-ventas-body');
    if (!tbody) return;

    const datos = filtradas || state.ventas;
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="21" class="text-center text-muted">No se encontraron registros de ventas.</td></tr>';
        return;
    }

    const ordenadas = [...datos].sort((a, b) => new Date(b.date) - new Date(a.date));
    let html = '';
    ordenadas.forEach((v, idx) => {
        const cli = state.contactos.find(con => con.id === v.contact_id);
        const cliNombre = cli ? cli.name : '<span class="text-muted">Desconocido</span>';
        const cliRut = cli ? cli.tax_id : '';
        
        const operNum = ordenadas.length - idx;

        html += `
            <tr>
                <td>${operNum}</td>
                <td>${formatearFechaISOaUI(v.date)}</td>
                <td><span class="font-semibold">${cliRut}</span></td>
                <td>
                    <div style="max-width:180px; white-space:normal; line-height:1.2; word-break:break-word;" title="${cliNombre}">${cliNombre}</div>
                </td>
                <td>
                    <div style="font-size:0.8rem; font-weight:600;">Máq: ${v.fiscal_machine || '-'}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Z: ${v.control_z || '-'}</div>
                </td>
                <td>${v.export_form_d || '-'}</td>
                <td><span class="font-semibold">
                    ${v.doc_type === 'Factura' 
                        ? (v.fiscal_machine || v.control_z ? `${v.doc_number} al ${v.control_number}` : v.doc_number) 
                        : '-'}
                </span></td>
                <td>${v.fiscal_machine || v.control_z ? '-' : (v.control_number || '-')}</td>
                <td>${v.nota_debito || (v.doc_type === 'Nota Débito' ? v.doc_number : '-')}</td>
                <td>${v.nota_credito || (v.doc_type === 'Nota Crédito' ? v.doc_number : '-')}</td>
                <td>${v.doc_afectado || '-'}</td>
                <td class="text-right font-semibold">${formatearMoneda(v.total_amount)}</td>
                <td class="text-right">${formatearMoneda(v.base_exenta || 0)}</td>
                <td class="text-right">${formatearMoneda(v.base_general || 0)}</td>
                <td class="text-right">${formatearMoneda(v.tax_general || 0)}</td>
                <td class="text-right" style="font-size:0.8rem; color:var(--text-secondary);">
                    Base: ${formatearMoneda((v.base_reducida || 0) + (v.base_adicional || 0))}<br>
                    IVA: ${formatearMoneda((v.tax_reducida || 0) + (v.tax_adicional || 0))}
                </td>
                <td class="text-right text-success font-semibold">${v.has_retention ? formatearMoneda(v.retention_amount) : '-'}</td>
                <td class="text-right">${v.iva_percibido_comprador ? formatearMoneda(v.iva_percibido_comprador) : '-'}</td>
                <td class="text-right" style="font-size:0.8rem; color:var(--text-secondary);">
                    Total: ${formatearMoneda(v.ventas_terceros_total || 0)}<br>
                    Exento: ${formatearMoneda(v.ventas_terceros_exentas || 0)}<br>
                    Gravado: ${formatearMoneda(v.ventas_terceros_gravadas || 0)}
                </td>
                <td>
                    <div style="font-size:0.8rem; font-weight:600;">${v.retention_number || '-'}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary);">${v.retention_date ? formatearFechaISOaUI(v.retention_date) : ''}</div>
                </td>
                <td>
                    <div class="flex gap-8">
                        <button class="btn btn-secondary btn-icon-only" onclick="editarTransaccion('venta', ${v.id})" title="Editar">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-icon-only" onclick="eliminarTransaccion('venta', ${v.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// Listado de Contactos
function renderTablaContactos(filtrados = null) {
    const tbody = document.getElementById('tabla-contactos-body');
    if (!tbody) return;

    const datos = filtrados || state.contactos;
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No hay contactos registrados.</td></tr>';
        return;
    }

    const ordenados = [...datos].sort((a, b) => a.name.localeCompare(b.name));
    let html = '';
    ordenados.forEach(c => {
        const typeBadge = c.type === 'proveedor' ? 'badge-success' : 'badge-danger';
        const espBadge = c.especial === 'si' ? '<span class="badge badge-success">SÍ</span>' : '<span class="badge badge-warning">NO</span>';
        
        html += `
            <tr>
                <td><span class="font-semibold">${c.tax_id}</span></td>
                <td><span class="font-semibold">${c.name}</span></td>
                <td><span class="badge ${typeBadge}">${c.type}</span></td>
                <td>${espBadge}</td>
                <td>${c.email || '-'}</td>
                <td>${c.phone || '-'}</td>
                <td>${c.address || '-'}</td>
                <td>
                    <div class="flex gap-8">
                        <button class="btn btn-secondary btn-icon-only" onclick="editarContacto(${c.id})" title="Editar">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-icon-only" onclick="eliminarContacto(${c.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// --- FILTROS DE BÚSQUEDA POR QUINCENAS ---

function checkFiltroQuincena(dateStr, quincenaVal) {
    if (!quincenaVal || quincenaVal === 'completo') return true;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return true;
    const dia = parseInt(parts[2], 10);
    if (quincenaVal === 'q1') {
        return dia <= 15;
    } else if (quincenaVal === 'q2') {
        return dia >= 16;
    }
    return true;
}

function filtrarCompras() {
    const query = document.getElementById('buscar-compras').value.toLowerCase();
    const mesVal = document.getElementById('filtro-mes-compras').value;
    const quincenaVal = document.getElementById('filtro-periodo-compras').value;

    const filtradas = state.compras.filter(c => {
        const prov = state.contactos.find(con => con.id === c.contact_id);
        const matchText = (prov ? prov.name : '').toLowerCase().includes(query) ||
                          (prov ? prov.tax_id : '').toLowerCase().includes(query) ||
                          c.doc_number.toLowerCase().includes(query) ||
                          (c.control_number || '').toLowerCase().includes(query);
                          
        const matchMes = mesVal ? c.date.startsWith(mesVal) : true;
        const matchQuincena = checkFiltroQuincena(c.date, quincenaVal);

        return matchText && matchMes && matchQuincena;
    });
    renderTablaCompras(filtradas);
}

function filtrarVentas() {
    const query = document.getElementById('buscar-ventas').value.toLowerCase();
    const mesVal = document.getElementById('filtro-mes-ventas').value;
    const quincenaVal = document.getElementById('filtro-periodo-ventas').value;

    const filtradas = state.ventas.filter(v => {
        const cli = state.contactos.find(con => con.id === v.contact_id);
        const matchText = (cli ? cli.name : '').toLowerCase().includes(query) ||
                          (cli ? cli.tax_id : '').toLowerCase().includes(query) ||
                          v.doc_number.toLowerCase().includes(query) ||
                          (v.control_number || '').toLowerCase().includes(query);
                          
        const matchMes = mesVal ? v.date.startsWith(mesVal) : true;
        const matchQuincena = checkFiltroQuincena(v.date, quincenaVal);

        return matchText && matchMes && matchQuincena;
    });
    renderTablaVentas(filtradas);
}

function filtrarContactos() {
    const query = document.getElementById('buscar-contactos').value.toLowerCase();
    const tipoVal = document.getElementById('filtro-tipo-contactos').value;

    const filtrados = state.contactos.filter(c => {
        const matchText = c.name.toLowerCase().includes(query) ||
                          c.tax_id.toLowerCase().includes(query) ||
                          (c.email || '').toLowerCase().includes(query);
        const matchTipo = tipoVal ? c.type === tipoVal : true;
        return matchText && matchTipo;
    });
    renderTablaContactos(filtrados);
}

// --- CRUD OPERACIONES ---

// --- Contactos ---
function abrirModalContacto(tipoDefault = 'cliente') {
    document.getElementById('form-contacto').reset();
    document.getElementById('contacto-id').value = '';
    if (document.getElementById('contacto-documento-tipo')) {
        document.getElementById('contacto-documento-tipo').value = 'RIF';
    }
    document.getElementById('contacto-type').value = tipoDefault;
    document.getElementById('contacto-especial').value = 'no';
    document.getElementById('modal-contacto-title').innerText = 'Registrar R.I.F. de Contacto';
    document.getElementById('modal-contacto').classList.add('active');
}
function cerrarModalContacto() {
    document.getElementById('modal-contacto').classList.remove('active');
}

document.getElementById('form-contacto').addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = document.getElementById('contacto-id').value;
    const taxId = document.getElementById('contacto-tax-id').value.trim().toUpperCase();
    const name = document.getElementById('contacto-name').value.trim();
    const type = document.getElementById('contacto-type').value;
    const especial = document.getElementById('contacto-especial').value;
    const email = document.getElementById('contacto-email').value.trim();
    const phone = document.getElementById('contacto-phone').value.trim();
    const address = document.getElementById('contacto-address').value.trim();

    if (!taxId || !name) {
        mostrarNotificacion('R.I.F. y Razón Social son obligatorios.', 'warning');
        return;
    }

    if (!validarFormatoRif(taxId)) {
        mostrarNotificacion('El R.I.F. o Cédula ingresada no tiene un formato válido (Ej: J-12345678-9 o V-12345678).', 'warning');
        return;
    }

    if (idVal) {
        const idx = state.contactos.findIndex(c => c.id === parseInt(idVal));
        if (idx !== -1) {
            state.contactos[idx] = { id: parseInt(idVal), tax_id: taxId, name, type, especial, email, phone, address };
            mostrarNotificacion('Contacto fiscal actualizado.', 'success');
        }
    } else {
        const nuevoId = state.contactos.length > 0 ? Math.max(...state.contactos.map(c => c.id)) + 1 : 1;
        state.contactos.push({ id: nuevoId, tax_id: taxId, name, type, especial, email, phone, address });
        mostrarNotificacion('Nuevo R.I.F. guardado con éxito.', 'success');
    }

    guardarDatos();
    renderAll();
    cerrarModalContacto();
});

function editarContacto(id) {
    const c = state.contactos.find(item => item.id === id);
    if (!c) return;

    document.getElementById('contacto-id').value = c.id;
    if (document.getElementById('contacto-documento-tipo')) {
        document.getElementById('contacto-documento-tipo').value = determinarTipoDoc(c.tax_id);
    }
    document.getElementById('contacto-tax-id').value = c.tax_id;
    document.getElementById('contacto-name').value = c.name;
    document.getElementById('contacto-type').value = c.type;
    document.getElementById('contacto-especial').value = c.especial || 'no';
    document.getElementById('contacto-email').value = c.email || '';
    document.getElementById('contacto-phone').value = c.phone || '';
    document.getElementById('contacto-address').value = c.address || '';

    document.getElementById('modal-contacto-title').innerText = 'Modificar Registro Fiscal';
    document.getElementById('modal-contacto').classList.add('active');
}

function eliminarContacto(id) {
    const c = state.contactos.find(item => item.id === id);
    if (!c) return;

    const enCompras = state.compras.some(comp => comp.contact_id === id);
    const enVentas = state.ventas.some(v => v.contact_id === id);
    
    if (enCompras || enVentas) {
        mostrarNotificacion('No se puede borrar. R.I.F. asociado a transacciones de libros.', 'danger');
        return;
    }

    if (confirm(`¿Deseas eliminar a "${c.name}"?`)) {
        state.contactos = state.contactos.filter(item => item.id !== id);
        guardarDatos();
        renderAll();
        mostrarNotificacion('Contacto eliminado.', 'success');
    }
}

// --- Compras ---
function abrirModalCompra() {
    document.getElementById('form-compra').reset();
    document.getElementById('compra-id').value = '';
    document.getElementById('compra-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('compra-retention-box').classList.remove('active');
    document.getElementById('compra-ret-pct-custom-group').style.display = 'none';
    document.getElementById('modal-compra-title').innerText = 'Registrar Factura de Compra';
    
    // Reset new fields
    document.getElementById('compra-export-form-d').value = '';
    document.getElementById('compra-import-expediente').value = '';
    document.getElementById('compra-nota-debito').value = '';
    document.getElementById('compra-nota-credito').value = '';
    document.getElementById('compra-sin-credito').value = '';
    document.getElementById('compra-retencion-terceros').value = '';
    document.getElementById('compra-iva-percibido-aduana').value = '';
    document.getElementById('compra-territorialidad').value = 'nacional';
    
    if (window.toggleCompraImportFields) window.toggleCompraImportFields();
    if (window.toggleCompraNotasFields) window.toggleCompraNotasFields();
    
    renderSelectoresContactos();
    actualizarFacturasAfectadasCompra();
    document.getElementById('modal-compra').classList.add('active');
}
function cerrarModalCompra() {
    document.getElementById('modal-compra').classList.remove('active');
}

document.getElementById('form-compra').addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = document.getElementById('compra-id').value;
    
    const date = document.getElementById('compra-date').value;
    const doc_type = document.getElementById('compra-doc-type').value;
    const doc_afectado = document.getElementById('compra-doc-afectado').value.trim();
    const doc_number = document.getElementById('compra-doc-number').value.trim();
    const control_number = document.getElementById('compra-control-number').value.trim();
    const contact_id = parseInt(document.getElementById('compra-proveedor').value);
    const is_import = document.getElementById('compra-territorialidad').value === 'importacion';

    // Desglose
    const base_exenta = parseFloat(document.getElementById('compra-base-exenta').value) || 0;
    const sin_credito = parseFloat(document.getElementById('compra-sin-credito').value) || 0;
    const base_general = parseFloat(document.getElementById('compra-base-general').value) || 0;
    const tax_general = parseFloat(document.getElementById('compra-iva-general').value) || 0;
    const base_reducida = parseFloat(document.getElementById('compra-base-reducida').value) || 0;
    const tax_reducida = parseFloat(document.getElementById('compra-iva-reducida').value) || 0;
    const base_adicional = parseFloat(document.getElementById('compra-base-adicional').value) || 0;
    const tax_adicional = parseFloat(document.getElementById('compra-iva-adicional').value) || 0;
    const total_amount = parseFloat(document.getElementById('compra-total').value) || 0;
    
    const status = document.getElementById('compra-status').value;
    const notes = document.getElementById('compra-notes').value.trim();

    // Retención
    const has_ret = document.getElementById('compra-has-retention').checked;
    const retention_pct_select = document.getElementById('compra-retention-pct').value;
    let retention_pct = 75;
    if (retention_pct_select === '100') retention_pct = 100;
    else if (retention_pct_select === 'otro') retention_pct = parseFloat(document.getElementById('compra-retention-pct-custom').value) || 0;
    
    const retention_amount = has_ret ? parseFloat(document.getElementById('compra-retention-amount').value) || 0 : 0;
    const retention_number = has_ret ? document.getElementById('compra-retention-number').value.trim() : '';
    const retention_date = has_ret ? document.getElementById('compra-retention-date').value : '';

    const export_form_d = is_import ? document.getElementById('compra-export-form-d').value.trim() : '';
    const import_expediente = is_import ? document.getElementById('compra-import-expediente').value.trim() : '';
    const nota_debito = doc_type === 'Nota Débito' ? (document.getElementById('compra-nota-debito').value.trim() || doc_number) : '';
    const nota_credito = doc_type === 'Nota Crédito' ? (document.getElementById('compra-nota-credito').value.trim() || doc_number) : '';
    const retencion_terceros = has_ret ? (parseFloat(document.getElementById('compra-retencion-terceros').value) || 0) : 0;
    const iva_percibido_aduana = is_import ? (parseFloat(document.getElementById('compra-iva-percibido-aduana').value) || 0) : 0;

    if (!date || !doc_number || !control_number || !contact_id || (total_amount <= 0 && doc_type === 'Factura')) {
        mostrarNotificacion('Completa los campos requeridos de la factura fiscal.', 'warning');
        return;
    }

    // 1. Facturas Duplicadas
    const existeDuplicada = state.compras.some(c => 
        c.contact_id === contact_id && 
        c.doc_number.toLowerCase() === doc_number.toLowerCase() && 
        c.id !== parseInt(idVal || -1)
    );
    if (existeDuplicada) {
        mostrarNotificacion(`Ya existe una factura registrada con el N° ${doc_number} para este proveedor.`, 'warning');
        return;
    }

    // 2. Fechas Coherentes (Fecha futura y fecha de retención posterior)
    const hoyStr = new Date().toISOString().substring(0, 10);
    if (date > hoyStr) {
        mostrarNotificacion('La fecha de la factura no puede ser superior a la fecha actual.', 'warning');
        return;
    }
    if (has_ret && retention_date < date) {
        mostrarNotificacion('La fecha de retención no puede ser anterior a la fecha de emisión de la factura.', 'warning');
        return;
    }

    // 3. Coherencia Matemática del IVA
    if ((base_general > 0 && tax_general === 0) || (base_general === 0 && tax_general > 0)) {
        mostrarNotificacion('Incoherencia en alícuota general: no puede haber base imponible sin impuesto general de IVA o viceversa.', 'warning');
        return;
    }
    if ((base_reducida > 0 && tax_reducida === 0) || (base_reducida === 0 && tax_reducida > 0)) {
        mostrarNotificacion('Incoherencia en alícuota reducida: comprueba la base y su respectivo IVA (8%).', 'warning');
        return;
    }
    if ((base_adicional > 0 && tax_adicional === 0) || (base_adicional === 0 && tax_adicional > 0)) {
        mostrarNotificacion('Incoherencia en alícuota adicional: comprueba la base y su respectivo IVA (31%).', 'warning');
        return;
    }

    // 4. Contribuyente Especial vs Ordinario en Compras
    if (has_ret && state.config.empresaContribuyente !== 'especial') {
        mostrarNotificacion('La empresa actual está configurada como Contribuyente Ordinario. No se permite realizar retenciones de IVA en compras.', 'warning');
        return;
    }

    // Interceptador para Notas de Crédito / Débito: actualizar factura afectada en caliente
    if (doc_type === 'Nota Crédito' || doc_type === 'Nota Débito') {
        if (!doc_afectado) {
            mostrarNotificacion('Debe seleccionar la Factura Afectada para registrar la nota.', 'warning');
            return;
        }

        let originalInvoice = state.compras.find(c => 
            String(c.doc_number).trim() === String(doc_afectado).trim() && 
            Number(c.contact_id) === Number(contact_id)
        );
        if (!originalInvoice) {
            originalInvoice = state.compras.find(c => 
                String(c.doc_number).trim() === String(doc_afectado).trim()
            );
        }

        if (!originalInvoice) {
            mostrarNotificacion(`No se encontró la Factura Afectada N° ${doc_afectado} en los registros de compras para aplicar el ajuste.`, 'warning');
            return;
        }

        const factor = doc_type === 'Nota Crédito' ? -1 : 1;

        originalInvoice.base_exenta = Math.max(0, (originalInvoice.base_exenta || 0) + (base_exenta * factor));
        originalInvoice.sin_credito = Math.max(0, (originalInvoice.sin_credito || 0) + (sin_credito * factor));
        originalInvoice.base_general = Math.max(0, (originalInvoice.base_general || 0) + (base_general * factor));
        originalInvoice.tax_general = Math.max(0, (originalInvoice.tax_general || 0) + (tax_general * factor));
        originalInvoice.base_reducida = Math.max(0, (originalInvoice.base_reducida || 0) + (base_reducida * factor));
        originalInvoice.tax_reducida = Math.max(0, (originalInvoice.tax_reducida || 0) + (tax_reducida * factor));
        originalInvoice.base_adicional = Math.max(0, (originalInvoice.base_adicional || 0) + (base_adicional * factor));
        originalInvoice.tax_adicional = Math.max(0, (originalInvoice.tax_adicional || 0) + (tax_adicional * factor));
        originalInvoice.total_amount = Math.max(0, (originalInvoice.total_amount || 0) + (total_amount * factor));

        originalInvoice.net_amount = (originalInvoice.base_general || 0) + (originalInvoice.base_reducida || 0) + (originalInvoice.base_adicional || 0);
        originalInvoice.tax_amount = (originalInvoice.tax_general || 0) + (originalInvoice.tax_reducida || 0) + (originalInvoice.tax_adicional || 0);

        if (doc_type === 'Nota Crédito') {
            originalInvoice.nota_credito = doc_number;
        } else {
            originalInvoice.nota_debito = doc_number;
        }
        originalInvoice.doc_afectado = doc_afectado;

        mostrarNotificacion(`Ajuste de ${doc_type} aplicado con éxito sobre la Factura N° ${doc_afectado}.`, 'success');
        
        guardarDatos();
        renderAll();
        cerrarModalCompra();
        return;
    }

    const payload = {
        type: 'compra',
        date, doc_type, doc_afectado, doc_number, control_number, contact_id,
        is_import_export: is_import,
        base_exenta, base_general, tax_general, base_reducida, tax_reducida, base_adicional, tax_adicional,
        net_amount: base_general + base_reducida + base_adicional,
        tax_amount: tax_general + tax_reducida + tax_adicional,
        total_amount,
        has_retention: has_ret, retention_pct, retention_amount, retention_number, retention_date,
        status, notes,
        export_form_d, import_expediente, nota_debito, nota_credito, sin_credito, retencion_terceros, iva_percibido_aduana
    };

    if (idVal) {
        const idx = state.compras.findIndex(c => c.id === parseInt(idVal));
        if (idx !== -1) {
            state.compras[idx] = { id: parseInt(idVal), ...payload };
            mostrarNotificacion('Factura de compra actualizada.', 'success');
        }
    } else {
        const nuevoId = state.compras.length > 0 ? Math.max(...state.compras.map(c => c.id)) + 1 : 1;
        state.compras.push({ id: nuevoId, ...payload });
        mostrarNotificacion('Factura registrada en el Libro de Compras.', 'success');
    }

    guardarDatos();
    renderAll();
    cerrarModalCompra();
});

// --- Ventas ---
function abrirModalVenta() {
    document.getElementById('form-venta').reset();
    document.getElementById('venta-id').value = '';
    document.getElementById('venta-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('venta-retention-box').classList.remove('active');
    document.getElementById('venta-ret-pct-custom-group').style.display = 'none';
    document.getElementById('modal-venta-title').innerText = 'Registrar Factura de Venta';
    
    // Reset new fields
    document.getElementById('venta-export-form-d').value = '';
    document.getElementById('venta-nota-debito').value = '';
    document.getElementById('venta-nota-credito').value = '';
    document.getElementById('venta-iva-percibido-comprador').value = '';
    
    document.getElementById('venta-is-fiscal-printer').checked = false;
    if (document.getElementById('venta-fiscal-inicio')) document.getElementById('venta-fiscal-inicio').value = '';
    if (document.getElementById('venta-fiscal-final')) document.getElementById('venta-fiscal-final').value = '';
    document.getElementById('venta-fiscal-printer-box').classList.remove('active');
    document.getElementById('venta-fiscal-machine').value = '';
    document.getElementById('venta-control-z').value = '';
    if (window.actualizarCamposFiscalesVenta) window.actualizarCamposFiscalesVenta();

    document.getElementById('venta-is-terceros').checked = false;
    document.getElementById('venta-terceros-box').classList.remove('active');
    document.getElementById('venta-terceros-total').value = '';
    document.getElementById('venta-terceros-exentas').value = '';
    document.getElementById('venta-terceros-gravadas').value = '';
    
    document.getElementById('venta-territorialidad').value = 'nacional';
    
    if (window.toggleVentaExportFields) window.toggleVentaExportFields();
    if (window.toggleVentaNotasFields) window.toggleVentaNotasFields();

    renderSelectoresContactos();
    actualizarFacturasAfectadasVenta();
    document.getElementById('modal-venta').classList.add('active');
}
function cerrarModalVenta() {
    document.getElementById('modal-venta').classList.remove('active');
}

document.getElementById('form-venta').addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = document.getElementById('venta-id').value;
    
    const date = document.getElementById('venta-date').value;
    const doc_type = document.getElementById('venta-doc-type').value;
    const doc_afectado = document.getElementById('venta-doc-afectado').value.trim();
    const isFiscal = document.getElementById('venta-is-fiscal-printer').checked;
    const doc_number = isFiscal 
        ? document.getElementById('venta-fiscal-inicio').value.trim() 
        : document.getElementById('venta-doc-number').value.trim();
    const control_number = isFiscal 
        ? document.getElementById('venta-fiscal-final').value.trim() 
        : document.getElementById('venta-control-number').value.trim();
    const contact_id = parseInt(document.getElementById('venta-cliente').value);
    const is_export = document.getElementById('venta-territorialidad').value === 'exportacion';

    // Desglose
    const base_exenta = parseFloat(document.getElementById('venta-base-exenta').value) || 0;
    const base_general = parseFloat(document.getElementById('venta-base-general').value) || 0;
    const tax_general = parseFloat(document.getElementById('venta-iva-general').value) || 0;
    const base_reducida = parseFloat(document.getElementById('venta-base-reducida').value) || 0;
    const tax_reducida = parseFloat(document.getElementById('venta-iva-reducida').value) || 0;
    const base_adicional = parseFloat(document.getElementById('venta-base-adicional').value) || 0;
    const tax_adicional = parseFloat(document.getElementById('venta-iva-adicional').value) || 0;
    const total_amount = parseFloat(document.getElementById('venta-total').value) || 0;
    
    const status = document.getElementById('venta-status').value;
    const notes = document.getElementById('venta-notes').value.trim();

    // Retención
    const has_ret = document.getElementById('venta-has-retention').checked;
    const retention_pct_select = document.getElementById('venta-retention-pct').value;
    let retention_pct = 75;
    if (retention_pct_select === '100') retention_pct = 100;
    else if (retention_pct_select === 'otro') retention_pct = parseFloat(document.getElementById('venta-retention-pct-custom').value) || 0;
    
    const retention_amount = has_ret ? parseFloat(document.getElementById('venta-retention-amount').value) || 0 : 0;
    const retention_number = has_ret ? document.getElementById('venta-retention-number').value.trim() : '';
    const retention_date = has_ret ? document.getElementById('venta-retention-date').value : '';

    // Nuevos campos
    const fiscal_machine = document.getElementById('venta-is-fiscal-printer').checked ? document.getElementById('venta-fiscal-machine').value.trim() : '';
    const control_z = document.getElementById('venta-is-fiscal-printer').checked ? document.getElementById('venta-control-z').value.trim() : '';
    const export_form_d = is_export ? document.getElementById('venta-export-form-d').value.trim() : '';
    const nota_debito = doc_type === 'Nota Débito' ? (document.getElementById('venta-nota-debito').value.trim() || doc_number) : '';
    const nota_credito = doc_type === 'Nota Crédito' ? (document.getElementById('venta-nota-credito').value.trim() || doc_number) : '';
    const iva_percibido_comprador = has_ret ? (parseFloat(document.getElementById('venta-iva-percibido-comprador').value) || 0) : 0;
    const ventas_terceros_total = document.getElementById('venta-is-terceros').checked ? (parseFloat(document.getElementById('venta-terceros-total').value) || 0) : 0;
    const ventas_terceros_exentas = document.getElementById('venta-is-terceros').checked ? (parseFloat(document.getElementById('venta-terceros-exentas').value) || 0) : 0;
    const ventas_terceros_gravadas = document.getElementById('venta-is-terceros').checked ? (parseFloat(document.getElementById('venta-terceros-gravadas').value) || 0) : 0;

    if (!date || !doc_number || !control_number || !contact_id || (total_amount <= 0 && doc_type === 'Factura')) {
        mostrarNotificacion('Completa los campos requeridos de la factura fiscal.', 'warning');
        return;
    }

    // 1. Fechas Coherentes (Fecha futura y fecha de retención posterior)
    const hoyStr = new Date().toISOString().substring(0, 10);
    if (date > hoyStr) {
        mostrarNotificacion('La fecha de la factura no puede ser superior a la fecha actual.', 'warning');
        return;
    }
    if (has_ret && retention_date < date) {
        mostrarNotificacion('La fecha de retención no puede ser anterior a la fecha de emisión de la factura.', 'warning');
        return;
    }

    // 2. Coherencia Matemática del IVA
    if ((base_general > 0 && tax_general === 0) || (base_general === 0 && tax_general > 0)) {
        mostrarNotificacion('Incoherencia en alícuota general: no puede haber base imponible de venta sin su IVA o viceversa.', 'warning');
        return;
    }
    if ((base_reducida > 0 && tax_reducida === 0) || (base_reducida === 0 && tax_reducida > 0)) {
        mostrarNotificacion('Incoherencia en alícuota reducida en ventas: comprueba la base y su respectivo IVA (8%).', 'warning');
        return;
    }
    if ((base_adicional > 0 && tax_adicional === 0) || (base_adicional === 0 && tax_adicional > 0)) {
        mostrarNotificacion('Incoherencia en alícuota adicional en ventas: comprueba la base y su respectivo IVA (31%).', 'warning');
        return;
    }

    // 3. Cliente Contribuyente Especial en Ventas
    if (has_ret) {
        const clienteObj = state.contactos.find(c => c.id === contact_id);
        if (clienteObj && clienteObj.especial !== 'si') {
            mostrarNotificacion('El cliente seleccionado no es Contribuyente Especial. No se pueden recibir retenciones de IVA de clientes ordinarios.', 'warning');
            return;
        }
    }

    // Interceptador para Notas de Crédito / Débito: actualizar factura afectada en caliente
    if (doc_type === 'Nota Crédito' || doc_type === 'Nota Débito') {
        if (!doc_afectado) {
            mostrarNotificacion('Debe seleccionar la Factura Afectada para registrar la nota.', 'warning');
            return;
        }

        let originalInvoice = state.ventas.find(v => 
            String(v.doc_number).trim() === String(doc_afectado).trim() && 
            Number(v.contact_id) === Number(contact_id)
        );
        if (!originalInvoice) {
            originalInvoice = state.ventas.find(v => 
                String(v.doc_number).trim() === String(doc_afectado).trim()
            );
        }

        if (!originalInvoice) {
            mostrarNotificacion(`No se encontró la Factura Afectada N° ${doc_afectado} en los registros de ventas para aplicar el ajuste.`, 'warning');
            return;
        }

        const factor = doc_type === 'Nota Crédito' ? -1 : 1;

        originalInvoice.base_exenta = Math.max(0, (originalInvoice.base_exenta || 0) + (base_exenta * factor));
        originalInvoice.base_general = Math.max(0, (originalInvoice.base_general || 0) + (base_general * factor));
        originalInvoice.tax_general = Math.max(0, (originalInvoice.tax_general || 0) + (tax_general * factor));
        originalInvoice.base_reducida = Math.max(0, (originalInvoice.base_reducida || 0) + (base_reducida * factor));
        originalInvoice.tax_reducida = Math.max(0, (originalInvoice.tax_reducida || 0) + (tax_reducida * factor));
        originalInvoice.base_adicional = Math.max(0, (originalInvoice.base_adicional || 0) + (base_adicional * factor));
        originalInvoice.tax_adicional = Math.max(0, (originalInvoice.tax_adicional || 0) + (tax_adicional * factor));
        originalInvoice.total_amount = Math.max(0, (originalInvoice.total_amount || 0) + (total_amount * factor));

        originalInvoice.net_amount = (originalInvoice.base_general || 0) + (originalInvoice.base_reducida || 0) + (originalInvoice.base_adicional || 0);
        originalInvoice.tax_amount = (originalInvoice.tax_general || 0) + (originalInvoice.tax_reducida || 0) + (originalInvoice.tax_adicional || 0);

        if (doc_type === 'Nota Crédito') {
            originalInvoice.nota_credito = doc_number;
        } else {
            originalInvoice.nota_debito = doc_number;
        }
        originalInvoice.doc_afectado = doc_afectado;

        mostrarNotificacion(`Ajuste de ${doc_type} aplicado con éxito sobre la Factura N° ${doc_afectado}.`, 'success');
        
        guardarDatos();
        renderAll();
        cerrarModalVenta();
        return;
    }

    const payload = {
        type: 'venta',
        date, doc_type, doc_afectado, doc_number, control_number, contact_id,
        is_import_export: is_export,
        base_exenta, base_general, tax_general, base_reducida, tax_reducida, base_adicional, tax_adicional,
        net_amount: base_general + base_reducida + base_adicional,
        tax_amount: tax_general + tax_reducida + tax_adicional,
        total_amount,
        has_retention: has_ret, retention_pct, retention_amount, retention_number, retention_date,
        status, notes,
        fiscal_machine, control_z, export_form_d, nota_debito, nota_credito, iva_percibido_comprador,
        ventas_terceros_total, ventas_terceros_exentas, ventas_terceros_gravadas
    };

    if (idVal) {
        const idx = state.ventas.findIndex(v => v.id === parseInt(idVal));
        if (idx !== -1) {
            state.ventas[idx] = { id: parseInt(idVal), ...payload };
            mostrarNotificacion('Factura de venta actualizada.', 'success');
        }
    } else {
        const nuevoId = state.ventas.length > 0 ? Math.max(...state.ventas.map(v => v.id)) + 1 : 1;
        state.ventas.push({ id: nuevoId, ...payload });
        mostrarNotificacion('Factura registrada en el Libro de Ventas.', 'success');
    }

    guardarDatos();
    renderAll();
    cerrarModalVenta();
});

// Editar transacciones (globales)
window.editarTransaccion = function(tipo, id) {
    renderSelectoresContactos();
    
    if (tipo === 'compra') {
        const item = state.compras.find(c => c.id === id);
        if (!item) return;

        document.getElementById('compra-id').value = item.id;
        document.getElementById('compra-date').value = item.date;
        document.getElementById('compra-doc-type').value = item.doc_type;
        document.getElementById('compra-proveedor').value = item.contact_id;
        actualizarFacturasAfectadasCompra(item.doc_afectado || '');
        document.getElementById('compra-doc-number').value = item.doc_number;
        document.getElementById('compra-control-number').value = item.control_number || '';
        document.getElementById('compra-territorialidad').value = item.is_import_export ? 'importacion' : 'nacional';
        
        document.getElementById('compra-base-exenta').value = item.base_exenta || '';
        document.getElementById('compra-sin-credito').value = item.sin_credito || '';
        document.getElementById('compra-base-general').value = item.base_general || '';
        document.getElementById('compra-iva-general').value = item.tax_general || '';
        document.getElementById('compra-base-reducida').value = item.base_reducida || '';
        document.getElementById('compra-iva-reducida').value = item.tax_reducida || '';
        document.getElementById('compra-base-adicional').value = item.base_adicional || '';
        document.getElementById('compra-iva-adicional').value = item.tax_adicional || '';
        
        document.getElementById('compra-export-form-d').value = item.export_form_d || '';
        document.getElementById('compra-import-expediente').value = item.import_expediente || '';
        document.getElementById('compra-nota-debito').value = item.nota_debito || '';
        document.getElementById('compra-nota-credito').value = item.nota_credito || '';
        
        document.getElementById('compra-total').value = item.total_amount;
        if (document.getElementById('compra-monto-ajuste')) {
            document.getElementById('compra-monto-ajuste').value = item.total_amount || '';
        }
        document.getElementById('compra-status').value = item.status;
        document.getElementById('compra-notes').value = item.notes || '';

        const checkRet = document.getElementById('compra-has-retention');
        const boxRet = document.getElementById('compra-retention-box');
        checkRet.checked = item.has_retention || false;
        
        if (item.has_retention) {
            boxRet.classList.add('active');
            const pctVal = item.retention_pct === 75 || item.retention_pct === 100 ? item.retention_pct.toString() : 'otro';
            document.getElementById('compra-retention-pct').value = pctVal;
            if (pctVal === 'otro') {
                document.getElementById('compra-ret-pct-custom-group').style.display = 'block';
                document.getElementById('compra-retention-pct-custom').value = item.retention_pct;
            } else {
                document.getElementById('compra-ret-pct-custom-group').style.display = 'none';
            }
            document.getElementById('compra-retention-amount').value = item.retention_amount || '';
            document.getElementById('compra-retention-number').value = item.retention_number || '';
            document.getElementById('compra-retention-date').value = item.retention_date || '';
            document.getElementById('compra-retencion-terceros').value = item.retencion_terceros || '';
        } else {
            boxRet.classList.remove('active');
            document.getElementById('compra-ret-pct-custom-group').style.display = 'none';
            document.getElementById('compra-retencion-terceros').value = '';
        }

        document.getElementById('compra-iva-percibido-aduana').value = item.iva_percibido_aduana || '';

        if (window.toggleCompraNotasFields) window.toggleCompraNotasFields();
        if (window.toggleCompraImportFields) window.toggleCompraImportFields();

        document.getElementById('modal-compra-title').innerText = 'Modificar Factura de Compra';
        document.getElementById('modal-compra').classList.add('active');
        
    } else {
        const item = state.ventas.find(v => v.id === id);
        if (!item) return;

        document.getElementById('venta-id').value = item.id;
        document.getElementById('venta-date').value = item.date;
        document.getElementById('venta-doc-type').value = item.doc_type;
        document.getElementById('venta-cliente').value = item.contact_id;
        actualizarFacturasAfectadasVenta(item.doc_afectado || '');
        const isFiscal = !!(item.fiscal_machine || item.control_z);
        document.getElementById('venta-is-fiscal-printer').checked = isFiscal;
        if (window.actualizarCamposFiscalesVenta) window.actualizarCamposFiscalesVenta();

        if (isFiscal) {
            document.getElementById('venta-fiscal-machine').value = item.fiscal_machine || '';
            document.getElementById('venta-control-z').value = item.control_z || '';
            document.getElementById('venta-fiscal-inicio').value = item.doc_number || '';
            document.getElementById('venta-fiscal-final').value = item.control_number || '';
            document.getElementById('venta-doc-number').value = '';
            document.getElementById('venta-control-number').value = '';
        } else {
            document.getElementById('venta-doc-number').value = item.doc_number || '';
            document.getElementById('venta-control-number').value = item.control_number || '';
            if (document.getElementById('venta-fiscal-inicio')) document.getElementById('venta-fiscal-inicio').value = '';
            if (document.getElementById('venta-fiscal-final')) document.getElementById('venta-fiscal-final').value = '';
        }
        document.getElementById('venta-territorialidad').value = item.is_import_export ? 'exportacion' : 'nacional';
        
        document.getElementById('venta-base-exenta').value = item.base_exenta || '';
        document.getElementById('venta-base-general').value = item.base_general || '';
        document.getElementById('venta-iva-general').value = item.tax_general || '';
        document.getElementById('venta-base-reducida').value = item.base_reducida || '';
        document.getElementById('venta-iva-reducida').value = item.tax_reducida || '';
        document.getElementById('venta-base-adicional').value = item.base_adicional || '';
        document.getElementById('venta-iva-adicional').value = item.tax_adicional || '';
        
        document.getElementById('venta-export-form-d').value = item.export_form_d || '';
        document.getElementById('venta-nota-debito').value = item.nota_debito || '';
        document.getElementById('venta-nota-credito').value = item.nota_credito || '';
        
        document.getElementById('venta-total').value = item.total_amount;
        if (document.getElementById('venta-monto-ajuste')) {
            document.getElementById('venta-monto-ajuste').value = item.total_amount || '';
        }
        document.getElementById('venta-status').value = item.status;
        document.getElementById('venta-notes').value = item.notes || '';

        const checkRet = document.getElementById('venta-has-retention');
        const boxRet = document.getElementById('venta-retention-box');
        checkRet.checked = item.has_retention || false;
        
        if (item.has_retention) {
            boxRet.classList.add('active');
            const pctVal = item.retention_pct === 75 || item.retention_pct === 100 ? item.retention_pct.toString() : 'otro';
            document.getElementById('venta-retention-pct').value = pctVal;
            if (pctVal === 'otro') {
                document.getElementById('venta-ret-pct-custom-group').style.display = 'block';
                document.getElementById('venta-retention-pct-custom').value = item.retention_pct;
            } else {
                document.getElementById('venta-ret-pct-custom-group').style.display = 'none';
            }
            document.getElementById('venta-retention-amount').value = item.retention_amount || '';
            document.getElementById('venta-retention-number').value = item.retention_number || '';
            document.getElementById('venta-retention-date').value = item.retention_date || '';
            document.getElementById('venta-iva-percibido-comprador').value = item.iva_percibido_comprador || '';
        } else {
            boxRet.classList.remove('active');
            document.getElementById('venta-ret-pct-custom-group').style.display = 'none';
            document.getElementById('venta-iva-percibido-comprador').value = '';
        }

        // Campos fiscales ya configurados arriba

        const isTerceros = !!(item.ventas_terceros_total || item.ventas_terceros_exentas || item.ventas_terceros_gravadas);
        document.getElementById('venta-is-terceros').checked = isTerceros;
        const boxTerceros = document.getElementById('venta-terceros-box');
        if (isTerceros) {
            boxTerceros.classList.add('active');
            document.getElementById('venta-terceros-total').value = item.ventas_terceros_total || '';
            document.getElementById('venta-terceros-exentas').value = item.ventas_terceros_exentas || '';
            document.getElementById('venta-terceros-gravadas').value = item.ventas_terceros_gravadas || '';
        } else {
            boxTerceros.classList.remove('active');
            document.getElementById('venta-terceros-total').value = '';
            document.getElementById('venta-terceros-exentas').value = '';
            document.getElementById('venta-terceros-gravadas').value = '';
        }

        if (window.toggleVentaNotasFields) window.toggleVentaNotasFields();
        if (window.toggleVentaExportFields) window.toggleVentaExportFields();

        document.getElementById('modal-venta-title').innerText = 'Modificar Factura de Venta';
        document.getElementById('modal-venta').classList.add('active');
    }
}

window.eliminarTransaccion = function(tipo, id) {
    const libro = tipo === 'compra' ? 'compras' : 'ventas';
    if (confirm('¿Deseas eliminar este registro fiscal?')) {
        state[libro] = state[libro].filter(item => item.id !== id);
        guardarDatos();
        renderAll();
        mostrarNotificacion('Registro fiscal eliminado del libro.', 'success');
    }
}

window.editarContacto = editarContacto;
window.eliminarContacto = eliminarContacto;

// --- REPORTE CONSOLIDADO: FORMA 30 SENIAT ---

function setElementValue(id, value, isInput = false) {
    if (isInput) {
        const input1 = document.getElementById(id);
        if (input1) input1.value = value;
        const input2 = document.getElementById(id + '-art72');
        if (input2) input2.value = value;
    } else {
        const text1 = document.getElementById(id);
        if (text1) text1.innerText = value;
        const text2 = document.getElementById(id + '-art72');
        if (text2) text2.innerText = value;
    }
}

function generarForma30SENIAT() {
    const inputMes = document.getElementById('reporte-mes-select');
    const inputPeriodo = document.getElementById('reporte-periodo-select');

    const mesStr = inputMes.value || new Date().toISOString().substring(0, 7);
    const periodo = inputPeriodo.value || 'completo';

    // Rellenar cabecera Forma 30
    const empresaName = state.config.empresaName || 'Contribuyente sin Nombre';
    const empresaRut = state.config.empresaRut || 'J-00000000-0';
    
    document.getElementById('report-header-empresa').innerText = empresaName;
    document.getElementById('report-header-rut').innerText = empresaRut;
    document.getElementById('report-header-contribuyente-tipo').innerText = state.config.empresaContribuyente === 'especial' 
        ? 'CONTRIBUYENTE ESPECIAL (Agente de Retención)' 
        : 'CONTRIBUYENTE ORDINARIO';

    const empresaArt72 = document.getElementById('report-header-empresa-art72');
    if (empresaArt72) empresaArt72.innerText = empresaName;
    const rutArt72 = document.getElementById('report-header-rut-art72');
    if (rutArt72) rutArt72.innerText = empresaRut;

    // Rellenar MES y AÑO en el periodo de imposición de la Forma 30 oficial
    document.getElementById('report-header-mes').innerText = mesStr.substring(5, 7);
    document.getElementById('report-header-ano').innerText = mesStr.substring(0, 4);

    let labelPeriodo = formatearMesNombre(mesStr).toUpperCase();
    if (periodo === 'q1') labelPeriodo += ' - 1RA QUINCENA (Días 01 al 15)';
    else if (periodo === 'q2') labelPeriodo += ' - 2DA QUINCENA (Días 16 al fin)';
    document.getElementById('report-period-title').innerText = labelPeriodo;

    // Calcular rango de fechas para Art. 72
    const anoNum = parseInt(mesStr.substring(0, 4));
    const mesNum = parseInt(mesStr.substring(5, 7));
    const ultimoDia = new Date(anoNum, mesNum, 0).getDate();
    let fechaRango = "";
    const mesPad = mesStr.substring(5, 7);
    if (periodo === 'q1') {
        fechaRango = `01/${mesPad}/${anoNum} al 15/${mesPad}/${anoNum}`;
    } else if (periodo === 'q2') {
        fechaRango = `16/${mesPad}/${anoNum} al ${ultimoDia}/${mesPad}/${anoNum}`;
    } else {
        fechaRango = `01/${mesPad}/${anoNum} al ${ultimoDia}/${mesPad}/${anoNum}`;
    }
    const reportPeriodArt72 = document.getElementById('report-period-title-art72');
    if (reportPeriodArt72) {
        reportPeriodArt72.innerText = fechaRango;
    }

    // Campos del comprobante oficial (Certificado y Fecha)
    const certNumber = "99030" + mesStr.replace('-', '') + (periodo === 'q1' ? '1' : (periodo === 'q2' ? '2' : '0')) + "7412";
    document.getElementById('report-certificado-num').innerText = certNumber;
    
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('es-VE') + ' ' + now.toLocaleTimeString('es-VE');
    document.getElementById('report-presentacion-fecha').innerText = dateFormatted;

    // --- FILTRADO DE TRANSACCIONES ---
    const filterFunc = (item) => {
        const matchMes = item.date.startsWith(mesStr);
        const matchPeriodo = checkFiltroQuincena(item.date, periodo);
        return matchMes && matchPeriodo;
    };

    const comprasPeriodo = state.compras.filter(filterFunc);
    const ventasPeriodo = state.ventas.filter(filterFunc);

    // --- CÁLCULO DÉBITOS FISCALES (VENTAS) ---
    let vExentaBase = 0;
    let vExportBase = 0;
    let vGenBase = 0; let vGenTax = 0;
    let vRedBase = 0; let vRedTax = 0;
    let vAdicBase = 0; let vAdicTax = 0;

    ventasPeriodo.forEach(v => {
        const factor = v.doc_type === 'Nota Crédito' ? -1 : 1;
        if (v.is_import_export) {
            // Ventas de exportación (exentas de IVA pero declaradas aparte en Casilla 23)
            vExportBase += (v.total_amount || 0) * factor;
        } else {
            vExentaBase += (v.base_exenta || 0) * factor;
            vGenBase += (v.base_general || 0) * factor; vGenTax += (v.tax_general || 0) * factor;
            vRedBase += (v.base_reducida || 0) * factor; vRedTax += (v.tax_reducida || 0) * factor;
            vAdicBase += (v.base_adicional || 0) * factor; vAdicTax += (v.tax_adicional || 0) * factor;
        }
    });

    const vTotalBase = vExentaBase + vExportBase + vGenBase + vRedBase + vAdicBase;
    const vTotalTax = vGenTax + vRedTax + vAdicTax;

    // Cargar ajustes del periodo
    const active = getActiveBeneficiary();
    if (!active.ajustes) active.ajustes = [];
    let ajuste = active.ajustes.find(a => a.period === mesStr && a.quincena === periodo);
    if (!ajuste) {
        ajuste = {
            period: mesStr,
            quincena: periodo,
            debito_ajuste: 0,
            debito_exonerado: 0,
            credito_ajuste: 0,
            excedente_anterior: 0,
            credito_ajuste_tax: 0
        };
        active.ajustes.push(ajuste);
    }

    // Set values in inputs
    setElementValue('f30-v-ajuste-tax', ajuste.debito_ajuste || 0, true);
    setElementValue('f30-v-exonerado-tax', ajuste.debito_exonerado || 0, true);
    setElementValue('f30-c-excedente-anterior', ajuste.excedente_anterior || 0, true);
    setElementValue('f30-c-ajuste-tax', ajuste.credito_ajuste_tax || 0, true);

    // Escribir Débitos en F30
    setElementValue('f30-v-exenta-base', formatearMonedaF30(vExentaBase));
    setElementValue('f30-v-export-base', formatearMonedaF30(vExportBase));
    setElementValue('f30-v-general-base', formatearMonedaF30(vGenBase));
    setElementValue('f30-v-general-tax', formatearMonedaF30(vGenTax));
    setElementValue('f30-v-adicional-base', formatearMonedaF30(vAdicBase));
    setElementValue('f30-v-adicional-tax', formatearMonedaF30(vAdicTax));
    setElementValue('f30-v-reducida-base', formatearMonedaF30(vRedBase));
    setElementValue('f30-v-reducida-tax', formatearMonedaF30(vRedTax));
    
    setElementValue('f30-v-total-base', formatearMonedaF30(vTotalBase));
    setElementValue('f30-v-total-tax', formatearMonedaF30(vTotalTax));

    // TOTAL FINAL DE DÉBITOS FISCALES (Casilla 49)
    const debitoAjusteVal = parseFloat(ajuste.debito_ajuste) || 0;
    const debitoExoneradoVal = parseFloat(ajuste.debito_exonerado) || 0;
    const vTotalFinalTax = Math.max(0, vTotalTax + debitoAjusteVal - debitoExoneradoVal);
    setElementValue('f30-v-total-final-tax', formatearMonedaF30(vTotalFinalTax));

    // --- CÁLCULO CRÉDITOS FISCALES (COMPRAS) ---
    let cExentaBase = 0;
    let cImportExentaBase = 0;
    let cGenBase = 0; let cGenTax = 0;
    let cImportGenBase = 0; let cImportGenTax = 0;
    let cAdicBase = 0; let cAdicTax = 0;
    let cImportAdicBase = 0; let cImportAdicTax = 0;
    let cRedBase = 0; let cRedTax = 0;
    let cImportRedBase = 0; let cImportRedTax = 0;

    comprasPeriodo.forEach(c => {
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

    const cTotalBase = cExentaBase + cImportExentaBase + cGenBase + cImportGenBase + cRedBase + cImportRedBase + cAdicBase + cImportAdicBase;
    const cTotalTax = cGenTax + cImportGenTax + cRedTax + cImportRedTax + cAdicTax + cImportAdicTax;

    // Escribir Créditos en F30
    setElementValue('f30-c-exenta-base', formatearMonedaF30(cExentaBase + cImportExentaBase));
    setElementValue('f30-c-import-general-base', formatearMonedaF30(cImportGenBase));
    setElementValue('f30-c-import-general-tax', formatearMonedaF30(cImportGenTax));
    setElementValue('f30-c-import-adicional-base', formatearMonedaF30(cImportAdicBase));
    setElementValue('f30-c-import-adicional-tax', formatearMonedaF30(cImportAdicTax));
    setElementValue('f30-c-import-reducida-base', formatearMonedaF30(cImportRedBase));
    setElementValue('f30-c-import-reducida-tax', formatearMonedaF30(cImportRedTax));

    setElementValue('f30-c-general-base', formatearMonedaF30(cGenBase));
    setElementValue('f30-c-general-tax', formatearMonedaF30(cGenTax));
    setElementValue('f30-c-adicional-base', formatearMonedaF30(cAdicBase));
    setElementValue('f30-c-adicional-tax', formatearMonedaF30(cAdicTax));
    setElementValue('f30-c-reducida-base', formatearMonedaF30(cRedBase));
    setElementValue('f30-c-reducida-tax', formatearMonedaF30(cRedTax));

    setElementValue('f30-c-total-base', formatearMonedaF30(cTotalBase));
    setElementValue('f30-c-total-tax', formatearMonedaF30(cTotalTax));

    // Deducibles
    setElementValue('f30-c-deducibles-tax', formatearMonedaF30(cTotalTax));
    setElementValue('f30-c-prorata-tax', '0,00');
    setElementValue('f30-c-total-deducibles-tax', formatearMonedaF30(cTotalTax));

    // Ajustes créditos
    setElementValue('f30-c-reintegro-exportadores-tax', '0,00');
    setElementValue('f30-c-reintegro-exonerados-tax', '0,00');
    setElementValue('f30-c-certificados-emitidos-tax', '0,00');

    const excedenteAnteriorVal = parseFloat(ajuste.excedente_anterior) || 0;
    const creditoAjusteTaxVal = parseFloat(ajuste.credito_ajuste_tax) || 0;

    // Casilla 39: Total Créditos Fiscales (71 + 20 - 21 - 81 +/- 38 - 82)
    const cTotalFinalTax = Math.max(0, cTotalTax + excedenteAnteriorVal + creditoAjusteTaxVal);
    setElementValue('f30-c-total-final-tax', formatearMonedaF30(cTotalFinalTax));

    // --- AUTOLIQUIDACIÓN (PÁGINA 2) ---
    let totalCuotaTributaria = 0; // Casilla 53
    let excedenteMesSiguiente = 0; // Casilla 60

    const diff = vTotalFinalTax - cTotalFinalTax;
    if (diff > 0) {
        totalCuotaTributaria = diff;
    } else {
        excedenteMesSiguiente = Math.abs(diff);
    }

    setElementValue('f30-v-total-cuota', formatearMonedaF30(totalCuotaTributaria));
    setElementValue('f30-v-excedente-mes-siguiente', formatearMonedaF30(excedenteMesSiguiente));

    // Casillas 22, 51, 24
    setElementValue('f30-impuesto-pagado-sustituida', '0,00');
    setElementValue('f30-v-retenciones-sustituida', '0,00');
    setElementValue('f30-v-percepciones-sustituida', '0,00');

    // Casilla 78: Sub-total impuesto
    const subtotalImpuestoPagar = totalCuotaTributaria;
    setElementValue('f30-v-subtotal-impuesto', formatearMonedaF30(subtotalImpuestoPagar));

    // --- RETENCIONES ---
    const retencionesAcumuladasVal = parseFloat(state.config.retencionesAnteriores) || 0;
    setElementValue('f30-retenciones-acumuladas', formatearMonedaF30(retencionesAcumuladasVal));

    const retencionesPeriodoVal = ventasPeriodo.reduce((acc, curr) => acc + (curr.retention_amount || 0), 0);
    setElementValue('f30-retenciones-periodo', formatearMonedaF30(retencionesPeriodoVal));

    // Casillas 72, 73
    setElementValue('f30-retenciones-cesiones', '0,00');
    setElementValue('f30-retenciones-recuperaciones', '0,00');

    // Casilla 74: Total Retenciones
    const totalRetencionesVal = retencionesAcumuladasVal + retencionesPeriodoVal;
    setElementValue('f30-total-retenciones', formatearMonedaF30(totalRetencionesVal));

    // Casilla 55: Retenciones Descontadas
    const retencionesDescontadasVal = Math.min(subtotalImpuestoPagar, totalRetencionesVal);
    setElementValue('f30-retenciones-descontadas', formatearMonedaF30(retencionesDescontadasVal));

    // Casilla 67: Saldo Retenciones no Aplicado
    const saldoRetencionesNoAplicadoVal = totalRetencionesVal - retencionesDescontadasVal;
    setElementValue('f30-retenciones-saldo-no-aplicado', formatearMonedaF30(saldoRetencionesNoAplicadoVal));

    // Casilla 56: Sub-Total Impuesto a Pagar (78-55)
    const subtotalDespuesRetencionesVal = subtotalImpuestoPagar - retencionesDescontadasVal;
    setElementValue('f30-subtotal-impuesto-despues-retenciones', formatearMonedaF30(subtotalDespuesRetencionesVal));

    // --- PERCEPCIONES ---
    // Casillas 57, 75, 76
    setElementValue('f30-percepciones-acumuladas-import', '0,00');
    setElementValue('f30-percepciones-cesiones', '0,00');
    setElementValue('f30-percepciones-recuperacion', '0,00');

    // Casilla 68: Percepciones del Periodo (iva_percibido_aduana de compras + iva_percibido_comprador de ventas)
    const percepcionesAduanaCompras = comprasPeriodo.reduce((acc, curr) => acc + (curr.iva_percibido_aduana || 0), 0);
    const percepcionesCompradorVentas = ventasPeriodo.reduce((acc, curr) => acc + (curr.iva_percibido_comprador || 0), 0);
    const percepcionesPeriodoVal = percepcionesAduanaCompras + percepcionesCompradorVentas;
    setElementValue('f30-percepciones-periodo', formatearMonedaF30(percepcionesPeriodoVal));

    // Casilla 77: Total Percepciones
    const totalPercepcionesVal = percepcionesPeriodoVal;
    setElementValue('f30-total-percepciones', formatearMonedaF30(totalPercepcionesVal));

    // Casilla 58: Percepciones descontadas
    const percepcionesDescontadasVal = Math.min(subtotalDespuesRetencionesVal, totalPercepcionesVal);
    setElementValue('f30-percepciones-descontadas', formatearMonedaF30(percepcionesDescontadasVal));

    // Casilla 69: Saldo Percepciones no Aplicado
    const saldoPercepcionesNoAplicadoVal = totalPercepcionesVal - percepcionesDescontadasVal;
    setElementValue('f30-percepciones-saldo-no-aplicado', formatearMonedaF30(saldoPercepcionesNoAplicadoVal));

    // Casilla 90: TOTAL A PAGAR (56-58)
    const totalPagarFinalVal = subtotalDespuesRetencionesVal - percepcionesDescontadasVal;
    setElementValue('f30-total-pagar-final', formatearMonedaF30(totalPagarFinalVal));

    console.log(`Cierre IVA SENIAT Completo: Débitos ${vTotalFinalTax} - Créditos ${cTotalFinalTax} = Neto ${diff}. Pagar Final: ${totalPagarFinalVal}`);
}

function updateF30Ajuste(field, val) {
    const inputMes = document.getElementById('reporte-mes-select');
    const inputPeriodo = document.getElementById('reporte-periodo-select');
    const mesStr = inputMes.value || new Date().toISOString().substring(0, 7);
    const periodo = inputPeriodo.value || 'completo';

    const active = getActiveBeneficiary();
    if (!active.ajustes) active.ajustes = [];
    
    let ajuste = active.ajustes.find(a => a.period === mesStr && a.quincena === periodo);
    if (!ajuste) {
        ajuste = {
            period: mesStr,
            quincena: periodo,
            debito_ajuste: 0,
            debito_exonerado: 0,
            credito_ajuste: 0,
            excedente_anterior: 0,
            credito_ajuste_tax: 0
        };
        active.ajustes.push(ajuste);
    }
    
    ajuste[field] = val;
    
    // Recalcular
    generarForma30SENIAT();
    
    // Guardar en base de datos
    guardarDatos();
}

// Botones de ejecución en reporte
document.getElementById('btn-cargar-reporte').addEventListener('click', generarForma30SENIAT);
document.getElementById('btn-imprimir-reporte').addEventListener('click', async () => {
    if (window.electronAPI && typeof window.electronAPI.printToPDF === 'function') {
        try {
            mostrarNotificacion('Generando PDF de la Forma 30...', 'info');
            const res = await window.electronAPI.printToPDF();
            if (res && res.success) {
                mostrarNotificacion('¡PDF generado y abierto en el visor/navegador del sistema!', 'success');
            }
        } catch (error) {
            console.error('Error al generar PDF:', error);
            mostrarNotificacion('Error al generar el PDF: ' + error.message, 'danger');
        }
    } else {
        window.print();
    }
});

// --- EXPORTACIÓN DE LIBROS EN EXCEL (CSV VENEZOLANO) ---

document.getElementById('btn-csv-compras').addEventListener('click', () => {
    exportarCSVVenezia('compras');
});
document.getElementById('btn-csv-ventas').addEventListener('click', () => {
    exportarCSVVenezia('ventas');
});

function exportarCSVVenezia(tipo) {
    const datos = tipo === 'compras' ? state.compras : state.ventas;
    if (datos.length === 0) {
        mostrarNotificacion(`El libro fiscal de ${tipo} está vacío. Nada que exportar.`, 'warning');
        return;
    }

    let csv = '\uFEFF'; // BOM para compatibilidad con Excel

    if (tipo === 'compras') {
        // Libro de Compras venezolano oficial detallado
        csv += 'Oper. N°;Fecha Factura;RIF Proveedor;Razon Social Proveedor;Planilla Exportacion Forma D;Expediente Importacion;N° Factura;N° Control;N° Nota Debito;N° Nota Credito;Factura Afectada;Total Compras con IVA;Sin Derecho Credito Fiscal;Base Imponible General (16%);Alicuota General (16%);Monto IVA General (16%);Base Reducida (8%);Alicuota Reducida (8%);Monto IVA Reducido (8%);Base Adicional (31%);Alicuota Adicional (31%);Monto IVA Adicional (31%);IVA Retenido al Vendedor;IVA Retenido a Terceros;IVA Percibido por Aduana;N° Comprobante Retencion;Fecha Comprobante Retencion;Clasificacion\r\n';
        
        datos.forEach((d, idx) => {
            const contact = state.contactos.find(c => c.id === d.contact_id);
            const rif = contact ? contact.tax_id : '';
            const nombre = contact ? contact.name : '';
            const territorial = d.is_import_export ? 'IMPORTACION' : 'NACIONAL';
            const nd = d.nota_debito || (d.doc_type === 'Nota Débito' ? d.doc_number : '');
            const nc = d.nota_credito || (d.doc_type === 'Nota Crédito' ? d.doc_number : '');
            
            csv += `${idx + 1};${d.date};${rif};"${nombre.replace(/"/g, '""')}";${d.export_form_d || ''};${d.import_expediente || ''};${d.doc_type === 'Factura' ? d.doc_number : ''};${d.control_number || ''};${nd};${nc};${d.doc_afectado || ''};${d.total_amount};${d.sin_credito || 0};${d.base_general || 0};16%;${d.tax_general || 0};${d.base_reducida || 0};8%;${d.tax_reducida || 0};${d.base_adicional || 0};31%;${d.tax_adicional || 0};${d.has_retention ? d.retention_amount : 0};${d.retencion_terceros || 0};${d.iva_percibido_aduana || 0};${d.retention_number || ''};${d.retention_date || ''};${territorial}\r\n`;
        });
    } else {
        // Libro de Ventas venezolano oficial detallado
        csv += 'Oper. N°;Fecha Factura;RIF Cliente;Razon Social Cliente;Maquina Fiscal;Control Z;Planilla Exportacion Forma D;N° Factura;N° Control;N° Nota Debito;N° Nota Credito;Factura Afectada;N° Comprobante Retencion;Total Ventas con IVA;Ventas Exentas;Ventas Exportacion;Base Imponible General (16%);Alicuota General (16%);Monto IVA General (16%);Base Reducida (8%);Alicuota Reducida (8%);Monto IVA Reducido (8%);Base Adicional (31%);Alicuota Adicional (31%);Monto IVA Adicional (31%);IVA Retenido por Comprador;IVA Percibido por Comprador;Ventas Terceros Total;Ventas Terceros Exentas;Ventas Terceros Gravadas;Clasificacion\r\n';
        
        datos.forEach((d, idx) => {
            const contact = state.contactos.find(c => c.id === d.contact_id);
            const rif = contact ? contact.tax_id : '';
            const nombre = contact ? contact.name : '';
            const exportVal = d.is_import_export ? d.total_amount : 0;
            const exentaVal = d.is_import_export ? 0 : (d.base_exenta || 0);
            const territorial = d.is_import_export ? 'EXPORTACION' : 'NACIONAL';
            const nd = d.nota_debito || (d.doc_type === 'Nota Débito' ? d.doc_number : '');
            const nc = d.nota_credito || (d.doc_type === 'Nota Crédito' ? d.doc_number : '');

            const isFisc = !!(d.fiscal_machine || d.control_z);
            const csvDocNum = d.doc_type === 'Factura' ? (isFisc ? `${d.doc_number} al ${d.control_number}` : d.doc_number) : '';
            const csvCtrlNum = isFisc ? '' : (d.control_number || '');

            csv += `${idx + 1};${d.date};${rif};"${nombre.replace(/"/g, '""')}";${d.fiscal_machine || ''};${d.control_z || ''};${d.export_form_d || ''};${csvDocNum};${csvCtrlNum};${nd};${nc};${d.doc_afectado || ''};${d.retention_number || ''};${d.total_amount};${exentaVal};${exportVal};${d.base_general || 0};16%;${d.tax_general || 0};${d.base_reducida || 0};8%;${d.tax_reducida || 0};${d.base_adicional || 0};31%;${d.tax_adicional || 0};${d.has_retention ? d.retention_amount : 0};${d.iva_percibido_comprador || 0};${d.ventas_terceros_total || 0};${d.ventas_terceros_exentas || 0};${d.ventas_terceros_gravadas || 0};${territorial}\r\n`;
        });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `libro_${tipo}_fiscal_${new Date().toISOString().substring(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarNotificacion(`Libro fiscal de ${tipo} exportado a CSV con éxito.`, 'success');
}

// --- RESPALDOS JSON ---

function exportarJSON() {
    syncBeneficiarioActivo();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `respaldo_fiscal_SENIAT_${new Date().toISOString().substring(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    mostrarNotificacion('Respaldo contable JSON exportado.', 'success');
}

function importarJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const parsed = JSON.parse(event.target.result);
            if ((parsed.compras && parsed.ventas && parsed.contactos) || (parsed.beneficiarios && parsed.activeBeneficiaryId)) {
                if (!parsed.beneficiarios) {
                    const oldBeneficiary = {
                        id: Date.now(),
                        name: (parsed.config && parsed.config.empresaName) || 'Mi Empresa C.A.',
                        tax_id: (parsed.config && parsed.config.empresaRut) || 'J-12345678-9',
                        especial: (parsed.config && parsed.config.empresaContribuyente === 'especial') ? 'si' : 'no',
                        retencionesAnteriores: (parsed.config && parsed.config.retencionesAnteriores) || 0,
                        compras: parsed.compras || [],
                        ventas: parsed.ventas || [],
                        contactos: parsed.contactos || [],
                        articulos: parsed.articulos || [],
                        movimientos: parsed.movimientos || [],
                        asientos_manuales: parsed.asientos_manuales || [],
                        cuentas_contables: parsed.cuentas_contables || [],
                        balances_guardados: parsed.balances_guardados || []
                    };
                    parsed.beneficiarios = [oldBeneficiary];
                    parsed.activeBeneficiaryId = oldBeneficiary.id;
                    delete parsed.compras;
                    delete parsed.ventas;
                    delete parsed.contactos;
                    delete parsed.articulos;
                    delete parsed.movimientos;
                    delete parsed.asientos_manuales;
                    delete parsed.cuentas_contables;
                    delete parsed.balances_guardados;
                }
                
                state = parsed;
                const active = state.beneficiarios.find(b => b.id === state.activeBeneficiaryId) || state.beneficiarios[0];
                state.compras = active.compras || [];
                state.ventas = active.ventas || [];
                state.contactos = active.contactos || [];
                state.articulos = active.articulos || [];
                state.movimientos = active.movimientos || [];
                state.asientos_manuales = active.asientos_manuales || [];
                state.cuentas_contables = active.cuentas_contables || [];
                state.balances_guardados = active.balances_guardados || [];
                
                if (!state.config) state.config = { ivaRate: 16, theme: 'dark' };
                state.config.empresaName = active.name;
                state.config.empresaRut = active.tax_id;
                state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
                state.config.retencionesAnteriores = active.retencionesAnteriores || 0;

                guardarDatos();
                renderAll();
                mostrarNotificacion('Copia de seguridad contable importada.', 'success');
            } else {
                mostrarNotificacion('Archivo JSON inválido. Estructura contable incorrecta.', 'danger');
            }
        } catch (error) {
            console.error(error);
            mostrarNotificacion('Error leyendo el archivo JSON.', 'danger');
        }
    };
    reader.readAsText(file);
    e.target.value = "";
}

function actualizarIndicadorBaseDatos(enlazado, nombreArchivo = '') {
    const dot = document.getElementById('db-status-dot');
    const label = document.getElementById('db-status-label');
    
    if (enlazado) {
        dot.className = 'status-dot';
        label.innerHTML = `Sincronizado: <strong style="color:var(--text-primary); font-size:0.75rem;">${nombreArchivo}</strong>`;
    } else {
        dot.className = 'status-dot unsaved';
        label.innerText = 'Guardado Local (Navegador)';
    }
}

// --- UTILIDADES ---

function formatearMoneda(val) {
    return new Intl.NumberFormat('es-VE', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(val) + ' Bs.';
}

function formatearMonedaF30(val) {
    return new Intl.NumberFormat('es-VE', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(val);
}

function formatearFechaISOaUI(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatearMesNombre(mesStr) {
    if (!mesStr) return '';
    const [anio, mes] = mesStr.split('-');
    const nombresMeses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const index = parseInt(mes, 10) - 1;
    return `${nombresMeses[index]} ${anio}`;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    
    let icon = '';
    if (tipo === 'success') {
        icon = '<svg style="width:20px;height:20px;stroke:var(--color-success);stroke-width:2;fill:none;" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3"/></svg>';
    } else if (tipo === 'danger') {
        icon = '<svg style="width:20px;height:20px;stroke:var(--color-danger);stroke-width:2;fill:none;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6m0-6 6 6"/></svg>';
    } else if (tipo === 'warning') {
        icon = '<svg style="width:20px;height:20px;stroke:var(--color-warning);stroke-width:2;fill:none;" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4m0 4h.01"/></svg>';
    } else {
        icon = '<svg style="width:20px;height:20px;stroke:var(--color-info);stroke-width:2;fill:none;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>';
    }

    toast.innerHTML = `${icon}<span>${mensaje}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'opacity 0.4s, transform 0.4s';
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

// --- LOGICA DE BENEFICIARIOS ---

function renderSelectoresBeneficiarios() {
    const activeId = state.activeBeneficiaryId;
    const selectEl = document.getElementById('select-beneficiario-activo');
    if (!selectEl) return;
    
    let html = '';
    state.beneficiarios.forEach(b => {
        html += `<option value="${b.id}" ${b.id === activeId ? 'selected' : ''}>${b.tax_id} | ${b.name}</option>`;
    });
    selectEl.innerHTML = html;
}

function renderTablaBeneficiarios(filtrados = null) {
    const tbody = document.getElementById('tabla-beneficiarios-body');
    if (!tbody) return;

    const datos = filtrados || state.beneficiarios;
    if (!datos || datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay beneficiarios registrados.</td></tr>';
        return;
    }

    const ordenados = [...datos].sort((a, b) => a.name.localeCompare(b.name));
    let html = '';
    ordenados.forEach(b => {
        const isActivo = b.id === state.activeBeneficiaryId;
        const rowClass = isActivo ? 'style="background-color: var(--color-primary-glow); font-weight: 500;"' : '';
        const tipoBadge = b.especial === 'si' ? '<span class="badge badge-success">ESPECIAL</span>' : '<span class="badge badge-warning">ORDINARIO</span>';
        
        html += `
            <tr ${rowClass}>
                <td><span class="font-semibold">${b.tax_id}</span></td>
                <td><span class="font-semibold">${b.name} ${isActivo ? ' <span class="badge badge-success" style="font-size: 0.6rem; padding: 2px 6px; text-transform:none;">Activo</span>' : ''}</span></td>
                <td>${tipoBadge}</td>
                <td class="text-right">${formatearMoneda(b.retencionesAnteriores || 0)}</td>
                <td class="text-center">
                    <div class="flex gap-8 justify-center">
                        ${!isActivo ? `
                            <button class="btn btn-success" style="font-size:0.75rem; padding: 6px 12px;" onclick="seleccionarBeneficiario(${b.id})" title="Seleccionar Beneficiario">
                                Seleccionar
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-icon-only" onclick="editarBeneficiario(${b.id})" title="Editar">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-icon-only" onclick="eliminarBeneficiario(${b.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function filtrarBeneficiarios() {
    const query = document.getElementById('buscar-beneficiarios').value.toLowerCase();
    const filtrados = state.beneficiarios.filter(b => {
        return b.name.toLowerCase().includes(query) || b.tax_id.toLowerCase().includes(query);
    });
    renderTablaBeneficiarios(filtrados);
}

function abrirModalBeneficiario() {
    document.getElementById('form-beneficiario').reset();
    document.getElementById('beneficiario-id').value = '';
    if (document.getElementById('beneficiario-documento-tipo')) {
        document.getElementById('beneficiario-documento-tipo').value = 'RIF';
    }
    document.getElementById('modal-beneficiario-title').innerText = 'Registrar Beneficiario';
    document.getElementById('modal-beneficiario').classList.add('active');
}

function cerrarModalBeneficiario() {
    document.getElementById('modal-beneficiario').classList.remove('active');
}

document.getElementById('form-beneficiario').addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = document.getElementById('beneficiario-id').value;
    const name = document.getElementById('beneficiario-name').value.trim();
    const taxId = document.getElementById('beneficiario-tax-id').value.trim().toUpperCase();
    const especial = document.getElementById('beneficiario-especial').value;
    const retenciones = parseFloat(document.getElementById('beneficiario-retenciones').value) || 0;

    if (!name || !taxId) {
        mostrarNotificacion('Nombre y RIF son obligatorios.', 'warning');
        return;
    }

    if (!validarFormatoRif(taxId)) {
        mostrarNotificacion('El R.I.F. o Cédula de la empresa no tiene un formato válido (Ej: J-12345678-9).', 'warning');
        return;
    }

    if (idVal) {
        // Editar existente
        const id = parseInt(idVal);
        const idx = state.beneficiarios.findIndex(b => b.id === id);
        if (idx !== -1) {
            state.beneficiarios[idx].name = name;
            state.beneficiarios[idx].tax_id = taxId;
            state.beneficiarios[idx].especial = especial;
            state.beneficiarios[idx].retencionesAnteriores = retenciones;
            
            // Si es el beneficiario activo, actualizar variables montadas
            if (state.activeBeneficiaryId === id) {
                state.config.empresaName = name;
                state.config.empresaRut = taxId;
                state.config.empresaContribuyente = especial === 'si' ? 'especial' : 'ordinario';
                state.config.retencionesAnteriores = retenciones;
            }
            mostrarNotificacion('Beneficiario actualizado con éxito.', 'success');
        }
    } else {
        // Crear nuevo
        const nuevoId = state.beneficiarios.length > 0 ? Math.max(...state.beneficiarios.map(b => b.id)) + 1 : 1;
        const nuevoBeneficiario = {
            id: nuevoId,
            name,
            tax_id: taxId,
            especial,
            retencionesAnteriores: retenciones,
            compras: [],
            ventas: [],
            contactos: [],
            articulos: [],
            movimientos: [],
            asientos_manuales: [],
            balances_guardados: [],
            cuentas_contables: Object.keys(CUENTAS_CATALOGO).map(code => ({
                code: code,
                name: CUENTAS_CATALOGO[code]
            }))
        };
        state.beneficiarios.push(nuevoBeneficiario);
        mostrarNotificacion('Nuevo beneficiario registrado con éxito.', 'success');
        
        // Auto-seleccionar si es el único
        if (state.beneficiarios.length === 1) {
            seleccionarBeneficiario(nuevoId);
        }
    }

    guardarDatos();
    renderAll();
    cerrarModalBeneficiario();
});

function editarBeneficiario(id) {
    const b = state.beneficiarios.find(item => item.id === id);
    if (!b) return;

    document.getElementById('beneficiario-id').value = b.id;
    document.getElementById('beneficiario-name').value = b.name;
    if (document.getElementById('beneficiario-documento-tipo')) {
        document.getElementById('beneficiario-documento-tipo').value = determinarTipoDoc(b.tax_id);
    }
    document.getElementById('beneficiario-tax-id').value = b.tax_id;
    document.getElementById('beneficiario-especial').value = b.especial || 'no';
    document.getElementById('beneficiario-retenciones').value = b.retencionesAnteriores || 0;

    document.getElementById('modal-beneficiario-title').innerText = 'Modificar Beneficiario';
    document.getElementById('modal-beneficiario').classList.add('active');
}

function eliminarBeneficiario(id) {
    if (state.beneficiarios.length <= 1) {
        mostrarNotificacion('No se puede eliminar el único beneficiario existente. Debe haber al menos uno.', 'warning');
        return;
    }

    const b = state.beneficiarios.find(item => item.id === id);
    if (!b) return;

    if (confirm(`¿Deseas eliminar al beneficiario "${b.name}"?\n\n¡Advertencia! Se borrarán permanentemente todos sus libros de compras, ventas y contactos.`)) {
        state.beneficiarios = state.beneficiarios.filter(item => item.id !== id);
        
        // Si eliminamos el activo, alternar al primero disponible
        if (state.activeBeneficiaryId === id) {
            state.activeBeneficiaryId = state.beneficiarios[0].id;
            const active = state.beneficiarios[0];
            state.compras = active.compras || [];
            state.ventas = active.ventas || [];
            state.contactos = active.contactos || [];
            state.config.empresaName = active.name;
            state.config.empresaRut = active.tax_id;
            state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
            state.config.retencionesAnteriores = active.retencionesAnteriores || 0;
        }

        guardarDatos();
        renderAll();
        mostrarNotificacion('Beneficiario eliminado con éxito.', 'success');
    }
}

// =======================================================
// EXPONER FUNCIONES AL ENTORNO GLOBAL (window)
// Necesario porque el HTML usa atributos onclick="..."
// =======================================================

// Modales de Compras
window.abrirModalCompra = abrirModalCompra;
window.cerrarModalCompra = cerrarModalCompra;

// Modales de Ventas
window.abrirModalVenta = abrirModalVenta;
window.cerrarModalVenta = cerrarModalVenta;

// Modales de Contactos
window.abrirModalContacto = abrirModalContacto;
window.cerrarModalContacto = cerrarModalContacto;

// Beneficiarios
window.seleccionarBeneficiario = seleccionarBeneficiario;
window.abrirModalBeneficiario = abrirModalBeneficiario;
window.cerrarModalBeneficiario = cerrarModalBeneficiario;
window.editarBeneficiario = editarBeneficiario;
window.eliminarBeneficiario = eliminarBeneficiario;

function aplicarFormatoRif(e) {
    const input = e.target;
    
    // Auto-detectar si empieza por J, G, C para forzar R.I.F.
    const clean = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length > 0) {
        const firstChar = clean.charAt(0);
        if (/^[JGC]$/.test(firstChar)) {
            const selectId = (input.id === 'contacto-tax-id') ? 'contacto-documento-tipo' : 'beneficiario-documento-tipo';
            const selectEl = document.getElementById(selectId);
            if (selectEl && selectEl.value !== 'RIF') {
                selectEl.value = 'RIF';
            }
        }
    }

    if (e.inputType && e.inputType.startsWith('delete')) {
        return; // Permitir borrar guiones sin re-escribirlos
    }

    // Obtener tipo de documento seleccionado
    let tipoDoc = 'RIF';
    if (input.id === 'contacto-tax-id') {
        tipoDoc = document.getElementById('contacto-documento-tipo').value;
    } else if (input.id === 'beneficiario-tax-id') {
        tipoDoc = document.getElementById('beneficiario-documento-tipo').value;
    }

    const originalVal = input.value;
    const formatted = formatearRif(originalVal, tipoDoc);
    if (originalVal !== formatted) {
        input.value = formatted;
    }
}

function formatearRif(val, tipoDoc = 'RIF') {
    let clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length === 0) return '';
    
    let prefix = clean.charAt(0);
    let numbers = '';
    
    if (/^[VEJGPC]$/.test(prefix)) {
        numbers = clean.slice(1);
    } else {
        // Prefijo por defecto según el tipo de documento seleccionado
        prefix = (tipoDoc === 'CEDULA') ? 'V' : 'J';
        numbers = clean;
    }
    
    numbers = numbers.replace(/[^0-9]/g, '');
    
    if (numbers.length === 0) {
        return prefix + '-';
    }
    
    if (tipoDoc === 'CEDULA') {
        // Formato Cédula (V-12345678, sin guión final, máximo 8 números)
        return prefix + '-' + numbers.slice(0, 8);
    } else {
        // Formato RIF tradicional (J-12345678-9, 8 números + 1)
        if (numbers.length <= 8) {
            return prefix + '-' + numbers;
        } else {
            let base = numbers.slice(0, 8);
            let verifier = numbers.slice(8, 9);
            return prefix + '-' + base + '-' + verifier;
        }
    }
}

function determinarTipoDoc(taxId) {
    if (!taxId) return 'RIF';
    const clean = taxId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const prefix = clean.charAt(0);
    
    if (/^[JGC]$/.test(prefix)) {
        return 'RIF';
    }
    
    // Si tiene dos guiones en el formato o más de 8 números, es RIF
    const hasTwoHyphens = (taxId.match(/-/g) || []).length > 1;
    const digitsOnly = taxId.replace(/[^0-9]/g, '');
    if (hasTwoHyphens || digitsOnly.length > 8) {
        return 'RIF';
    }
    
    return 'CEDULA';
}

function tieneDatosRegistrados() {
    if (!state.beneficiarios || state.beneficiarios.length === 0) return false;
    
    // 1. Verificar si hay compras en algún beneficiario
    const tieneCompras = state.beneficiarios.some(b => b.compras && b.compras.length > 0);
    
    // 2. Verificar si hay ventas en algún beneficiario
    const tieneVentas = state.beneficiarios.some(b => b.ventas && b.ventas.length > 0);
    
    // 3. Verificar si hay contactos registrados
    const tieneContactos = state.beneficiarios.some(b => b.contactos && b.contactos.length > 0);
    
    // 4. Verificar si hay más de una empresa registrada, o si la única empresa tiene un nombre/RIF personalizado
    const tieneEmpresasPersonalizadas = state.beneficiarios.length > 1 || 
        (state.beneficiarios.length === 1 && 
         state.beneficiarios[0].name !== 'Nueva Empresa S.A.' && 
         state.beneficiarios[0].name !== 'Corporación Inversiones del Caribe C.A.');
         
    return tieneCompras || tieneVentas || tieneContactos || tieneEmpresasPersonalizadas;
}

function validarFormatoRif(taxId) {
    if (!taxId) return false;
    const rifRegex = /^[VEJGPC]-[0-9]{8}-[0-9]$/;
    const cedulaRegex = /^[VE]-[0-9]{6,8}$/;
    return rifRegex.test(taxId) || cedulaRegex.test(taxId);
}

// ==========================================================================
// LOGICA DEL MODULO: LIBRO DE CONTROL DE INVENTARIO (SENIAT - VENEZUELA)
// ==========================================================================

// --- CONTROL DE PESTAÑAS INTERNAS DE INVENTARIO ---
function switchInventarioTab(tab) {
    const btnCatalogo = document.getElementById('btn-tab-inv-catalogo');
    const btnDiario = document.getElementById('btn-tab-inv-diario');
    const panelCatalogo = document.getElementById('inv-panel-catalogo');
    const panelDiario = document.getElementById('inv-panel-diario');

    if (!btnCatalogo || !btnDiario || !panelCatalogo || !panelDiario) return;

    if (tab === 'catalogo') {
        btnCatalogo.className = 'btn btn-primary';
        btnDiario.className = 'btn btn-secondary';
        panelCatalogo.className = 'inv-panel active';
        panelCatalogo.style.display = 'block';
        panelDiario.className = 'inv-panel';
        panelDiario.style.display = 'none';
        renderTablaArticulos();
    } else if (tab === 'diario') {
        btnCatalogo.className = 'btn btn-secondary';
        btnDiario.className = 'btn btn-primary';
        panelCatalogo.className = 'inv-panel';
        panelCatalogo.style.display = 'none';
        panelDiario.className = 'inv-panel active';
        panelDiario.style.display = 'block';
        renderTablaLibroDiario();
    }
}

// --- ALGORITMO DETERMINISTA: COSTO PROMEDIO PONDERADO (KARDEX FISCAL) ---
function calcularKardex(articleId) {
    const art = state.articulos.find(a => parseInt(a.id) === parseInt(articleId));
    if (!art) return { rows: [], stock: 0, cost: 0, totalValue: 0 };
    
    let stock = parseFloat(art.initial_stock) || 0;
    let avg_cost = parseFloat(art.initial_cost) || 0;
    let total_value = stock * avg_cost;
    
    // Filtrar movimientos de este articulo
    const movs = state.movimientos.filter(m => parseInt(m.article_id) === parseInt(articleId));
    // Ordenar cronológicamente (Fecha, y luego por ID en caso de misma fecha)
    const movsSorted = [...movs].sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
    
    const rows = [];
    
    // Fila inicial de saldo
    rows.push({
        date: 'Inicial',
        type: 'Inicial',
        doc_type: '-',
        doc_number: '-',
        notes: 'Inventario Inicial',
        qty_in: 0,
        cost_in: 0,
        total_in: 0,
        qty_out: 0,
        cost_out: 0,
        total_out: 0,
        qty_bal: stock,
        cost_bal: avg_cost,
        total_bal: total_value
    });
    
    for (const m of movsSorted) {
        let qty_in = 0, cost_in = 0, total_in = 0;
        let qty_out = 0, cost_out = 0, total_out = 0;
        
        const qty = parseFloat(m.qty) || 0;
        const unit_cost = parseFloat(m.unit_cost) || 0;
        
        if (m.type === 'Entrada' || m.type === 'Ajuste+') {
            qty_in = qty;
            cost_in = unit_cost;
            total_in = qty * unit_cost;
            
            stock += qty_in;
            total_value += total_in;
            if (stock > 0) {
                avg_cost = total_value / stock;
            } else {
                avg_cost = 0;
            }
        } else if (m.type === 'Salida' || m.type === 'Ajuste-') {
            qty_out = qty;
            cost_out = avg_cost; // Se valora al costo promedio actual acumulado
            total_out = qty_out * cost_out;
            
            stock -= qty_out;
            total_value -= total_out;
            
            if (stock <= 0) {
                stock = 0;
                total_value = 0;
                avg_cost = 0;
            }
        }
        
        rows.push({
            id: m.id,
            date: m.date,
            type: m.type,
            doc_type: m.doc_type,
            doc_number: m.doc_number,
            notes: m.notes || '',
            qty_in: qty_in,
            cost_in: cost_in,
            total_in: total_in,
            qty_out: qty_out,
            cost_out: cost_out,
            total_out: total_out,
            qty_bal: stock,
            cost_bal: avg_cost,
            total_bal: total_value
        });
    }
    
    return {
        rows: rows,
        stock: stock,
        cost: avg_cost,
        totalValue: total_value
    };
}

// --- RENDERIZADORES DE VISTAS ---
function renderInventario() {
    if (!state.articulos) state.articulos = [];
    if (!state.movimientos) state.movimientos = [];

    let totalInventarioVal = 0;
    let totalArticulosCount = state.articulos.length;
    
    const hoy = new Date();
    const mesActual = hoy.toISOString().substring(0, 7);
    
    let entradasCount = 0;
    let salidasCount = 0;
    
    // Llenar selector del modal de movimientos
    const selectArtForm = document.getElementById('movimiento-articulo');
    if (selectArtForm) {
        let artHTML = '<option value="" disabled selected>Seleccione un Material...</option>';
        state.articulos.forEach(art => {
            artHTML += `<option value="${art.id}">[${art.code}] ${art.description}</option>`;
        });
        selectArtForm.innerHTML = artHTML;
    }
    
    // Llenar selector de filtro
    const selectArtFiltro = document.getElementById('filtro-articulo-movimientos');
    if (selectArtFiltro) {
        const prevVal = selectArtFiltro.value;
        let artHTML = '<option value="">Todos los Materiales</option>';
        state.articulos.forEach(art => {
            artHTML += `<option value="${art.id}">[${art.code}] ${art.description}</option>`;
        });
        selectArtFiltro.innerHTML = artHTML;
        selectArtFiltro.value = prevVal;
    }
    
    const inputMesFiltro = document.getElementById('filtro-mes-inventario');
    if (inputMesFiltro && !inputMesFiltro.value) {
        inputMesFiltro.value = mesActual;
    }
    
    // Calcular KPIs
    state.articulos.forEach(art => {
        const kardex = calcularKardex(art.id);
        totalInventarioVal += kardex.totalValue;
    });
    
    state.movimientos.forEach(mov => {
        if (mov.date.startsWith(mesActual)) {
            if (mov.type === 'Entrada' || mov.type === 'Ajuste+') {
                entradasCount++;
            } else if (mov.type === 'Salida' || mov.type === 'Ajuste-') {
                salidasCount++;
            }
        }
    });
    
    // Rellenar KPIs en HTML
    const kpiInvVal = document.getElementById('kpi-inv-valor-val');
    if (kpiInvVal) kpiInvVal.innerText = formatearMoneda(totalInventarioVal);
    
    const kpiInvArt = document.getElementById('kpi-inv-articulos-val');
    if (kpiInvArt) kpiInvArt.innerText = totalArticulosCount;
    
    const kpiInvEnt = document.getElementById('kpi-inv-entradas-val');
    if (kpiInvEnt) kpiInvEnt.innerText = entradasCount;
    
    const kpiInvSal = document.getElementById('kpi-inv-salidas-val');
    if (kpiInvSal) kpiInvSal.innerText = salidasCount;
    
    // Renderizar tablas
    renderTablaArticulos();
    renderTablaLibroDiario();
}

function renderTablaArticulos() {
    const tbody = document.getElementById('tabla-articulos-body');
    if (!tbody) return;
    
    let datos = state.articulos;
    const busqueda = document.getElementById('buscar-articulos')?.value.trim().toLowerCase();
    
    if (busqueda) {
        datos = datos.filter(art => 
            art.code.toLowerCase().includes(busqueda) || 
            art.description.toLowerCase().includes(busqueda)
        );
    }
    
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron artículos en el catálogo.</td></tr>';
        return;
    }
    
    let html = '';
    datos.forEach(art => {
        const kardex = calcularKardex(art.id);
        html += `
            <tr>
                <td><span class="font-semibold text-success">[${art.code}]</span></td>
                <td>${art.description}</td>
                <td><span class="badge badge-success" style="font-size:0.75rem;">${art.unit}</span></td>
                <td class="text-right font-semibold">${kardex.stock.toFixed(2)}</td>
                <td class="text-right">${formatearMoneda(kardex.cost)}</td>
                <td class="text-right font-semibold" style="color:var(--color-primary);">${formatearMoneda(kardex.totalValue)}</td>
                <td>
                    <div class="flex gap-8">
                        <button class="btn btn-secondary btn-icon-only" onclick="editarArticulo(${art.id})" title="Editar">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-icon-only" onclick="eliminarArticulo(${art.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

function renderTablaLibroDiario() {
    const tbody = document.getElementById('tabla-libro-diario-body');
    if (!tbody) return;
    
    const filtroArticulo = document.getElementById('filtro-articulo-movimientos')?.value;
    const filtroMes = document.getElementById('filtro-mes-inventario')?.value;
    
    let allRows = [];
    
    state.articulos.forEach(art => {
        if (filtroArticulo && parseInt(filtroArticulo) !== art.id) return;
        
        const kardex = calcularKardex(art.id);
        // Solo saltar la fila inicial si el artículo no tiene movimientos Y el stock inicial es 0
        const tieneMovimientos = state.movimientos.some(m => parseInt(m.article_id) === parseInt(art.id));
        kardex.rows.forEach(r => {
            if (r.type === 'Inicial' && r.qty_bal === 0 && !tieneMovimientos) return;
            
            allRows.push({
                ...r,
                article_id: art.id,
                article_code: art.code,
                article_desc: art.description,
                unit: art.unit
            });
        });
    });
    
    if (filtroMes) {
        allRows = allRows.filter(r => r.date === 'Inicial' || r.date.startsWith(filtroMes));
    }
    
    allRows.sort((a, b) => {
        if (a.date === 'Inicial') return -1;
        if (b.date === 'Inicial') return 1;
        return new Date(a.date) - new Date(b.date) || (a.id || 0) - (b.id || 0);
    });
    
    if (allRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" class="text-center text-muted">No hay movimientos registrados para el período seleccionado.</td></tr>';
        return;
    }
    
    let html = '';
    allRows.forEach(r => {
        const isEntry = r.qty_in > 0;
        const isExit = r.qty_out > 0;
        
        let typeBadge = '';
        if (r.type === 'Inicial') {
            typeBadge = `<span class="badge" style="background-color:var(--bg-tertiary); color:var(--text-secondary);">INICIAL</span>`;
        } else if (r.type === 'Entrada') {
            typeBadge = `<span class="badge badge-success">ENTRADA</span>`;
        } else if (r.type === 'Salida') {
            typeBadge = `<span class="badge badge-danger">SALIDA</span>`;
        } else if (r.type === 'Ajuste+') {
            typeBadge = `<span class="badge badge-success" style="filter:hue-rotate(45deg);">AJUSTE+</span>`;
        } else if (r.type === 'Ajuste-') {
            typeBadge = `<span class="badge badge-warning">AJUSTE-</span>`;
        }
        
        let actionBtn = '-';
        if (r.type !== 'Inicial') {
            actionBtn = `
                <div class="flex gap-8 justify-center">
                    <button class="btn btn-secondary btn-icon-only" style="padding:4px;" onclick="editarMovimiento(${r.id})" title="Editar">
                        <svg viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                    </button>
                    <button class="btn btn-danger btn-icon-only" style="padding:4px;" onclick="eliminarMovimiento(${r.id})" title="Eliminar">
                        <svg viewBox="0 0 24 24" style="width:14px;height:14px;"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                    </button>
                </div>
            `;
        }
        
        html += `
            <tr style="${r.type === 'Inicial' ? 'background-color: rgba(255,255,255,0.01);' : ''}">
                <td>${r.date === 'Inicial' ? 'Inicial' : formatearFechaISOaUI(r.date)}</td>
                <td>
                    <div style="font-weight:600; color:var(--text-secondary);">[${r.article_code}]</div>
                    <div style="font-size:0.75rem; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.article_desc}">${r.article_desc}</div>
                </td>
                <td>${r.doc_type}</td>
                <td><span class="font-semibold">${r.doc_number}</span></td>
                <td style="border-right: 1px solid var(--border-color);">
                    <div class="flex align-center gap-8">
                        ${typeBadge}
                        <div style="font-size:0.75rem; color:var(--text-muted); max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.notes}">${r.notes}</div>
                    </div>
                </td>
                
                <!-- Entradas -->
                <td class="text-right" style="background-color:rgba(16,185,129,0.01);">${isEntry ? r.qty_in.toFixed(2) : '-'}</td>
                <td class="text-right" style="background-color:rgba(16,185,129,0.01);">${isEntry ? formatearMoneda(r.cost_in) : '-'}</td>
                <td class="text-right font-semibold text-success" style="border-right:1px solid var(--border-color); background-color:rgba(16,185,129,0.02);">${isEntry ? formatearMoneda(r.total_in) : '-'}</td>
                
                <!-- Salidas -->
                <td class="text-right" style="background-color:rgba(244,63,94,0.01);">${isExit ? r.qty_out.toFixed(2) : '-'}</td>
                <td class="text-right" style="background-color:rgba(244,63,94,0.01);">${isExit ? formatearMoneda(r.cost_out) : '-'}</td>
                <td class="text-right font-semibold text-danger" style="border-right:1px solid var(--border-color); background-color:rgba(244,63,94,0.02);">${isExit ? formatearMoneda(r.total_out) : '-'}</td>
                
                <!-- Saldo -->
                <td class="text-right font-semibold" style="background-color:rgba(99,102,241,0.01);">${r.qty_bal.toFixed(2)} <span style="font-size:0.7rem;color:var(--text-muted);">${r.unit}</span></td>
                <td class="text-right" style="background-color:rgba(99,102,241,0.01);">${formatearMoneda(r.cost_bal)}</td>
                <td class="text-right font-semibold" style="background-color:rgba(99,102,241,0.02); color:var(--color-primary);">${formatearMoneda(r.total_bal)}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// --- FILTROS DE INTERFAZ ---
function filtrarArticulos() {
    renderTablaArticulos();
}

function filtrarInventarioMovimientos() {
    renderTablaLibroDiario();
}

// --- AUTO-VALORACIÓN FISCAL AL VENDER/CONSUMIR ---
function actualizarSugerenciaCostoMovimiento() {
    const articleSelect = document.getElementById('movimiento-articulo');
    const typeSelect = document.getElementById('movimiento-type');
    const costInput = document.getElementById('movimiento-unit-cost');
    const sugLabel = document.getElementById('sugerencia-costo-promedio');
    const costLabel = document.getElementById('label-costo-movimiento');
    
    if (!articleSelect || !typeSelect || !costInput || !sugLabel) return;
    
    const articleId = parseInt(articleSelect.value);
    const type = typeSelect.value;
    
    if (!articleId) {
        sugLabel.style.display = 'none';
        return;
    }
    
    const kardex = calcularKardex(articleId);
    
    if (type === 'Salida' || type === 'Ajuste-') {
        costInput.value = kardex.cost.toFixed(2);
        costInput.readOnly = true;
        sugLabel.innerText = `Requerido fiscal (Valuación Promedio Ponderado): Bs. ${kardex.cost.toFixed(2)}`;
        sugLabel.className = 'text-success font-semibold';
        sugLabel.style.display = 'block';
        if (costLabel) costLabel.innerText = 'Costo Unitario Fiscal (Autocalculado) *';
    } else {
        costInput.value = '';
        costInput.readOnly = false;
        sugLabel.innerText = `Costo promedio actual en existencias: Bs. ${kardex.cost.toFixed(2)}`;
        sugLabel.className = 'text-muted';
        sugLabel.style.display = 'block';
        if (costLabel) costLabel.innerText = 'Costo Unitario (Bs.) *';
    }
}

// --- GESTIÓN DE MODALES DE ARTÍCULOS ---
function abrirModalArticulo(id = null) {
    const modal = document.getElementById('modal-articulo');
    if (!modal) return;

    modal.classList.add('active');
    document.getElementById('form-articulo').reset();
    document.getElementById('articulo-id').value = '';
    document.getElementById('modal-articulo-title').innerText = 'Registrar Material / Producto';

    if (id !== null) {
        const art = state.articulos.find(a => a.id === id);
        if (art) {
            document.getElementById('articulo-id').value = art.id;
            document.getElementById('articulo-code').value = art.code;
            document.getElementById('articulo-description').value = art.description;
            document.getElementById('articulo-unit').value = art.unit;
            document.getElementById('articulo-initial-stock').value = art.initial_stock;
            document.getElementById('articulo-initial-cost').value = art.initial_cost;
            document.getElementById('modal-articulo-title').innerText = 'Editar Material / Producto';
        }
    }
}

function cerrarModalArticulo() {
    const modal = document.getElementById('modal-articulo');
    if (modal) modal.classList.remove('active');
}

async function guardarArticulo(e) {
    e.preventDefault();
    const idVal = document.getElementById('articulo-id').value;
    const code = document.getElementById('articulo-code').value.trim().toUpperCase();
    const description = document.getElementById('articulo-description').value.trim();
    const unit = document.getElementById('articulo-unit').value;
    const initialStock = parseFloat(document.getElementById('articulo-initial-stock').value) || 0;
    const initialCost = parseFloat(document.getElementById('articulo-initial-cost').value) || 0;

    if (!code || !description || !unit) {
        mostrarNotificacion('Por favor, rellene todos los campos obligatorios.', 'error');
        return;
    }

    if (idVal) {
        // Editar
        const art = state.articulos.find(a => parseInt(a.id) === parseInt(idVal));
        if (art) {
            art.code = code;
            art.description = description;
            art.unit = unit;
            art.initial_stock = initialStock;
            art.initial_cost = initialCost;
            mostrarNotificacion('Artículo actualizado con éxito.', 'success');
        }
    } else {
        // Crear
        const nuevoId = Date.now();
        const nuevo = {
            id: nuevoId,
            code: code,
            description: description,
            unit: unit,
            initial_stock: initialStock,
            initial_cost: initialCost
        };
        state.articulos.push(nuevo);
        mostrarNotificacion('Artículo creado con éxito.', 'success');
    }

    cerrarModalArticulo();
    await guardarDatos();
    renderAll();
}

async function eliminarArticulo(id) {
    if (confirm('¿Está seguro de eliminar este artículo? Esto también borrará todos sus movimientos históricos de inventario en cascada.')) {
        state.articulos = state.articulos.filter(a => a.id !== id);
        state.movimientos = state.movimientos.filter(m => m.article_id !== id);
        mostrarNotificacion('Artículo y movimientos eliminados del almacén.', 'warning');
        await guardarDatos();
        renderAll();
    }
}

function editarArticulo(id) {
    abrirModalArticulo(id);
}

// --- GESTIÓN DE MODALES DE MOVIMIENTOS ---
// Referencia al handler para poder removerlo correctamente y evitar duplicados
let _handlerSugerenciaCosto = null;

function abrirModalMovimiento(id = null) {
    const modal = document.getElementById('modal-movimiento');
    if (!modal) return;

    modal.classList.add('active');
    document.getElementById('form-movimiento').reset();
    document.getElementById('movimiento-id').value = '';
    document.getElementById('movimiento-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('sugerencia-costo-promedio').style.display = 'none';
    document.getElementById('movimiento-unit-cost').readOnly = false;
    document.getElementById('modal-movimiento-title').innerText = 'Registrar Movimiento de Inventario';
    
    // Vincular el listener de cambio evitando duplicados
    const selectArticulo = document.getElementById('movimiento-articulo');
    if (_handlerSugerenciaCosto) {
        selectArticulo.removeEventListener('change', _handlerSugerenciaCosto);
    }
    _handlerSugerenciaCosto = actualizarSugerenciaCostoMovimiento;
    selectArticulo.addEventListener('change', _handlerSugerenciaCosto);

    if (id !== null) {
        const mov = state.movimientos.find(m => m.id === id);
        if (mov) {
            document.getElementById('movimiento-id').value = mov.id;
            document.getElementById('movimiento-articulo').value = mov.article_id;
            document.getElementById('movimiento-date').value = mov.date;
            document.getElementById('movimiento-type').value = mov.type;
            document.getElementById('movimiento-doc-type').value = mov.doc_type;
            document.getElementById('movimiento-doc-number').value = mov.doc_number;
            document.getElementById('movimiento-qty').value = mov.qty;
            document.getElementById('movimiento-unit-cost').value = mov.unit_cost;
            document.getElementById('movimiento-notes').value = mov.notes || '';
            document.getElementById('modal-movimiento-title').innerText = 'Editar Movimiento de Inventario';
            // Actualizar la sugerencia de costo al cargar datos del movimiento existente
            actualizarSugerenciaCostoMovimiento();
        }
    }
}

function cerrarModalMovimiento() {
    const modal = document.getElementById('modal-movimiento');
    if (modal) modal.classList.remove('active');
}

async function guardarMovimiento(e) {
    e.preventDefault();
    const idVal = document.getElementById('movimiento-id').value;
    const articleId = parseInt(document.getElementById('movimiento-articulo').value);
    const date = document.getElementById('movimiento-date').value;
    const type = document.getElementById('movimiento-type').value;
    const docType = document.getElementById('movimiento-doc-type').value;
    const docNumber = document.getElementById('movimiento-doc-number').value.trim();
    const qty = parseFloat(document.getElementById('movimiento-qty').value) || 0;
    const unitCost = parseFloat(document.getElementById('movimiento-unit-cost').value) || 0;
    const notes = document.getElementById('movimiento-notes').value.trim();

    if (!articleId || !date || !type || !docType || !docNumber || qty <= 0) {
        mostrarNotificacion('Por favor, rellene todos los campos requeridos con valores válidos.', 'error');
        return;
    }

    // VALIDACIÓN DE STOCK: No permitir salidas mayores al stock disponible
    if (type === 'Salida' || type === 'Ajuste-') {
        // Calcular kardex excluyendo el movimiento que se está editando (si aplica)
        const movimientosParaKardex = idVal
            ? state.movimientos.filter(m => parseInt(m.id) !== parseInt(idVal))
            : state.movimientos;
        const stockTemporal = { articulos: state.articulos, movimientos: movimientosParaKardex };
        
        // Calcular stock actual del artículo
        const movsFiltrados = movimientosParaKardex
            .filter(m => parseInt(m.article_id) === articleId)
            .sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
        
        const art = state.articulos.find(a => parseInt(a.id) === articleId);
        let stockActual = parseFloat(art?.initial_stock) || 0;
        let totalVal = stockActual * (parseFloat(art?.initial_cost) || 0);
        for (const m of movsFiltrados) {
            const q = parseFloat(m.qty) || 0;
            const uc = parseFloat(m.unit_cost) || 0;
            if (m.type === 'Entrada' || m.type === 'Ajuste+') {
                stockActual += q;
                totalVal += q * uc;
            } else if (m.type === 'Salida' || m.type === 'Ajuste-') {
                const costoSalida = stockActual > 0 ? totalVal / stockActual : 0;
                stockActual -= q;
                totalVal -= q * costoSalida;
                if (stockActual <= 0) { stockActual = 0; totalVal = 0; }
            }
        }

        if (qty > stockActual + 0.0001) { // margen de flotante
            mostrarNotificacion(
                `Stock insuficiente. Existencia actual: ${stockActual.toFixed(2)} ${art?.unit || 'unidades'}. No se puede registrar una salida de ${qty.toFixed(2)}.`,
                'danger'
            );
            return;
        }
    }

    // El costo unitario de salida es el promedio ponderado (ya viene bloqueado desde el form)
    // Para salidas, recalcular total usando el unit_cost del form (que es el promedio al momento de registrar)
    const totalCost = qty * unitCost;

    if (idVal) {
        // Editar
        const mov = state.movimientos.find(m => parseInt(m.id) === parseInt(idVal));
        if (mov) {
            mov.article_id = articleId;
            mov.date = date;
            mov.type = type;
            mov.doc_type = docType;
            mov.doc_number = docNumber;
            mov.qty = qty;
            mov.unit_cost = unitCost;
            mov.total_cost = totalCost;
            mov.notes = notes;
            mostrarNotificacion('Movimiento de inventario actualizado.', 'success');
        }
    } else {
        // Crear
        const nuevoId = Date.now();
        const nuevo = {
            id: nuevoId,
            article_id: articleId,
            date: date,
            type: type,
            doc_type: docType,
            doc_number: docNumber,
            qty: qty,
            unit_cost: unitCost,
            total_cost: totalCost,
            notes: notes
        };
        state.movimientos.push(nuevo);
        mostrarNotificacion('Movimiento de inventario registrado con éxito.', 'success');
    }

    cerrarModalMovimiento();
    await guardarDatos();
    renderAll();
}

async function eliminarMovimiento(id) {
    if (confirm('¿Está seguro de eliminar este registro del libro diario de control de inventario?')) {
        state.movimientos = state.movimientos.filter(m => m.id !== id);
        mostrarNotificacion('Movimiento eliminado del libro de control.', 'warning');
        await guardarDatos();
        renderAll();
    }
}

function editarMovimiento(id) {
    abrirModalMovimiento(id);
}

// --- IMPRESIÓN DEL REPORTE FISCAL OFICIAL DEL SENIAT ---
function imprimirLibroInventario() {
    const originalTitle = document.title;
    const active = getActiveBeneficiary();
    const periodStr = document.getElementById('filtro-mes-inventario')?.value || '';
    
    // Asegurar que el panel del diario esté visible para el PDF
    const panelDiario = document.getElementById('inv-panel-diario');
    if (panelDiario) panelDiario.style.display = 'block';

    if (active) {
        document.title = `LIBRO_DE_INVENTARIO_${active.tax_id}_${periodStr}`;
    }

    // Activar modo de impresión
    document.body.setAttribute('data-print-mode', 'inventario');

    const doRestore = () => {
        document.body.removeAttribute('data-print-mode');
        document.title = originalTitle;
    };

    if (window.electronAPI && typeof window.electronAPI.printToPDF === 'function') {
        mostrarNotificacion('Generando PDF del Libro de Inventario...', 'info');
        // Esperar 350ms para que Chromium aplique los estilos CSS de impresión
        setTimeout(() => {
            window.electronAPI.printToPDF('Libro_de_Inventario', { landscape: true })
                .then(res => {
                    if (res && res.success) {
                        mostrarNotificacion('¡PDF del Libro de Inventario generado y abierto en el navegador!', 'success');
                    }
                })
                .catch(error => {
                    console.error('Error al generar PDF de inventario:', error);
                    mostrarNotificacion('Error al generar el PDF: ' + error.message, 'danger');
                })
                .finally(() => {
                    doRestore();
                });
        }, 350);
    } else {
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                doRestore();
            }, 500);
        }, 250);
    }
}

// =======================================================
// EXPONER FUNCIONES DE INVENTARIO AL ENTORNO GLOBAL
// =======================================================
window.switchInventarioTab = switchInventarioTab;
window.abrirModalArticulo = abrirModalArticulo;
window.cerrarModalArticulo = cerrarModalArticulo;
window.editarArticulo = editarArticulo;
window.eliminarArticulo = eliminarArticulo;
window.abrirModalMovimiento = abrirModalMovimiento;
window.cerrarModalMovimiento = cerrarModalMovimiento;
window.editarMovimiento = editarMovimiento;
window.eliminarMovimiento = eliminarMovimiento;
window.actualizarSugerenciaCostoMovimiento = actualizarSugerenciaCostoMovimiento;
window.filtrarArticulos = filtrarArticulos;
window.filtrarInventarioMovimientos = filtrarInventarioMovimientos;
window.imprimirLibroInventario = imprimirLibroInventario;
window.guardarArticulo = guardarArticulo;
window.guardarMovimiento = guardarMovimiento;


// ==========================================================================
// MÓDULO DE CONTABILIDAD: LIBRO DIARIO Y LIBRO MAYOR (SENIAT - VENEZUELA)
// ==========================================================================
// (CUENTAS_CATALOGO definido al inicio del archivo)

function obtenerNombreCuenta(codigo) {
    if (state.cuentas_contables && Array.isArray(state.cuentas_contables)) {
        const found = state.cuentas_contables.find(c => c.code === codigo);
        if (found) return found.name;
    }
    return CUENTAS_CATALOGO[codigo] || 'Cuenta Contable Genérica';
}

function obtenerFechasPeriodo(mesStr, quincenaVal) {
    if (!mesStr) return { start: '1970-01-01', end: '9999-12-31' };
    
    if (quincenaVal === 'q1') {
        return {
            start: `${mesStr}-01`,
            end: `${mesStr}-15`
        };
    } else if (quincenaVal === 'q2') {
        return {
            start: `${mesStr}-16`,
            end: `${mesStr}-31`
        };
    } else {
        return {
            start: `${mesStr}-01`,
            end: `${mesStr}-31`
        };
    }
}

function generarAsientosAutomaticos() {
    let asientos = [];
    
    // Asientos de Compras
    state.compras.forEach(c => {
        if (c.status === 'Anulado') return;
        
        const baseDeducible = (c.base_exenta || 0) + (c.base_general || 0) + (c.base_reducida || 0) + (c.base_adicional || 0);
        const sinCredito = c.sin_credito || 0;
        const tax = (c.tax_general || 0) + (c.tax_reducida || 0) + (c.tax_adicional || 0);
        const total = c.total_amount || 0;
        const retVal = c.has_retention ? (c.retention_amount || 0) : 0;
        const net = total - retVal;
        
        const origen = `Compra N° ${c.doc_number}`;
        const isNC = c.doc_type === 'Nota Crédito';
        
        if (!isNC) {
            if (baseDeducible > 0) {
                asientos.push({
                    id: `C-${c.id}-1`,
                    date: c.date,
                    origin: origen,
                    account: '5.1.01',
                    concept: c.notes || `Registro de compra ${c.doc_type} N° ${c.doc_number}`,
                    debe: baseDeducible,
                    haber: 0
                });
            }
            if (sinCredito > 0) {
                asientos.push({
                    id: `C-${c.id}-1-nc`,
                    date: c.date,
                    origin: origen,
                    account: '5.1.02',
                    concept: c.notes || `Gasto no deducible - Compra N° ${c.doc_number}`,
                    debe: sinCredito,
                    haber: 0
                });
            }
            if (tax > 0) {
                asientos.push({
                    id: `C-${c.id}-2`,
                    date: c.date,
                    origin: origen,
                    account: '1.1.04',
                    concept: `IVA Crédito Fiscal - Compra N° ${c.doc_number}`,
                    debe: tax,
                    haber: 0
                });
            }
            asientos.push({
                id: `C-${c.id}-3`,
                date: c.date,
                origin: origen,
                account: '2.1.01',
                concept: `Obligación con Proveedor - Compra N° ${c.doc_number}`,
                debe: 0,
                haber: net
            });
            if (retVal > 0) {
                asientos.push({
                    id: `C-${c.id}-4`,
                    date: c.date,
                    origin: origen,
                    account: '2.1.02',
                    concept: `Retención IVA retenida al Proveedor - Compra N° ${c.doc_number}`,
                    debe: 0,
                    haber: retVal
                });
            }
        } else {
            asientos.push({
                id: `C-${c.id}-1`,
                date: c.date,
                origin: origen,
                account: '2.1.01',
                concept: `Ajuste Proveedor - Nota de Crédito N° ${c.doc_number}`,
                debe: net,
                haber: 0
            });
            if (retVal > 0) {
                asientos.push({
                    id: `C-${c.id}-2`,
                    date: c.date,
                    origin: origen,
                    account: '2.1.02',
                    concept: `Ajuste Retención - Nota de Crédito N° ${c.doc_number}`,
                    debe: retVal,
                    haber: 0
                });
            }
            if (baseDeducible > 0) {
                asientos.push({
                    id: `C-${c.id}-3`,
                    date: c.date,
                    origin: origen,
                    account: '5.1.01',
                    concept: `Reversa Gasto - Nota de Crédito N° ${c.doc_number}`,
                    debe: 0,
                    haber: baseDeducible
                });
            }
            if (sinCredito > 0) {
                asientos.push({
                    id: `C-${c.id}-3-nc`,
                    date: c.date,
                    origin: origen,
                    account: '5.1.02',
                    concept: `Ajuste Gasto no deducible - Nota de Crédito N° ${c.doc_number}`,
                    debe: 0,
                    haber: sinCredito
                });
            }
            if (tax > 0) {
                asientos.push({
                    id: `C-${c.id}-4`,
                    date: c.date,
                    origin: origen,
                    account: '1.1.04',
                    concept: `Ajuste IVA Crédito - Nota de Crédito N° ${c.doc_number}`,
                    debe: 0,
                    haber: tax
                });
            }
        }
    });
    
    // Asientos de Ventas
    state.ventas.forEach(v => {
        if (v.status === 'Anulado') return;
        
        const base = (v.base_exenta || 0) + (v.base_general || 0) + (v.base_reducida || 0) + (v.base_adicional || 0);
        const tax = (v.tax_general || 0) + (v.tax_reducida || 0) + (v.tax_adicional || 0);
        const total = v.total_amount || 0;
        const retVal = v.has_retention ? (v.retention_amount || 0) : 0;
        const net = total - retVal;
        
        const origen = `Venta N° ${v.doc_number}`;
        const isNC = v.doc_type === 'Nota Crédito';
        
        if (!isNC) {
            asientos.push({
                id: `V-${v.id}-1`,
                date: v.date,
                origin: origen,
                account: '1.1.02',
                concept: `Derecho de cobro - Venta N° ${v.doc_number}`,
                debe: net,
                haber: 0
            });
            if (retVal > 0) {
                asientos.push({
                    id: `V-${v.id}-2`,
                    date: v.date,
                    origin: origen,
                    account: '1.1.03',
                    concept: `Retención IVA aplicada por Cliente - Venta N° ${v.doc_number}`,
                    debe: retVal,
                    haber: 0
                });
            }
            asientos.push({
                id: `V-${v.id}-3`,
                date: v.date,
                origin: origen,
                account: '4.1.01',
                concept: v.notes || `Registro de venta ${v.doc_type} N° ${v.doc_number}`,
                debe: 0,
                haber: base
            });
            if (tax > 0) {
                asientos.push({
                    id: `V-${v.id}-4`,
                    date: v.date,
                    origin: origen,
                    account: '2.1.03',
                    concept: `IVA Débito Fiscal - Venta N° ${v.doc_number}`,
                    debe: 0,
                    haber: tax
                });
            }
        } else {
            asientos.push({
                id: `V-${v.id}-1`,
                date: v.date,
                origin: origen,
                account: '4.1.01',
                concept: `Descuento sobre Ventas - Nota de Crédito N° ${v.doc_number}`,
                debe: base,
                haber: 0
            });
            if (tax > 0) {
                asientos.push({
                    id: `V-${v.id}-2`,
                    date: v.date,
                    origin: origen,
                    account: '2.1.03',
                    concept: `Ajuste IVA Débito - Nota de Crédito N° ${v.doc_number}`,
                    debe: tax,
                    haber: 0
                });
            }
            asientos.push({
                id: `V-${v.id}-3`,
                date: v.date,
                origin: origen,
                account: '1.1.02',
                concept: `Ajuste Cliente - Nota de Crédito N° ${v.doc_number}`,
                debe: 0,
                haber: net
            });
            if (retVal > 0) {
                asientos.push({
                    id: `V-${v.id}-4`,
                    date: v.date,
                    origin: origen,
                    account: '1.1.03',
                    concept: `Reversa Retención - Nota de Crédito N° ${v.doc_number}`,
                    debe: 0,
                    haber: retVal
                });
            }
        }
    });

    // Asientos de Movimientos de Inventario (Almacén)
    // El total_cost de Entradas se usa directamente (costo real de compra)
    // Para Salidas, se recalcula usando el Kardex para garantizar consistencia con el costo promedio ponderado
    if (state.movimientos && Array.isArray(state.movimientos)) {
        // Pre-calcular el Kardex de cada artículo para obtener el costo promedio en cada salida
        const kardexPorArticulo = {};
        (state.articulos || []).forEach(art => {
            let stock = parseFloat(art.initial_stock) || 0;
            let avg_cost = parseFloat(art.initial_cost) || 0;
            let total_value = stock * avg_cost;
            const movs = (state.movimientos || [])
                .filter(m => parseInt(m.article_id) === parseInt(art.id))
                .sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
            kardexPorArticulo[art.id] = { movCostMap: {} };
            for (const m of movs) {
                const qty = parseFloat(m.qty) || 0;
                const uc = parseFloat(m.unit_cost) || 0;
                if (m.type === 'Entrada' || m.type === 'Ajuste+') {
                    stock += qty;
                    total_value += qty * uc;
                    if (stock > 0) avg_cost = total_value / stock;
                } else if (m.type === 'Salida' || m.type === 'Ajuste-') {
                    const costoReal = avg_cost; // costo promedio ANTES de esta salida
                    kardexPorArticulo[art.id].movCostMap[m.id] = costoReal; // guardar el costo promedio de esta salida
                    const totalSalida = qty * costoReal;
                    stock -= qty;
                    total_value -= totalSalida;
                    if (stock <= 0) { stock = 0; total_value = 0; avg_cost = 0; }
                }
            }
        });

        state.movimientos.forEach(m => {
            const art = (state.articulos || []).find(a => a.id === m.article_id);
            const artName = art ? art.description : `ID Artículo: ${m.article_id}`;
            const typeLower = m.type.toLowerCase();
            const origen = `Mov. Inventario N° ${m.id}`;
            const concept = m.notes || `${m.type} de ${artName} (${m.qty} ${art?.unit || 'Unidad'}) - ${m.doc_type} N° ${m.doc_number}`;

            if (typeLower.startsWith('entrada') || typeLower.startsWith('ajuste+')) {
                const totalCost = parseFloat(m.total_cost) || 0;
                if (totalCost <= 0) return;
                // Entrada: Inventario (Debe) contra Compras/Variación (Haber)
                asientos.push({
                    id: `I-${m.id}-1`,
                    date: m.date,
                    origin: origen,
                    account: '1.1.06',
                    concept: `[Entrada Almacén] ${concept}`,
                    debe: totalCost,
                    haber: 0
                });
                asientos.push({
                    id: `I-${m.id}-2`,
                    date: m.date,
                    origin: origen,
                    account: '5.1.01',
                    concept: `[Entrada Almacén] ${concept}`,
                    debe: 0,
                    haber: totalCost
                });
            } else if (typeLower.startsWith('salida') || typeLower.startsWith('ajuste-')) {
                // Para salidas, usar el costo promedio calculado por el Kardex (más preciso que total_cost guardado)
                const costoPromedioKardex = kardexPorArticulo[m.article_id]?.movCostMap[m.id] ?? (parseFloat(m.unit_cost) || 0);
                const qty = parseFloat(m.qty) || 0;
                const totalCostReal = qty * costoPromedioKardex;
                if (totalCostReal <= 0) return;
                // Salida: Costo de Ventas (Debe) contra Inventario (Haber)
                asientos.push({
                    id: `I-${m.id}-1`,
                    date: m.date,
                    origin: origen,
                    account: '5.1.03',
                    concept: `[Salida Almacén] ${concept}`,
                    debe: totalCostReal,
                    haber: 0
                });
                asientos.push({
                    id: `I-${m.id}-2`,
                    date: m.date,
                    origin: origen,
                    account: '1.1.06',
                    concept: `[Salida Almacén] ${concept}`,
                    debe: 0,
                    haber: totalCostReal
                });
            }
        });
    }

    return asientos;
}

function compilarTodosLosAsientos() {
    const autoAsientos = generarAsientosAutomaticos();
    
    const manualAsientos = (state.asientos_manuales || []).map(am => ({
        id: `M-${am.id}`,
        date: am.date,
        origin: 'Asiento Manual',
        account: am.account,
        concept: am.concept,
        debe: am.debe || 0,
        haber: am.haber || 0,
        isManual: true,
        rawId: am.id
    }));
    
    const todos = [...autoAsientos, ...manualAsientos];
    todos.sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff !== 0) return dateDiff;
        return String(a.id).localeCompare(String(b.id));
    });
    
    return todos;
}

function calcularSaldoAnterior(cuenta, fechaInicio) {
    const todosAsientos = compilarTodosLosAsientos();
    const anteriores = todosAsientos.filter(as => as.account === cuenta && as.date < fechaInicio);
    
    const esDeudora = cuenta.startsWith('1') || cuenta.startsWith('5');
    
    let saldo = 0;
    anteriores.forEach(as => {
        if (esDeudora) {
            saldo += (as.debe || 0) - (as.haber || 0);
        } else {
            saldo += (as.haber || 0) - (as.debe || 0);
        }
    });
    
    return saldo;
}

function renderLibroDiario() {
    const cardDetallado = document.getElementById('card-diario-detallado');
    const cardConsolidado = document.getElementById('card-diario-consolidado');
    const tbody = document.getElementById('tabla-diario-body');
    const tbodyConsolidado = document.getElementById('tabla-diario-consolidado-body');
    
    if (!tbody || !tbodyConsolidado) return;
    
    // Controlar visibilidad de las tarjetas de vista
    if (window.vistaConsolidadaDiario) {
        if (cardDetallado) cardDetallado.style.display = 'none';
        if (cardConsolidado) cardConsolidado.style.display = 'block';
    } else {
        if (cardDetallado) cardDetallado.style.display = 'block';
        if (cardConsolidado) cardConsolidado.style.display = 'none';
    }
    
    const query = (document.getElementById('buscar-diario')?.value || '').toLowerCase().trim();
    const filterMes = document.getElementById('filtro-mes-diario')?.value;
    const filterPeriodo = document.getElementById('filtro-periodo-diario')?.value;
    
    let asientos = compilarTodosLosAsientos();
    
    if (filterMes) {
        asientos = asientos.filter(as => as.date.startsWith(filterMes));
        
        if (filterPeriodo === 'q1') {
            asientos = asientos.filter(as => {
                const dia = parseInt(as.date.split('-')[2]);
                return dia <= 15;
            });
        } else if (filterPeriodo === 'q2') {
            asientos = asientos.filter(as => {
                const dia = parseInt(as.date.split('-')[2]);
                return dia > 15;
            });
        }
    }
    
    if (query) {
        asientos = asientos.filter(as => 
            as.concept.toLowerCase().includes(query) ||
            as.account.includes(query) ||
            obtenerNombreCuenta(as.account).toLowerCase().includes(query) ||
            as.origin.toLowerCase().includes(query)
        );
    }
    
    if (window.vistaConsolidadaDiario) {
        // --- VISTA CONSOLIDADA POR CUENTA CONTABLE ---
        if (asientos.length === 0) {
            tbodyConsolidado.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No se encontraron movimientos para agrupar en este período.</td></tr>';
            return;
        }
        
        const agrupado = {};
        asientos.forEach(as => {
            if (!agrupado[as.account]) {
                agrupado[as.account] = {
                    code: as.account,
                    name: obtenerNombreCuenta(as.account),
                    debe: 0,
                    haber: 0
                };
            }
            agrupado[as.account].debe += as.debe || 0;
            agrupado[as.account].haber += as.haber || 0;
        });
        
        const listaAgrupada = Object.values(agrupado).sort((a, b) => a.code.localeCompare(b.code));
        
        let html = '';
        let totalDebe = 0;
        let totalHaber = 0;
        
        listaAgrupada.forEach(item => {
            totalDebe += item.debe;
            totalHaber += item.haber;
            
            html += `
                <tr>
                    <td><strong style="color: var(--color-primary);">${item.code}</strong></td>
                    <td>${item.name}</td>
                    <td class="text-right font-semibold" style="color: var(--color-success);">${item.debe > 0 ? formatearMoneda(item.debe) : '-'}</td>
                    <td class="text-right font-semibold" style="color: var(--color-danger);">${item.haber > 0 ? formatearMoneda(item.haber) : '-'}</td>
                </tr>
            `;
        });
        
        // Fila de Totales
        html += `
            <tr style="background: rgba(255, 255, 255, 0.05); font-weight: bold; border-top: 2px solid var(--border-color);">
                <td colspan="2" style="text-align: right; padding-right: 20px;">TOTALES GENERALES</td>
                <td class="text-right" style="color: var(--color-success); font-size: 0.9rem;">${formatearMoneda(totalDebe)}</td>
                <td class="text-right" style="color: var(--color-danger); font-size: 0.9rem;">${formatearMoneda(totalHaber)}</td>
            </tr>
        `;
        
        tbodyConsolidado.innerHTML = html;
        
    } else {
        // --- VISTA DETALLADA POR MOVIMIENTO (AUXILIAR) ---
        if (asientos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron asientos contables en este período.</td></tr>';
            return;
        }
        
        const extraerIdOrigen = (origin) => {
            const match = origin.match(/N[°o]?\s*(\S+)$/i);
            if (match) return match[1];
            if (origin.toLowerCase().includes('manual')) return 'Manual';
            return origin;
        };
        
        let html = '';
        asientos.forEach(as => {
            const accName = obtenerNombreCuenta(as.account);
            const actionButton = as.isManual ? 
                `<button class="btn btn-danger btn-icon-only" onclick="eliminarAsientoManual(${as.rawId})" title="Eliminar Asiento Manual">
                    <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                 </button>` : '-';
            
            const idOrigen = extraerIdOrigen(as.origin);
            
            html += `
                <tr>
                    <td>${formatearFechaISOaUI(as.date)}</td>
                    <td title="${as.origin}">
                        <span class="badge ${as.isManual ? 'badge-success' : 'badge-primary'}" style="cursor:default; ${as.isManual ? 'background-color: var(--color-success); color: #fff;' : 'background-color: var(--color-primary); color: #fff;'}">${idOrigen}</span>
                    </td>
                    <td><strong style="color: var(--color-primary);">${as.account}</strong><br><span style="font-size:0.75rem; color:var(--text-secondary);">${accName}</span></td>
                    <td>${as.concept}</td>
                    <td class="text-right font-semibold" style="color: var(--color-success);">${as.debe > 0 ? formatearMoneda(as.debe) : '-'}</td>
                    <td class="text-right font-semibold" style="color: var(--color-danger);">${as.haber > 0 ? formatearMoneda(as.haber) : '-'}</td>
                    <td style="text-align: center;">${actionButton}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
    }
}

function renderLibroMayor() {
    const tbody = document.getElementById('tabla-mayor-body');
    if (!tbody) return;
    
    const cuentaSeleccionada = document.getElementById('filtro-cuenta-mayor')?.value || 'todas';
    const filterMes = document.getElementById('filtro-mes-mayor')?.value;
    const filterPeriodo = document.getElementById('filtro-periodo-mayor')?.value || 'completo';
    
    if (!filterMes) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Seleccione un período fiscal para consultar el mayor contable.</td></tr>';
        return;
    }
    
    const { start: fechaInicio, end: fechaFin } = obtenerFechasPeriodo(filterMes, filterPeriodo);
    const todosAsientos = compilarTodosLosAsientos();
    
    let html = '';

    const renderCuentaMayorRows = (code, name) => {
        const saldoAnterior = calcularSaldoAnterior(code, fechaInicio);
        const delPeriodo = todosAsientos.filter(as => 
            as.account === code && 
            as.date >= fechaInicio && 
            as.date <= fechaFin
        );

        let subHtml = '';
        
        // Cabecera de la Cuenta (solo si se consultan todas las cuentas)
        if (cuentaSeleccionada === 'todas') {
            subHtml += `
                <tr style="background: rgba(59,130,246,0.15); font-weight: bold; border-left: 4px solid var(--color-primary);">
                    <td colspan="6" style="color: var(--color-primary); font-size: 0.9rem; text-align: left; padding: 10px 12px;">
                        CUENTA: ${code} - ${name}
                    </td>
                </tr>
            `;
        }

        // Fila de saldo anterior
        subHtml += `
            <tr style="background: rgba(255,255,255,0.01); font-weight: 500; color: var(--text-muted);">
                <td>-</td>
                <td><strong style="color: var(--color-primary);">${code}</strong></td>
                <td><em>SALDO ANTERIOR (Arrastrado)</em></td>
                <td class="text-right">-</td>
                <td class="text-right">-</td>
                <td class="text-right font-semibold" style="color: var(--color-success);">${formatearMoneda(saldoAnterior)}</td>
            </tr>
        `;

        // Naturaleza: deudora (1=Activo, 5=Gastos), acreedora (2=Pasivo, 3=Patrimonio, 4=Ingresos)
        // Si el código es libre (no empieza por dígito), se asume deudora por defecto
        const primerChar = code.trim().charAt(0);
        const esDeudora = primerChar === '1' || primerChar === '5' || isNaN(parseInt(primerChar));
        let saldoAcumulado = saldoAnterior;

        if (delPeriodo.length === 0) {
            subHtml += `
                <tr style="border-bottom: 1px dashed var(--border-color);">
                    <td>-</td>
                    <td><strong style="color: var(--color-primary);">${code}</strong></td>
                    <td colspan="4" class="text-center text-muted" style="padding: 10px; font-size: 0.8rem;">No hubo movimientos en el período seleccionado.</td>
                </tr>
            `;
        } else {
            delPeriodo.forEach(as => {
                if (esDeudora) {
                    saldoAcumulado += (as.debe || 0) - (as.haber || 0);
                } else {
                    saldoAcumulado += (as.haber || 0) - (as.debe || 0);
                }

                subHtml += `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td>${formatearFechaISOaUI(as.date)}</td>
                        <td><strong style="color: var(--color-primary);">${as.account}</strong><br><span style="font-size:0.75rem; color:var(--text-secondary);">${name}</span></td>
                        <td>
                            <span class="badge ${as.isManual ? 'badge-success' : 'badge-primary'}" style="margin-right: 8px; font-size:0.75rem; ${as.isManual ? 'background-color: var(--color-success); color: #fff;' : 'background-color: var(--color-primary); color: #fff;'}">${as.origin}</span>
                            ${as.concept}
                        </td>
                        <td class="text-right" style="color: var(--color-success);">${as.debe > 0 ? formatearMoneda(as.debe) : '-'}</td>
                        <td class="text-right" style="color: var(--color-danger);">${as.haber > 0 ? formatearMoneda(as.haber) : '-'}</td>
                        <td class="text-right font-semibold" style="color: var(--color-success);">${formatearMoneda(saldoAcumulado)}</td>
                    </tr>
                `;
            });
        }
        return subHtml;
    };

    if (cuentaSeleccionada === 'todas') {
        // Unir cuentas del catálogo con cuentas de asientos automáticos (compras/ventas)
        // para que aparezcan aunque no estén en el catálogo manual del usuario
        const codigosEnCatalogo = new Set((state.cuentas_contables || []).map(c => c.code));

        // Recoger códigos únicos de todos los asientos del período (automáticos + manuales)
        const todosAsientosParaMerge = compilarTodosLosAsientos();
        const codigosDeAsientos = [...new Set(todosAsientosParaMerge.map(as => as.account))];

        // Construir lista unificada: primero las del catálogo (con nombre), luego las de asientos
        // que no están en el catálogo (con nombre de CUENTAS_CATALOGO como fallback)
        const cuentasUnificadas = [...(state.cuentas_contables || [])];
        codigosDeAsientos.forEach(code => {
            if (!codigosEnCatalogo.has(code)) {
                cuentasUnificadas.push({ code, name: obtenerNombreCuenta(code) });
            }
        });

        if (cuentasUnificadas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay cuentas contables ni asientos registrados.</td></tr>';
            return;
        }

        // Ordenar cuentas por código (soporte numérico y alfanumérico libre)
        const sortedCuentas = cuentasUnificadas.sort((a, b) => {
            const aParts = a.code.split('.');
            const bParts = b.code.split('.');
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                if (aParts[i] === undefined) return -1;
                if (bParts[i] === undefined) return 1;
                const aNum = parseFloat(aParts[i]);
                const bNum = parseFloat(bParts[i]);
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    if (aNum !== bNum) return aNum - bNum;
                } else {
                    const cmp = aParts[i].localeCompare(bParts[i]);
                    if (cmp !== 0) return cmp;
                }
            }
            return 0;
        });

        sortedCuentas.forEach(c => {
            html += renderCuentaMayorRows(c.code, c.name);
        });
    } else {
        const c = state.cuentas_contables.find(item => item.code === cuentaSeleccionada);
        const name = c ? c.name : 'Cuenta Contable Genérica';
        html += renderCuentaMayorRows(cuentaSeleccionada, name);
    }
    
    tbody.innerHTML = html;
}

function abrirModalAsientoManual() {
    document.getElementById('form-asiento-manual').reset();
    document.getElementById('asiento-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('modal-asiento-manual').classList.add('active');
}

function cerrarModalAsientoManual() {
    document.getElementById('modal-asiento-manual').classList.remove('active');
}

async function guardarAsientoManual(e) {
    e.preventDefault();
    
    const date = document.getElementById('asiento-date').value;
    const concept = document.getElementById('asiento-concept').value.trim();
    const cuentaDebe = document.getElementById('asiento-cuenta-debe').value;
    const cuentaHaber = document.getElementById('asiento-cuenta-haber').value;
    const monto = parseFloat(document.getElementById('asiento-monto').value) || 0;
    
    if (!date || !concept || !cuentaDebe || !cuentaHaber || monto <= 0) {
        mostrarNotificacion('Por favor, rellene todos los campos obligatorios.', 'error');
        return;
    }
    
    if (cuentaDebe === cuentaHaber) {
        mostrarNotificacion('La cuenta de cargo (Debe) y abono (Haber) no pueden ser la misma.', 'error');
        return;
    }
    
    const asientoId = Date.now();
    
    if (!state.asientos_manuales) state.asientos_manuales = [];
    
    // Cargo (Debe)
    state.asientos_manuales.push({
        id: asientoId,
        date: date,
        concept: concept,
        account: cuentaDebe,
        debe: monto,
        haber: 0
    });
    
    // Abono (Haber)
    state.asientos_manuales.push({
        id: asientoId,
        date: date,
        concept: concept,
        account: cuentaHaber,
        debe: 0,
        haber: monto
    });
    
    mostrarNotificacion('Asiento contable registrado con éxito en partida doble.', 'success');
    cerrarModalAsientoManual();
    
    await guardarDatos();
    renderLibroDiario();
    renderLibroMayor();
}

async function eliminarAsientoManual(rawId) {
    if (confirm('¿Está seguro de eliminar este asiento manual? Se borrarán sus registros correspondientes en el Debe y el Haber.')) {
        state.asientos_manuales = (state.asientos_manuales || []).filter(am => am.id !== rawId);
        mostrarNotificacion('Asiento manual eliminado.', 'warning');
        await guardarDatos();
        renderLibroDiario();
        renderLibroMayor();
    }
}

async function imprimirLibroDiario() {
    document.body.setAttribute('data-print-mode', 'diario');
    
    const originalTitle = document.title;
    const active = getActiveBeneficiary();
    const periodStr = document.getElementById('filtro-mes-diario')?.value || '';
    
    if (active) {
        document.title = `LIBRO_DIARIO_${active.tax_id}_${periodStr}`;
    }

    if (window.electronAPI && typeof window.electronAPI.printToPDF === 'function') {
        try {
            mostrarNotificacion('Generando PDF del Libro Diario...', 'info');
            const res = await window.electronAPI.printToPDF('Libro_Diario', { landscape: false });
            if (res && res.success) {
                mostrarNotificacion('¡PDF del Libro Diario generado y abierto en el navegador!', 'success');
            }
        } catch (error) {
            console.error('Error al generar PDF de diario:', error);
            mostrarNotificacion('Error al generar el PDF: ' + error.message, 'danger');
        } finally {
            document.body.removeAttribute('data-print-mode');
            document.title = originalTitle;
        }
    } else {
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.body.removeAttribute('data-print-mode');
                document.title = originalTitle;
            }, 500);
        }, 250);
    }
}

async function imprimirLibroMayor() {
    document.body.setAttribute('data-print-mode', 'mayor');
    
    const originalTitle = document.title;
    const active = getActiveBeneficiary();
    const cuenta = document.getElementById('filtro-cuenta-mayor')?.value || '1.1.01';
    const periodStr = document.getElementById('filtro-mes-mayor')?.value || '';
    
    if (active) {
        document.title = `LIBRO_MAYOR_${cuenta}_${active.tax_id}_${periodStr}`;
    }

    if (window.electronAPI && typeof window.electronAPI.printToPDF === 'function') {
        try {
            mostrarNotificacion('Generando PDF del Libro Mayor...', 'info');
            const res = await window.electronAPI.printToPDF('Libro_Mayor', { landscape: false });
            if (res && res.success) {
                mostrarNotificacion('¡PDF del Libro Mayor generado y abierto en el navegador!', 'success');
            }
        } catch (error) {
            console.error('Error al generar PDF de mayor:', error);
            mostrarNotificacion('Error al generar el PDF: ' + error.message, 'danger');
        } finally {
            document.body.removeAttribute('data-print-mode');
            document.title = originalTitle;
        }
    } else {
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.body.removeAttribute('data-print-mode');
                document.title = originalTitle;
            }, 500);
        }, 250);
    }
}

// --- GESTIÓN DE CATÁLOGO DE CUENTAS ---

function renderSelectoresCuentas() {
    const debeSelect = document.getElementById('asiento-cuenta-debe');
    const haberSelect = document.getElementById('asiento-cuenta-haber');
    const mayorSelect = document.getElementById('filtro-cuenta-mayor');

    if (!state.cuentas_contables) state.cuentas_contables = [];

    // Conservar valores seleccionados actuales para evitar que cambien al renderizar
    const prevDebe = debeSelect ? debeSelect.value : '';
    const prevHaber = haberSelect ? haberSelect.value : '';
    const prevMayor = mayorSelect ? mayorSelect.value : 'todas';

    // Generar opciones para asientos (específicas, sin "todas")
    let asientosHTML = '';
    state.cuentas_contables.forEach(c => {
        asientosHTML += `<option value="${c.code}">${c.code} - ${c.name}</option>`;
    });

    // Generar opciones para mayor (con "todas" al inicio)
    let mayorHTML = '<option value="todas">[Todas las Cuentas]</option>';
    state.cuentas_contables.forEach(c => {
        mayorHTML += `<option value="${c.code}">${c.code} - ${c.name}</option>`;
    });

    if (debeSelect) {
        debeSelect.innerHTML = asientosHTML;
        if (prevDebe && state.cuentas_contables.some(c => c.code === prevDebe)) {
            debeSelect.value = prevDebe;
        }
    }
    if (haberSelect) {
        haberSelect.innerHTML = asientosHTML;
        if (prevHaber && state.cuentas_contables.some(c => c.code === prevHaber)) {
            haberSelect.value = prevHaber;
        }
    }
    if (mayorSelect) {
        mayorSelect.innerHTML = mayorHTML;
        if (prevMayor === 'todas') {
            mayorSelect.value = 'todas';
        } else if (prevMayor && state.cuentas_contables.some(c => c.code === prevMayor)) {
            mayorSelect.value = prevMayor;
        } else {
            mayorSelect.value = 'todas';
        }
    }
}

function abrirModalCatalogoCuentas() {
    const modal = document.getElementById('modal-catalogo-cuentas');
    if (modal) {
        modal.classList.add('active');
        // Limpiar formulario y buscador
        document.getElementById('form-catalogo-nueva-cuenta')?.reset();
        const originalCodeInput = document.getElementById('catalogo-cuenta-original-codigo');
        if (originalCodeInput) originalCodeInput.value = '';
        document.getElementById('catalogo-form-title').innerText = 'Registrar Nueva Cuenta Contable';
        document.getElementById('btn-catalogo-guardar').innerText = 'Guardar';
        const inputBuscar = document.getElementById('buscar-catalogo-cuentas');
        if (inputBuscar) inputBuscar.value = '';
        renderTablaCatalogoCuentas();
    }
}

function cerrarModalCatalogoCuentas() {
    const modal = document.getElementById('modal-catalogo-cuentas');
    if (modal) modal.classList.remove('active');
}

function renderTablaCatalogoCuentas() {
    const tbody = document.getElementById('tabla-catalogo-cuentas-body');
    if (!tbody) return;

    if (!state.cuentas_contables) state.cuentas_contables = [];

    const query = (document.getElementById('buscar-catalogo-cuentas')?.value || '').toLowerCase().trim();

    let filtered = state.cuentas_contables;
    if (query) {
        filtered = state.cuentas_contables.filter(c => 
            c.code.toLowerCase().includes(query) || 
            c.name.toLowerCase().includes(query)
        );
    }

    // Ordenar cuentas por código
    filtered.sort((a, b) => {
        const aParts = a.code.split('.').map(Number);
        const bParts = b.code.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            if (aParts[i] === undefined) return -1;
            if (bParts[i] === undefined) return 1;
            if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
        }
        return 0;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No hay cuentas contables registradas.</td></tr>';
        return;
    }

    let html = '';
    filtered.forEach(c => {
        const deleteButton = `
            <button type="button" class="btn btn-danger btn-icon-only" onclick="eliminarCuentaContable('${c.code}')" title="Eliminar Cuenta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;
        const editButton = `
            <button type="button" class="btn btn-secondary btn-icon-only" onclick="editarCuentaContable('${c.code}')" title="Editar Cuenta" style="margin-right: 4px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
        `;

        html += `
            <tr>
                <td style="font-weight: 600; color: var(--color-primary);">${c.code}</td>
                <td>${c.name}</td>
                <td style="text-align: center;">${editButton}${deleteButton}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function filtrarCatalogoCuentas() {
    renderTablaCatalogoCuentas();
}

function editarCuentaContable(code) {
    const c = state.cuentas_contables.find(item => item.code === code);
    if (!c) return;

    document.getElementById('catalogo-cuenta-codigo').value = c.code;
    document.getElementById('catalogo-cuenta-nombre').value = c.name;
    const originalCodeEl = document.getElementById('catalogo-cuenta-original-codigo');
    if (originalCodeEl) originalCodeEl.value = c.code;

    document.getElementById('catalogo-form-title').innerText = 'Editar Cuenta Contable';
    document.getElementById('btn-catalogo-guardar').innerText = 'Actualizar';
}

function guardarNuevaCuenta(e) {
    if (e) e.preventDefault();

    const codeInput = document.getElementById('catalogo-cuenta-codigo');
    const nameInput = document.getElementById('catalogo-cuenta-nombre');
    const originalCodeInput = document.getElementById('catalogo-cuenta-original-codigo');

    if (!codeInput || !nameInput) return;

    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    const originalCode = originalCodeInput ? originalCodeInput.value.trim() : '';

    if (!code || !name) {
        mostrarNotificacion('Por favor completa todos los campos obligatorios.', 'danger');
        return;
    }

    if (!state.cuentas_contables) state.cuentas_contables = [];

    if (originalCode) {
        // Validar duplicado
        if (code !== originalCode && state.cuentas_contables.some(c => c.code === code)) {
            mostrarNotificacion(`El código de cuenta ${code} ya está registrado en el catálogo.`, 'danger');
            return;
        }

        // Si cambió el código, actualizar también los asientos manuales existentes con el código anterior
        if (code !== originalCode) {
            let countActualizados = 0;
            state.asientos_manuales.forEach(am => {
                if (am.account === originalCode) {
                    am.account = code;
                    countActualizados++;
                }
            });
            const active = getActiveBeneficiary();
            if (active) {
                if (!active.asientos_manuales) active.asientos_manuales = [];
                active.asientos_manuales.forEach(am => {
                    if (am.account === originalCode) {
                        am.account = code;
                    }
                });
            }
            if (countActualizados > 0) {
                console.log(`Se actualizaron ${countActualizados} asientos manuales con el nuevo código.`);
            }
        }

        // Actualizar en el catálogo
        const index = state.cuentas_contables.findIndex(c => c.code === originalCode);
        if (index !== -1) {
            state.cuentas_contables[index] = { code, name };
        }
    } else {
        // Validar duplicado
        const existe = state.cuentas_contables.some(c => c.code === code);
        if (existe) {
            mostrarNotificacion(`El código de cuenta ${code} ya está registrado en el catálogo.`, 'danger');
            return;
        }

        // Agregar al catálogo
        state.cuentas_contables.push({ code, name });
    }

    // Sincronizar en el beneficiario activo
    const active = getActiveBeneficiary();
    if (active) {
        active.cuentas_contables = state.cuentas_contables;
    }

    // Resetear formulario a modo creación
    document.getElementById('form-catalogo-nueva-cuenta')?.reset();
    if (originalCodeInput) originalCodeInput.value = '';
    document.getElementById('catalogo-form-title').innerText = 'Registrar Nueva Cuenta Contable';
    document.getElementById('btn-catalogo-guardar').innerText = 'Guardar';

    // Guardar en DB y repoblar UI
    guardarDatos();
    renderSelectoresCuentas();
    renderTablaCatalogoCuentas();
    
    mostrarNotificacion(`Cuenta contable guardada exitosamente.`, 'success');
}

function eliminarCuentaContable(code) {
    if (!code) return;

    // Validar que no tenga movimientos contables
    const todosAsientos = compilarTodosLosAsientos();
    const enUso = todosAsientos.some(as => as.account === code);
    
    if (enUso) {
        mostrarNotificacion(`No se puede eliminar la cuenta ${code} porque tiene asientos contables o facturas asociadas.`, 'danger');
        return;
    }

    if (confirm(`¿Estás seguro de que deseas eliminar la cuenta contable ${code} del catálogo? Esta acción no se puede deshacer.`)) {
        // Remover de la lista
        state.cuentas_contables = state.cuentas_contables.filter(c => c.code !== code);

        const active = getActiveBeneficiary();
        if (active) {
            active.cuentas_contables = state.cuentas_contables;
        }

        // Guardar cambios
        guardarDatos();
        renderSelectoresCuentas();
        renderTablaCatalogoCuentas();
        
        mostrarNotificacion('Cuenta contable eliminada del catálogo exitosamente.', 'success');
    }
}

window.abrirModalAsientoManual = abrirModalAsientoManual;
window.cerrarModalAsientoManual = cerrarModalAsientoManual;
window.eliminarAsientoManual = eliminarAsientoManual;
window.imprimirLibroDiario = imprimirLibroDiario;
window.imprimirLibroMayor = imprimirLibroMayor;
window.filtrarLibroMayor = renderLibroMayor;
window.guardarAsientoManual = guardarAsientoManual;
window.renderLibroDiario = renderLibroDiario;
window.renderLibroMayor = renderLibroMayor;

window.vistaConsolidadaDiario = false;
window.toggleVistaConsolidadaDiario = function() {
    window.vistaConsolidadaDiario = !window.vistaConsolidadaDiario;
    const btnTexto = document.getElementById('btn-consolidado-diario-texto');
    if (btnTexto) {
        btnTexto.innerText = window.vistaConsolidadaDiario ? 'Ver Diario Detallado' : 'Ver Resumen Agrupado';
    }
    renderLibroDiario();
};

window.abrirModalCatalogoCuentas = abrirModalCatalogoCuentas;
window.cerrarModalCatalogoCuentas = cerrarModalCatalogoCuentas;
window.guardarNuevaCuenta = guardarNuevaCuenta;
window.eliminarCuentaContable = eliminarCuentaContable;
window.filtrarCatalogoCuentas = filtrarCatalogoCuentas;
window.editarCuentaContable = editarCuentaContable;

// ==========================================================================
// MÓDULO DE LIBRO DE INVENTARIO Y BALANCES (SENIAT VENEZUELA)
// ==========================================================================

function calcularKardexAFecha(articleId, fechaCorte) {
    const art = state.articulos.find(a => parseInt(a.id) === parseInt(articleId));
    if (!art) return { stock: 0, cost: 0, totalValue: 0 };
    
    let stock = parseFloat(art.initial_stock) || 0;
    let avg_cost = parseFloat(art.initial_cost) || 0;
    let total_value = stock * avg_cost;
    
    const movs = (state.movimientos || []).filter(m => 
        parseInt(m.article_id) === parseInt(articleId) && 
        (!fechaCorte || m.date <= fechaCorte)
    );
    const movsSorted = [...movs].sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
    
    for (const m of movsSorted) {
        const qty = parseFloat(m.qty) || 0;
        const unit_cost = parseFloat(m.unit_cost) || 0;
        
        if (m.type === 'Entrada' || m.type === 'Ajuste+') {
            stock += qty;
            total_value += qty * unit_cost;
            if (stock > 0) {
                avg_cost = total_value / stock;
            } else {
                avg_cost = 0;
            }
        } else if (m.type === 'Salida' || m.type === 'Ajuste-') {
            const cost_out = avg_cost;
            stock -= qty;
            total_value -= qty * cost_out;
            if (stock <= 0) {
                stock = 0;
                total_value = 0;
                avg_cost = 0;
            }
        }
    }
    
    return {
        stock: stock,
        cost: avg_cost,
        totalValue: total_value
    };
}

function generarDetalleDeInventario(fechaCorte) {
    if (!fechaCorte) {
        fechaCorte = new Date().toISOString().substring(0, 10);
    }
    const yearCorte = new Date(fechaCorte).getFullYear();
    
    // 1. Calcular inventario físico a la fecha
    const inventario_detalle = (state.articulos || []).map(art => {
        const k = calcularKardexAFecha(art.id, fechaCorte);
        return {
            id: art.id,
            code: art.code,
            description: art.description,
            unit: art.unit || 'Unidad',
            stock: k.stock,
            cost: k.cost,
            totalValue: k.totalValue
        };
    }).filter(i => i.stock > 0 || i.totalValue > 0);
    
    const totalInventarioFisico = inventario_detalle.reduce((sum, i) => sum + i.totalValue, 0);

    // 2. Calcular saldos de cuentas contables reales y nominales hasta fecha de corte
    const todosAsientos = compilarTodosLosAsientos().filter(as => as.date <= fechaCorte);
    
    // Agrupar debe/haber por cuenta
    const balancesCuentas = {};
    todosAsientos.forEach(as => {
        if (!balancesCuentas[as.account]) {
            balancesCuentas[as.account] = { debe: 0, haber: 0 };
        }
        balancesCuentas[as.account].debe += parseFloat(as.debe) || 0;
        balancesCuentas[as.account].haber += parseFloat(as.haber) || 0;
    });

    // Mapear todas las cuentas contables registradas o usadas en asientos
    const codigosUsados = new Set([
        ...Object.keys(balancesCuentas),
        ...(state.cuentas_contables || []).map(c => c.code)
    ]);
    
    const cuentas = [];
    codigosUsados.forEach(code => {
        // Sanitizar: descartar códigos no válidos para evitar errores en .trim() y charAt()
        if (!code || typeof code !== 'string' || code.trim() === '' || code === 'undefined' || code === 'null') return;

        const name = obtenerNombreCuenta(code);
        const debe = balancesCuentas[code]?.debe || 0;
        const haber = balancesCuentas[code]?.haber || 0;
        
        // Determinar naturaleza: deudora si empieza por 1 o 5
        const firstDigit = code.trim().charAt(0);
        const nature = (firstDigit === '1' || firstDigit === '5') ? 'deudora' : 'acreedora';
        
        let saldo = 0;
        if (nature === 'deudora') {
            saldo = debe - haber;
        } else {
            saldo = haber - debe;
        }
        
        cuentas.push({
            code,
            name,
            debe,
            haber,
            saldo,
            nature
        });
    });

    // Forzar consistencia de la cuenta de inventarios 1.1.06 con el detalle físico
    const cInventario = cuentas.find(c => c.code === '1.1.06');
    if (cInventario) {
        cInventario.saldo = totalInventarioFisico;
    } else {
        cuentas.push({
            code: '1.1.06',
            name: 'Inventario de Mercancías',
            debe: totalInventarioFisico,
            haber: 0,
            saldo: totalInventarioFisico,
            nature: 'deudora'
        });
    }

    // 3. Separar en Balance General y Estado de Resultados
    const ingresos = [];
    const egresos = [];
    
    let utilidad_ejercicio = 0;
    let resultados_acumulados = 0;

    cuentas.forEach(c => {
        const firstDigit = c.code.trim().charAt(0);
        
        if (firstDigit === '4') {
            const movsAnio = todosAsientos.filter(as => as.account === c.code && new Date(as.date).getFullYear() === yearCorte);
            const debeAnio = movsAnio.reduce((sum, as) => sum + (as.debe || 0), 0);
            const haberAnio = movsAnio.reduce((sum, as) => sum + (as.haber || 0), 0);
            const saldoAnio = haberAnio - debeAnio;
            
            if (saldoAnio !== 0) {
                ingresos.push({ code: c.code, name: c.name, saldo: saldoAnio });
                utilidad_ejercicio += saldoAnio;
            }
            
            const movsPrevios = todosAsientos.filter(as => as.account === c.code && new Date(as.date).getFullYear() < yearCorte);
            const debePrevios = movsPrevios.reduce((sum, as) => sum + (as.debe || 0), 0);
            const haberPrevios = movsPrevios.reduce((sum, as) => sum + (as.haber || 0), 0);
            resultados_acumulados += (haberPrevios - debePrevios);
            
        } else if (firstDigit === '5') {
            const movsAnio = todosAsientos.filter(as => as.account === c.code && new Date(as.date).getFullYear() === yearCorte);
            const debeAnio = movsAnio.reduce((sum, as) => sum + (as.debe || 0), 0);
            const haberAnio = movsAnio.reduce((sum, as) => sum + (as.haber || 0), 0);
            const saldoAnio = debeAnio - haberAnio;
            
            if (saldoAnio !== 0) {
                egresos.push({ code: c.code, name: c.name, saldo: saldoAnio });
                utilidad_ejercicio -= saldoAnio;
            }
            
            const movsPrevios = todosAsientos.filter(as => as.account === c.code && new Date(as.date).getFullYear() < yearCorte);
            const debePrevios = movsPrevios.reduce((sum, as) => sum + (as.debe || 0), 0);
            const haberPrevios = movsPrevios.reduce((sum, as) => sum + (as.haber || 0), 0);
            resultados_acumulados -= (debePrevios - haberPrevios);
        }
    });

    const total_ingresos = ingresos.reduce((sum, i) => sum + i.saldo, 0);
    const total_egresos = egresos.reduce((sum, e) => sum + e.saldo, 0);
    const utilidad_neta = total_ingresos - total_egresos;

    const activos_corrientes = [];
    const activos_nocorrientes = [];
    const pasivos_corrientes = [];
    const pasivos_nocorrientes = [];
    const patrimonio = [];

    const cResAcumulados = cuentas.find(c => c.code === '3.1.02');
    let saldoResAcumulados = cResAcumulados ? cResAcumulados.saldo : 0;
    saldoResAcumulados += resultados_acumulados;

    cuentas.forEach(c => {
        const firstDigit = c.code.trim().charAt(0);
        const subGroup = c.code.trim().substring(0, 3);
        
        if (c.saldo === 0 && c.code !== '1.1.06') return;
        
        if (firstDigit === '1') {
            if (subGroup === '1.1') {
                activos_corrientes.push({ code: c.code, name: c.name, saldo: c.saldo });
            } else {
                activos_nocorrientes.push({ code: c.code, name: c.name, saldo: c.saldo });
            }
        } else if (firstDigit === '2') {
            if (subGroup === '2.1') {
                pasivos_corrientes.push({ code: c.code, name: c.name, saldo: c.saldo });
            } else {
                pasivos_nocorrientes.push({ code: c.code, name: c.name, saldo: c.saldo });
            }
        } else if (firstDigit === '3') {
            if (c.code !== '3.1.02') {
                patrimonio.push({ code: c.code, name: c.name, saldo: c.saldo });
            }
        }
    });

    if (saldoResAcumulados !== 0) {
        patrimonio.push({ code: '3.1.02', name: 'Resultados Acumulados (Años Anteriores)', saldo: saldoResAcumulados });
    }
    if (utilidad_ejercicio !== 0) {
        patrimonio.push({ code: '3.1.99', name: 'Utilidad / Pérdida del Ejercicio Actual', saldo: utilidad_ejercicio });
    }

    // Ordenar cuentas por código
    activos_corrientes.sort((a, b) => a.code.localeCompare(b.code));
    activos_nocorrientes.sort((a, b) => a.code.localeCompare(b.code));
    pasivos_corrientes.sort((a, b) => a.code.localeCompare(b.code));
    pasivos_nocorrientes.sort((a, b) => a.code.localeCompare(b.code));
    patrimonio.sort((a, b) => a.code.localeCompare(b.code));

    const total_activos = activos_corrientes.reduce((sum, a) => sum + a.saldo, 0) + activos_nocorrientes.reduce((sum, a) => sum + a.saldo, 0);
    const total_pasivos = pasivos_corrientes.reduce((sum, p) => sum + p.saldo, 0) + pasivos_nocorrientes.reduce((sum, p) => sum + p.saldo, 0);
    const total_patrimonio = patrimonio.reduce((sum, pa) => sum + pa.saldo, 0);

    return {
        fechaCorte,
        inventario_detalle,
        cuentas,
        balance_general: {
            activos_corrientes,
            activos_nocorrientes,
            pasivos_corrientes,
            pasivos_nocorrientes,
            patrimonio,
            total_activos,
            total_pasivos,
            total_patrimonio
        },
        estado_resultados: {
            ingresos,
            egresos,
            total_ingresos,
            total_egresos,
            utilidad_neta
        }
    };
}

function abrirModalGenerarBalance() {
    const modal = document.getElementById('modal-generar-balance');
    if (modal) {
        modal.classList.add('active');
        const dateInput = document.getElementById('balance-fecha');
        if (dateInput) {
            dateInput.value = new Date().toISOString().substring(0, 10);
        }
    }
}

function cerrarModalGenerarBalance() {
    const modal = document.getElementById('modal-generar-balance');
    if (modal) {
        modal.classList.remove('active');
        document.getElementById('form-generar-balance')?.reset();
    }
}

function guardarNuevoBloque(event) {
    event.preventDefault();
    const tipo = document.getElementById('balance-tipo')?.value || 'Inventario General';
    const fecha = document.getElementById('balance-fecha')?.value || '';
    const notas = document.getElementById('balance-notas-input')?.value || '';
    
    if (!fecha) {
        mostrarNotificacion('Debe seleccionar una fecha de asentamiento.', 'danger');
        return;
    }
    
    const dataReport = generarDetalleDeInventario(fecha);
    
    const nuevoBloque = {
        id: Date.now(),
        type: tipo,
        date: fecha,
        notes: notas || '',
        data: dataReport
    };
    
    const active = getActiveBeneficiary();
    if (active) {
        if (!active.balances_guardados) active.balances_guardados = [];
        active.balances_guardados.push(nuevoBloque);
        state.balances_guardados = active.balances_guardados;
    }
    
    guardarDatos();
    cerrarModalGenerarBalance();
    
    // Recargar el listado e ir a ver el nuevo bloque directamente
    cargarHistoricoBalancesSelect();
    verBloque(nuevoBloque.id);
    
    mostrarNotificacion(`Bloque de ${tipo} generado y asentado con éxito.`, 'success');
}

function cargarHistoricoBalancesSelect() {
    const select = document.getElementById('select-balance-historico');
    const tableBody = document.getElementById('balance-historial-tabla-body');
    const vacioAviso = document.getElementById('balance-vacio-aviso');
    const tablaContainer = document.getElementById('balance-historial-tabla-container');
    
    const active = getActiveBeneficiary();
    const bloques = active?.balances_guardados || [];
    
    if (bloques.length === 0) {
        if (select) select.innerHTML = '<option value="">-- No hay bloques generados --</option>';
        if (tableBody) tableBody.innerHTML = '';
        if (vacioAviso) vacioAviso.style.display = 'block';
        if (tablaContainer) tablaContainer.style.display = 'none';
        
        // Si no hay bloques, forzar vista historial
        volverAlHistorialBalances();
        return;
    }
    
    const sorted = [...bloques].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
    
    // Poblar el select del visor
    if (select) {
        let selectHtml = '';
        sorted.forEach(b => {
            selectHtml += `<option value="${b.id}">${b.type} (${formatearFechaISOaUI(b.date)})</option>`;
        });
        select.innerHTML = selectHtml;
    }
    
    // Poblar la tabla de historial
    if (tableBody) {
        let tableHtml = '';
        sorted.forEach(b => {
            const notasTruncated = b.notes ? (b.notes.length > 60 ? b.notes.substring(0, 57) + '...' : b.notes) : '<span class="text-muted" style="font-style:italic;">Sin observaciones</span>';
            tableHtml += `
                <tr>
                    <td><strong>${b.type}</strong></td>
                    <td>${formatearFechaISOaUI(b.date)}</td>
                    <td>${notasTruncated}</td>
                    <td class="text-center">
                        <div class="flex gap-8 justify-center">
                            <button onclick="verBloque(${b.id})" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;" title="Cargar y Ver Reporte">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                Ver Bloque
                            </button>
                            <button onclick="eliminarBloqueEspecifico(${b.id})" class="btn btn-danger" style="padding: 4px 8px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;" title="Eliminar Bloque">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                Eliminar
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = tableHtml;
    }
    
    if (vacioAviso) vacioAviso.style.display = 'none';
    if (tablaContainer) tablaContainer.style.display = 'block';
}

function verBloque(id) {
    const select = document.getElementById('select-balance-historico');
    if (select) {
        select.value = id;
    }
    
    // Cambiar la vista PRIMERO (antes de cargar datos), para que sea visible aunque el render falle
    const histContainer = document.getElementById('balance-historial-container');
    const visorContainer = document.getElementById('balance-visor-container');
    const bloqueVisor = document.getElementById('balance-bloque-visor');
    const tabsContainer = document.getElementById('balance-tabs-container');
    
    if (histContainer) histContainer.style.display = 'none';
    if (visorContainer) visorContainer.style.display = 'block';
    if (bloqueVisor) bloqueVisor.style.display = 'block';
    if (tabsContainer) tabsContainer.style.display = 'flex';
    
    // Ahora cargar y renderizar el contenido del bloque
    try {
        cargarBloqueSeleccionado();
    } catch (err) {
        console.error('Error al renderizar el bloque seleccionado:', err);
    }
}

function volverAlHistorialBalances() {
    cargarHistoricoBalancesSelect();
    document.getElementById('balance-historial-container').style.display = 'block';
    document.getElementById('balance-visor-container').style.display = 'none';
}

let activeBalanceTab = 'inventario';
function switchBalancesTab(tabName) {
    activeBalanceTab = tabName;
    
    document.querySelectorAll('#balance-tabs-container button').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    });
    
    const activeBtn = document.getElementById(`btn-tab-bal-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-secondary');
        activeBtn.classList.add('btn-primary');
    }
    
    document.querySelectorAll('.balance-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    const targetContent = document.getElementById(`tab-content-bal-${tabName}`);
    if (targetContent) {
        targetContent.style.display = 'block';
    }
}

function cargarBloqueSeleccionado() {
    const select = document.getElementById('select-balance-historico');
    if (!select) return;
    
    const val = select.value;
    if (!val) {
        cargarHistoricoBalancesSelect();
        return;
    }
    
    const active = getActiveBeneficiary();
    const bloque = (active?.balances_guardados || []).find(b => parseInt(b.id) === parseInt(val));
    if (!bloque) return;
    
    // Auto-regenerar los datos si el bloque fue guardado sin datos válidos (versión anterior)
    const bgOk = bloque.data && bloque.data.balance_general && 
        Array.isArray(bloque.data.balance_general.activos_corrientes);
    const erOk = bloque.data && bloque.data.estado_resultados && 
        Array.isArray(bloque.data.estado_resultados.ingresos);
    
    if (!bgOk || !erOk) {
        if (bloque.date) {
            console.log(`Bloque ${bloque.id} sin datos válidos. Regenerando desde fecha ${bloque.date}...`);
            bloque.data = generarDetalleDeInventario(bloque.date);
            // Persistir la regeneración automáticamente
            guardarDatos();
        }
    }
    
    const lblRif = document.getElementById('lbl-empresa-rif');
    const lblNombre = document.getElementById('lbl-empresa-nombre');
    const lblTitulo = document.getElementById('lbl-balance-titulo');
    const lblFecha = document.getElementById('lbl-balance-fecha-titulo');
    const lblFirma = document.getElementById('lbl-firma-propietario-rif');
    
    if (lblRif) lblRif.innerText = `R.I.F.: ${active.tax_id}`;
    if (lblNombre) lblNombre.innerText = active.name;
    if (lblTitulo) lblTitulo.innerText = `LIBRO DE INVENTARIO Y BALANCES`;
    if (lblFecha) lblFecha.innerText = `${bloque.type.toUpperCase()} AL ${formatearFechaISOaUI(bloque.date)}`;
    
    const notesArea = document.getElementById('txt-balance-notes');
    if (notesArea) {
        notesArea.value = bloque.notes || '';
    }
    
    // Actualizar las notas en las tres pestañas integradas
    const noteText = bloque.notes || '';
    const noteIds = ['lbl-note-inventario', 'lbl-note-general', 'lbl-note-resultados'];
    const containerIds = ['note-container-inventario', 'note-container-general', 'note-container-resultados'];
    
    noteIds.forEach((id, index) => {
        const el = document.getElementById(id);
        const container = document.getElementById(containerIds[index]);
        if (el && container) {
            el.innerText = noteText;
            if (noteText.trim() === '') {
                container.style.display = 'none';
            } else {
                container.style.display = 'block';
            }
        }
    });

    const firmaEl = document.getElementById('lbl-firma-propietario-rif');
    if (firmaEl) firmaEl.innerText = `C.I. / R.I.F.: ${active.tax_id}`;
    
    renderTablasBloque(bloque.data);
    switchBalancesTab(activeBalanceTab);
}

function guardarNotasAlVuelo() {
    const select = document.getElementById('select-balance-historico');
    if (!select) return;
    
    const val = select.value;
    if (!val) return;
    
    const active = getActiveBeneficiary();
    const bloque = (active?.balances_guardados || []).find(b => parseInt(b.id) === parseInt(val));
    if (!bloque) return;
    
    const text = document.getElementById('txt-balance-notes').value || '';
    bloque.notes = text;
    if (bloque.data) {
        bloque.data.notes = text;
    }
    
    // Actualizar las notas en las tres pestañas integradas
    const noteIds = ['lbl-note-inventario', 'lbl-note-general', 'lbl-note-resultados'];
    const containerIds = ['note-container-inventario', 'note-container-general', 'note-container-resultados'];
    
    noteIds.forEach((id, index) => {
        const el = document.getElementById(id);
        const container = document.getElementById(containerIds[index]);
        if (el && container) {
            el.innerText = text;
            if (text.trim() === '') {
                container.style.display = 'none';
            } else {
                container.style.display = 'block';
            }
        }
    });
}

function guardarNotasManualmente() {
    guardarNotasAlVuelo();
    if (guardarDatosTimer) clearTimeout(guardarDatosTimer);
    guardarDatos().then(() => {
        mostrarNotificacion('Notas del bloque guardadas con éxito.', 'success');
    });
}

let guardarDatosTimer = null;
function guardarDatosDiferido() {
    if (guardarDatosTimer) clearTimeout(guardarDatosTimer);
    guardarDatosTimer = setTimeout(() => {
        guardarDatos();
    }, 1000);
}

function eliminarBloqueSeleccionado() {
    const select = document.getElementById('select-balance-historico');
    if (!select) return;
    
    const val = select.value;
    if (!val) return;
    
    eliminarBloqueInventario(val);
}

function eliminarBloqueInventario(bloqueId) {
    const active = getActiveBeneficiary();
    if (active) {
        if (confirm('¿Estás seguro de que deseas eliminar este bloque guardado? Esta acción es irreversible.')) {
            active.balances_guardados = (active.balances_guardados || []).filter(b => parseInt(b.id) !== parseInt(bloqueId));
            state.balances_guardados = active.balances_guardados;
            guardarDatos();
            cargarHistoricoBalancesSelect();
            volverAlHistorialBalances();
            mostrarNotificacion('Bloque contable eliminado con éxito.', 'success');
        }
    }
}

function eliminarBloqueEspecifico(bloqueId) {
    eliminarBloqueInventario(bloqueId);
}

function renderTablasBloque(data) {
    if (!data) return;
    
    // Guard: si el bloque no tiene la estructura esperada, salir sin crashear
    if (!data.balance_general || !Array.isArray(data.balance_general.activos_corrientes) ||
        !data.estado_resultados || !Array.isArray(data.estado_resultados.ingresos)) {
        console.warn('renderTablasBloque: datos de bloque inválidos, omitiendo renderizado.');
        return;
    }
    
    // --- 1. Tabla de Cuerpo de Inventario (Detalle Analítico de 3 Columnas) ---
    const tbodyInv = document.getElementById('tabla-cuerpo-inventario-3col-body');
    if (tbodyInv) {
        
        let htmlInv = '';
        
        const totalActivos = data.balance_general.total_activos || 0;
        const totalPasivos = data.balance_general.total_pasivos || 0;
        const totalPatrimonio = data.balance_general.total_patrimonio || 0;
        
        // Activos Corrientes
        htmlInv += `<tr style="font-weight: bold; background: #cbd5e1; color:#000;"><td colspan="8" style="padding: 6px; border: 1px solid #000;">1. ACTIVO</td></tr>`;
        htmlInv += `<tr style="font-weight: bold; background: #e2e8f0; color:#000;"><td colspan="8" style="padding: 6px; border: 1px solid #000; padding-left: 15px;">1.1 ACTIVO CORRIENTE</td></tr>`;
        
        let subtotalActivoCorriente = 0;
        data.balance_general.activos_corrientes.forEach(c => {
            subtotalActivoCorriente += c.saldo;
            if (c.code === '1.1.06') {
                htmlInv += `
                    <tr style="font-weight: bold; background: #f8fafc; color:#000;">
                        <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                        <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                        <td style="border: 1px solid #000;"></td>
                    </tr>
                `;
                if (data.inventario_detalle && data.inventario_detalle.length > 0) {
                    data.inventario_detalle.forEach(prod => {
                        htmlInv += `
                            <tr style="color: #374151;">
                                <td style="padding: 4px 6px; border: 1px solid #000; padding-left: 20px;">${c.code}.${prod.code}</td>
                                <td style="padding: 4px 6px; border: 1px solid #000; padding-left: 20px;">Stock: ${prod.description}</td>
                                <td style="text-align: center; padding: 4px 6px; border: 1px solid #000;">${prod.stock}</td>
                                <td style="text-align: center; padding: 4px 6px; border: 1px solid #000;">${prod.unit}</td>
                                <td style="text-align: right; padding: 4px 6px; border: 1px solid #000;">${formatearMoneda(prod.cost)}</td>
                                <td style="text-align: right; padding: 4px 6px; border: 1px solid #000;">${formatearMoneda(prod.totalValue)}</td>
                                <td style="border: 1px solid #000;"></td>
                                <td style="border: 1px solid #000;"></td>
                            </tr>
                        `;
                    });
                } else {
                    htmlInv += `
                        <tr style="color: #6b7280; font-style: italic;">
                            <td colspan="8" style="padding: 4px 6px; border: 1px solid #000; text-align: center;">Sin existencias en stock físico.</td>
                        </tr>
                    `;
                }
            } else {
                htmlInv += `
                    <tr>
                        <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                        <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                        <td style="border: 1px solid #000;"></td>
                    </tr>
                `;
            }
        });
        
        htmlInv += `
            <tr style="font-weight: bold; background: #e2e8f0; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 6px; border: 1px solid #000; padding-left: 20px;">TOTAL ACTIVO CORRIENTE</td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 6px; border: 1px solid #000; border-bottom: 2px double #000;">${formatearMoneda(subtotalActivoCorriente)}</td>
            </tr>
        `;
        
        let subtotalActivoNoCorriente = 0;
        if (data.balance_general.activos_nocorrientes.length > 0) {
            htmlInv += `<tr style="font-weight: bold; background: #e2e8f0; color:#000;"><td colspan="8" style="padding: 6px; border: 1px solid #000; padding-left: 15px;">1.2 ACTIVO NO CORRIENTE</td></tr>`;
            data.balance_general.activos_nocorrientes.forEach(c => {
                subtotalActivoNoCorriente += c.saldo;
                htmlInv += `
                    <tr>
                        <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                        <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                        <td style="border: 1px solid #000;"></td>
                    </tr>
                `;
            });
            htmlInv += `
                <tr style="font-weight: bold; background: #e2e8f0; color:#000;">
                    <td style="border: 1px solid #000;"></td>
                    <td style="padding: 6px; border: 1px solid #000; padding-left: 20px;">TOTAL ACTIVO NO CORRIENTE</td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000; border-bottom: 2px double #000;">${formatearMoneda(subtotalActivoNoCorriente)}</td>
                </tr>
            `;
        }
        
        htmlInv += `
            <tr style="font-weight: bold; background: #cbd5e1; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 8px; border: 1px solid #000; text-transform: uppercase;">TOTAL GENERAL DEL ACTIVO</td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 8px; border: 1px solid #000; border-bottom: 4px double #000; font-size: 0.85rem;">${formatearMoneda(totalActivos)}</td>
            </tr>
        `;

        // Pasivos Corrientes
        htmlInv += `<tr style="font-weight: bold; background: #cbd5e1; color:#000;"><td colspan="8" style="padding: 6px; border: 1px solid #000;">2. PASIVO</td></tr>`;
        htmlInv += `<tr style="font-weight: bold; background: #e2e8f0; color:#000;"><td colspan="8" style="padding: 6px; border: 1px solid #000; padding-left: 15px;">2.1 PASIVO CORRIENTE</td></tr>`;
        
        let subtotalPasivoCorriente = 0;
        data.balance_general.pasivos_corrientes.forEach(c => {
            subtotalPasivoCorriente += c.saldo;
            htmlInv += `
                <tr>
                    <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                    <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                    <td style="border: 1px solid #000;"></td>
                </tr>
            `;
        });
        htmlInv += `
            <tr style="font-weight: bold; background: #e2e8f0; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 6px; border: 1px solid #000; padding-left: 20px;">TOTAL PASIVO CORRIENTE</td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 6px; border: 1px solid #000; border-bottom: 2px double #000;">${formatearMoneda(subtotalPasivoCorriente)}</td>
            </tr>
        `;
        
        let subtotalPasivoNoCorriente = 0;
        if (data.balance_general.pasivos_nocorrientes.length > 0) {
            htmlInv += `<tr style="font-weight: bold; background: #e2e8f0; color:#000;"><td colspan="8" style="padding: 6px; border: 1px solid #000; padding-left: 15px;">2.2 PASIVO NO CORRIENTE</td></tr>`;
            data.balance_general.pasivos_nocorrientes.forEach(c => {
                subtotalPasivoNoCorriente += c.saldo;
                htmlInv += `
                    <tr>
                        <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                        <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="border: 1px solid #000;"></td>
                        <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                        <td style="border: 1px solid #000;"></td>
                    </tr>
                `;
            });
            htmlInv += `
                <tr style="font-weight: bold; background: #e2e8f0; color:#000;">
                    <td style="border: 1px solid #000;"></td>
                    <td style="padding: 6px; border: 1px solid #000; padding-left: 20px;">TOTAL PASIVO NO CORRIENTE</td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000; border-bottom: 2px double #000;">${formatearMoneda(subtotalPasivoNoCorriente)}</td>
                </tr>
            `;
        }
        
        htmlInv += `
            <tr style="font-weight: bold; background: #cbd5e1; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 8px; border: 1px solid #000; text-transform: uppercase;">TOTAL GENERAL DEL PASIVO</td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 8px; border: 1px solid #000; border-bottom: 4px double #000; font-size: 0.85rem;">${formatearMoneda(totalPasivos)}</td>
            </tr>
        `;

        // Patrimonio
        htmlInv += `<tr style="font-weight: bold; background: #cbd5e1; color:#000;"><td colspan="8" style="padding: 6px; border: 1px solid #000;">3. PATRIMONIO NETO</td></tr>`;
        data.balance_general.patrimonio.forEach(c => {
            htmlInv += `
                <tr>
                    <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                    <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="border: 1px solid #000;"></td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                    <td style="border: 1px solid #000;"></td>
                </tr>
            `;
        });
        
        htmlInv += `
            <tr style="font-weight: bold; background: #cbd5e1; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 8px; border: 1px solid #000; text-transform: uppercase;">TOTAL PATRIMONIO NETO</td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 8px; border: 1px solid #000; border-bottom: 4px double #000; font-size: 0.85rem;">${formatearMoneda(totalPatrimonio)}</td>
            </tr>
        `;
        
        htmlInv += `
            <tr style="font-weight: bold; background: #cbd5e1; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 8px; border: 1px solid #000; text-transform: uppercase;">TOTAL GENERAL DE PASIVO Y PATRIMONIO</td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 8px; border: 1px solid #000; border-bottom: 5px double #000; font-size: 0.88rem;">${formatearMoneda(totalPasivos + totalPatrimonio)}</td>
            </tr>
        `;
        
        tbodyInv.innerHTML = htmlInv;
    }

    // --- 2. Tabla del Balance General ---
    const tbodyBG = document.getElementById('tabla-cuerpo-general-3col-body');
    if (tbodyBG) {
        let htmlBG = '';
        const totalActivos = data.balance_general.total_activos;
        const totalPasivos = data.balance_general.total_pasivos;
        const totalPatrimonio = data.balance_general.total_patrimonio;
        
        htmlBG += `<tr style="font-weight: bold; background: #cbd5e1; color:#000;"><td colspan="4" style="padding: 6px; border: 1px solid #000;">1. ACTIVOS</td></tr>`;
        htmlBG += `<tr style="font-weight: bold; background: #e2e8f0; color:#000;"><td colspan="4" style="padding: 6px; border: 1px solid #000; padding-left: 15px;">1.1 ACTIVO CORRIENTE</td></tr>`;
        let subtotalActivoCorriente = 0;
        data.balance_general.activos_corrientes.forEach(c => {
            subtotalActivoCorriente += c.saldo;
            htmlBG += `
                <tr>
                    <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                    <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                    <td style="border: 1px solid #000;"></td>
                </tr>
            `;
        });
        htmlBG += `
            <tr style="font-weight: bold; background: #e2e8f0; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 6px; border: 1px solid #000; padding-left: 20px;">TOTAL ACTIVO CORRIENTE</td>
                <td style="text-align: right; padding: 6px; border: 1px solid #000; border-bottom: 2px double #000;">${formatearMoneda(subtotalActivoCorriente)}</td>
                <td style="border: 1px solid #000;"></td>
            </tr>
        `;
        
        let subtotalActivoNoCorriente = 0;
        if (data.balance_general.activos_nocorrientes.length > 0) {
            htmlBG += `<tr style="font-weight: bold; background: #e2e8f0; color:#000;"><td colspan="4" style="padding: 6px; border: 1px solid #000; padding-left: 15px;">1.2 ACTIVO NO CORRIENTE</td></tr>`;
            data.balance_general.activos_nocorrientes.forEach(c => {
                subtotalActivoNoCorriente += c.saldo;
                htmlBG += `
                    <tr>
                        <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                        <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                        <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                        <td style="border: 1px solid #000;"></td>
                    </tr>
                `;
            });
            htmlBG += `
                <tr style="font-weight: bold; background: #e2e8f0; color:#000;">
                    <td style="border: 1px solid #000;"></td>
                    <td style="padding: 6px; border: 1px solid #000; padding-left: 20px;">TOTAL ACTIVO NO CORRIENTE</td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000; border-bottom: 2px double #000;">${formatearMoneda(subtotalActivoNoCorriente)}</td>
                    <td style="border: 1px solid #000;"></td>
                </tr>
            `;
        }
        
        htmlBG += `
            <tr style="font-weight: bold; background: #cbd5e1; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 8px; border: 1px solid #000; text-transform: uppercase;">TOTAL GENERAL DEL ACTIVO</td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 8px; border: 1px solid #000; border-bottom: 4px double #000;">${formatearMoneda(totalActivos)}</td>
            </tr>
        `;

        // Pasivos
        htmlBG += `<tr style="font-weight: bold; background: #cbd5e1; color:#000;"><td colspan="4" style="padding: 6px; border: 1px solid #000;">2. PASIVOS</td></tr>`;
        htmlBG += `<tr style="font-weight: bold; background: #e2e8f0; color:#000;"><td colspan="4" style="padding: 6px; border: 1px solid #000; padding-left: 15px;">2.1 PASIVO CORRIENTE</td></tr>`;
        let subtotalPasivoCorriente = 0;
        data.balance_general.pasivos_corrientes.forEach(c => {
            subtotalPasivoCorriente += c.saldo;
            htmlBG += `
                <tr>
                    <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                    <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                    <td style="border: 1px solid #000;"></td>
                </tr>
            `;
        });
        htmlBG += `
            <tr style="font-weight: bold; background: #e2e8f0; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 6px; border: 1px solid #000; padding-left: 20px;">TOTAL PASIVO CORRIENTE</td>
                <td style="text-align: right; padding: 6px; border: 1px solid #000; border-bottom: 2px double #000;">${formatearMoneda(subtotalPasivoCorriente)}</td>
                <td style="border: 1px solid #000;"></td>
            </tr>
        `;
        
        htmlBG += `
            <tr style="font-weight: bold; background: #cbd5e1; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 8px; border: 1px solid #000; text-transform: uppercase;">TOTAL GENERAL DEL PASIVO</td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 8px; border: 1px solid #000; border-bottom: 4px double #000;">${formatearMoneda(totalPasivos)}</td>
            </tr>
        `;

        // Patrimonio
        htmlBG += `<tr style="font-weight: bold; background: #cbd5e1; color:#000;"><td colspan="4" style="padding: 6px; border: 1px solid #000;">3. PATRIMONIO NETO</td></tr>`;
        data.balance_general.patrimonio.forEach(c => {
            htmlBG += `
                <tr>
                    <td style="padding: 6px; border: 1px solid #000;">${c.code}</td>
                    <td style="padding: 6px; border: 1px solid #000;">${c.name}</td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(c.saldo)}</td>
                    <td style="border: 1px solid #000;"></td>
                </tr>
            `;
        });
        
        htmlBG += `
            <tr style="font-weight: bold; background: #cbd5e1; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 8px; border: 1px solid #000; text-transform: uppercase;">TOTAL PATRIMONIO NETO</td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 8px; border: 1px solid #000; border-bottom: 4px double #000;">${formatearMoneda(totalPatrimonio)}</td>
            </tr>
        `;
        
        htmlBG += `
            <tr style="font-weight: bold; background: #cbd5e1; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 8px; border: 1px solid #000; text-transform: uppercase; color: #000;">TOTAL GENERAL DE PASIVO Y PATRIMONIO</td>
                <td style="border: 1px solid #000;"></td>
                <td style="text-align: right; padding: 8px; border: 1px solid #000; border-bottom: 5px double #000; font-size: 0.85rem; color: #000;">${formatearMoneda(totalPasivos + totalPatrimonio)}</td>
            </tr>
        `;
        
        tbodyBG.innerHTML = htmlBG;
    }

    // --- 3. Tabla del Estado de Resultados ---
    const tbodyER = document.getElementById('tabla-cuerpo-resultados-3col-body');
    if (tbodyER) {
        let htmlER = '';
        
        htmlER += `<tr style="font-weight: bold; background: #cbd5e1; color:#000;"><td colspan="4" style="padding: 6px; border: 1px solid #000;">INGRESOS OPERACIONALES</td></tr>`;
        data.estado_resultados.ingresos.forEach(i => {
            htmlER += `
                <tr>
                    <td style="padding: 6px; border: 1px solid #000;">${i.code}</td>
                    <td style="padding: 6px; border: 1px solid #000;">${i.name}</td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(i.saldo)}</td>
                    <td style="border: 1px solid #000;"></td>
                </tr>
            `;
        });
        htmlER += `
            <tr style="font-weight: bold; background: #f8fafc; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 6px; border: 1px solid #000; padding-left: 20px;">TOTAL INGRESOS</td>
                <td style="text-align: right; padding: 6px; border: 1px solid #000; border-bottom: 2px double #000;">${formatearMoneda(data.estado_resultados.total_ingresos)}</td>
                <td style="border: 1px solid #000;"></td>
            </tr>
        `;

        htmlER += `<tr style="font-weight: bold; background: #cbd5e1; color:#000;"><td colspan="4" style="padding: 6px; border: 1px solid #000;">EGRESOS, COSTOS Y GASTOS</td></tr>`;
        data.estado_resultados.egresos.forEach(e => {
            htmlER += `
                <tr>
                    <td style="padding: 6px; border: 1px solid #000;">${e.code}</td>
                    <td style="padding: 6px; border: 1px solid #000;">${e.name}</td>
                    <td style="text-align: right; padding: 6px; border: 1px solid #000;">${formatearMoneda(e.saldo)}</td>
                    <td style="border: 1px solid #000;"></td>
                </tr>
            `;
        });
        htmlER += `
            <tr style="font-weight: bold; background: #f8fafc; color:#000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 6px; border: 1px solid #000; padding-left: 20px;">TOTAL EGRESOS Y GASTOS</td>
                <td style="text-align: right; padding: 6px; border: 1px solid #000; border-bottom: 2px double #000;">${formatearMoneda(data.estado_resultados.total_egresos)}</td>
                <td style="border: 1px solid #000;"></td>
            </tr>
        `;

        const esGanancia = data.estado_resultados.utilidad_neta >= 0;
        htmlER += `
            <tr style="font-weight: bold; background: ${esGanancia ? '#d1fae5' : '#fee2e2'}; color: #000;">
                <td style="border: 1px solid #000;"></td>
                <td style="padding: 8px; border: 1px solid #000; text-transform: uppercase;">UTILIDAD O PÉRDIDA NETA DEL EJERCICIO</td>
                <td style="text-align: right; padding: 8px; border: 1px solid #000; border-bottom: 5px double #000;">${formatearMoneda(data.estado_resultados.utilidad_neta)}</td>
                <td style="border: 1px solid #000;"></td>
            </tr>
        `;
        
        tbodyER.innerHTML = htmlER;
    }
}

function imprimirLibroInventarioYBalances() {
    const select = document.getElementById('select-balance-historico');
    if (!select) return;
    
    const val = select.value;
    if (!val) return;
    
    const active = getActiveBeneficiary();
    const bloque = (active?.balances_guardados || []).find(b => parseInt(b.id) === parseInt(val));
    if (!bloque) return;
    
    const filename = `Libro_Inventario_y_Balances_${active.name.replace(/\s+/g, '_')}_${bloque.date}`;
    
    // Asegurar que el visor esté visible (por si se llama desde otro contexto)
    const visorContainer = document.getElementById('balance-visor-container');
    const bloqueVisor = document.getElementById('balance-bloque-visor');
    if (visorContainer) visorContainer.style.display = 'block';
    if (bloqueVisor) bloqueVisor.style.display = 'block';

    // Activar modo de impresión
    document.body.setAttribute('data-print-mode', 'balances');
    const originalTitle = document.title;
    document.title = filename;

    const doRestore = () => {
        document.body.removeAttribute('data-print-mode');
        document.title = originalTitle;
    };

    if (window.electronAPI && typeof window.electronAPI.printToPDF === 'function') {
        mostrarNotificacion('Generando PDF del Libro de Inventario y Balances...', 'info');
        // Esperar 350ms para que Chromium aplique los estilos CSS de impresión
        setTimeout(() => {
            window.electronAPI.printToPDF(filename, {
                landscape: false,
                pageSize: 'Letter',
                printBackground: true
            }).then(res => {
                if (res && res.success) {
                    mostrarNotificacion('¡PDF del Libro de Inventario y Balances generado con éxito!', 'success');
                }
            }).catch(err => {
                console.error('Error al generar PDF de balances:', err);
                mostrarNotificacion('Error al generar el PDF: ' + err.message, 'danger');
            }).finally(() => {
                doRestore();
            });
        }, 350);
    } else {
        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.body.removeAttribute('data-print-mode');
                document.title = originalTitle;
            }, 500);
        }, 250);
    }
}

// Registrar funciones en window para que puedan llamarse desde los eventos onclick de index.html
window.abrirModalGenerarBalance = abrirModalGenerarBalance;
window.cerrarModalGenerarBalance = cerrarModalGenerarBalance;
window.guardarNuevoBloque = guardarNuevoBloque;
window.cargarHistoricoBalancesSelect = cargarHistoricoBalancesSelect;
window.cargarBloqueSeleccionado = cargarBloqueSeleccionado;
window.eliminarBloqueSeleccionado = eliminarBloqueSeleccionado;
window.switchBalancesTab = switchBalancesTab;
window.imprimirLibroInventarioYBalances = imprimirLibroInventarioYBalances;
window.guardarNotasAlVuelo = guardarNotasAlVuelo;
window.verBloque = verBloque;
window.volverAlHistorialBalances = volverAlHistorialBalances;
window.eliminarBloqueEspecifico = eliminarBloqueEspecifico;
window.guardarNotasManualmente = guardarNotasManualmente;

// Módulo de Reporte Consolidado Art. 72 IVA
window.vistaReporteArt72 = false;
window.toggleFormatoReporteIVA = function() {
    window.vistaReporteArt72 = !window.vistaReporteArt72;
    const btnTexto = document.getElementById('btn-toggle-formato-reporte-texto');
    if (btnTexto) {
        btnTexto.innerText = window.vistaReporteArt72 ? 'Ver Forma 30 Oficial' : 'Ver Formato Art. 72';
    }
    
    const cardF30 = document.getElementById('printable-report-card');
    const cardArt72 = document.getElementById('printable-report-card-art72');
    
    if (window.vistaReporteArt72) {
        if (cardF30) cardF30.classList.add('hidden-card');
        if (cardArt72) cardArt72.classList.remove('hidden-card');
    } else {
        if (cardF30) cardF30.classList.remove('hidden-card');
        if (cardArt72) cardArt72.classList.add('hidden-card');
    }
};



