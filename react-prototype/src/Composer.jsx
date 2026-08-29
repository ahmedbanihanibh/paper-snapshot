/**
 * Linear's new-issue composer — collapsed ⇄ maximized.
 *
 * Every number is read from the live composer's computed styles. Where a value
 * could not be captured it is marked, rather than guessed.
 *
 * THREE elements animate, each a different property, all on the same 300ms
 * cubic-bezier(0.43, 0.07, 0.59, 0.94):
 *
 *   wrapper (role=dialog)  padding    13vh 12px → 6vh 12px
 *   panel                  max-width  750px → 820px
 *   form                   min-height 0 → 88vh
 *
 * The vertical padding is in vh, not px. An earlier capture at a different
 * window height read 94px/43px and those were hard-coded here; at 900px tall
 * the same element measures 117px/54px. 117/900 and 54/900 are 13% and 6% of
 * the viewport height, and percentage padding in CSS resolves against the
 * containing block's *width*, so vh is the only unit that fits both readings.
 * Hard-coded pixels put the panel in the right place at exactly one window size.
 *
 * The property split matters as much as the values. Only max-width lives on the
 * panel; the height animation is min-height on the inner form. Putting both on
 * the panel still lands the right endpoints with the right easing, and still
 * looks wrong between roughly 30% and 70%, because the panel would then apply
 * its final height on the first frame while max-width was still tweening.
 */

import { useState } from 'react';
import {
  TeamIcon, ExpandIcon, CollapseIcon, CloseIcon, BacklogIcon, PriorityIcon,
  AssigneeIcon, ProjectIcon, LabelsIcon, PlayIcon, MoreIcon, AttachIcon,
} from './icons.jsx';

const MOTION = 'duration-300 ease-(--ease-composer)';

/**
 * Metadata pill. Captured: 24px tall, fully round, 6px leading / 8px trailing,
 * 5px between icon and label, 12px/12px weight 500.
 *
 * The border is 0.5px and transparent at rest — it is there so the pill does not
 * shift by a pixel when a hover or selected state colours it in.
 */
function Pill({ icon: Glyph, children, label }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-6 shrink-0 items-center gap-[5px] rounded-full border-[0.5px] border-transparent
                 bg-chip pr-2 pl-1.5 text-[12px]/[12px] font-medium whitespace-nowrap text-ink-muted
                 transition-colors duration-150 hover:text-ink-soft
                 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      <Glyph className="size-3.5 shrink-0" />
      {children}
    </button>
  );
}

/** Icon-only pill. Captured 24×24 with 2px side padding, same chip fill. */
function RoundButton({ label, icon: Glyph, className = '' }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`grid size-6 shrink-0 place-items-center rounded-full border-[0.5px] border-transparent
                  bg-chip px-0.5 text-ink-soft transition-colors duration-150 hover:text-ink
                  focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      <Glyph className="size-3.5" />
    </button>
  );
}

/**
 * Header control. Captured 28×28, fully round, transparent at rest.
 *
 * This was `rounded-[5px]` before — the capture says 9999px. Every button in
 * this composer is a pill; there is not a single rounded-rectangle control in it.
 */
function HeaderButton({ label, icon: Glyph, onClick, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      {...rest}
      className="grid size-7 shrink-0 place-items-center rounded-full px-0.5 text-ink-soft
                 transition-colors duration-150 hover:bg-chip hover:text-ink
                 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Glyph className="size-3.5" />
    </button>
  );
}

export default function Composer() {
  const [maximized, setMaximized] = useState(false);
  const [createMore, setCreateMore] = useState(false);

  return (
    // Animates its own vertical padding, which is what carries the panel's top
    // edge upward. Centring instead lets the top edge fall out of height growth
    // — same destination, different timeline.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New issue"
      data-part="wrapper"
      // items-start, not the default stretch: the collapsed panel is sized by
      // its content (261px), and a stretched panel would fill the whole padded
      // area (666px) while every band inside it still measured correct.
      className={`flex h-full w-full items-start justify-center px-3 transition-[padding] ${MOTION}
                  ${maximized ? 'py-[6vh]' : 'py-[13vh]'}`}
    >
      {/* Captured: radius 22px, 0.5px border, five-layer shadow, max-height 100%,
          and overflow visible — the shadow is not clipped by this element. */}
      <div
        data-part="panel"
        data-state={maximized ? 'maximized' : 'collapsed'}
        className={`flex max-h-full w-full flex-col rounded-[22px] border-[0.5px] border-panel-border
                    bg-panel shadow-(--shadow-composer) transition-[max-width] ${MOTION}
                    ${maximized ? 'max-w-[820px]' : 'max-w-[750px]'}`}
      >
        {/* The form carries the height animation and repeats the 22px radius so
            the scrolling body is clipped to the panel's corners. */}
        <form
          data-part="form"
          className={`flex max-h-full w-full flex-1 flex-col overflow-hidden rounded-[22px]
                      transition-[min-height] ${MOTION}
                      ${maximized ? 'min-h-[88vh]' : 'min-h-0'}`}
          onSubmit={(event) => event.preventDefault()}
        >
          {/* Captured 52px tall, 12px padding on all four sides. */}
          <header className="flex h-[52px] shrink-0 items-center p-3">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <button
                type="button"
                aria-label="Set team"
                className="flex h-6 shrink-0 items-center gap-[5px] rounded-full bg-chip pr-2 pl-[5px]
                           transition-colors duration-150 hover:brightness-125
                           focus-visible:outline-2 focus-visible:outline-accent"
              >
                <TeamIcon className="size-3.5 text-ink-muted" />
                <span className="text-[12px] font-[450] text-ink">TES</span>
              </button>
              {/* A separator element sits here in the capture but measures under
                  6px, so its exact glyph was not resolved. */}
              <span aria-hidden className="text-[13px] text-ink-muted">›</span>
              <span className="text-[13px] font-[450] text-ink-soft">New issue</span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <HeaderButton
                data-part="toggle"
                label={maximized ? 'Collapse' : 'Expand'}
                icon={maximized ? CollapseIcon : ExpandIcon}
                onClick={() => setMaximized((value) => !value)}
              />
              <HeaderButton label="Close" icon={CloseIcon} />
            </div>
          </header>

          {/*
            The only band that grows: 114.2px collapsed → 646px maximized. Its
            collapsed height is entirely natural (title 29 + gap 6 + description
            79.2), so it carries no min-height of its own — the form's animated
            min-height is what drives it, and a second floor here would fight it.

            Padding is 6px outer + 12px inner, per the capture. That asymmetry is
            also what keeps the description text off the scrollbar track.
          */}
          <div data-part="body" className="flex flex-1 flex-col overflow-y-auto px-1.5">
            <div className="flex flex-1 flex-col gap-1.5 px-3">
              {/* Row is 29px with 2px of it padding. The editor inside is 24px
                  even though its line-height is 28.8 — Linear clips the line box
                  rather than letting it set the row height, so an empty title
                  and a filled one occupy the same space. */}
              <div className="flex h-[29px] shrink-0 items-center gap-1 pt-0.5">
                <div
                  role="textbox"
                  contentEditable
                  suppressContentEditableWarning
                  aria-label="Issue title"
                  data-placeholder="Issue title"
                  className="h-6 w-full overflow-hidden text-[18px]/[24px] font-semibold
                             tracking-[-0.1px] text-ink outline-none"
                />
              </div>

              {/* Pulled 4px wider than the column, then padded 16px, so the text
                  still lands on the title's left edge. Captured, not tidied. */}
              <div className="-mx-1 flex-1 px-4">
                <div
                  role="textbox"
                  contentEditable
                  suppressContentEditableWarning
                  aria-label="Add description"
                  data-placeholder="Add description…"
                  // 79.2px, not the 61.2px of text it contains: min-height is
                  // border-box here, so it has to include the 6px/12px padding
                  // or the block comes out 18px short and the whole collapsed
                  // panel with it.
                  className="min-h-[79.2px] w-full pt-1.5 pb-3 text-[15px]/[24px] font-[450]
                             text-ink-body outline-none"
                />
              </div>
            </div>
          </div>

          {/* Captured 42px: 6px top, 12px sides and bottom, 6px between pills. */}
          <div className="shrink-0 px-3 pt-1.5 pb-3">
            <div className="flex h-6 flex-wrap items-center gap-1.5">
              <Pill icon={BacklogIcon} label="Change status">Backlog</Pill>
              <Pill icon={PriorityIcon} label="Change priority">Priority</Pill>
              <Pill icon={AssigneeIcon} label="Change assignee">Assignee</Pill>
              <Pill icon={ProjectIcon} label="Change project">Project</Pill>
              <Pill icon={LabelsIcon} label="Change labels">Labels</Pill>
              {/* 32px wide, not 24 — it is a combobox that happens to have no label. */}
              <RoundButton label="Add to cycle" icon={PlayIcon} className="w-8" />
              <RoundButton label="More actions" icon={MoreIcon} />
            </div>
          </div>

          {/* Captured 40px tall, 12px sides and bottom, no top padding, 18px
              between the two groups — and no divider rule above it. */}
          <footer className="mt-3 flex h-10 shrink-0 items-center gap-[18px] px-3 pb-3">
            <button
              type="button"
              aria-label="Attach images, files, or videos"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-chip px-0.5
                         text-ink-soft transition-colors duration-150 hover:text-ink
                         focus-visible:outline-2 focus-visible:outline-accent"
            >
              <AttachIcon className="size-3.5" />
            </button>

            <div className="flex flex-1 items-center justify-end gap-3">
              {/* The switch's own dimensions were not in the capture; only its
                  label and the 12px gap to the button were. */}
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-muted select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={createMore}
                  onClick={() => setCreateMore((value) => !value)}
                  className={`relative h-[18px] w-[30px] rounded-full transition-colors duration-150
                              ${createMore ? 'bg-accent' : 'bg-chip'}`}
                >
                  <span
                    className={`absolute top-[2px] size-[14px] rounded-full bg-white transition-[left]
                                duration-150 ${createMore ? 'left-[14px]' : 'left-[2px]'}`}
                  />
                </button>
                Create more
              </label>

              <button
                type="submit"
                className="flex h-7 shrink-0 items-center rounded-full bg-accent px-2.5
                           text-[12px] font-medium text-accent-ink transition-[filter] duration-150
                           hover:brightness-110 focus-visible:outline-2
                           focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Create issue
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
