/** Scientific workbench in the existing Session-scoped right sidebar. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-tool-science/client'
import { IconSkillOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { SciencePanel, ScienceTitle } from './SciencePanel.tsx'
import { ScienceCatalog, type ScienceCatalogInjected } from './catalog.ts'
import { en, zh, type ScienceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { science: ScienceKey }
}

/** Client services used by the sidebar and the instruction-catalog read. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.skills']

/**
 * Register the page and its dictionaries for this plugin's lifetime.
 * @param ctx - browser context with the existing sidebar and generated Remote services.
 */
export function apply(ctx: Context): void {
  const id = '@deepseek-ai/dsh-client-ui-science'
  const namespace = 'science'
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'ui-science: dictionaries')
  const t = ctx.locale.bind(namespace)
  const catalogs = new Map<SessionId, ScienceCatalog>()
  const catalogFor = (sessionId: SessionId): ScienceCatalog => {
    const existing = catalogs.get(sessionId)
    if (existing !== undefined) return existing
    const catalog = new ScienceCatalog(sessionId, ctx.remote.skills)
    catalogs.set(sessionId, catalog)
    return catalog
  }
  ctx.effect(() => async () => {
    const pending = [...catalogs.values()].map(catalog => catalog.dispose())
    catalogs.clear()
    await Promise.all(pending)
  }, 'ui-science: catalog lifetime')
  ctx.on('connection/reset', () => { for (const catalog of catalogs.values()) catalog.invalidate() })
  ctx.effect(() => ctx.remote.$on('agent-preset/selected', (sessionId) => { catalogs.get(sessionId)?.invalidate() }), 'ui-science: preset invalidation')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id, kind: 'science', priority: 'builtin', title: () => t('panel.title'),
    guide: [{ id: 'science', order: 20, title: () => t('panel.title'), description: () => t('panel.description'), icon: IconSkillOutlineRegular }],
  }), 'ui-science: sidebar type')
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: id, locale: namespace,
    inject: (sessionId: SessionId): ScienceCatalogInjected => {
      const catalog = catalogFor(sessionId)
      return { hooks: { catalog: catalog.source }, loadCatalog: catalog.load }
    },
  }, SciencePanel))
  ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: id, locale: namespace,
  }, ScienceTitle))
}
