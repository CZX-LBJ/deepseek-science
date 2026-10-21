// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ScienceProjection } from '@deepseek-ai/dsh-tool-science/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Mock } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SciencePanel, type SciencePanelProps } from '../src/client/SciencePanel.tsx'
import type { ScienceCatalogSnapshot } from '../src/client/catalog.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const words = en

function projection(): ScienceProjection {
  return {
    project: null, papers: [], sources: [], skills: [], reading: null,
    metrics: {
      attempts: 0, uncachedInputTokens: null, cacheReadTokens: null,
      cacheWriteTokens: null, outputTokens: null, cacheReadRatio: null,
      totalMs: null, firstVisibleMs: null, estimatedCost: null, currency: null,
    },
  }
}

function catalogHook(snapshot: ScienceCatalogSnapshot): SciencePanelProps['useCatalog'] {
  return select => select(snapshot)
}

type OpenResource = ReturnType<SciencePanelProps['useTabInfo']>['tab']['actions']['openResource']

function props(value = projection()): SciencePanelProps & { openResource: Mock<OpenResource> } {
  const openResource = vi.fn<OpenResource>()
  return {
    sessionId: 's-science' as SessionId,
    useProjection: () => value,
    useSession: () => 'open',
    useSessions: (select: (state: object) => unknown) => select({ byId: { 's-science': { cwd: '/research' } } }),
    useTabInfo: () => ({ tab: { actions: { openResource } } }),
    useCatalog: catalogHook({ status: 'ready', skills: [], error: null }),
    loadCatalog: vi.fn(async () => {}),
    t: makeTranslate(en),
    openResource,
  } as SciencePanelProps & { openResource: Mock<OpenResource> }
}

describe('Science sidebar', () => {
  it('offers six research templates and displays the selected task without sending it', () => {
    render(<SciencePanel {...props()} />)
    for (const name of ['Literature review', 'Ideas and novelty', 'Experiment analysis', 'Writing and polishing', 'Scientific figures', 'Peer review']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Scientific figures' }))
    expect(screen.getByText(words['tasks.figures.prompt'])).toBeTruthy()
  })
  it('keeps unknown accounting explicit and explains how to start a project', () => {
    const p = props()
    render(<SciencePanel {...p} />)
    expect(screen.getByRole('heading', { name: 'Science' })).toBeTruthy()
    expect(screen.getByText(words['project.empty'])).toBeTruthy()
    expect(screen.getByText('Cost unknown')).toBeTruthy()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(3)
    expect(screen.queryByText('0%')).toBeNull()
    expect(screen.getByText(words['skills.empty'])).toBeTruthy()
  })

  it('replays the empty scientific state as explicit user-facing output', () => {
    const view = render(<SciencePanel {...props()} />)
    expect([...view.container.querySelectorAll('h1,h2,dt,dd,p')].map(node => node.textContent)).toMatchInlineSnapshot(`
      [
        "Science",
        "Projects, literature, skills and measured usage",
        "Start a research task",
        "Choose a template, fill in the topic or files, and send it in the conversation.",
        "Research project",
        "Describe your research task in the conversation to start a project.",
        "Literature",
        "Describe the topic to search in the conversation.",
        "Paper reading",
        "Provide a paper link or DOI to inspect available text and abstracts.",
        "Measured usage",
        "Settled attempts",
        "0",
        "Uncached input",
        "Unavailable",
        "Cache reads",
        "Unavailable",
        "Cache writes",
        "Unavailable",
        "Output",
        "Unavailable",
        "Cache read share",
        "Unavailable",
        "Total response time",
        "Unavailable",
        "First visible response",
        "Unavailable",
        "Estimated cost",
        "Cost unknown",
        "Skills",
        "Ask “show scientific skills” in the conversation to check skill readiness.",
      ]
    `)
  })

  it('shows measured buckets, latency and known cost without recalculating missing data', () => {
    const value = projection()
    value.metrics = {
      attempts: 3, uncachedInputTokens: 20, cacheReadTokens: 80, cacheWriteTokens: 0,
      outputTokens: 7, cacheReadRatio: 0.8, totalMs: 4500, firstVisibleMs: 125,
      estimatedCost: 0.0042, currency: 'USD',
    }
    render(<SciencePanel {...props(value)} />)
    expect(screen.getByText('80%')).toBeTruthy()
    expect(screen.getByText('4500 ms')).toBeTruthy()
    expect(screen.getByText('125 ms')).toBeTruthy()
    expect(screen.getByText('0.0042 USD')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('keeps an unreported cache share and unknown currency unavailable', () => {
    const value = projection()
    value.metrics.uncachedInputTokens = 20
    value.metrics.cacheReadTokens = 80
    value.metrics.estimatedCost = 0.0042
    render(<SciencePanel {...props(value)} />)
    expect(screen.queryByText('80%')).toBeNull()
    expect(screen.getByText('Cost unknown')).toBeTruthy()
  })

  it('offers instruction browsing before any scientific tool result exists', () => {
    const p = props()
    p.useProjection = () => undefined
    p.useCatalog = catalogHook({ status: 'ready', skills: [{ name: 'research-guide', description: 'Review research evidence', modelInvocable: true }], error: null })
    render(<SciencePanel {...p} />)
    expect(screen.getByText('research-guide')).toBeTruthy()
    expect(screen.getByText('Instruction catalog · requirements not checked')).toBeTruthy()
    expect(screen.queryByText('Supported')).toBeNull()
  })

  it('opens exact recorded project, artifact and cached-reading paths', () => {
    const value = projection()
    value.project = {
      schemaVersion: 1, id: 'project-1' as NonNullable<ScienceProjection['project']>['id'],
      revision: 2, title: 'Verified study', objective: 'Evaluate the claim',
      statePath: '/research/.science/project.json', currentPhase: 'design', status: 'active',
      createdAt: '2026-10-09', updatedAt: '2026-10-09',
      phases: [{ phase: 'design', status: 'completed', summary: 'Reviewed protocol', reason: '',
        artifacts: [{ path: '/research/results.md', sha256: 'abc', size: 40, snapshotPath: '/research/.science/snapshot.md' }],
        evidence: [{ claim: 'Bounded claim', artifact: '/research/results.md', locator: 'line 4', quote: 'Measured result', support: 'partial', depth: 'experiment' }],
      }],
    }
    value.reading = { ref: '10.1234/study', status: 'completed', depth: 'abstract-only', cachePath: '/research/.science/paper.md', excerpts: [{ locator: 'Abstract', text: 'Bounded paper excerpt' }] }
    const p = props(value)
    render(<SciencePanel {...p} />)
    expect(screen.getByText('Verified study')).toBeTruthy()
    expect(screen.getByText('Partially supported')).toBeTruthy()
    expect(screen.getByText('Abstract only')).toBeTruthy()
    for (const name of ['Open project record', 'Open artifact', 'Open cached reading']) fireEvent.click(screen.getByRole('button', { name }))
    expect(p.openResource.mock.calls.map(call => call[0])).toEqual([
      'dsh-resource://file/session/s-science/.science/project.json',
      'dsh-resource://file/session/s-science/results.md',
      'dsh-resource://file/session/s-science/.science/paper.md',
    ])
  })

  it('filters skill metadata locally and distinguishes catalog guidance from checked readiness', () => {
    const value = projection()
    value.skills = [{ name: 'evidence-audit', description: 'Read claim evidence', source: 'Imported source', license: 'MIT', status: 'needs-setup', requirements: ['Python'], path: '/research/skills/audit/SKILL.md' }]
    const p = props(value)
    p.useCatalog = catalogHook({ status: 'ready', skills: [{ name: 'literature', description: 'Search papers', modelInvocable: true, path: '/research/skills/literature/SKILL.md' }], error: null })
    render(<SciencePanel {...p} />)
    expect(screen.getByText('Setup required')).toBeTruthy()
    expect(screen.getByText('Instruction catalog · requirements not checked')).toBeTruthy()
    expect(screen.getByText('Imported source')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search skills' }), { target: { value: 'Python' } })
    expect(screen.getByText('evidence-audit')).toBeTruthy()
    expect(screen.queryByText('literature')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open source' }))
    expect(p.openResource).toHaveBeenCalledWith('dsh-resource://file/session/s-science/skills/audit/SKILL.md')
  })

  it('keeps source failures visible and exposes only HTTP(S) paper links', () => {
    const value = projection()
    value.sources = [{ source: 'Crossref', status: 'failed', count: 0, error: 'Source timeout' }]
    value.papers = [
      { id: 'p1', title: 'Safe paper', url: 'https://example.org/paper', doi: null, arxivId: null, year: 2024 },
      { id: 'p2', title: 'Unsafe paper', url: 'javascript:alert(1)', doi: null, arxivId: null, year: null },
    ]
    render(<SciencePanel {...props(value)} />)
    expect(screen.getByText('Source timeout')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Safe paper' }).getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.queryByRole('link', { name: 'Unsafe paper' })).toBeNull()
    expect(screen.getByText('Unsafe paper')).toBeTruthy()
  })

  it('waits for the Session opening before loading instruction metadata', () => {
    const p = props()
    p.useCatalog = catalogHook({ status: 'idle', skills: [], error: null })
    p.useSession = (() => 'opening') as SciencePanelProps['useSession']
    const view = render(<SciencePanel {...p} />)
    expect(p.loadCatalog).not.toHaveBeenCalled()
    p.useSession = (() => 'open') as SciencePanelProps['useSession']
    view.rerender(<SciencePanel {...p} />)
    expect(p.loadCatalog).toHaveBeenCalledOnce()
  })

  it('reports reading setup requirements without implying successful retrieval', () => {
    const value = projection()
    value.reading = { ref: 'scanned-paper', depth: 'unavailable', status: 'needs-setup', cachePath: null, excerpts: [] }
    render(<SciencePanel {...props(value)} />)
    expect(screen.getByText('Setup required')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open cached reading' })).toBeNull()
  })

  it('renders both dictionaries with no untranslated status keys', () => {
    for (const dictionary of [zh, en]) {
      const p = props()
      p.t = makeTranslate(dictionary)
      const view = render(<SciencePanel {...p} />)
      expect(screen.getByRole('heading', { name: dictionary['panel.title'] })).toBeTruthy()
      expect(view.container.textContent).not.toMatch(/metrics\.|skills\.|phaseStatus\./u)
      view.unmount()
    }
  })
})
