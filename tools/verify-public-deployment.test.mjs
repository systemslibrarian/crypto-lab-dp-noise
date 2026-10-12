import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { deploymentUrl, validateManifest, verifyFiles, verifyReport,
  verifyOriginalMembership, verifyStages, requiredStages, verifyFileReport } from './verify-public-deployment.mjs'

const url = 'https://systemslibrarian.github.io/crypto-lab-dp-noise/'
const identity = { repository: 'systemslibrarian/crypto-lab-dp-noise',
  sourceSha: 'a'.repeat(40), lockSha256: 'b'.repeat(64) }
const bytes = Buffer.from('<h1>Frozen Heart</h1>')
const manifest = () => ({ version: 1, ...identity, files: [{ path: 'index.html',
  bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }] })
const report = () => ({ suites: [{ title: 'claims.spec.ts', specs: Array.from({ length: 10 }, (_, i) => ({
  file: 'claims.spec.ts', title: `control ${i}`, ok: true,
  tests: [{ projectName: '', expectedStatus: 'passed', status: 'expected',
    results: [{ status: 'passed', retry: 0, errors: [] }] }],
})) }], errors: [], stats: { expected: 10, unexpected: 0, skipped: 0, flaky: 0 } })
const fixtureFetch = async (requested) => ({ status: 200, url: requested,
  arrayBuffer: async () => bytes })

test('accepts the actual HTTPS deployment URL and rejects other targets', () => {
  assert.equal(deploymentUrl(url), url)
  for (const wrong of ['http://systemslibrarian.github.io/crypto-lab-dp-noise/',
    'https://example.com/crypto-lab-dp-noise/', 'https://systemslibrarian.github.io/',
    `${url}?other=1`, `${url}#other`, 'https://user@systemslibrarian.github.io/crypto-lab-dp-noise/']) {
    assert.throws(() => deploymentUrl(wrong))
  }
})

test('accepts exact source and lock identity; rejects stale, empty and opaque build evidence', () => {
  assert.deepEqual(validateManifest(manifest(), identity), manifest())
  for (const bad of [null, { ...manifest(), sourceSha: 'c'.repeat(40) },
    { ...manifest(), lockSha256: 'd'.repeat(64) }, { ...manifest(), files: [] },
    { ...manifest(), files: [{ ...manifest().files[0], path: '../index.html' }] },
    { ...manifest(), files: [manifest().files[0], manifest().files[0]] },
    { ...manifest(), files: [{ ...manifest().files[0], sha256: null }] }]) {
    assert.throws(() => validateManifest(bad, identity))
  }
  for (const badIdentity of [{ ...identity, sourceSha: undefined },
    { ...identity, sourceSha: 'short' }, { ...identity, lockSha256: undefined },
    { ...identity, lockSha256: 'short' }]) {
    assert.throws(() => validateManifest({ ...manifest(), ...badIdentity }, badIdentity))
  }
})

test('checks real downloaded bytes and rejects changed, missing or redirected pages', async () => {
  assert.equal((await verifyFiles(manifest(), identity, url, fixtureFetch)).files.length, 1)
  for (const response of [
    { status: 200, url: `${url}index.html`, arrayBuffer: async () => Buffer.from('old deployment') },
    { status: 404, url: `${url}index.html`, arrayBuffer: async () => bytes },
    { status: 200, url: 'https://example.com/index.html', arrayBuffer: async () => bytes },
  ]) await assert.rejects(verifyFiles(manifest(), identity, url, async () => response))
})

test('a wrong URL or source identity stops collection before any request', async () => {
  let requests = 0
  const collect = async () => { requests++; throw new Error('Should not request') }
  await assert.rejects(verifyFiles(manifest(), identity, 'https://example.com/', collect))
  await assert.rejects(verifyFiles(manifest(), { ...identity, sourceSha: 'c'.repeat(40) }, url, collect))
  assert.equal(requests, 0)
})

test('unreadable network or timeout cannot establish successful deployment', async () => {
  await assert.rejects(verifyFiles(manifest(), identity, url, async () => {
    throw new Error('Network timeout')
  }), /timeout/)
})

test('a successful first download cannot hide an unreadable second file', async () => {
  const twoFiles = manifest()
  twoFiles.files.push({ ...twoFiles.files[0], path: 'assets/application.js' })
  let requests = 0
  await assert.rejects(verifyFiles(twoFiles, identity, url, async (requested) => {
    requests++
    if (requests === 1) return fixtureFetch(requested)
    return { status: 404, url: requested, arrayBuffer: async () => bytes }
  }), /Unreadable deployed file/)
  assert.equal(requests, 2)
})

test('requires successful execution and the complete original browser membership', () => {
  assert.equal(verifyReport(report(), report(), 0).passed, 10)
  for (const exit of [1, null, undefined, NaN]) assert.throws(() => verifyReport(report(), report(), exit))
  for (const bad of [null, {}, { ...report(), errors: [{ message: 'Uncaught error' }] },
    { ...report(), suites: [] }]) assert.throws(() => verifyReport(report(), bad, 0))
  const partial = report(); partial.suites[0].specs.pop(); partial.stats.expected = 9
  assert.throws(() => verifyReport(report(), partial, 0), /membership/)
  assert.throws(() => verifyReport(partial, partial, 0), /original full-suite/)
  const changed = report(); changed.suites[0].specs[0].title = 'Different test'
  assert.throws(() => verifyReport(report(), changed, 0), /membership/)
  const duplicate = report(); duplicate.suites[0].specs[1].title = duplicate.suites[0].specs[0].title
  assert.throws(() => verifyReport(report(), duplicate, 0), /duplicate/)
})

test('zero process exit cannot hide failed, skipped, unfinished, flaky or unreadable tests', () => {
  for (const status of ['failed', 'timedOut', 'skipped', 'interrupted', undefined]) {
    const bad = report(); bad.suites[0].specs[0].tests[0].results[0].status = status
    assert.throws(() => verifyReport(report(), bad, 0))
  }
  for (const count of ['unexpected', 'skipped', 'flaky']) {
    const bad = report(); bad.stats[count] = 1
    assert.throws(() => verifyReport(report(), bad, 0))
  }
  const unread = report(); unread.suites[0].specs[0].tests[0].results = []
  assert.throws(() => verifyReport(report(), unread, 0))
  const retried = report(); retried.suites[0].specs[0].tests[0].results.unshift({ status: 'failed' })
  assert.throws(() => verifyReport(report(), retried, 0))
})

test('actual capture pins Git bytes, rejects a changed checkout/lock, and installs or runs no lifecycle code', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'frozen-public-control-'))
  const cli = fileURLToPath(new URL('./verify-public-deployment.mjs', import.meta.url))
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
  try {
    git('init', '--quiet')
    writeFileSync(resolve(directory, 'package-lock.json'), '{"lockfileVersion":3}\n')
    writeFileSync(resolve(directory, 'package.json'), JSON.stringify({ name: 'synthetic-control',
      scripts: { postinstall: 'touch lifecycle-ran', prepare: 'touch lifecycle-ran' } }))
    mkdirSync(resolve(directory, 'src'))
    writeFileSync(resolve(directory, 'src/main.ts'), 'export const original = true\n')
    git('add', 'package.json', 'package-lock.json', 'src/main.ts')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture')
    const sourceSha = git('rev-parse', 'HEAD')
    mkdirSync(resolve(directory, 'dist'))
    writeFileSync(resolve(directory, 'dist/index.html'), bytes)
    const env = { ...process.env, GITHUB_REPOSITORY: identity.repository, DP_APPLICATION_SHA: sourceSha,
      GITHUB_OUTPUT: resolve(directory, 'workflow-output') }
    const capture = (overrides = {}) => spawnSync(process.execPath, [cli, 'capture'], {
      cwd: directory, env: { ...env, ...overrides }, encoding: 'utf8' })
    assert.equal(capture().status, 0)
    const evidence = JSON.parse(readFileSync(resolve(directory, 'public-build-evidence.json'), 'utf8'))
    assert.equal(evidence.sourceSha, sourceSha)
    assert.equal(evidence.lockSha256, createHash('sha256').update(git('show', `${sourceSha}:package-lock.json`) + '\n').digest('hex'))
    assert.equal(existsSync(resolve(directory, 'node_modules')), false)
    assert.equal(existsSync(resolve(directory, 'lifecycle-ran')), false)
    // Same HEAD and lock, different source bytes must not be labelled exact.
    writeFileSync(resolve(directory, 'src/main.ts'), 'export const original = false\n')
    assert.notEqual(capture().status, 0)
    git('add', 'src/main.ts')
    assert.notEqual(capture().status, 0)
    writeFileSync(resolve(directory, 'src/main.ts'), 'export const original = true\n')
    assert.notEqual(capture().status, 0) // clean worktree bytes, dirty index
    git('add', 'src/main.ts')
    assert.equal(capture().status, 0)
    assert.notEqual(capture({ DP_APPLICATION_SHA: 'f'.repeat(40) }).status, 0)
    writeFileSync(resolve(directory, 'package-lock.json'), '{"lockfileVersion":2}\n')
    assert.notEqual(capture().status, 0)
    assert.equal(JSON.parse(readFileSync(resolve(directory, 'public-verification-error.json'), 'utf8')).completed, false)
    writeFileSync(resolve(directory, 'package-lock.json'), '{"lockfileVersion":3}\n')
    symlinkSync(resolve(directory, 'package-lock.json'), resolve(directory, 'dist/opaque'))
    assert.notEqual(capture().status, 0)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

const reviewed = JSON.parse(readFileSync(new URL('./dp-original-membership.json', import.meta.url), 'utf8'))
function originalReport() {
  const suites = []
  for (const [file, suite, title, projectName] of reviewed.tests) {
    let group = suites.find((item) => item.title === suite)
    if (!group) { group = { title: suite, specs: [] }; suites.push(group) }
    group.specs.push({ file, title, ok: true, tests: [{ projectName, expectedStatus: 'passed',
      status: 'expected', results: [{ status: 'passed', retry: 0, errors: [] }] }] })
  }
  return { suites, errors: [], stats: { expected: 10, unexpected: 0, skipped: 0, flaky: 0 } }
}

test('independently frozen original ten identities reject same-count replacement and omitted discovery', () => {
  const good = originalReport()
  verifyOriginalMembership(good, reviewed)
  assert.equal(verifyReport(good, good, 0).passed, 10)
  const changed = originalReport(); changed.suites[0].specs[0].title = 'replacement with the same count'
  assert.throws(() => verifyOriginalMembership(changed, reviewed))
  const missing = originalReport(); missing.suites[0].specs.pop()
  assert.throws(() => verifyOriginalMembership(missing, reviewed))
  const project = originalReport(); project.suites[0].specs[0].tests[0].projectName = 'webkit'
  assert.throws(() => verifyOriginalMembership(project, reviewed))
  assert.throws(() => verifyOriginalMembership(good, { ...reviewed, appSha: 'f'.repeat(40) }))
  assert.throws(() => verifyOriginalMembership(good, { ...reviewed, tests: [] }))
})

test('fully passing statistics cannot hide result, spec, test or global errors and unfinished retries', () => {
  const mutate = (change) => {
    const bad = originalReport(); change(bad, bad.suites[0].specs[0], bad.suites[0].specs[0].tests[0])
    assert.throws(() => verifyReport(originalReport(), bad, 0))
  }
  mutate((r) => { r.errors.push({ message: 'global browser error' }) })
  mutate((r, s) => { s.error = { message: 'spec error' } })
  mutate((r, s) => { s.ok = false })
  mutate((r, s, t) => { t.error = { message: 'test error' } })
  mutate((r, s, t) => { t.expectedStatus = 'failed' })
  mutate((r, s, t) => { t.status = 'flaky' })
  mutate((r, s, t) => { t.results = [] })
  mutate((r, s, t) => { t.results[0].retry = 1 })
  mutate((r, s, t) => { t.results[0].error = { message: 'result error' } })
  mutate((r, s, t) => { t.results[0].errors = [{ message: 'result error list' }] })
  mutate((r, s, t) => { t.results[0].errors = {} })
  mutate((r, s, t) => { t.results.push({ status: 'passed', retry: 1 }) })
})

test('every required stage must finish successfully, including outcome masked by continue-on-error', () => {
  const good = () => Object.fromEntries(requiredStages.map((stage) => [stage,
    { outcome: 'success', conclusion: 'success' }]))
  verifyStages(good())
  assert.throws(() => verifyStages(null))
  for (const stage of requiredStages) {
    const missing = good(); delete missing[stage]; assert.throws(() => verifyStages(missing))
    for (const state of ['failure', 'cancelled', 'skipped', 'pending', undefined]) {
      const bad = good(); bad[stage].outcome = state; assert.throws(() => verifyStages(bad))
      const masked = good(); masked[stage].conclusion = state; assert.throws(() => verifyStages(masked))
    }
  }
})

test('retained deployed-file evidence requires exact final URL, all files, hashes and byte counts', () => {
  const good = () => ({ ...identity, pageUrl: url, files: [{ ...manifest().files[0], status: 200,
    requestedUrl: url + 'index.html', finalUrl: url + 'index.html' }] })
  verifyFileReport(manifest(), identity, good(), url)
  const variants = [
    (r) => { r.files = [] }, (r) => { r.files.push(r.files[0]) },
    (r) => { r.files[0].finalUrl = 'https://example.com/index.html' },
    (r) => { r.files[0].requestedUrl += '?other=1' }, (r) => { r.files[0].status = 302 },
    (r) => { r.files[0].bytes++ }, (r) => { r.files[0].sha256 = 'f'.repeat(64) },
    (r) => { r.sourceSha = 'f'.repeat(40) }, (r) => { r.files[0].path = 'missing.html' },
  ]
  for (const change of variants) { const bad = good(); change(bad); assert.throws(() => verifyFileReport(manifest(), identity, bad, url)) }
})

test('mismatched fetched bytes are retained before the fail-closed comparison', async () => {
  const retained = []
  await assert.rejects(verifyFiles(manifest(), identity, url,
    async (requested) => ({ status: 200, url: requested, arrayBuffer: async () => Buffer.from('wrong bytes') }),
    (record, raw) => retained.push({ record, raw: Buffer.from(raw).toString() })))
  assert.equal(retained.length, 1)
  assert.equal(retained[0].raw, 'wrong bytes')
  assert.notEqual(retained[0].record.sha256, manifest().files[0].sha256)
})
