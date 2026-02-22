#!/usr/bin/env node
/*
  Simple smoke test:
  - Build web assets
  - Start server on a test port
  - Probe /health and /api/health
*/
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const root = path.join(__dirname, '..')
const PORT = 5180

function httpGet(pathname){
  return new Promise((resolve,reject)=>{
    const req = http.get({ host:'127.0.0.1', port: PORT, path: pathname }, (res)=>{
      let data=''
      res.on('data', chunk=> data+=chunk)
      res.on('end', ()=> resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
  })
}

async function main(){
  // Build web (optional, ignore failures for dev)
  await new Promise((resolve)=>{
    const build = spawn('npm', ['run','build'], { cwd: root, stdio: 'inherit' })
    build.on('exit', ()=> resolve())
  })

  // Start server
  const server = spawn('node', ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore','pipe','pipe'] })

  let ready = false
  server.stdout.on('data', (buf)=>{
    const s = buf.toString()
    if (s.includes(`:${PORT}`)) ready = true
    process.stdout.write(s)
  })
  server.stderr.on('data', (buf)=> process.stderr.write(buf.toString()))

  const deadline = Date.now()+5000
  while (!ready && Date.now()<deadline) await new Promise(r=>setTimeout(r,200))

  try {
    const h1 = await httpGet('/health')
    const h2 = await httpGet('/api/health')
    if (h1.status===200 && h2.status===200) {
      console.log('Smoke test OK')
      process.exitCode = 0
    } else {
      console.error('Smoke test failed', h1.status, h2.status)
      process.exitCode = 1
    }
  } catch (e) {
    console.error('Smoke test error', e)
    process.exitCode = 1
  } finally {
    server.kill('SIGTERM')
  }
}

main()
