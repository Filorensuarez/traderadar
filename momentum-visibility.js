// Shared frontend/backend guard: only fully confirmed 30-second momentum results can be displayed.
export function confirmedMomentumRows(rows) {
 return Array.isArray(rows) ? rows.filter(row=>row!==null&&typeof row==="object"&&row.confirmed===true) : [];
}
