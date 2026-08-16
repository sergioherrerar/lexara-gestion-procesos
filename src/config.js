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
      // Campos adicionales de la lista real "Procesos Judiciales" — vistos en
      // el formulario Access original, todavía sin mapear (se confirman uno
      // a uno desde Configuración). Agrupados en la pestaña "Datos generales"
      // (rediseñada en tarjetas) y "Trazabilidad fechas" del panel de proceso.
      {key:"NoCompleto", label:"No. completo", hint:["no completo","numero completo","número completo"]},
      {key:"ParteActuamos", label:"Parte en que actuamos", hint:["parte en que actuamos","parte actuamos"]},
      {key:"AbogadoEncargado", label:"Abogado encargado", hint:["abogado encargado"]},
      {key:"CCApoderada", label:"CC Apoderada", hint:["cc apoderada","cc apoderado"]},
      {key:"Demandante", label:"Demandante", hint:["demandante"]},
      {key:"Demandado", label:"Demandado", hint:["demandado"]},
      {key:"LinkContrato", label:"Link contrato", hint:["link contrato"]},
      {key:"LinkCliente", label:"Link cliente", hint:["link cliente"]},
      {key:"LinkDespacho", label:"Link despacho", hint:["link despacho"]},
      {key:"CorreoDespacho", label:"Correo despacho", hint:["correo despacho"]},
      {key:"HistoricoNumerosCompletos", label:"Histórico números completos", hint:["historico numeros completos","histórico números completos"]},
      // Distinto del anterior: bitácora narrativa del proceso (actuaciones,
      // fechas y decisiones a lo largo del tiempo) — columna real de
      // SharePoint con texto enriquecido (permite negrita/subrayado/resaltado),
      // igual que Observaciones.
      {key:"Historico", label:"Histórico", hint:["historico","histórico"]},
      {key:"ValorRadicacion", label:"Valor radicación", hint:["valor radicacion","valor radicación"]},
      {key:"ValorReforma", label:"Valor reforma", hint:["valor reforma"]},
      {key:"ValorActualDemanda", label:"Valor actual demanda", hint:["valor actual demanda"]},
      {key:"FechaInstancia", label:"Fecha instancia", hint:["fecha instancia"]},
      {key:"FechaUltimoEstado", label:"Fecha último estado", hint:["fecha ultimo estado","fecha último estado"]},
      // Los siguientes 3 se agregaron en la pestaña "Trazabilidad fechas" —
      // Admitida/Prueba Pericial son listas Sí/No; Origen/Tipo Glosa es texto.
      {key:"Admitida", label:"Admitida", hint:["admitida"]},
      {key:"PruebaPericial", label:"Prueba Pericial", hint:["prueba pericial"]},
      {key:"OrigenTipoGlosa", label:"Origen/Tipo Glosa", hint:["origen tipo glosa","origen/tipo glosa","tipo glosa"]},
      // Agregados 2026-08-14 para el módulo "Informes" — Entidad SOS pide un
      // informe (Excel + PDF) con estas columnas exactas, tomadas de su
      // consulta real de Access. La mayoría de sus columnas ya existían acá
      // con otro nombre (ver mapeo en informeSOS.js); estas 13 son nuevas.
      {key:"NaturalezaProceso", label:"Naturaleza del proceso", hint:["naturaleza del proceso","naturaleza proceso"]},
      {key:"Subclasificacion", label:"Subclasificación", hint:["subclasificacion","subclasificación"]},
      {key:"Numero5Digitos", label:"Número 5 dígitos", hint:["numero 5 digitos","número 5 dígitos"]},
      {key:"FechaReformaDemanda", label:"Fecha reforma de demanda", hint:["fecha reforma de demanda","fecha reforma demanda"]},
      {key:"ValorCarteraActual", label:"Valor cartera actual", hint:["valor cartera actual","valor cartera"]},
      {key:"EnlaceProceso", label:"Enlace proceso", hint:["enlace proceso"]},
      {key:"GlosaDemandada", label:"Glosa demandada", hint:["glosa demandada"]},
      {key:"Departamento", label:"Departamento", hint:["departamento"]},
      {key:"Municipio", label:"Municipio", hint:["municipio"]},
      {key:"DemandanteIdentificacion", label:"No. de identificación demandante", hint:["identificacion demandante","identificación demandante","numero de identificacion demandante"]},
      {key:"MedidaCautelar", label:"Medida cautelar", hint:["medida cautelar"]},
      {key:"MontoMedidaCautelar", label:"Monto medida cautelar", hint:["monto medida cautelar"]},
      {key:"PorcentajeCalificacion", label:"Porcentaje de la calificación", hint:["porcentaje de la calificacion","porcentaje calificacion","porcentaje de la calificación"]},
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
      // No existe columna real "Ciudad" en la lista de Clientes (confirmado
      // por el usuario) — se quitó de aquí para que Configuración deje de
      // mostrarla como "sin mapear". El campo Ciudad de Facturas/Órdenes de
      // compra sigue funcionando igual (editable por documento), solo que
      // ya no intenta guardarse en ninguna columna real del Cliente.
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
  {
    key: "colaboradores",
    listName: "Equipo MD",
    label: "Colaborador Lexara",
    // Base del sistema de roles/permisos: el campo "Rol" (Administrador /
    // Jefe / Colaborador) define qué partes del menú puede ver cada quien —
    // ver src/lib/permissions.js. Se cruza por Correo contra la cuenta de
    // Microsoft 365 con la que se inició sesión.
    semanticFields: [
      {key:"Nombre", label:"Nombre", hint:["nombre"], required:true},
      {key:"TipoIdentificacion", label:"Tipo de identificación", hint:["tipo identif","tipo de identificacion","tipo de identificación"]},
      {key:"Identificacion", label:"Identificación", hint:["identificacion","identificación"]},
      {key:"Telefono", label:"Teléfono", hint:["telefono","teléfono"]},
      {key:"Direccion", label:"Dirección", hint:["direccion","dirección"]},
      {key:"Correo", label:"Correo", hint:["correo","email"], required:true},
      {key:"Activo", label:"Activo", hint:["activo"]},
      {key:"Rol", label:"Rol", hint:["rol"], required:true},
    ],
    mapping: {},
  },
  {
    key: "formasPago",
    listName: "Formas de pago",
    label: "Formas de pago",
    // Igual que Facturación/Órdenes de compra, se asocia al proceso por
    // Contrato (columna real "Numero de Contrato"). 6 pagos fijos por
    // registro, cada uno con su Etapa procesal cumplida, valor y factura
    // asociada — no es una tabla aparte, son 6 juegos de columnas fijos.
    semanticFields: [
      {key:"Contrato", label:"Contrato", hint:["numero de contrato","numero contrato"], required:true},
      ...Array.from({length:6}, (_,i) => i+1).flatMap(n => [
        {key:`Pago${n}`, label:`Pago ${n} (etapa)`, hint:[`pago${n}`,`pago ${n}`]},
        {key:`ValorPago${n}`, label:`Valor pago ${n}`, hint:[`valor pago${n}`,`valor pago ${n}`]},
        {key:`FacturaPago${n}`, label:`Factura pago ${n}`, hint:[`factura pago${n}`,`factura pago ${n}`]},
        {key:`EtapaProcesalCumplida${n}`, label:`Pago ${n} cumplido`, hint:[n===1 ? "etapa procesal cumplida" : `etapa procesal cumplida ${n}`]},
      ]),
      {key:"Honorarios", label:"Honorarios", hint:["honorarios"]},
    ],
    mapping: {},
  },
  {
    key: "desistimientos",
    listName: "Desistimientos tabla",
    label: "Desistimientos",
    // A diferencia de Facturación/Órdenes de compra/Formas de pago (que se
    // asocian por Contrato, un texto), esta se asocia por el campo "Proceso",
    // que guarda el ID real del elemento en la lista Procesos Judiciales —
    // relación por ID, no por texto. No existe columna real "Numero corto"
    // en esta lista (confirmado por el usuario) — en el formulario sigue
    // usándose como campo de búsqueda en pantalla para encontrar el proceso
    // por su Radicado, solo que ya no aparece en Configuración porque no hay
    // ninguna columna real que mapearle.
    semanticFields: [
      {key:"Proceso", label:"Proceso (ID)", hint:["proceso"], required:true},
      {key:"DesistimientoValor", label:"Desistimiento Valor", hint:["desistimiento valor"]},
      {key:"FechaRadicacion", label:"Fecha Radicación", hint:["fecha radicacion","fecha radicación"]},
      {key:"Aprobacion", label:"Aprobación", hint:["aprobacion","aprobación"]},
      {key:"FechaAprobacion", label:"Fecha de Aprobación", hint:["fecha de aprobacion","fecha de aprobación"]},
      {key:"Observaciones", label:"Observaciones", hint:["observaciones"]},
    ],
    mapping: {},
  },
  {
    key: "tiposAccion",
    listName: "tipos de Accion",
    label: "Tipos de Acción",
    // Lista de referencia (no tiene módulo ni panel propio): guía qué
    // combinaciones de Tipo de Acción / Tipo de Proceso / Despacho son
    // válidas en Procesos Judiciales. La columna "Nombre Id Tipo Proceso"
    // guarda el Tipo de Acción (Administrativo/Civil/Laboral); a partir de
    // ahí, "Tipo de Proceso" y "Despacho" quedan filtrados a los valores que
    // de verdad aparecen juntos en esta lista — son selects dependientes en
    // el panel de Proceso judicial (ver tiposProcesoParaAccion/
    // despachosParaAccion en graph.js). "Descripcion"/"TipoAlerta"/"Dias" son
    // para más adelante (Términos/Impulso Procesal, "por configurar").
    semanticFields: [
      {key:"NombreIdTipoProceso", label:"Nombre (Tipo de Acción)", hint:["nombre id tipo proceso","nombre"], required:true},
      {key:"Descripcion", label:"Descripción", hint:["descripcion","descripción"]},
      {key:"TipoAlerta", label:"Tipo de Alerta", hint:["tipo alerta","tipo de alerta"]},
      {key:"Dias", label:"Días", hint:["dias","días"]},
      {key:"Despacho", label:"Despacho", hint:["despacho"]},
      {key:"TipoProceso", label:"Tipo de Proceso", hint:["tipo de proceso","tipo proceso"]},
      {key:"Link", label:"Link", hint:["link"]},
    ],
    mapping: {},
  },
];

export const DEMO_PROCESOS = [
  {id:1, Radicado:"11001-31-03-045-2023-00218-00", Cliente:"Grupo Andino S.A.S.", Entidad:"Aseguradora Cordillera", Apoderado:"María Fernanda Ruiz", Despacho:"Juzgado 45 Civil del Circuito de Bogotá", Instancia:"Primera instancia", Estado:"En trámite", EstadoVT:"VIGENTE", EtapaProcesal:"Período probatorio", TipoProceso:"Ejecutivo", NumeroContrato:"CT-2023-118", FechaAdmision:"2023-05-12", FechaContestacion:"2023-06-30", CalificacionContingencia:"PROBABLE", Observaciones:"Pendiente dictamen pericial contable.",
    NoCompleto:"1100131030452023002180", ParteActuamos:"Con el Demandante", Demandante:"Grupo Andino S.A.S.", Demandado:"Aseguradora Cordillera", AbogadoEncargado:"María Fernanda Ruiz", CCApoderada:"52.884.221",
    LinkContrato:"https://mydabogados/contrato-118", LinkCliente:"https://mydabogados/cliente-1", LinkDespacho:"https://mydabogados/despacho-45",
    CorreoDespacho:"juzgado45civil@cendoj.ramajudicial.gov.co", HistoricoNumerosCompletos:"11001-31-03-045-2023-00218-00 (anterior: 2023-00218)",
    Historico:"<div>12-05-2023 radicación de la demanda.</div><div><u>30-06-2023</u> contestación de la demanda por la aseguradora.</div><div>18-09-2023 auto que <b>decreta pruebas</b> y fija <span style=\"background-color:#fff3b0\">audiencia de instrucción</span>.</div>",
    ValorRadicacion:"120.000.000,00", ValorReforma:"120.000.000,00", ValorActualDemanda:"135.400.000,00",
    FechaInstancia:"2023-05-20", FechaUltimoEstado:"2024-11-03",
    Admitida:"Sí", PruebaPericial:"Sí", OrigenTipoGlosa:"Glosa parcial - honorarios"},
  {id:2, Radicado:"05001-31-03-012-2022-00341-00", Cliente:"Constructora del Sur Ltda.", Entidad:"Sector Privado", Apoderado:"Carlos Andrés Peña", Despacho:"Juzgado 12 Civil del Circuito de Medellín", Instancia:"Segunda instancia", Estado:"En apelación", EstadoVT:"VIGENTE", FechaUltimoEstado:"2026-07-01", EtapaProcesal:"Alegatos de conclusión", TipoProceso:"Ordinario", NumeroContrato:"CT-2022-076", FechaAdmision:"2022-09-03", FechaContestacion:"2022-11-15", CalificacionContingencia:"PROBABLE", Observaciones:"Riesgo de fallo desfavorable, revisar con el cliente."},
  {id:3, Radicado:"76001-31-03-008-2024-00092-00", Cliente:"Inversiones Cali Norte", Entidad:"Sector Privado", Apoderado:"María Fernanda Ruiz", Despacho:"Juzgado 8 Civil del Circuito de Cali", Instancia:"Primera instancia", Estado:"Admitida", EstadoVT:"EN REVISION", FechaUltimoEstado:"2026-01-15", EtapaProcesal:"Traslado de la demanda", TipoProceso:"Verbal", NumeroContrato:"CT-2024-004", FechaAdmision:"2024-02-20", FechaContestacion:"", CalificacionContingencia:"REMOTO", Observaciones:""},
  {id:4, Radicado:"11001-31-03-021-2021-00567-00", Cliente:"Grupo Andino S.A.S.", Entidad:"Aseguradora Cordillera", Apoderado:"Jorge Iván Salcedo", Despacho:"Juzgado 21 Civil del Circuito de Bogotá", Instancia:"Casación", Estado:"En corte", EstadoVT:"VIGENTE", FechaUltimoEstado:"2024-03-01", EtapaProcesal:"Traslado en casación", TipoProceso:"Ordinario", NumeroContrato:"CT-2021-201", FechaAdmision:"2021-04-18", FechaContestacion:"2021-07-02", CalificacionContingencia:"PROBABLE", Observaciones:"Enviado a la Corte Suprema desde marzo."},
  {id:5, Radicado:"13001-31-03-003-2023-00450-00", Cliente:"Distribuidora Caribe SAS", Entidad:"Sector Público", Apoderado:"Carlos Andrés Peña", Despacho:"Juzgado 3 Civil del Circuito de Cartagena", Instancia:"Primera instancia", Estado:"Terminado", EstadoVT:"TERMINADO", EtapaProcesal:"Sentencia en firme", TipoProceso:"Ejecutivo", NumeroContrato:"CT-2023-055", FechaAdmision:"2023-01-30", FechaContestacion:"2023-03-11", CalificacionContingencia:"Baja", Observaciones:"Fallo a favor. Pendiente archivar expediente."},
  // Ejemplo Entidad "SOS" (2026-08-14) — datos ficticios, solo para probar el
  // módulo Informes y el formato de exportación Excel/PDF de esta Entidad
  // (ver src/lib/informeSOS.js). No es información real de ningún cliente.
  {id:6, Radicado:"11001-33-44-006-2025-00099-00", Cliente:"EPS Ejemplo de Salud S.A.", Entidad:"SOS", Apoderado:"Dahiana Camila Pedraza", Despacho:"Juzgado 6 Administrativo de Bogotá", Instancia:"Primera instancia",
    Estado:"<div>10-02-2026 Auto admite demanda.</div><div>18-03-2026 Notificación de auto admisorio.</div><div>05-05-2026 Contestación de la demanda por ADRES.</div><div>22-06-2026 Al despacho para resolver.</div>",
    EstadoVT:"VIGENTE", FechaUltimoEstado:"2026-06-22", EtapaProcesal:"Traslado para alegar de conclusión", TipoProceso:"Nulidad y restablecimiento del derecho", TipoAccion:"Administrativo",
    NumeroContrato:"CT-2025-090", FechaAdmision:"2026-02-10", FechaContestacion:"2026-05-05", CalificacionContingencia:"PROBABLE", PorcentajeCalificacion:"0,5",
    Observaciones:"Ejemplo de proceso de recobro ante ADRES.",
    NoCompleto:"1100133440062025000990", ParteActuamos:"Con el Demandante", Demandante:"EPS Ejemplo de Salud S.A.", DemandanteIdentificacion:"900.000.111-2", Demandado:"ADRES", AbogadoEncargado:"Dahiana Camila Pedraza", CCApoderada:"1.014.300.118",
    NaturalezaProceso:"Administrativo", Subclasificacion:"Nulidad y restablecimiento del derecho", Numero5Digitos:"2025-00099",
    Departamento:"BOGOTÁ D.C.", Municipio:"BOGOTÁ D.C.", GlosaDemandada:"Recobro por glosa de auditoría", MedidaCautelar:"No",
    ValorRadicacion:"850.000.000,00", ValorReforma:"850.000.000,00", ValorActualDemanda:"912.400.000,00", ValorCarteraActual:"912.400.000,00",
    HistoricoNumerosCompletos:"11001-33-44-006-2025-00099-00", EnlaceProceso:"https://mydabogados/proceso-ejemplo-sos",
    Historico:"<div>10-02-2026 Auto admite demanda.</div><div>18-03-2026 Notificación de auto admisorio.</div><div>05-05-2026 Contestación de la demanda por ADRES.</div><div>22-06-2026 Al despacho para resolver.</div>",
    Admitida:"Sí", PruebaPericial:"No", OrigenTipoGlosa:"Glosa de auditoría"},
];

export const DEMO_CLIENTES = [
  {id:1, RazonSocial:"Grupo Andino S.A.S.", Nit:"900.123.456-7", Ciudad:"Bogotá", Direccion:"Calle 100 #15-20", Telefono:"601 654 3210", Correo:"contacto@grupoandino.com", Entidad:"Privada"},
  {id:2, RazonSocial:"Constructora del Sur Ltda.", Nit:"890.234.567-1", Ciudad:"Medellín", Direccion:"Carrera 43A #30-10", Telefono:"604 512 3344", Correo:"info@constructorasur.com", Entidad:"Privada"},
  {id:3, RazonSocial:"Inversiones Cali Norte", Nit:"805.345.678-2", Ciudad:"Cali", Direccion:"Avenida 6N #28-45", Telefono:"602 660 7788", Correo:"admin@calinorte.com", Entidad:"Privada"},
  {id:4, RazonSocial:"Distribuidora Caribe SAS", Nit:"812.456.789-3", Ciudad:"Cartagena", Direccion:"Calle 35 #22-18", Telefono:"605 690 1122", Correo:"ventas@distcaribe.com", Entidad:"Privada"},
  // Ejemplo Entidad "SOS" — ver nota en DEMO_PROCESOS id:6, datos ficticios.
  {id:5, RazonSocial:"EPS Ejemplo de Salud S.A.", Nit:"900.000.111-2", Ciudad:"Bogotá", Direccion:"Avenida Ejemplo #1-00", Telefono:"601 000 0000", Correo:"contacto@epsejemplo.com", Entidad:"SOS"},
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

export const DEMO_COLABORADORES = [
  {id:1, Nombre:"Monica Paola Gómez", TipoIdentificacion:"C.C.", Identificacion:"40.039.240", Telefono:"+57 312 4420026", Direccion:"Carrera 56B", Correo:"Gerencia@lexaraabogados.com", Activo:true, Rol:"Jefe"},
  {id:2, Nombre:"Sergio Alexander Herrera", TipoIdentificacion:"C.C.", Identificacion:"80.728.333", Telefono:"+57 310 4380043", Direccion:"Calle 128 No 87", Correo:"Soporte@lexaraabogados.com", Activo:true, Rol:"Administrador"},
  {id:3, Nombre:"Dahiana Camila Pedraza", TipoIdentificacion:"C.C.", Identificacion:"1.014.300.118", Telefono:"+57 3202751824", Direccion:"Cll 69a #105-35", Correo:"dcpedrazap@lexaraabogados.com", Activo:true, Rol:"Colaborador"},
  {id:4, Nombre:"Daniel Santiago Flechas", TipoIdentificacion:"C.C.", Identificacion:"1.032.502.681", Telefono:"+57 310 4112130", Direccion:"Carrera 49B", Correo:"Asesoriajuridica@lexaraabogados.com", Activo:true, Rol:"Colaborador"},
  {id:5, Nombre:"Ariana Andrea Torres", TipoIdentificacion:"C.C", Identificacion:"1.006.415.925", Telefono:"+57 3124720", Direccion:"Calle 27a #33-6", Correo:"Tutelas@lexaraabogados.com", Activo:true, Rol:"Colaborador"},
];

export const DEMO_FORMAS_PAGO = [
  {id:1, Contrato:"CT-2023-118",
    Pago1:"Contestacion", ValorPago1:"1.500.000,00", FacturaPago1:"92", EtapaProcesalCumplida1:true,
    Pago2:"Sentencia 1ra", ValorPago2:"1.442.697,50", FacturaPago2:"", EtapaProcesalCumplida2:false,
    Pago3:"", ValorPago3:"", FacturaPago3:"", EtapaProcesalCumplida3:false,
    Pago4:"", ValorPago4:"", FacturaPago4:"", EtapaProcesalCumplida4:false,
    Pago5:"", ValorPago5:"", FacturaPago5:"", EtapaProcesalCumplida5:false,
    Pago6:"", ValorPago6:"", FacturaPago6:"", EtapaProcesalCumplida6:false,
    Honorarios:"2.942.697,50"},
  {id:2, Contrato:"CT-2022-076",
    Pago1:"Honorarios", ValorPago1:"5.200.000,00", FacturaPago1:"93", EtapaProcesalCumplida1:true,
    Pago2:"", ValorPago2:"", FacturaPago2:"", EtapaProcesalCumplida2:false,
    Pago3:"", ValorPago3:"", FacturaPago3:"", EtapaProcesalCumplida3:false,
    Pago4:"", ValorPago4:"", FacturaPago4:"", EtapaProcesalCumplida4:false,
    Pago5:"", ValorPago5:"", FacturaPago5:"", EtapaProcesalCumplida5:false,
    Pago6:"", ValorPago6:"", FacturaPago6:"", EtapaProcesalCumplida6:false,
    Honorarios:"5.200.000,00"},
];

export const DEMO_DESISTIMIENTOS = [
  {id:1, Proceso:1, NumeroCorto:"11001-31-03-045-2023-00218-00", DesistimientoValor:"792.695,00", FechaRadicacion:"2023-10-20", Aprobacion:"Aprobado", FechaAprobacion:"2024-06-22", Observaciones:""},
  // Ejemplo Entidad "SOS" (2026-08-16) — datos ficticios, solo para probar el
  // informe de Desistimientos de esa Entidad (ver src/lib/informeSOS.js).
  {id:2, Proceso:6, NumeroCorto:"11001-33-44-006-2025-00099-00", DesistimientoValor:"1.250.000,00", FechaRadicacion:"2026-04-10", Aprobacion:"APROBADO", FechaAprobacion:"2026-05-02", Observaciones:"Desistimiento parcial de pretensiones de mora."},
];

// Lista de referencia "tipos de Accion" — guía las combinaciones válidas de
// Tipo de Acción / Tipo de Proceso / Despacho en Procesos Judiciales (ver
// tiposProcesoParaAccion/despachosParaAccion en graph.js).
export const DEMO_TIPOS_ACCION = [
  {id:1, NombreIdTipoProceso:"Administrativo", Descripcion:"Apelacion De Sentencias Art. 292 CPACA", TipoAlerta:"Termino", Dias:"5,00", Despacho:"Consejo De Estado Sección Primera", TipoProceso:"Nulidad simple", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012_pr007.html"},
  {id:2, NombreIdTipoProceso:"Administrativo", Descripcion:"Audiencia De Alegaciones Y Juzgamiento Art. 182 Cpaca", TipoAlerta:"Audiencia", Dias:"", Despacho:"Consejo De Estado Sección Segunda", TipoProceso:"Nulidad y reestablecimiento del derecho", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1437_2011_pr004.html"},
  {id:3, NombreIdTipoProceso:"Administrativo", Descripcion:"Audiencia De Pruebas Art. 181 Cpaca", TipoAlerta:"Audiencia", Dias:"", Despacho:"Consejo De Estado Sección Tercera", TipoProceso:"Reparación directa", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1437_2011_pr004.html"},
  {id:4, NombreIdTipoProceso:"Administrativo", Descripcion:"Audiencia Inicial Art. 180 Cpaca", TipoAlerta:"Audiencia", Dias:"", Despacho:"Consejo De Estado Sección Cuarta", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1437_2011_pr004.html"},
  {id:5, NombreIdTipoProceso:"Administrativo", Descripcion:"Contestacion Art. 172 CPACA", TipoAlerta:"Termino", Dias:"30,00", Despacho:"Consejo De Estado Sección Quinto", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1437_2011_pr004.html"},
  {id:6, NombreIdTipoProceso:"Administrativo", Descripcion:"Continuacion Art. 180 Cpaca", TipoAlerta:"Termino", Dias:"30,00", Despacho:"Consejo De Estado Sección Sexta", TipoProceso:"", Link:""},
  {id:7, NombreIdTipoProceso:"Administrativo", Descripcion:"Continuacion Art. 181 Cpaca", TipoAlerta:"Termino", Dias:"30,00", Despacho:"Juzgado Administrativo", TipoProceso:"", Link:""},
  {id:8, NombreIdTipoProceso:"Administrativo", Descripcion:"Recurso De Apelacion Auto Art. 244 CPACA", TipoAlerta:"Termino", Dias:"3,00", Despacho:"Procuradurías Administrativas", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1437_2011_pr005.html"},
  {id:9, NombreIdTipoProceso:"Administrativo", Descripcion:"Recurso De Queja Art. 245 CPACA", TipoAlerta:"Termino", Dias:"3,00", Despacho:"Tribunal Administrativo", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1437_2011_pr005.html"},
  {id:10, NombreIdTipoProceso:"Administrativo", Descripcion:"Recurso Reposicion Auto ART. 242 CPACA", TipoAlerta:"Termino", Dias:"3,00", Despacho:"", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1437_2011_pr005.html"},
  {id:11, NombreIdTipoProceso:"Administrativo", Descripcion:"Termino Para La Reforma Art. 173 CPACA", TipoAlerta:"Termino", Dias:"40,00", Despacho:"", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1437_2011_pr004.html"},
  {id:12, NombreIdTipoProceso:"Administrativo", Descripcion:"Subsanacion de la Demanda Art 170 CPACA", TipoAlerta:"Termino", Dias:"10,00", Despacho:"", TipoProceso:"", Link:""},
  {id:13, NombreIdTipoProceso:"Civil", Descripcion:"Audiencia Art. 372 Y 373 Cg", TipoAlerta:"Audiencia", Dias:"", Despacho:"Centro De Conciliación Civil De La Procuraduría", TipoProceso:"Declarativo", Link:""},
  {id:14, NombreIdTipoProceso:"Civil", Descripcion:"Audiencia De Instruccion Y Juzgamiento Art 373 Cgp", TipoAlerta:"Audiencia", Dias:"", Despacho:"Corte Suprema De Justicia Civil Y Agraria", TipoProceso:"Ejecutivo", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012_pr009.html"},
  {id:15, NombreIdTipoProceso:"Civil", Descripcion:"Audiencia Inicial Art 372 Cgp", TipoAlerta:"Audiencia", Dias:"", Despacho:"Juzgado Civil Del Circuito", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012_pr009.html"},
  {id:16, NombreIdTipoProceso:"Civil", Descripcion:"Contestacion Art. 369 CGP", TipoAlerta:"Termino", Dias:"20,00", Despacho:"Juzgado Civil Municipal", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012_pr009.html"},
  {id:17, NombreIdTipoProceso:"Civil", Descripcion:"Recurso De Apelacion Auto Art. 322 CGP", TipoAlerta:"Termino", Dias:"3,00", Despacho:"Juzgado De Pequeñas Causas Y Competencias Múltiples", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012_pr007.html"},
  {id:18, NombreIdTipoProceso:"Civil", Descripcion:"Recurso De Casacion Art. 337 CGP", TipoAlerta:"Termino", Dias:"3,00", Despacho:"Superintendencia De Industria Y Comercio", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012_pr008.html"},
  {id:19, NombreIdTipoProceso:"Civil", Descripcion:"Recurso De Queja Art. 353 CGP", TipoAlerta:"Termino", Dias:"3,00", Despacho:"Superintendencia Financiera", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012_pr008.html"},
  {id:20, NombreIdTipoProceso:"Civil", Descripcion:"Recurso De Suplica Art. 353 CGP", TipoAlerta:"Termino", Dias:"3,00", Despacho:"Tribunal Superior Sala Civil", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012_pr008.html"},
  {id:21, NombreIdTipoProceso:"Civil", Descripcion:"Recurso Reposicion Auto Art. 318 CGP", TipoAlerta:"Termino", Dias:"3,00", Despacho:"", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/ley_1564_2012_pr007.html"},
  {id:22, NombreIdTipoProceso:"Laboral", Descripcion:"Alegatos En Apelacion Art. 13 Ley 2213 De 2022", TipoAlerta:"Termino", Dias:"5,00", Despacho:"Corte Suprema De Justicia Sala Laboral", TipoProceso:"Ordinario laboral", Link:"https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=187626"},
  {id:23, NombreIdTipoProceso:"Laboral", Descripcion:"Art. 72 Cpl Y Ss Unica Instancia", TipoAlerta:"Audiencia", Dias:"", Despacho:"Juzgado Laboral Del Circuito", TipoProceso:"Ejecutivo laboral", Link:"http://www.secretariasenado.gov.co/senado/basedoc/codigo_procedimental_laboral_pr001.html"},
  {id:24, NombreIdTipoProceso:"Laboral", Descripcion:"Art. 77 Cpl Y Ss Conciliacion Y Primera De Tramite", TipoAlerta:"Audiencia", Dias:"", Despacho:"Juzgado Laboral Municipal De Pequeñas Causas", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/codigo_procedimental_laboral_pr001.html"},
  {id:25, NombreIdTipoProceso:"Laboral", Descripcion:"Art. 77 Y Art. 80 Cpl Y Ss", TipoAlerta:"Audiencia", Dias:"", Despacho:"Superintendencia Nacional De Salud", TipoProceso:"", Link:""},
  {id:26, NombreIdTipoProceso:"Laboral", Descripcion:"Art. 80 Cpl Y Ss Pruebas Alegatos Y Fallo", TipoAlerta:"Audiencia", Dias:"", Despacho:"Tribunal Superior Sala Laboral", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/codigo_procedimental_laboral_pr001.html"},
  {id:27, NombreIdTipoProceso:"Laboral", Descripcion:"Casacion Art. 88 CPL Y SS", TipoAlerta:"Termino", Dias:"15,00", Despacho:"", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/codigo_procedimental_laboral_pr002.html"},
  {id:28, NombreIdTipoProceso:"Laboral", Descripcion:"Contestacion Art. 74 CPL Y SS", TipoAlerta:"Termino", Dias:"10,00", Despacho:"", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/codigo_procedimental_laboral_pr001.html"},
  {id:29, NombreIdTipoProceso:"Laboral", Descripcion:"Continuacion Art. 77 Cpl Y Ss", TipoAlerta:"Termino", Dias:"10,00", Despacho:"", TipoProceso:"", Link:""},
  {id:30, NombreIdTipoProceso:"Laboral", Descripcion:"Continuacion Art. 80 Cpl Y Ss", TipoAlerta:"Termino", Dias:"10,00", Despacho:"", TipoProceso:"", Link:""},
  {id:31, NombreIdTipoProceso:"Laboral", Descripcion:"Recurso De Apelacion Auto Art. 65 CPL Y SS", TipoAlerta:"Termino", Dias:"3,00", Despacho:"", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/codigo_procedimental_laboral_pr001.html"},
  {id:32, NombreIdTipoProceso:"Laboral", Descripcion:"Recurso Reposicion Auto Art. 63 CPL Y SS", TipoAlerta:"Termino", Dias:"2,00", Despacho:"", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/codigo_procedimental_laboral_pr001.html"},
  {id:33, NombreIdTipoProceso:"Laboral", Descripcion:"Subsanacion Art. 28 CPL Y SS", TipoAlerta:"Termino", Dias:"5,00", Despacho:"", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/codigo_procedimental_laboral.html"},
  {id:34, NombreIdTipoProceso:"Laboral", Descripcion:"Termino Para La Reforma", TipoAlerta:"Termino", Dias:"15,00", Despacho:"", TipoProceso:"", Link:"http://www.secretariasenado.gov.co/senado/basedoc/codigo_procedimental_laboral.html"},
];

export const ICON_SVG = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 30 L50 50 L80 30" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/><path d="M20 70 L50 50 L80 70" stroke="currentColor" stroke-width="14" fill="none" stroke-linecap="square"/></svg>`;
