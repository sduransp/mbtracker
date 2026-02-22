import { h, render } from './mini.js'
import { api } from './net.js'
import { formatEUR, since } from './util.js'

const state = {
  houses: [],
  entries: [],
  summary: null,
  selectedHouse: null,
  tab: 'dashboard',
}

async function load() {
  try {
    state.houses = await api('/api/houses')
    if (state.houses.length && !state.selectedHouse) state.selectedHouse = state.houses[0].id
    state.summary = await api('/api/analytics/summary')
  } catch (e) {
    state.error = 'No puedo conectar con el servidor. ¿Está iniciado?'
  }
  rerender()
}

function HouseList() {
  return h('div', { class: 'panel' }, [
    h('h2', {}, 'Casas'),
    h('ul', {}, state.houses.map(hs => h('li', { key: hs.id }, [
      h('button', { class: state.selectedHouse===hs.id?'sel':'', onclick: ()=>{state.selectedHouse=hs.id; rerender()} }, hs.name)
    ]))),
    h('form', { onsubmit: onAddHouse }, [
      h('input', { name: 'name', placeholder: 'Nombre (p.ej., Retabet)', required: true }),
      h('input', { name: 'country', placeholder: 'País', style: 'width:120px' }),
      h('button', { type: 'submit' }, 'Añadir')
    ])
  ])
}

async function onAddHouse(e){
  e.preventDefault()
  const fd = new FormData(e.target)
  const name = fd.get('name')
  const country = fd.get('country') || ''
  await api('/api/houses', { method: 'POST', body: { name, country }})
  await load()
  e.target.reset()
}

function Dashboard(){
  const rows = state.summary?.rows || []
  return h('div', { class:'grid' }, rows.map(r => CardHouse(r)))
}

function CardHouse(r){
  return h('div', { class:'card' }, [
    h('h3', {}, r.name),
    h('div', { class:'metrics' }, [
      h('div', {}, ['Cash neto: ', formatEUR(r.net_cash||0)]),
      h('div', {}, ['PnL neto: ', formatEUR(r.net_pnl||0)]),
      h('div', {}, ['Comisiones: ', formatEUR(r.net_fees||0)]),
      h('div', {}, ['Flujo bruto: ', formatEUR(r.gross_flow||0)]),
    ])
  ])
}

function EntryForm(){
  return h('form', { class: 'entry', onsubmit: onAddEntry }, [
    h('h2', {}, 'Nueva entrada'),
    h('select', { name: 'house_id', required: true }, state.houses.map(hs=> h('option', { value: hs.id, selected: hs.id===state.selectedHouse }, hs.name))),
    h('select', { name: 'kind', required: true }, [
      'deposit','withdrawal','profit','loss','bonus','fee'
    ].map(k => h('option', { value: k }, k))),
    h('input', { name: 'amount', type:'number', step:'0.01', placeholder:'Importe EUR', required: true }),
    h('input', { name: 'ref', placeholder: 'Ref/ID' }),
    h('input', { name: 'notes', placeholder: 'Notas' }),
    h('button', { type: 'submit' }, 'Guardar')
  ])
}

async function onAddEntry(e){
  e.preventDefault()
  const fd = new FormData(e.target)
  const body = Object.fromEntries(fd.entries())
  body.amount = parseFloat(body.amount)
  body.house_id = Number(body.house_id)
  await api('/api/entries', { method: 'POST', body })
  state.summary = await api('/api/analytics/summary')
  e.target.reset()
  rerender()
}

function App(){
  return h('div', { class:'wrap' }, [
    h('header', {}, [
      h('h1', {}, 'MBTracker — Matched Betting Dashboard'),
      h('nav', {}, [
        h('button', { class: state.tab==='dashboard'?'sel':'', onclick:()=>{state.tab='dashboard'; rerender()} }, 'Dashboard'),
        h('button', { class: state.tab==='entries'?'sel':'', onclick:()=>{state.tab='entries'; rerender()} }, 'Entradas'),
        h('button', { class: state.tab==='houses'?'sel':'', onclick:()=>{state.tab='houses'; rerender()} }, 'Casas')
      ])
    ]),
    state.error && h('div', { class:'panel', style:'border-color:#8b2635;color:#f5c6cb' }, state.error),
    state.tab==='dashboard' && Dashboard(),
    state.tab==='entries' && EntryForm(),
    state.tab==='houses' && HouseList(),
  ])
}

function rerender(){
  render(App(), document.getElementById('app'))
}

load()
