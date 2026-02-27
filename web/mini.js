// Minimal hyperscript + renderer used by the MBTracker web UI.
// Keep it tiny and dependency-free.
export function h(tag, props, children){
  const kids = Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean)
  return { tag, props: props||{}, children: kids }
}
export function render(vnode, root){
  root.innerHTML = ''
  root.appendChild(_render(vnode))
}
function _render(v){
  if (v == null || v === false) return document.createTextNode('')
  if (typeof v === 'string' || typeof v === 'number') return document.createTextNode(String(v))
  const el = document.createElement(v.tag)
  Object.entries(v.props||{}).forEach(([k,val])=>{
    if (k==='onclick') el.addEventListener('click', val)
    else if (k==='onsubmit') el.addEventListener('submit', val)
    else if (k==='class') el.className = val
    else el.setAttribute(k, val)
  })
  ;(v.children||[]).forEach(ch => el.appendChild(_render(ch)))
  return el
}
