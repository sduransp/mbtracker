export async function api(path, opts={}){
  const base = location.origin
  const res = await fetch(base + path, {
    method: opts.method||'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body?JSON.stringify(opts.body):undefined
  })
  if (!res.ok) throw new Error('API error')
  return await res.json()
}
