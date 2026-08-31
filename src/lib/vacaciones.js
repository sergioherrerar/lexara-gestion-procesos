// Vacaciones (Administración) — reescrito por completo 2026-08-31: reemplaza
// el Excel real que se usaba antes ("Vacaciones.xlsx", ver la saga completa
// de 404 en [[project_administracion_modulo]]) por la lista real "Vacaciones"
// (una fila por PERÍODO tomado, no una fila por persona) — pedido explícito
// del usuario: "no vamos a dejar el excel, vamos a crear lista en SharePoint".
//
// Los totales que antes eran fórmulas del propio Excel (fila 3, columnas
// C-H: fecha actual=HOY(), Días Laborados=C-B, Días generados=Días
// Laborados/24, Días Tomados=SUMA de columnas Días, Días Pendientes=
// generados-tomados) ahora los calcula esta función, con la MISMA fórmula
// real (confirmada leyendo el Excel real), solo que a partir de:
//   - "Fecha de Ingreso" — ya existe en la lista Equipo MD (colaboradores)
//   - la suma de "Dias" de la lista "Vacaciones" (una fila por período)
// en vez de columnas fijas de un archivo.

function soloFecha(v){
  const s = String(v||"").slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function redondear(n){ return Math.round(n * 100) / 100; }

// Misma fórmula real del Excel (C3-B3, D3/24) — días CORRIDOS, no hábiles.
export function calcularResumen(fechaIngresoISO, periodosDeEsaPersona){
  const ingresoISO = soloFecha(fechaIngresoISO);
  if(!ingresoISO) return { diasLaborados: null, diasGenerados: null, diasTomados: 0, diasPendientes: null };
  const [y,m,d] = ingresoISO.split('-').map(Number);
  const ingreso = new Date(y, m-1, d);
  const hoy = new Date(); const hoySoloFecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const diasLaborados = Math.round((hoySoloFecha - ingreso) / 86400000);
  const diasGenerados = redondear(diasLaborados / 24);
  const diasTomados = redondear((periodosDeEsaPersona||[]).reduce((s,p) => s + (Number(p.Dias)||0), 0));
  const diasPendientes = redondear(diasGenerados - diasTomados);
  return { diasLaborados, diasGenerados, diasTomados, diasPendientes };
}

// Une Equipo MD (colaboradores, para Nombre + Fecha de Ingreso) con la lista
// "Vacaciones" (períodos, uno por fila) — un bloque por colaborador con
// Fecha de Ingreso, ordenado alfabéticamente. Solo incluye colaboradores
// ACTIVOS con Fecha de Ingreso cargada (sin eso no hay nada que calcular).
export function agruparVacacionesPorColaborador(colaboradores, periodos){
  return (colaboradores||[])
    .filter(c => (c.Activo||"Sí") !== "No" && soloFecha(c.FechaIngreso))
    .map(c => {
      const propios = (periodos||[])
        .filter(p => (p.Colaborador||"").trim() === (c.Nombre||"").trim())
        .sort((a,b) => String(b.FechaInicio||"").localeCompare(String(a.FechaInicio||"")));
      const resumen = calcularResumen(c.FechaIngreso, propios);
      return { id: c.id, nombre: c.Nombre, fechaIngreso: c.FechaIngreso, ...resumen, cantidadPeriodos: propios.length, historial: propios };
    })
    .sort((a,b) => (a.nombre||"").localeCompare(b.nombre||""));
}
