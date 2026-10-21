/** Recorded scientific work and measured accounting for the tab's Session. */
import { useEffect, useMemo, useState } from 'react'
import { Button, IconSkillOutlineRegular, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScienceMetrics, ScienceProjection, ScienceSkillView } from '@deepseek-ai/dsh-tool-science/client'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from './index.ts'
import type { ScienceCatalogInjected } from './catalog.ts'
import css from './SciencePanel.module.css'

/** Framework-derived Session, tab, locale and catalog props. */
export type SciencePanelProps = PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<'science'> & InjectFace<ScienceCatalogInjected>

type Translate = SciencePanelProps['t']
type Project = NonNullable<ScienceProjection['project']>
const taskKinds = ['literature', 'ideas', 'analysis', 'writing', 'figures', 'review'] as const

function safePaperUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.username === '' && url.password === ''
      ? url.href : undefined
  } catch (_invalidAddress) {
    return undefined
  }
}

function skillMatches(skill: ScienceSkillView | SkillEntry, query: string): boolean {
  const details = 'requirements' in skill ? [skill.source, skill.license, ...skill.requirements] : []
  return [skill.name, skill.description, ...details].join(' ').toLocaleLowerCase().includes(query)
}

function readingStatus(status: string, t: Translate): string {
  if (status === 'ready') return t('reading.ready')
  if (status === 'needs-setup') return t('skills.needs-setup')
  if (status === 'unavailable') return t('reading.statusUnavailable')
  if (status === 'completed' || status === 'partial' || status === 'failed') return t(`source.${status}`)
  return status
}

function Metrics({ metrics, t }: { metrics: ScienceMetrics; t: Translate }) {
  const number = (value: number | null): string => value === null ? t('metrics.unavailable') : String(value)
  const duration = (value: number | null): string => value === null ? t('metrics.unavailable') : t('metrics.ms', { count: Math.round(value) })
  const ratio = metrics.cacheReadRatio === null ? t('metrics.unavailable')
    : t('metrics.percent', { percent: Number((metrics.cacheReadRatio * 100).toFixed(1)) })
  const cost = metrics.estimatedCost === null || metrics.currency === null ? t('metrics.costUnknown')
    : t('metrics.costValue', { cost: metrics.estimatedCost, currency: metrics.currency })
  return <section className={css.section} aria-label={t('metrics.title')}>
    <h2>{t('metrics.title')}</h2>
    <dl className={css.metrics}>
      <dt>{t('metrics.attempts')}</dt><dd>{metrics.attempts}</dd>
      <dt>{t('metrics.uncached')}</dt><dd>{number(metrics.uncachedInputTokens)}</dd>
      <dt>{t('metrics.cacheRead')}</dt><dd>{number(metrics.cacheReadTokens)}</dd>
      <dt>{t('metrics.cacheWrite')}</dt><dd>{number(metrics.cacheWriteTokens)}</dd>
      <dt>{t('metrics.output')}</dt><dd>{number(metrics.outputTokens)}</dd>
      <dt>{t('metrics.cacheRatio')}</dt><dd>{ratio}</dd>
      <dt>{t('metrics.totalMs')}</dt><dd>{duration(metrics.totalMs)}</dd>
      <dt>{t('metrics.firstVisibleMs')}</dt><dd>{duration(metrics.firstVisibleMs)}</dd>
      <dt>{t('metrics.cost')}</dt><dd>{cost}</dd>
    </dl>
  </section>
}

function ProjectDetails({ project, t, openPath }: { project: Project; t: Translate; openPath: (path: string) => void }) {
  return <>
    <div className={css.row}>
      <h3>{project.title}</h3>
      <Tag tone={project.status === 'completed' ? 'success' : 'info'}>{t(`project.${project.status}`)}</Tag>
    </div>
    <p>{project.objective}</p>
    <div className={css.row}>
      <span className={css.secondary}>{t(`phase.${project.currentPhase}`)} · {t('project.revision', { revision: project.revision })}</span>
      <Button size="sm" onClick={() => { openPath(project.statePath) }}>{t('action.openProject')}</Button>
    </div>
    <ol className={css.phases}>
      {project.phases.map(phase => <li key={phase.phase} className={css.phase}
        data-current={phase.phase === project.currentPhase || undefined}>
        <div className={css.row}><h3>{t(`phase.${phase.phase}`)}</h3><Tag tone={phase.status === 'failed' ? 'danger' : 'neutral'}>{t(`phaseStatus.${phase.status}`)}</Tag></div>
        {phase.summary !== '' && <p>{phase.summary}</p>}
        {phase.reason !== '' && <p className={css.secondary}>{phase.reason}</p>}
        {phase.artifacts.length > 0 && <ul className={css.artifacts} aria-label={t('project.artifacts')}>
          {phase.artifacts.map(artifact => <li key={artifact.path} className={css.artifact}>
            <span className={css.path}>{artifact.path}</span>
            <Button size="sm" onClick={() => { openPath(artifact.path) }}>{t('action.openArtifact')}</Button>
          </li>)}
        </ul>}
        {phase.evidence.length > 0 && <ul className={css.evidence} aria-label={t('project.evidence')}>
          {phase.evidence.map((evidence, index) => <li key={`${evidence.artifact}:${evidence.locator}:${index}`}>
            <p>{evidence.claim}</p>
            <span className={css.secondary}>{t('evidence.assessment')}</span>
            <Tag tone={evidence.support === 'unsupported' ? 'warning' : 'neutral'}>{t(`evidence.${evidence.support}`)}</Tag>
            <span className={css.secondary}>{evidence.artifact} · {evidence.locator}</span>
            <blockquote className={css.excerpt}><p>{evidence.quote}</p><cite>{t(`evidence.${evidence.depth}`)}</cite></blockquote>
          </li>)}
        </ul>}
      </li>)}
    </ol>
  </>
}

/**
 * Render persisted project data and actual metrics through framework hooks.
 * @param props - Session-bound tab data, instruction read callback and localized copy.
 * @returns the scientific workbench, including explicit missing-data states.
 */
export function SciencePanel({
  sessionId, useSession, useProjection, useSessions, useTabInfo, useCatalog, loadCatalog, t,
}: SciencePanelProps) {
  const science = useProjection('science')
  const openState = useSession(state => state.openState)
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const tab = useTabInfo()
  const catalog = useCatalog(state => state)
  const [query, setQuery] = useState('')
  const [task, setTask] = useState<typeof taskKinds[number] | null>(null)
  useEffect(() => { if (openState === 'open' && catalog.status === 'idle') void loadCatalog() }, [openState, catalog.status, loadCatalog])
  const openPath = (path: string): void => { tab.tab.actions.openResource(fileAddressFor(sessionId, cwd, path)) }
  const knownSkills = science?.skills ?? []
  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase()
    const known = new Set(knownSkills.map(skill => skill.name))
    return {
      checked: knownSkills.filter(skill => skillMatches(skill, text)),
      guidance: catalog.skills.filter(skill => !known.has(skill.name) && skillMatches(skill, text)),
    }
  }, [knownSkills, catalog.skills, query])

  return <div className={css.page}>
    <header className={css.header}><h1>{t('panel.title')}</h1><p>{t('panel.description')}</p></header>
    <section className={css.section} aria-label={t('tasks.title')}>
      <h2>{t('tasks.title')}</h2><p className={css.secondary}>{t('tasks.help')}</p>
      <div className={css.row}>{taskKinds.map(kind => <Button key={kind} size="sm"
        onClick={() => { setTask(kind) }}>{t(`tasks.${kind}`)}</Button>)}</div>
      {task !== null && <blockquote className={css.excerpt}><p>{t(`tasks.${task}.prompt`)}</p></blockquote>}
    </section>
    {science === undefined ? <p role="status">{t('panel.unavailable')}</p> : <>
      <section className={css.section} aria-label={t('project.title')}>
        <h2>{t('project.title')}</h2>
        {science.project === null ? <p className={css.empty}>{t('project.empty')}</p> : <ProjectDetails project={science.project} t={t} openPath={openPath} />}
      </section>
      <section className={css.section} aria-label={t('papers.title')}>
        <h2>{t('papers.title')}</h2>
        {science.sources.length > 0 && <ul className={css.sources}>
          {science.sources.map(source => <li key={source.source}>
            <div className={css.row}><span>{source.source}</span><Tag tone={source.status === 'failed' ? 'danger' : 'neutral'}>{t(`source.${source.status}`)}</Tag><span className={css.secondary}>{t('papers.count', { count: source.count })}</span></div>
            {source.error !== null && <p className={css.secondary}>{source.error}</p>}
          </li>)}
        </ul>}
        {science.papers.length === 0 ? <p className={css.empty}>{t('papers.empty')}</p> : <ul className={css.papers}>
          {science.papers.map((paper) => {
            const href = safePaperUrl(paper.url)
            return <li key={paper.id}>
              {href === undefined ? <span>{paper.title}</span> : <a href={href} target="_blank" rel="noopener noreferrer">{paper.title}</a>}
              <p className={css.secondary}>{[paper.year, paper.doi ?? paper.arxivId].filter(value => value !== null).join(' · ')}</p>
            </li>
          })}
        </ul>}
      </section>
      <section className={css.section} aria-label={t('reading.title')}>
        <h2>{t('reading.title')}</h2>
        {science.reading === null ? <p className={css.empty}>{t('reading.empty')}</p> : <>
          <div className={css.row}><span className={css.path}>{science.reading.ref}</span><Tag tone={science.reading.depth === 'full-text' ? 'info' : 'neutral'}>{t(`reading.${science.reading.depth}`)}</Tag></div>
          <p className={css.secondary}>{readingStatus(science.reading.status, t)}</p>
          {science.reading.cachePath !== null && <Button size="sm" onClick={() => { if (science.reading?.cachePath) openPath(science.reading.cachePath) }}>{t('action.openReading')}</Button>}
          {science.reading.excerpts.map((excerpt, index) => <blockquote className={css.excerpt} key={`${excerpt.locator}:${index}`}><p>{excerpt.text}</p><cite>{excerpt.locator}</cite></blockquote>)}
        </>}
      </section>
      <Metrics metrics={science.metrics} t={t} />
    </>}
    <section className={css.section} aria-label={t('skills.title')} aria-busy={catalog.status === 'loading'}>
      <h2>{t('skills.title')}</h2>
      <div className={css.search}><Input value={query} onChange={(event) => { setQuery(event.target.value) }} aria-label={t('skills.search')} placeholder={t('skills.search')} /></div>
      {knownSkills.length === 0 && <p className={css.empty}>{t('skills.empty')}</p>}
      {catalog.status === 'failed' && <div role="status" className={css.catalogFailure}><p>{t('skills.catalogFailed')}</p><p className={css.secondary}>{catalog.error}</p><Button size="sm" onClick={() => { void loadCatalog() }}>{t('skills.retry')}</Button></div>}
      <ul className={css.skills}>
        {filtered.checked.map(skill => <li key={skill.name}>
          <div className={css.row}><h3>{skill.name}</h3><Tag tone={skill.status === 'support' ? 'success' : skill.status === 'needs-setup' ? 'warning' : 'neutral'}>{t(`skills.${skill.status}`)}</Tag></div>
          <p>{skill.description}</p>
          <dl className={css.skillDetails}><dt>{t('skills.source')}</dt><dd>{skill.source}</dd><dt>{t('skills.license')}</dt><dd>{skill.license}</dd>
            {skill.requirements.length > 0 && <><dt>{t('skills.requirements')}</dt><dd>{skill.requirements.join(' · ')}</dd></>}
          </dl>
          {skill.path !== null && <Button size="sm" onClick={() => { if (skill.path !== null) openPath(skill.path) }}>{t('action.openSource')}</Button>}
        </li>)}
        {filtered.guidance.map(skill => <li key={skill.name}>
          <h3>{skill.name}</h3><p>{skill.description}</p><p className={css.secondary}>{t('skills.catalog')}</p>
          {skill.path !== undefined && <Button size="sm" onClick={() => { if (skill.path !== undefined) openPath(skill.path) }}>{t('action.openSource')}</Button>}
        </li>)}
      </ul>
      {query.trim() !== '' && filtered.checked.length + filtered.guidance.length === 0 && <p className={css.empty}>{t('skills.noMatches')}</p>}
    </section>
  </div>
}

/**
 * Supply the registered page's existing skill glyph and localized tab title.
 * @param props - framework-localized sidebar title props.
 * @returns the title content without creating another navigation surface.
 */
export function ScienceTitle({ t }: PropsRuntime<'sidebar.right.pane.tab.title'> & PropsLocale<'science'>) {
  return <><IconSkillOutlineRegular size={16} />{t('panel.title')}</>
}
