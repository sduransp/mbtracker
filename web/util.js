export function formatEUR(n){
  return new Intl.NumberFormat('es-ES', { style:'currency', currency:'EUR' }).format(n||0)
}
export function since(ts){
  const d = Date.now()-ts
  const mins = Math.round(d/60000)
  if (mins<60) return `${mins}m`
  const hrs = Math.round(mins/60)
  return `${hrs}h`
}
