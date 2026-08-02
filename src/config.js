// =========================================================================
// CONFIG — edítalo directamente aquí para dejar la conexión fija en producción.
// =========================================================================
export const INITIAL_CONFIG = {
  CLIENT_ID: "8bf7069f-55e7-47ae-bea2-f1f0aa38657d",   // ID de aplicación (cliente) de Azure AD — registro "Lexara–Procesos"
  TENANT_ID: "a89ceaa6-c4df-4b18-93a7-65dfa57a5541",   // ID de directorio (inquilino) — "md abogados sas"
  SP_HOST: "mydabogados.sharepoint.com",
  SP_SITE_PATH: "/sites/NuevosProcesosMD",
};

// =========================================================================
// REGISTRO DE LISTAS DE SHAREPOINT
// Cada lista de SharePoint que la app usa se define una sola vez aquí:
// su nombre real, sus campos semánticos (con pistas para adivinar el
// mapeo) y el mapeo fijo ya confirmado columna-por-columna. Para agregar
// una lista nueva (Facturación, Desistimientos, ...) basta con sumar una
// entrada aquí y su vista de tabla — no hace falta tocar la lógica de
// conexión ni de mapeo, que es genérica para todas.
// =========================================================================
export const SHAREPOINT_LISTS_CONFIG = [
  {
    key: "procesos",
    listName: "Procesos Judiciales",
    label: "Procesos judiciales",
    semanticFields: [
      {key:"Radicado", label:"Numero_Corto", hint:["radicado"], required:true},
      {key:"Cliente", label:"Cliente", hint:["cliente","demandante"], required:true},
      {key:"Entidad", label:"Entidad", hint:["entidad"]},
      {key:"Apoderado", label:"Apoderado", hint:["apoderad"]},
      {key:"Despacho", label:"Despacho / juzgado", hint:["despacho","juzgado","corte"]},
      {key:"NumeroDespacho", label:"No. de despacho", hint:["numero de despacho","numero despacho","número de despacho"]},
      {key:"Instancia", label:"Instancia", hint:["instancia"]},
      {key:"TipoProceso", label:"Tipo de proceso", hint:["tipo de proceso","tipoproceso","tipo_proceso"]},
      {key:"TipoAccion", label:"Tipo de Acción", hint:["tipo de accion","tipo de acción","tipoaccion"]},
      {key:"NumeroContrato", label:"No. de contrato", hint:["contrato"]},
      {key:"EtapaProcesal", label:"Etapa procesal", hint:["etapa"]},
      {key:"Estado", label:"Estado", hint:["estado"], required:true},
      {key:"FechaAdmision", label:"Fecha de admisión", hint:["admision","admisión"]},
      {key:"FechaContestacion", label:"Fecha de contestación", hint:["contestacion","contestación"]},
      {key:"CalificacionContingencia", label:"Calificación de contingencia", hint:["calificacion","calificación","conting"]},
      {key:"EstadoVT", label:"Estado V/T", hint:["estado v/t","estado vt"]},
      {key:"Observaciones", label:"Observaciones", hint:["observ"]},
      {key:"LinkCarpeta", label:"Link a la carpeta", hint:["link carpeta","carpetas"]},
    ],
    mapping: {
      Radicado: "numero_x0020_corto",
      Cliente: "Cliente",
      Entidad: "Entidad",
      Apoderado: "Apoderada",
      Despacho: "Despacho",
      NumeroDespacho: "numero_x0020_de_x0020_despacho",
      Instancia: "Instancia",
      TipoProceso: "Tipo_x0020_de_x0020_Proceso",
      TipoAccion: "Tipo_x0020_de_x0020_Accion",
      NumeroContrato: "No_x0020_Contrato",
      EtapaProcesal: "Etapa_x0020_Procesal",
      Estado: "Estado",
      FechaAdmision: "Fecha_x0020_Admision_x0020_del_x",
      FechaContestacion: "Fecha_x0020_Contestacion_x0020_d",
      CalificacionContingencia: "Calificacion_de_la_contingencia",
      EstadoVT: "Estado_x0020_V_x002f_T",
      Observaciones: "Observaciones",
      LinkCarpeta: "Link_x0020_Carpetas",
    },
  },
  {
    key: "clientes",
    listName: "Clientes",
    label: "Clientes",
    semanticFields: [
      {key:"RazonSocial", label:"Razón social", hint:["razon social","razón social"], required:true},
      {key:"Nit", label:"NIT", hint:["nit"]},
      {key:"Ciudad", label:"Ciudad", hint:["ciudad"]},
      {key:"Direccion", label:"Dirección", hint:["direccion","dirrección","dirreccion"]},
      {key:"Telefono", label:"Teléfono", hint:["telefono","teléfono"]},
      {key:"Correo", label:"Correo", hint:["correo"]},
      {key:"Entidad", label:"Entidad", hint:["entidad"]},
    ],
    mapping: {
      RazonSocial: "RAZON_x0020_SOCIAL",
      Nit: "NIT",
      Direccion: "DIRRECCION",
      Telefono: "TELEFONO",
      Correo: "CORREO",
      Entidad: "Entidad",
    },
  },
  {
    key: "facturacion",
    listName: "base facturas",
    label: "Facturación",
    // Las líneas de detalle (Descripción/Cantidad/Valor unitario/Total) no son una
    // tabla aparte: son 6 juegos de columnas fijos en la misma lista (Descripcion1..6, etc.),
    // migrados así desde la base Access original.
    semanticFields: [
      {key:"Factura", label:"Factura", hint:["factura"], required:true},
      {key:"Dia", label:"Día", hint:["dia","día"]},
      {key:"Mes", label:"Mes", hint:["mes"]},
      {key:"Anio", label:"Año", hint:["año","ano","anio"]},
      {key:"Contrato", label:"Contrato", hint:["contrato"], required:true},
      ...Array.from({length:6}, (_,i) => i+1).flatMap(n => [
        {key:`Descripcion${n}`, label:`Descripción ${n}`, hint:[`descripcion ${n}`,`descripcion${n}`]},
        {key:`Cantidad${n}`, label:`Cantidad ${n}`, hint:[`cantidad ${n}`,`cantidad${n}`]},
        {key:`ValorUnitario${n}`, label:`Valor unitario ${n}`, hint:[`valor unitario ${n}`,`valorunitario${n}`]},
      ]),
      {key:"Observacion", label:"Observación", hint:["observacion","observación"]},
      {key:"EstadoFactura", label:"Estado de factura", hint:["estado de factura"]},
      {key:"CodigoCliente", label:"Código cliente", hint:["codigo cliente","código cliente","id cliente"], required:true},
      {key:"EtapaContrato", label:"Etapa contrato", hint:["etapa contrato","etapa"]},
      {key:"Proceso", label:"Proceso", hint:["proceso"]},
      {key:"Fecha", label:"Fecha", hint:["fecha"]},
      ...Array.from({length:6}, (_,i) => i+1).map(n => ({key:`Total${n}`, label:`Total ${n}`, hint:[`total ${n}`,`total${n}`]})),
      {key:"Subtotal", label:"Subtotales", hint:["subtotales","subtotal"]},
      {key:"Iva", label:"IVA", hint:["iva"]},
      {key:"Total", label:"Total", hint:["total"]},
      {key:"RetIva", label:"Ret IVA", hint:["ret iva","retencion iva","retención iva"]},
      {key:"ValorAPagar", label:"Valor a pagar", hint:["valor a pagar"]},
      // Fecha/TotalN/Subtotal/IVA/Total/RetIva sí son columnas reales en SharePoint.
      // Se calculan al crear una factura nueva (Fecha desde Día/Mes/Año, TotalN desde
      // CantidadN × Valor unitarioN, etc.) y ese valor calculado queda guardado. Al
      // editar una factura existente, solo se recalculan si el usuario cambia un
      // campo de origen — si no, se respeta el dato ya guardado (ver FacturaDrawer).
      // y el % de IVA, pero también se guardan como columnas reales en SharePoint.
    ],
    mapping: {
      Factura: "FACTURA",
      Dia: "DIA",
      Mes: "MES",
      Anio: "A_x00d1_O",
      Contrato: "CONTRATO",
      Descripcion1: "DESCRIPCION_x0020_1",
      Cantidad1: "CANTIDAD_x0020_1",
      ValorUnitario1: "VALOR_x0020_UNITARIO_x0020_1",
      Descripcion2: "DESCRIPCION_x0020_2",
      Cantidad2: "CANTIDAD_x0020_2",
      ValorUnitario2: "VALOR_x0020_UNITARIO_x0020_2",
      Descripcion3: "DESCRIPCION_x0020_3",
      Cantidad3: "CANTIDAD_x0020_3",
      ValorUnitario3: "VALOR_x0020_UNITARIO_x0020_3",
      Descripcion4: "DESCRIPCION_x0020_4",
      Cantidad4: "CANTIDAD_x0020_4",
      ValorUnitario4: "VALOR_x0020_UNITARIO_x0020_4",
      Descripcion5: "DESCRIPCION_x0020_5",
      Cantidad5: "CANTIDAD_x0020_5",
      ValorUnitario5: "VALOR_x0020_UNITARIO_x0020_5",
      Descripcion6: "DESCRIPCION_x0020_6",
      Cantidad6: "CANTIDAD_x0020_6",
      ValorUnitario6: "VALOR_x0020_UNITARIO_x0020_6",
      Observacion: "observacion",
      EstadoFactura: "Estado_x0020_de_x0020_factura",
      CodigoCliente: "CODIGO_x0020_CLIENTE",
      EtapaContrato: "ETAPA_x0020_CONTRATO",
      Proceso: "Proceso",
      Fecha: "FECHA",
      Total1: "TOTAL_x0020_1",
      Total2: "TOTAL_x0020_2",
      Total3: "TOTAL_x0020_3",
      Total4: "TOTAL_x0020_4",
      Total5: "TOTAL_x0020_5",
      Total6: "TOTAL_x0020_6",
      Subtotal: "SUBTOTALES",
      Iva: "IVA",
      Total: "TOTAL",
      RetIva: "RET_x0020_IVA",
      ValorAPagar: "VALOR_x0020_A_x0020_PAGAR",
    },
  },
  {
    key: "ordenesCompra",
    listName: "Órdenes de Compra",
    label: "Órdenes de compra",
    // Mismo esquema de líneas fijas (Descripcion/Cantidad/ValorUnitario x6) que
    // Facturación — es "el mismo formulario" pero contra otra lista. Diferencias:
    // el número de orden es directamente el ID (no hace falta columna propia,
    // ver ordenCompraNumero en graph.js), y el campo "Factura" no se autonumera:
    // guarda automáticamente el número de la factura de "base facturas" que
    // comparte el mismo Contrato (ver facturaForOrdenCompra en graph.js).
    semanticFields: [
      {key:"Contrato", label:"Contrato", hint:["contrato"], required:true},
      {key:"Proceso", label:"Proceso", hint:["proceso"]},
      {key:"CodigoCliente", label:"Código cliente", hint:["codigo cliente","código cliente","id cliente"]},
      {key:"Dia", label:"Día", hint:["dia","día"]},
      {key:"Mes", label:"Mes", hint:["mes"]},
      {key:"Anio", label:"Año", hint:["año","ano","anio"]},
      ...Array.from({length:6}, (_,i) => i+1).flatMap(n => [
        {key:`Descripcion${n}`, label:`Descripción ${n}`, hint:[`descripcion ${n}`,`descripcion${n}`]},
        {key:`Cantidad${n}`, label:`Cantidad ${n}`, hint:[`cantidad ${n}`,`cantidad${n}`]},
        {key:`ValorUnitario${n}`, label:`Valor unitario ${n}`, hint:[`valor unitario ${n}`,`valorunitario${n}`]},
      ]),
      {key:"Observacion", label:"Observación", hint:["observacion","observación"]},
      {key:"EtapaContrato", label:"Etapa contrato", hint:["etapa contrato","etapa"]},
      {key:"Fecha", label:"Fecha", hint:["fecha"]},
      ...Array.from({length:6}, (_,i) => i+1).map(n => ({key:`Total${n}`, label:`Total ${n}`, hint:[`total ${n}`,`total${n}`]})),
      {key:"Subtotal", label:"Subtotales", hint:["subtotales","subtotal"]},
      {key:"Iva", label:"IVA", hint:["iva"]},
      {key:"Total", label:"Total", hint:["total"]},
      {key:"RetIva", label:"Ret IVA", hint:["ret iva","retencion iva","retención iva"]},
      {key:"ValorAPagar", label:"Valor a pagar", hint:["valor a pagar"]},
      {key:"Factura", label:"Factura relacionada", hint:["factura"]},
    ],
    mapping: {},
  },
];

export const DEMO_PROCESOS = [
  {id:1, Radicado:"11001-31-03-045-2023-00218-00", Cliente:"Grupo Andino S.A.S.", Entidad:"Aseguradora Cordillera", Apoderado:"María Fernanda Ruiz", Despacho:"Juzgado 45 Civil del Circuito de Bogotá", Instancia:"Primera instancia", Estado:"En trámite", EtapaProcesal:"Período probatorio", TipoProceso:"Ejecutivo", NumeroContrato:"CT-2023-118", FechaAdmision:"2023-05-12", FechaContestacion:"2023-06-30", CalificacionContingencia:"Media", Observaciones:"Pendiente dictamen pericial contable."},
  {id:2, Radicado:"05001-31-03-012-2022-00341-00", Cliente:"Constructora del Sur Ltda.", Entidad:"Sector Privado", Apoderado:"Carlos Andrés Peña", Despacho:"Juzgado 12 Civil del Circuito de Medellín", Instancia:"Segunda instancia", Estado:"En apelación", EtapaProcesal:"Alegatos de conclusión", TipoProceso:"Ordinario", NumeroContrato:"CT-2022-076", FechaAdmision:"2022-09-03", FechaContestacion:"2022-11-15", CalificacionContingencia:"Alta", Observaciones:"Riesgo de fallo desfavorable, revisar con el cliente."},
  {id:3, Radicado:"76001-31-03-008-2024-00092-00", Cliente:"Inversiones Cali Norte", Entidad:"Sector Privado", Apoderado:"María Fernanda Ruiz", Despacho:"Juzgado 8 Civil del Circuito de Cali", Instancia:"Primera instancia", Estado:"Admitida", EtapaProcesal:"Traslado de la demanda", TipoProceso:"Verbal", NumeroContrato:"CT-2024-004", FechaAdmision:"2024-02-20", FechaContestacion:"", CalificacionContingencia:"Baja", Observaciones:""},
  {id:4, Radicado:"11001-31-03-021-2021-00567-00", Cliente:"Grupo Andino S.A.S.", Entidad:"Aseguradora Cordillera", Apoderado:"Jorge Iván Salcedo", Despacho:"Juzgado 21 Civil del Circuito de Bogotá", Instancia:"Casación", Estado:"En corte", EtapaProcesal:"Traslado en casación", TipoProceso:"Ordinario", NumeroContrato:"CT-2021-201", FechaAdmision:"2021-04-18", FechaContestacion:"2021-07-02", CalificacionContingencia:"Alta", Observaciones:"Enviado a la Corte Suprema desde marzo."},
  {id:5, Radicado:"13001-31-03-003-2023-00450-00", Cliente:"Distribuidora Caribe SAS", Entidad:"Sector Público", Apoderado:"Carlos Andrés Peña", Despacho:"Juzgado 3 Civil del Circuito de Cartagena", Instancia:"Primera instancia", Estado:"Terminado", EtapaProcesal:"Sentencia en firme", TipoProceso:"Ejecutivo", NumeroContrato:"CT-2023-055", FechaAdmision:"2023-01-30", FechaContestacion:"2023-03-11", CalificacionContingencia:"Baja", Observaciones:"Fallo a favor. Pendiente archivar expediente."},
];

export const DEMO_CLIENTES = [
  {id:1, RazonSocial:"Grupo Andino S.A.S.", Nit:"900.123.456-7", Ciudad:"Bogotá", Direccion:"Calle 100 #15-20", Telefono:"601 654 3210", Correo:"contacto@grupoandino.com", Entidad:"Privada"},
  {id:2, RazonSocial:"Constructora del Sur Ltda.", Nit:"890.234.567-1", Ciudad:"Medellín", Direccion:"Carrera 43A #30-10", Telefono:"604 512 3344", Correo:"info@constructorasur.com", Entidad:"Privada"},
  {id:3, RazonSocial:"Inversiones Cali Norte", Nit:"805.345.678-2", Ciudad:"Cali", Direccion:"Avenida 6N #28-45", Telefono:"602 660 7788", Correo:"admin@calinorte.com", Entidad:"Privada"},
  {id:4, RazonSocial:"Distribuidora Caribe SAS", Nit:"812.456.789-3", Ciudad:"Cartagena", Direccion:"Calle 35 #22-18", Telefono:"605 690 1122", Correo:"ventas@distcaribe.com", Entidad:"Privada"},
];

export const DEMO_FACTURAS = [
  {id:1, Factura:"92", CodigoCliente:"1", Contrato:"CT-2023-118", Proceso:"2023-00218", Dia:"15", Mes:"01", Anio:"2024", Fecha:"2024-01-15", EtapaContrato:"Contestacion", EstadoFactura:"Radicada", Observacion:"",
    Descripcion1:"Honorarios generados por la contestación realizada dentro del proceso 2023-00218 de Grupo Andino S.A.S. contra Aseguradora Cordillera. Por valor de 2 SMLV.", Cantidad1:"2", ValorUnitario1:"1.471.348,75", Total1:"2.942.697,50",
    Descripcion2:"", Cantidad2:"", ValorUnitario2:"",
    Descripcion3:"", Cantidad3:"", ValorUnitario3:"",
    Descripcion4:"", Cantidad4:"", ValorUnitario4:"",
    Descripcion5:"", Cantidad5:"", ValorUnitario5:"",
    Descripcion6:"", Cantidad6:"", ValorUnitario6:"",
    Subtotal:"2.942.697,50", Iva:"559.112,53", Total:"3.501.810,03", RetIva:"", ValorAPagar:"3.501.810,03"},
  {id:2, Factura:"93", CodigoCliente:"2", Contrato:"CT-2022-076", Proceso:"2022-00341", Dia:"01", Mes:"03", Anio:"2024", Fecha:"2024-03-01", EtapaContrato:"Honorarios", EstadoFactura:"Pagada", Observacion:"",
    Descripcion1:"Honorarios por apelación dentro del proceso 2022-00341.", Cantidad1:"1", ValorUnitario1:"5.200.000", Total1:"5.200.000",
    Descripcion2:"", Cantidad2:"", ValorUnitario2:"",
    Descripcion3:"", Cantidad3:"", ValorUnitario3:"",
    Descripcion4:"", Cantidad4:"", ValorUnitario4:"",
    Descripcion5:"", Cantidad5:"", ValorUnitario5:"",
    Descripcion6:"", Cantidad6:"", ValorUnitario6:"",
    Subtotal:"5.200.000", Iva:"988.000", Total:"6.188.000", RetIva:"", ValorAPagar:"6.188.000"},
];

export const DEMO_ORDENES_COMPRA = [
  {id:1, Contrato:"CT-2023-118", Proceso:"2023-00218", CodigoCliente:"1", Dia:"10", Mes:"01", Anio:"2024", Fecha:"2024-01-10", EtapaContrato:"Contestacion", Observacion:"", Factura:"92",
    Descripcion1:"Suministro de papelería y copias certificadas para el proceso 2023-00218.", Cantidad1:"1", ValorUnitario1:"350.000,00", Total1:"350.000,00",
    Descripcion2:"", Cantidad2:"", ValorUnitario2:"",
    Descripcion3:"", Cantidad3:"", ValorUnitario3:"",
    Descripcion4:"", Cantidad4:"", ValorUnitario4:"",
    Descripcion5:"", Cantidad5:"", ValorUnitario5:"",
    Descripcion6:"", Cantidad6:"", ValorUnitario6:"",
    Subtotal:"350.000,00", Iva:"66.500,00", Total:"416.500,00", RetIva:"", ValorAPagar:"416.500,00"},
  {id:2, Contrato:"CT-2022-076", Proceso:"2022-00341", CodigoCliente:"2", Dia:"25", Mes:"02", Anio:"2024", Fecha:"2024-02-25", EtapaContrato:"Honorarios", Observacion:"", Factura:"93",
    Descripcion1:"Gastos de desplazamiento y notificación judicial, proceso 2022-00341.", Cantidad1:"1", ValorUnitario1:"180.000,00", Total1:"180.000,00",
    Descripcion2:"", Cantidad2:"", ValorUnitario2:"",
    Descripcion3:"", Cantidad3:"", ValorUnitario3:"",
    Descripcion4:"", Cantidad4:"", ValorUnitario4:"",
    Descripcion5:"", Cantidad5:"", ValorUnitario5:"",
    Descripcion6:"", Cantidad6:"", ValorUnitario6:"",
    Subtotal:"180.000,00", Iva:"34.200,00", Total:"214.200,00", RetIva:"", ValorAPagar:"214.200,00"},
];

export const ICON_SVG = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 30 L50 50 L80 30" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/><path d="M20 70 L50 50 L80 70" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/></svg>`;
