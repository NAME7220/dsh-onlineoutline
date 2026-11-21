/**
 * Question outline — a scrollable list of this conversation's questions on the
 * right edge, replacing the built-in turn tick rail.
 *
 * Data comes from the `turnOutline` session projection, which the slot hands to
 * contributors as the `useProjection` runtime prop. Each entry is
 * `{ turn, seq, prompt, response }`.
 *
 * Three pieces are intentionally coupled to built-in artifacts and must be
 * re-checked after a DSH upgrade:
 *   1. `RAIL_FRAME` — the hashed class of the built-in tick rail we hide.
 *   2. `[data-turn-tail]` — the per-turn marker used for jumping, for tracking
 *      the turn being read, and for measuring the conversation column's width.
 *   3. `[data-conversation-scroll]` — the conversation scroll container.
 */
window.__ModuleLoader__.load({
  id: 'dsh-onlineoutline',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement

    /** Built-in tick rail container. Hashed build artifact; verify after upgrades. */
    const RAIL_FRAME = '.SNx2jG_frame'
    /** Scroll box of the built-in rail; its marks carry data-index. */
    const RAIL_SCROLLER = '.SNx2jG_scroller'
    /** Vertical step between built-in rail marks, in px. */
    const RAIL_SPACING = 10
    /** Marker the chat renderer puts on each turn's tail node. */
    const TURN_MARKER = '[data-turn-tail]'
    const SCROLLER = '[data-conversation-scroll]'

    const ROW_HEIGHT = 28
    const PANEL_WIDTH = 240
    const PANEL_MAX_HEIGHT = 240
    /**
     * Width of the collapsed tick strip: the 6px scrollbar box plus the 30px tick
     * slot, with a couple of pixels of slack so the pill is never clipped.
     */
    const COLLAPSED_WIDTH = 42
    /** Gap between the panel and the conversation area's right edge. */
    const PANEL_OFFSET_RIGHT = 18
    /** Hover preview card width, matching the built-in turn preview. */
    const PREVIEW_WIDTH = 300
    /** Clearance the collapsed strip must keep from the conversation column. */
    const MIN_CONTENT_GAP = 18
    /** Hard floor for the conversation area, regardless of column measurements. */
    const MIN_AREA_WIDTH = 420
    /** Viewport width below which the built-in left sidebar is collapsed first. */
    const SIDEBAR_COLLAPSE_BELOW = 1080
    /** Viewport width above which a later narrow crossing may collapse again. */
    const SIDEBAR_RESTORE_ABOVE = 1220
    /**
     * A collapsed sidebar leaves the conversation starting near the left edge.
     * When the conversation's left offset is below this, the sidebar is closed.
     * (The host renders no reliable `data-sidebar-collapsed` attribute: it only
     * appears inside a titlebar CSS selector, so state is read from layout.)
     */
    const SIDEBAR_COLLAPSED_MAX_LEFT = 140
    /** Treat the view as "at the bottom" within this many pixels. */
    const BOTTOM_EPSILON = 8

    const CSS = `
/* The built-in rail stays laid out but invisible: its marks are virtualised, and
   a display:none box reports zero height, which stops them from rendering — and
   those marks are what drive the host's own turn navigation. */
${RAIL_FRAME} { opacity: 0 !important; pointer-events: none !important; }
/* Collapsed by default: the same list, rendered as a compact tick rail. Rows
   keep their spacing and count, so the strip is a miniature of the outline.
   Expands on hover or keyboard focus. */
.to-outline {
  position: fixed;
  right: ${PANEL_OFFSET_RIGHT}px;
  top: 50%;
  transform: translateY(-50%);
  width: ${COLLAPSED_WIDTH}px;
  max-height: ${PANEL_MAX_HEIGHT}px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  border-radius: 12px;
  background: transparent;
  border: 0.5px solid transparent;
  box-shadow: none;
  backdrop-filter: none;
  z-index: 60;
}
.to-outline:hover,
.to-outline:focus-within {
  width: ${PANEL_WIDTH}px;
  background: var(--dsw-alias-bg-layer-1, rgba(32, 32, 32, 0.98));
  border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.28));
}
/* The backdrop blur lives on its own layer behind the content: applying it to
   the panel itself puts every child in one composited layer, which flattens the
   pill caps of the dashes. */
.to-outline::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  backdrop-filter: blur(8px);
  opacity: 0;
  pointer-events: none;
  z-index: -1;
}
.to-outline:hover::before,
.to-outline:focus-within::before {
  opacity: 1;
}
.to-outline__list {
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  /* Always reserve the scrollbar gutter. Without this the browser drops it when
     the list does not scroll (few turns), which shifts every right-aligned dash
     by 6px compared with a long list. */
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, rgba(255, 255, 255, 0.24)) transparent;
}
.to-outline__list::-webkit-scrollbar { width: 6px; }
.to-outline__list::-webkit-scrollbar-track { background: transparent; }
.to-outline__list::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-scrollbar-bg-l2, rgba(255, 255, 255, 0.24));
  border-radius: 3px;
}
.to-outline__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: ${ROW_HEIGHT}px;
  padding: 0 0 0 14px;
  box-sizing: border-box;
  background: none;
  border: 0;
  margin: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 13.5px;
  line-height: ${ROW_HEIGHT}px;
  color: var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.5));
  white-space: nowrap;
}
.to-outline__row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
  /* Hover reads white: brighter than the resting tertiary grey. */
  color: var(--dsw-alias-label-primary, rgba(255, 255, 255, 0.95));
}
.to-outline__row:hover .to-outline__dash {
  /* The dash follows the text: full-strength white, not the resting 35%. */
  background: currentColor;
}
.to-outline__row[data-active='true'] {
  /* Three colours only: grey at rest, white on hover, bright accent for the
     turn being read. */
  color: var(--dsw-alias-state-business-primary, #4c8dff);
}
.to-outline__row:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4c8dff);
  outline-offset: -2px;
}
.to-outline__index {
  flex: none;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  opacity: 0.7;
}
.to-outline__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.to-outline__dash {
  flex: none;
  width: 14px;
  height: 3px;
  /* Pill caps: radius is clamped to half the height, so 3px gives 1.5px ends. */
  border-radius: 999px;
  /* Dim via colour, never via opacity: an opacity layer gets its own
     composite pass, which flattens the rounded caps of such a small box. */
  /* Tint from the row's own colour, so the tick stays visible in both themes.
     A hard-coded white would vanish on a light background. The mid-grey is the
     fallback for engines without color-mix, and reads on either background. */
  background: rgba(128, 128, 128, 0.45);
  background: color-mix(in srgb, currentColor 35%, transparent);
  background: color-mix(in srgb, currentColor 35%, transparent);
  /* Fixed 30px tick slot at the row's right end. An auto left margin pins the
     tick there and the right margin centres it inside the slot, so the tick's
     centre sits at the same distance from the panel's right edge in both states:
     collapsing and expanding never move it. */
  margin-left: auto;
  margin-right: 8px;
  /* Own stacking layer: the panel's backdrop blur otherwise composites the dash
     and drops its rounded ends. */
  position: relative;
  z-index: 1;
}
/* Collapsed: drop the text. The tick keeps its slot and margins, so its centre
   stays put when the panel opens. */
.to-outline:not(:hover):not(:focus-within) .to-outline__row {
  gap: 0;
  padding: 0;
}
.to-outline:not(:hover):not(:focus-within) .to-outline__index,
.to-outline:not(:hover):not(:focus-within) .to-outline__title {
  display: none;
}
.to-outline:not(:hover):not(:focus-within) .to-outline__dash {
  background: rgba(128, 128, 128, 0.55);
  background: color-mix(in srgb, currentColor 45%, transparent);
  background: color-mix(in srgb, currentColor 45%, transparent);
}
/* The turn being read carries the accent on its tick. Size only: the slot margin
   below keeps its centre fixed, so two states never disagree about geometry. */
.to-outline__row[data-active='true'] .to-outline__dash {
  width: 16px;
  height: 4px;
  border-radius: 999px;
  /* (30 - 16) / 2 gives the wider accent tick the same centre inside the slot. */
  margin-right: 7px;
  background: var(--dsw-alias-state-business-primary, #4c8dff);
}
/* The collapsed dim rule outranks the accent rule, so restore full strength
   here. Size is deliberately untouched: the accent tick is identical in both
   states so hovering never changes its geometry. */
.to-outline:not(:hover):not(:focus-within) .to-outline__row[data-active='true'] .to-outline__dash {
  background: var(--dsw-alias-state-business-primary, #4c8dff);
}
/* Hover preview, mirroring the built-in turn preview: 300px wide, 100px cap,
   prompt clamped to one line, response to three. Rendered in a portal because
   the list clips its overflow, so it is positioned fixed next to the row. */
.to-outline__preview {
  position: fixed;
  z-index: 2147483000;
  box-sizing: border-box;
  width: ${PREVIEW_WIDTH}px;
  max-height: 100px;
  padding: 10px 12px;
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-alias-bg-layer-1, rgba(32, 32, 32, 0.98));
  box-shadow: var(--dsw-elevation-panel, 0 8px 24px rgba(0, 0, 0, 0.35));
  color: var(--dsw-alias-label-primary, rgba(255, 255, 255, 0.95));
  transform: translateY(-50%);
  overflow: hidden;
  pointer-events: none;
  text-align: left;
  white-space: normal;
  animation: to-outline-preview-enter 120ms ease-out;
}
@keyframes to-outline-preview-enter {
  from { opacity: 0; transform: translate(4px, -50%); }
  to { opacity: 1; transform: translate(0, -50%); }
}
.to-outline__previewPrompt {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
  font: var(--dsw-font-xs-strong-13, 600 13px/18px);
}
.to-outline__previewResponse {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  margin-top: 4px;
  color: var(--dsw-alias-label-caption, rgba(255, 255, 255, 0.55));
  font: var(--dsw-font-xxs-12, 12px/17px);
}
.to-outline:not(:hover):not(:focus-within) .to-outline__list {
  scrollbar-color: transparent transparent;
}
.to-outline:not(:hover):not(:focus-within) .to-outline__list::-webkit-scrollbar-thumb {
  background: transparent;
}
/* Belt and braces: hide on a narrow viewport even if the observer never runs. */
@media (max-width: 820px) {
  .to-outline { display: none; }
}
`

    /** Flatten an entry's prompt into one short line. */
    function titleOf(entry) {
      const prompt = typeof entry.prompt === 'string' ? entry.prompt : ''
      const flat = prompt.replace(/\s+/g, ' ').trim()
      if (flat.length > 0) return flat
      return '#' + String(entry.turn ?? '')
    }

    /**
     * The element that actually scrolls the conversation. The marked node is
     * usually it, but with a side panel open the marked wrapper can be a plain
     * box, in which case the nearest scrollable ancestor is the real scroller.
     */
    function findScroller() {
      const marked = document.querySelector(SCROLLER)
      const scrollable = (node) => node !== null
        && node.scrollHeight > node.clientHeight + 4
        && /(auto|scroll)/.test(window.getComputedStyle(node).overflowY)

      if (scrollable(marked)) return marked

      let node = document.querySelector(TURN_MARKER)
      node = node === null ? null : node.parentElement
      while (node !== null) {
        if (scrollable(node)) return node
        node = node.parentElement
      }
      return marked
    }

    /** Axis-aligned turns currently mounted, ascending. */
    function mountedTurns() {
      const turns = []
      for (const node of document.querySelectorAll(TURN_MARKER)) {
        const turn = Number(node.getAttribute('data-turn-tail'))
        if (!Number.isNaN(turn)) turns.push(turn)
      }
      return turns.sort((left, right) => left - right)
    }

    /**
     * Fallback navigation that crawls the conversation a viewport at a time.
     *
     * Only turns near the viewport are mounted (the chat virtualises its rows and
     * loads older pages on demand), so a far target usually has no marker at all.
     * Crawling also triggers the lazy page loads, and parks the turn about a third
     * of the way down rather than at the very top.
     */
    function crawlToTurn(turn, total) {
      const scroller = findScroller()
      if (scroller === null) return

      const findMarker = () => document.querySelector('[data-turn-tail="' + turn + '"]')

      const park = (marker) => {
        const markerRect = marker.getBoundingClientRect()
        const scrollerRect = scroller.getBoundingClientRect()
        // Offset of the marker inside the visible area, then move it to ~35%.
        const delta = (markerRect.top - scrollerRect.top) - scrollerRect.height * 0.35
        scroller.scrollTop += delta
      }

      const immediate = findMarker()
      if (immediate !== null) {
        park(immediate)
        return
      }

      // Rough first hop over the loaded content, to cut the crawl distance.
      const ratio = total <= 1 ? 0 : (turn - 1) / (total - 1)
      scroller.scrollTop = Math.round(ratio * (scroller.scrollHeight - scroller.clientHeight))

      const turns = mountedTurns()
      const crawlsUp = turns.length > 0 && turn < turns[0]
      const step = Math.max(120, Math.round(scroller.clientHeight * 0.9))
      let attempts = 0

      const crawl = () => {
        const marker = findMarker()
        if (marker !== null) {
          park(marker)
          return
        }
        if (++attempts > 50) return
        scroller.scrollTop += crawlsUp ? -step : step
        window.setTimeout(crawl, 60)
      }
      window.setTimeout(crawl, 60)
    }

    /**
     * Scroll one turn into view.
     *
     * Preferred path: click the built-in rail's mark for that turn and let the
     * host run its own navigation, which knows how to load unloaded history and
     * where exactly to land. `index` is the outline index, which is also the
     * mark's data-index. When no mark is reachable (rail absent, or the build
     * renamed things) it falls back to crawling.
     */
    function jumpToTurn(turn, index, total) {
      const rail = document.querySelector(RAIL_SCROLLER)
      if (rail !== null) {
        let tries = 0
        const attempt = () => {
          const mark = rail.querySelector('[data-index="' + index + '"]')
          if (mark !== null) {
            mark.click()
            return
          }
          if (++tries > 8) {
            crawlToTurn(turn, total)
            return
          }
          // Scroll the rail so the virtualised mark for that index renders.
          rail.scrollTop = Math.max(0, index * RAIL_SPACING - rail.clientHeight / 2)
          window.setTimeout(attempt, 40)
        }
        attempt()
        return
      }
      crawlToTurn(turn, total)
    }

    /**
     * Anchor the panel inside the conversation area rather than the window: with
     * a right sidebar open the two are nothing alike, and a window-anchored panel
     * would sit on top of the sidebar. Written straight to the DOM so scrolling
     * does not have to go through React.
     */
    function placePanel(element, scroller) {
      if (element === null) return
      const rect = scroller === null ? null : scroller.getBoundingClientRect()
      const right = rect === null
        ? PANEL_OFFSET_RIGHT
        : Math.round(window.innerWidth - rect.right + PANEL_OFFSET_RIGHT)
      const top = rect === null
        ? Math.round(window.innerHeight / 2)
        : Math.round(rect.top + rect.height / 2)
      element.style.right = right + 'px'
      element.style.top = top + 'px'
    }

    /** The outline panel; mounted once, in the composer dock slot. */
    function OutlinePanel(props) {
      const useProjection = props.useProjection
      const outline = typeof useProjection === 'function' ? useProjection('turnOutline') : undefined
      const items = Array.isArray(outline) ? outline : []
      const total = items.length

      const [active, setActive] = React.useState(null)
      const [crowded, setCrowded] = React.useState(false)
      const [hovered, setHovered] = React.useState(null)
      const listRef = React.useRef(null)
      const panelRef = React.useRef(null)
      /**
       * Remembered list scroll offset. The panel briefly unmounts when the
       * conversation area crosses the crowding threshold — which is exactly what
       * happens while a window is being resized — and a freshly mounted list
       * starts at the top, so the reader's position has to be restored.
       */
      const listScroll = React.useRef(0)
      /** The row under the pointer, kept so the preview card can follow it. */
      const hoveredRow = React.useRef(null)
      const previewRef = React.useRef(null)
      const narrowEpisode = React.useRef(false)
      const lastWidth = React.useRef(0)

      /**
       * Anchor the hover preview just left of a row. It is rendered through a
       * portal because the scrolling list clips its own overflow.
       */
      const previewFor = (entry, event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        hoveredRow.current = event.currentTarget
        const prompt = typeof entry.prompt === 'string' ? entry.prompt.replace(/\s+/g, ' ').trim() : ''
        const response = typeof entry.response === 'string' ? entry.response.replace(/\s+/g, ' ').trim() : ''
        // The card sits 10px left of the row, but never far enough left to cross
        // the window edge on a narrow conversation column.
        const desired = Math.round(window.innerWidth - rect.left + 10)
        const limit = Math.max(PANEL_OFFSET_RIGHT, Math.round(window.innerWidth - PREVIEW_WIDTH - 8))
        setHovered({
          top: Math.round(rect.top + rect.height / 2),
          right: Math.min(desired, limit),
          prompt: prompt.length > 0 ? prompt : '#' + String(entry.turn ?? ''),
          response,
        })
      }

      /**
       * One measurement pass drives two decisions: which turn is being read
       * (the highlight) and whether the collapsed strip would crowd the
       * conversation column (hide it). The DOM is re-queried on every pass
       * because the chat may replace its nodes after a resize or a session
       * switch — caching a node here is what previously dropped the highlight.
       */
      React.useEffect(() => {
        if (total === 0) return undefined
        let frame = 0

        /**
         * Re-measure when the conversation area itself changes size. Toggling a
         * side panel or dragging the splitter resizes it without firing scroll or
         * window resize, and the crowding decision depends on that width. The
         * observed element is re-bound whenever the chat replaces it.
         */
        let observed = null
        let observer = null
        const ensureObserver = () => {
          const scroller = document.querySelector(SCROLLER)
          if (scroller === observed) return
          if (observer !== null) observer.disconnect()
          observed = scroller
          observer = null
          const Observer = window.ResizeObserver
          if (scroller === null || typeof Observer !== 'function') return
          observer = new Observer(() => schedule())
          observer.observe(scroller)
        }

        const measure = () => {
          frame = 0
          ensureObserver()
          const scroller = document.querySelector(SCROLLER)
          const host = scroller === null ? document : scroller
          const nodes = host.querySelectorAll(TURN_MARKER)
          const scrollerRect = scroller === null ? null : scroller.getBoundingClientRect()
          placePanel(panelRef.current, scroller)

          // 1) Room check: the strip must stay MIN_CONTENT_GAP away from the
          //    conversation column (the widest turn marker is a good proxy). The
          //    strip is anchored inside the conversation area, so its left edge
          //    is measured from that area's right edge.
          const stripLeft = (scrollerRect === null ? window.innerWidth : scrollerRect.right)
            - PANEL_OFFSET_RIGHT - COLLAPSED_WIDTH
          const areaWidth = scrollerRect === null ? window.innerWidth : scrollerRect.width
          let contentRight = 0
          for (const node of nodes) {
            const rect = node.getBoundingClientRect()
            if (rect.right > contentRight) contentRight = rect.right
          }
          if (contentRight === 0 && scrollerRect !== null) contentRight = scrollerRect.right - 24
          setCrowded(areaWidth < MIN_AREA_WIDTH || contentRight + MIN_CONTENT_GAP > stripLeft)

          // 2) Give the conversation room before the outline gives up: on a
          //    narrow window, collapse the built-in left sidebar first, and give
          //    it back when the window is wide again. The sidebar state is read
          //    from layout, outside the width guard, because the host renders no
          //    reliable "collapsed" attribute in this build and the sidebar can
          //    toggle without a resize.
          const narrow = window.innerWidth < SIDEBAR_COLLAPSE_BELOW
          const wide = window.innerWidth > SIDEBAR_RESTORE_ABOVE

          /** Read the sidebar state straight from the DOM, for retries. */
          const isCollapsedNow = () => {
            const element = document.querySelector(SCROLLER)
            const rect = element === null ? null : element.getBoundingClientRect()
            const left = rect === null ? 0 : rect.left
            if (left > 0 && left < SIDEBAR_COLLAPSED_MAX_LEFT) return true
            return document.querySelector('[data-sidebar-collapsed]') !== null
          }

          /**
           * Toggle the sidebar towards `wantCollapsed`, then verify. One click
           * landing before the host finishes a large relayout is swallowed, so
           * re-check and retry a couple of times instead of trusting the first.
           */
          const nudge = (wantCollapsed, attempt) => {
            if (attempt > 2) return
            if (isCollapsedNow() === wantCollapsed) return
            const button = document.querySelector('[data-sidebar-toggle]')
            if (button === null) return
            button.click()
            window.setTimeout(() => {
              schedule()
              nudge(wantCollapsed, attempt + 1)
            }, 280)
          }

          // Only act when the viewport width actually changed, so scrolling
          // never toggles the sidebar.
          if (window.innerWidth !== lastWidth.current) {
            lastWidth.current = window.innerWidth
            if (narrow) {
              // Record the episode, not the authorship: widening must undo the
              // collapse even when the host or the user closed the sidebar.
              narrowEpisode.current = true
              nudge(true, 0)
            } else if (wide) {
              if (narrowEpisode.current) nudge(false, 0)
              narrowEpisode.current = false
            }
          }

          // 3) Reading position.
          if (nodes.length === 0) return

          // At the bottom the running turn has no tail node yet: highlight it.
          if (scroller !== null) {
            const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
            if (remaining < BOTTOM_EPSILON) {
              setActive(total)
              return
            }
          }

          // Otherwise: the last turn whose tail has passed the viewport top.
          const viewportTop = scrollerRect === null ? 0 : scrollerRect.top
          let current = null
          for (const node of nodes) {
            const rect = node.getBoundingClientRect()
            if (rect.top <= viewportTop + 8) {
              const turn = Number(node.getAttribute('data-turn-tail'))
              if (!Number.isNaN(turn)) current = turn
              continue
            }
            break
          }
          // A turn's marker closes that turn, so the turn being read is the one
          // AFTER the last passed marker: its question and answer are what fills
          // the viewport below that point. With no marker passed yet we are still
          // inside the first mounted turn.
          if (current === null) {
            const first = Number(nodes[0].getAttribute('data-turn-tail'))
            setActive(Number.isNaN(first) ? null : first)
            return
          }
          setActive(Math.min(total, current + 1))
        }

        const schedule = () => {
          if (frame === 0) frame = window.requestAnimationFrame(measure)
        }

        measure()
        window.addEventListener('scroll', schedule, { passive: true, capture: true })
        window.addEventListener('resize', schedule, { passive: true })
        return () => {
          window.removeEventListener('scroll', schedule, true)
          window.removeEventListener('resize', schedule)
          if (frame !== 0) window.cancelAnimationFrame(frame)
          if (observer !== null) observer.disconnect()
        }
      }, [total])

      // Keep the turn being read inside the visible strip, so the collapsed
      // rail tracks the reading position instead of drifting off-screen. Skipped
      // while the pointer is over the panel: there the reader drives the list.
      React.useEffect(() => {
        if (active === null || listRef.current === null) return
        if (panelRef.current !== null && panelRef.current.matches(':hover')) return
        const row = listRef.current.querySelector('[data-active="true"]')
        if (row !== null) row.scrollIntoView({ block: 'nearest' })
      }, [active])

      // Restore the remembered offset after the panel remounts.
      React.useEffect(() => {
        const list = listRef.current
        if (list === null || listScroll.current <= 0) return
        if (list.scrollTop !== listScroll.current) list.scrollTop = listScroll.current
      }, [crowded, total])

      // A hidden panel must not leave a stale preview card floating.
      React.useEffect(() => {
        if (crowded) setHovered(null)
      }, [crowded])

      /**
       * Follow the conversation area every frame instead of waiting for scroll
       * and resize events. Opening or closing a side panel, and dragging the
       * splitter, change the area's width without firing either event, which used
       * to leave the panel stranded at its old position. The loop only writes to
       * the DOM when the measured numbers actually change, so a still page costs
       * one rect read per frame and nothing else.
       */
      React.useEffect(() => {
        let stopped = false
        let lastRight = -1
        let lastTop = -1
        let lastCardRight = -1
        let lastCardTop = -1

        const tick = () => {
          if (stopped) return
          const element = panelRef.current
          const scroller = document.querySelector(SCROLLER)
          const rect = scroller === null ? null : scroller.getBoundingClientRect()

          if (element !== null) {
            const right = rect === null
              ? PANEL_OFFSET_RIGHT
              : Math.round(window.innerWidth - rect.right + PANEL_OFFSET_RIGHT)
            const top = rect === null
              ? Math.round(window.innerHeight / 2)
              : Math.round(rect.top + rect.height / 2)
            if (right !== lastRight || top !== lastTop) {
              lastRight = right
              lastTop = top
              element.style.right = right + 'px'
              element.style.top = top + 'px'
            }
          }

          // The preview card is anchored to the hovered row, so it has to follow
          // the same way the panel does: a resize would otherwise strand it.
          const card = previewRef.current
          const row = hoveredRow.current
          if (card !== null && row !== null) {
            const rowRect = row.getBoundingClientRect()
            const right = Math.round(window.innerWidth - rowRect.left + 10)
            const top = Math.round(rowRect.top + rowRect.height / 2)
            if (right !== lastCardRight || top !== lastCardTop) {
              lastCardRight = right
              lastCardTop = top
              card.style.right = right + 'px'
              card.style.top = top + 'px'
            }
          }

          window.requestAnimationFrame(tick)
        }

        window.requestAnimationFrame(tick)
        return () => { stopped = true }
      }, [])

      if (total === 0 || crowded) return null

      const panel = h(
        'div',
        {
          className: 'to-outline',
          role: 'navigation',
          'aria-label': 'Question outline',
          ref: panelRef,
        },
        h(
          'div',
          {
            ref: listRef,
            className: 'to-outline__list',
            onScroll: (event) => { listScroll.current = event.currentTarget.scrollTop },
            onWheel: (event) => {
              event.stopPropagation()
              setHovered(null)
            },
          },
          items.map((entry, index) => {
            const turn = typeof entry.turn === 'number' ? entry.turn : index + 1
            const isActive = turn === active
            const title = titleOf(entry)
            return h(
              'button',
              {
                key: String(turn),
                type: 'button',
                className: 'to-outline__row',
                'data-active': String(isActive),
                // aria-label, not title: a title attribute makes the browser pop
                // its native tooltip after a hover delay, which we do not want.
                'aria-label': title,
                onMouseEnter: (event) => { previewFor(entry, event) },
                onMouseLeave: () => {
                  hoveredRow.current = null
                  setHovered(null)
                },
                onClick: () => { jumpToTurn(turn, index, total) },
              },
              h('span', { className: 'to-outline__index' }, isActive ? turn + '/' + total : String(turn)),
              h('span', { className: 'to-outline__title' }, title),
              h('span', { className: 'to-outline__dash', 'aria-hidden': 'true' }),
            )
          }),
        ),
      )

      // Portal to <body>: the composer dock sits inside transformed/contained
      // ancestors, so `position: fixed` would otherwise resolve against that
      // box instead of the viewport (which parked the panel near the bottom).
      const preview = hovered === null ? null : h(
        'div',
        {
          ref: previewRef,
          className: 'to-outline__preview',
          style: { top: hovered.top + 'px', right: hovered.right + 'px' },
          role: 'tooltip',
        },
        h('div', { className: 'to-outline__previewPrompt' }, hovered.prompt),
        hovered.response.length > 0
          ? h('div', { className: 'to-outline__previewResponse' }, hovered.response)
          : null,
      )

      return createPortal(h(React.Fragment, null, panel, preview), document.body)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-dsh-onlineoutline', '')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'dsh-onlineoutline: styles')

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'dsh-onlineoutline', order: 40 },
            OutlinePanel,
          ),
        )
      },
    }
  },
})
