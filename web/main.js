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
    state.error = 'Cannot connect to server. Is it running?'
  }
  rerender()
}

async function loadMonthly(){
  try {
    state.monthly = await api('/api/analytics/monthly')
  } catch {}
}

function HouseList() {
  return h('div', { class: 'panel' }, [
    h('h2', {}, 'Houses'),
    h('ul', {}, state.houses.map(hs => h('li', { key: hs.id }, [
      h('button', { class: state.selectedHouse===hs.id?'sel':'', onclick: ()=>{state.selectedHouse=hs.id; rerender()} }, hs.name)
    ]))),
    h('form', { onsubmit: onAddHouse }, [
      h('input', { name: 'name', placeholder: 'Name (e.g., Retabet)', required: true }),
      h('input', { name: 'country', placeholder: 'Country', style: 'width:120px' }),
      h('button', { type: 'submit' }, 'Add')
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
  const exposure = state.summary?.exposure || { total_liability: 0, open_bets: 0 }
  return h('div', { class:'grid' }, [
    h('div', { class:'card' }, [
      h('h3', {}, 'Exposure'),
      h('div', { class:'metrics' }, [
        h('div', {}, ['Open bets: ', exposure.open_bets||0]),
        h('div', {}, ['Total liability: ', formatEUR(exposure.total_liability||0)])
      ])
    ]),
    ...rows.map(r => CardHouse(r))
  ])
}

function CardHouse(r){
  return h('div', { class:'card' }, [
    h('h3', {}, r.name),
    h('div', { class:'metrics' }, [
      h('div', {}, ['Net cash: ', formatEUR(r.net_cash||0)]),
      h('div', {}, ['Net PnL: ', formatEUR(r.net_pnl||0)]),
      h('div', {}, ['Fees: ', formatEUR(r.net_fees||0)]),
      h('div', {}, ['Gross flow: ', formatEUR(r.gross_flow||0)]),
    ])
  ])
}

function EntryForm(){
  return h('form', { class: 'entry', onsubmit: onAddEntry }, [
    h('h2', {}, 'New entry'),
    h('select', { name: 'house_id', required: true }, state.houses.map(hs=> h('option', { value: hs.id, selected: hs.id===state.selectedHouse }, hs.name))),
    h('select', { name: 'kind', required: true }, [
      'deposit','withdrawal','profit','loss','bonus','fee'
    ].map(k => h('option', { value: k }, k))),
    h('input', { name: 'amount', type:'number', step:'0.01', placeholder:'Amount EUR', required: true }),
    h('input', { name: 'ref', placeholder: 'Ref/ID' }),
    h('input', { name: 'notes', placeholder: 'Notes' }),
    h('button', { type: 'submit' }, 'Save')
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
        h('button', { class: state.tab==='entries'?'sel':'', onclick:()=>{state.tab='entries'; rerender()} }, 'Entries'),
        h('button', { class: state.tab==='bets'?'sel':'', onclick:()=>{state.tab='bets'; rerender()} }, 'Bets'),
        h('button', { class: state.tab==='houses'?'sel':'', onclick:()=>{state.tab='houses'; rerender()} }, 'Houses')
      ])
    ]),
    state.error && h('div', { class:'panel', style:'border-color:#8b2635;color:#f5c6cb' }, state.error),
    state.tab==='dashboard' && Dashboard(),
    state.tab==='entries' && EntryForm(),
    state.tab==='bets' && BetsForm(),
    state.tab==='houses' && HouseList(),
    state.monthly && h('div', { class:'panel' }, [
      h('h2', {}, 'This month'),
      h('div', {}, [`Invested: ${formatEUR(state.monthly.invested||0)} · Generated: ${formatEUR(state.monthly.generated||0)} · ROI: ${state.monthly.roi!=null?(state.monthly.roi*100).toFixed(1)+'%':'—'} · Settled bets: ${state.monthly.bets_settled}`])
    ])
  ])
}

function BetsForm(){
  return h('form', { class:'entry', onsubmit: onAddBet }, [
    h('h2', {}, 'New Bet'),
    h('select', { name: 'house_id', required: true }, state.houses.map(hs=> h('option', { value: hs.id, selected: hs.id===state.selectedHouse }, hs.name))),
    h('input', { name: 'event', placeholder:'Event', required: true }),
    h('input', { name: 'league', placeholder:'League' }),
    h('input', { name: 'market', placeholder:'Market (e.g., O/U 2.5, BTTS)', required: true }),
    h('input', { name: 'selection', placeholder:'Selection', required: true }),
    h('input', { name: 'odds_back', type:'number', step:'0.01', placeholder:'Odds back', required: true }),
    h('input', { name: 'stake_back', type:'number', step:'0.01', placeholder:'Stake back', required: true }),
    h('input', { name: 'odds_lay', type:'number', step:'0.01', placeholder:'Odds lay' }),
    h('input', { name: 'stake_lay', type:'number', step:'0.01', placeholder:'Stake lay' }),
    h('input', { name: 'commission', type:'number', step:'0.001', placeholder:'Commission (e.g., 0.02)' }),
    h('input', { name: 'promo_ref', placeholder:'Promo/ref' }),
    h('label', {}, [
      h('input', { name:'is_freebet', type:'checkbox' }), ' Freebet'
    ]),
    h('input', { name:'freebet_value', type:'number', step:'0.01', placeholder:'Freebet value' }),
    h('button', { type:'submit' }, 'Save bet')
  ])
}

async function onAddBet(e){
  e.preventDefault()
  const fd = new FormData(e.target)
  const b = Object.fromEntries(fd.entries())
  b.house_id = Number(b.house_id)
  b.odds_back = parseFloat(b.odds_back)
  b.stake_back = parseFloat(b.stake_back)
  if (b.odds_lay) b.odds_lay = parseFloat(b.odds_lay)
  if (b.stake_lay) b.stake_lay = parseFloat(b.stake_lay)
  if (b.commission) b.commission = parseFloat(b.commission)
  b.is_freebet = fd.get('is_freebet') ? true : false
  if (b.freebet_value) b.freebet_value = parseFloat(b.freebet_value)
  await api('/api/bets', { method:'POST', body: b })
  state.summary = await api('/api/analytics/summary')
  await loadMonthly()
  e.target.reset()
  rerender()
}

function rerender(){
  render(App(), document.getElementById('app'))
}

async function boot(){
  await load()
  await loadMonthly()
}

boot()
