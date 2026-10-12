import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Adapted from Frozen Heart's reviewed 2cd32d2 verifier. The app SHA is
// deliberately distinct from the temporary verification workflow SHA.
const repository = 'systemslibrarian/crypto-lab-dp-noise'
const appSha = '1a71ad1030045c5ac66c674442823d1bc81ece95'
const toolDirectory = resolve(new URL('.', import.meta.url).pathname)
const evidenceDirectory = () => resolve(process.env.DP_EVIDENCE_DIRECTORY ?? 'verification-results')
const save = (name, value) => writeFileSync(resolve(evidenceDirectory(), name), `${JSON.stringify(value, null, 2)}\n`)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const requireEvidence = (condition, message) => { if (!condition) throw new Error(message) }

export function deploymentUrl(value) {
  const url = new URL(value)
  requireEvidence(url.protocol === 'https:' && url.hostname === 'systemslibrarian.github.io'
    && url.pathname === '/crypto-lab-dp-noise/' && !url.port && !url.username
    && !url.password && !url.search && !url.hash, 'Unexpected deployment URL')
  return url.href
}

function sourceIdentity(directory = process.cwd()) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim()
  requireEvidence(/^[a-f0-9]{40}$/.test(sha) && sha === process.env.DP_APPLICATION_SHA,
    'Checkout does not match the application source SHA')
  requireEvidence(process.env.GITHUB_REPOSITORY === repository, 'Unexpected repository')
  // HEAD alone does not establish the bytes being built/tested. This checks
  // both staged and unstaged tracked changes; unreadable Git state fails too.
  execFileSync('git', ['diff', '--quiet', '--no-ext-diff', 'HEAD', '--'], { cwd: directory })
  execFileSync('git', ['diff', '--quiet', '--cached', '--no-ext-diff', 'HEAD', '--'], { cwd: directory })
  const capturedLock = execFileSync('git', ['show', `${sha}:package-lock.json`], { cwd: directory })
  requireEvidence(sha256(readFileSync(resolve(directory, 'package-lock.json'))) === sha256(capturedLock),
    'Working lock differs from the immutable source lock')
  return { repository, sourceSha: sha, lockSha256: sha256(capturedLock) }
}

function workflowIdentity() {
  const directory = resolve(toolDirectory, '..')
  const workflowSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim()
  requireEvidence(/^[a-f0-9]{40}$/.test(workflowSha) && workflowSha === process.env.GITHUB_SHA,
    'Verifier checkout does not match the workflow SHA')
  execFileSync('git', ['diff', '--quiet', '--no-ext-diff', 'HEAD', '--'], { cwd: directory })
  execFileSync('git', ['diff', '--quiet', '--cached', '--no-ext-diff', 'HEAD', '--'], { cwd: directory })
  return { workflowSha, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT }
}

function artifactFiles(directory, relative = '') {
  return readdirSync(resolve(directory, relative), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
      const path = relative ? `${relative}/${entry.name}` : entry.name
      requireEvidence(!entry.isSymbolicLink(), `Opaque artifact entry: ${path}`)
      if (entry.isDirectory()) return artifactFiles(directory, path)
      requireEvidence(entry.isFile(), `Unreadable artifact entry: ${path}`)
      const bytes = readFileSync(resolve(directory, path))
      return [{ path, bytes: bytes.length, sha256: sha256(bytes) }]
    })
}

export function validateManifest(manifest, identity) {
  requireEvidence(identity?.repository === repository && /^[a-f0-9]{40}$/.test(identity.sourceSha)
    && /^[a-f0-9]{64}$/.test(identity.lockSha256), 'Missing or malformed source identity')
  requireEvidence(manifest?.version === 1 && manifest.repository === identity.repository
    && manifest.sourceSha === identity.sourceSha && manifest.lockSha256 === identity.lockSha256,
  'Build evidence does not match the checked-out source and lock')
  requireEvidence(Array.isArray(manifest.files) && manifest.files.length > 0
    && manifest.files.some((file) => file.path === 'index.html'), 'Missing build files')
  const paths = new Set()
  for (const file of manifest.files) {
    requireEvidence(typeof file.path === 'string' && file.path !== ''
      && !file.path.startsWith('/') && !file.path.includes('\\')
      && !file.path.split('/').some((part) => part === '' || part === '.' || part === '..')
      && !/[\u0000-\u001f]/.test(file.path) && !paths.has(file.path), 'Invalid or duplicate artifact path')
    requireEvidence(Number.isSafeInteger(file.bytes) && file.bytes >= 0
      && /^[a-f0-9]{64}$/.test(file.sha256), 'Unreadable artifact hash or size')
    paths.add(file.path)
  }
  return manifest
}

export async function verifyFiles(manifest, identity, pageUrl, fetchFile = fetch, retain = () => {}) {
  validateManifest(manifest, identity)
  const base = deploymentUrl(pageUrl)
  requireEvidence(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification is disabled')
  const files = []
  for (const file of manifest.files) {
    const url = new URL(file.path.split('/').map(encodeURIComponent).join('/'), base).href
    const response = await fetchFile(url, { redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(30_000) })
    const bytes = new Uint8Array(await response.arrayBuffer())
    const actual = { path: file.path, requestedUrl: url, finalUrl: response.url,
      status: response.status, bytes: bytes.length, sha256: sha256(bytes) }
    retain(actual, bytes, [...files, actual])
    requireEvidence(response.status === 200 && response.url === url, `Unreadable deployed file: ${file.path}`)
    requireEvidence(actual.bytes === file.bytes && actual.sha256 === file.sha256,
      `Deployment differs from this build: ${file.path}`)
    files.push(actual)
  }
  return { version: 1, ...identity, pageUrl: base, verifiedAt: new Date().toISOString(), files }
}

function testsIn(report) {
  requireEvidence(report && Array.isArray(report.suites) && Array.isArray(report.errors)
    && report.errors.length === 0, 'Missing, malformed or errored browser report')
  const tests = []
  function visit(suites, parents = []) {
    for (const suite of suites) {
      requireEvidence(Array.isArray(suite.specs), 'Malformed browser suite')
      for (const spec of suite.specs) {
        requireEvidence(typeof spec.file === 'string' && typeof spec.title === 'string'
          && Array.isArray(spec.tests) && spec.tests.length > 0, 'Malformed browser spec')
        for (const test of spec.tests) {
          requireEvidence(typeof test.projectName === 'string', 'Missing browser project identity')
          tests.push({ key: JSON.stringify([spec.file, ...parents, suite.title, spec.title,
            test.projectName]), spec, test })
        }
      }
      if (suite.suites) visit(suite.suites, [...parents, suite.title])
    }
  }
  visit(report.suites)
  requireEvidence(tests.length > 0 && new Set(tests.map((test) => test.key)).size === tests.length,
    'Empty or duplicate browser membership')
  return tests
}

export function verifyReport(discovery, report, exitCode) {
  requireEvidence(exitCode === 0, 'Browser process did not succeed')
  const expected = testsIn(discovery), actual = testsIn(report)
  requireEvidence(expected.length === 10, 'Unexpected original full-suite membership; review the gate')
  const keys = new Set(expected.map((test) => test.key))
  requireEvidence(actual.length === expected.length && actual.every((test) => keys.has(test.key)),
    'Incomplete or changed browser membership')
  requireEvidence(report.stats?.expected === actual.length && report.stats.unexpected === 0
    && report.stats.skipped === 0 && report.stats.flaky === 0, 'Browser results are not fully successful')
  for (const { spec, test } of actual) {
    requireEvidence(spec.ok === true && test.expectedStatus === 'passed' && test.status === 'expected'
      && !spec.error && !test.error
      && (spec.errors === undefined || (Array.isArray(spec.errors) && spec.errors.length === 0))
      && (test.errors === undefined || (Array.isArray(test.errors) && test.errors.length === 0))
      && Array.isArray(test.results) && test.results.length === 1
      && test.results.every((result) => result.status === 'passed' && result.retry === 0 && !result.error
        && (result.errors === undefined || (Array.isArray(result.errors) && result.errors.length === 0))),
      'Failed, skipped, unreadable, retried or unfinished test')
  }
  return { verifiedAt: new Date().toISOString(), expected: expected.length, passed: actual.length }
}

export function verifyOriginalMembership(discovery, reviewed) {
  requireEvidence(reviewed?.appSha === appSha && Array.isArray(reviewed.tests)
    && reviewed.tests.length === 10 && new Set(reviewed.tests.map((test) => JSON.stringify(test))).size === 10,
    'Missing reviewed original ten-test membership')
  const expected = new Set(reviewed.tests.map((test) => JSON.stringify(test)))
  const discovered = testsIn(discovery)
  requireEvidence(discovered.length === 10 && discovered.every(({ key }) => expected.has(key)),
    'Discovery differs from the independently reviewed original ten tests')
}

export const requiredStages = ['checkout_verifier', 'checkout_app', 'node', 'identity',
  'controls', 'install', 'browsers', 'files', 'discovery', 'browser']

export function verifyStages(stages) {
  requireEvidence(stages && typeof stages === 'object', 'Missing workflow stage evidence')
  for (const stage of requiredStages) {
    requireEvidence(stages[stage]?.outcome === 'success' && stages[stage]?.conclusion === 'success',
      `Missing, unfinished, failed, skipped or masked stage: ${stage}`)
  }
}

export function verifyFileReport(manifest, identity, report, pageUrl) {
  validateManifest(manifest, identity)
  const base = deploymentUrl(pageUrl)
  requireEvidence(report?.repository === identity.repository && report.sourceSha === identity.sourceSha
    && report.lockSha256 === identity.lockSha256 && report.pageUrl === base
    && Array.isArray(report.files) && report.files.length === manifest.files.length,
    'Missing or stale deployed-file evidence')
  const seen = new Set()
  for (const actual of report.files) {
    const expected = manifest.files.find((file) => file.path === actual.path)
    requireEvidence(expected && !seen.has(actual.path), 'Missing, additional or duplicate deployed file')
    seen.add(actual.path)
    const url = new URL(actual.path.split('/').map(encodeURIComponent).join('/'), base).href
    requireEvidence(actual.status === 200 && actual.requestedUrl === url && actual.finalUrl === url
      && actual.bytes === expected.bytes && actual.sha256 === expected.sha256,
      'Deployed URL, hash or byte count differs from the artifact')
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'capture') {
    const identity = sourceIdentity()
    const manifest = validateManifest({ version: 1, ...identity, files: artifactFiles('dist') }, identity)
    writeFileSync('public-build-evidence.json', `${JSON.stringify(manifest, null, 2)}\n`)
    requireEvidence(process.env.GITHUB_OUTPUT, 'Missing workflow output destination')
    appendFileSync(process.env.GITHUB_OUTPUT, `evidence=${JSON.stringify(manifest)}\n`)
  } else if (command === 'identity') {
    const identity = sourceIdentity()
    requireEvidence(identity.sourceSha === appSha, 'Wrong application SHA')
    save('verification-identity.json', { ...identity, ...workflowIdentity() })
    const config = `import original from './playwright.config'\n\n// Only server, public base URL and report destination differ.\nexport default { ...original, webServer: undefined,\n  reporter: [['list'], ['json', { outputFile: process.env.DP_EVIDENCE_DIRECTORY + '/public-browser-results.json' }]],\n  use: { ...original.use, baseURL: '${deploymentUrl(process.env.PUBLIC_DEPLOYMENT_URL)}' },\n}\n`
    writeFileSync('playwright.public.config.ts', config)
    writeFileSync(resolve(evidenceDirectory(), 'playwright.public.config.ts'), config)
  } else if (command === 'files') {
    const identity = sourceIdentity()
    const manifest = JSON.parse(readFileSync(resolve(toolDirectory, 'dp-deployment-evidence.json'), 'utf8'))
    const results = await verifyFiles(manifest, identity, process.env.PUBLIC_DEPLOYMENT_URL, fetch,
      (actual, bytes, progress) => {
        // Flat names preserve all downloaded bytes, including a failed comparison.
        writeFileSync(resolve(evidenceDirectory(), `download-${actual.path.replaceAll('/', '_')}`), bytes)
        save('public-file-progress.json', { completed: false, files: progress })
      })
    save('public-file-results.json', results)
  } else if (command === 'report') {
    const stages = JSON.parse(process.env.DP_STAGE_EVIDENCE)
    save('workflow-stage-results.json', stages)
    verifyStages(stages)
    const identity = sourceIdentity(resolve(args[0] ?? '.')), workflow = workflowIdentity()
    requireEvidence(identity.sourceSha === appSha, 'Wrong application SHA')
    const read = (name) => JSON.parse(readFileSync(resolve(evidenceDirectory(), name), 'utf8'))
    const discovered = read('public-test-membership.json')
    verifyOriginalMembership(discovered, JSON.parse(readFileSync(resolve(toolDirectory, 'dp-original-membership.json'), 'utf8')))
    const results = verifyReport(discovered, read('public-browser-results.json'), 0)
    verifyFileReport(JSON.parse(readFileSync(resolve(toolDirectory, 'dp-deployment-evidence.json'), 'utf8')),
      identity, read('public-file-results.json'), process.env.PUBLIC_DEPLOYMENT_URL)
    save('public-verification-results.json', { completed: true, ...identity, ...workflow,
      pageUrl: deploymentUrl(process.env.PUBLIC_DEPLOYMENT_URL), ...results })
    console.log(JSON.stringify(results))
  } else throw new Error('Use capture, files or report')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const errorRecord = { completed: false, stage: process.argv[2],
      expectedApplicationSha: process.env.DP_APPLICATION_SHA ?? null,
      expectedWorkflowSha: process.env.GITHUB_SHA ?? null,
      recordedAt: new Date().toISOString(), error: error.message }
    // Capture controls intentionally use an isolated temporary directory.
    const destination = process.argv[2] === 'capture' ? 'public-verification-error.json'
      : resolve(evidenceDirectory(), `public-verification-error-${process.argv[2]}.json`)
    writeFileSync(destination, `${JSON.stringify(errorRecord, null, 2)}\n`)
    console.error(error.message)
    process.exitCode = 1
  })
}
