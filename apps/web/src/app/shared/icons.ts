import {
  LucideArrowDown,
  LucideArrowLeft,
  LucideArrowRight,
  LucideCheck,
  LucideChevronRight,
  LucideCornerUpRight,
  LucideCopy,
  LucideGalleryHorizontal,
  LucideInfo,
  LucideMenu,
  LucideMoon,
  LucideMoreHorizontal,
  LucidePencil,
  LucidePlus,
  LucideRefreshCw,
  LucideSettings,
  LucideSquareSplitHorizontal,
  LucideSun,
  LucideTriangleAlert,
  LucideUnplug,
  LucideX,
} from '@lucide/angular';

/**
 * The app's icon set: the twenty-one `@lucide/angular` components pinned by
 * the icon list in `docs/DESIGN-SYSTEM.md`. Components import from here,
 * never from `@lucide/angular` directly, so the sanctioned set is one
 * import away and one grep wide.
 *
 * `LucideMoreHorizontal` is the alias of `LucideEllipsis` and
 * `LucideTriangleAlert` supersedes the deprecated `LucideAlertTriangle`;
 * both names above are the ones that exist in `@lucide/angular@1.43.0`.
 *
 * Sizing is `--icon-sm|md|lg|xl` and colour is always `currentColor`.
 * There is no spinner icon: the loading indicator is a CSS ochre dot pulse.
 */
export {
  /** rail / mobile-drawer toggle — `svg[lucideMenu]` */
  LucideMenu,
  /** close pane, close dialog, clear scope, clear filter — `svg[lucideX]` */
  LucideX,
  /** create menu (pane / tab / workspace) — `svg[lucidePlus]` */
  LucidePlus,
  /** settings link — `svg[lucideSettings]` */
  LucideSettings,
  /** switch to washi — `svg[lucideSun]` */
  LucideSun,
  /** switch to sumi — `svg[lucideMoon]` */
  LucideMoon,
  /** rename workspace / tab — `svg[lucidePencil]` */
  LucidePencil,
  /** split right — `svg[lucideArrowRight]` */
  LucideArrowRight,
  /** split down — `svg[lucideArrowDown]` */
  LucideArrowDown,
  /** move a pane to another tab or workspace — `svg[lucideCornerUpRight]` */
  LucideCornerUpRight,
  /** back to board — `svg[lucideArrowLeft]` */
  LucideArrowLeft,
  /** rail disclosure, scope breadcrumb — `svg[lucideChevronRight]` */
  LucideChevronRight,
  /** overflow menu trigger — `svg[lucideMoreHorizontal]` */
  LucideMoreHorizontal,
  /** error toast, failed state — `svg[lucideTriangleAlert]` */
  LucideTriangleAlert,
  /** success toast, confirmed selection — `svg[lucideCheck]` */
  LucideCheck,
  /** info toast — `svg[lucideInfo]` */
  LucideInfo,
  /** copy config snippet / command — `svg[lucideCopy]` */
  LucideCopy,
  /** retry a failed load — `svg[lucideRefreshCw]` */
  LucideRefreshCw,
  /** disconnected host, stale marker — `svg[lucideUnplug]` */
  LucideUnplug,
  /** card switcher on the terminal bar — `svg[lucideGalleryHorizontal]` */
  LucideGalleryHorizontal,
  /** next card in this tab — `svg[lucideSquareSplitHorizontal]` */
  LucideSquareSplitHorizontal,
};

/**
 * Every sanctioned icon, for a component that wants the lot rather than a
 * hand-picked few. Prefer naming the icons you actually use — this exists
 * for shells and overlays that legitimately need most of the set.
 */
export const KANHRD_ICONS = [
  LucideMenu,
  LucideX,
  LucidePlus,
  LucideSettings,
  LucideSun,
  LucideMoon,
  LucidePencil,
  LucideArrowRight,
  LucideArrowDown,
  LucideCornerUpRight,
  LucideArrowLeft,
  LucideChevronRight,
  LucideMoreHorizontal,
  LucideTriangleAlert,
  LucideCheck,
  LucideInfo,
  LucideCopy,
  LucideRefreshCw,
  LucideUnplug,
  LucideGalleryHorizontal,
  LucideSquareSplitHorizontal,
] as const;

/**
 * The set is twenty-one icons. A twenty-second is a change to
 * `docs/DESIGN-SYSTEM.md` first — this line breaks the build until the
 * count here is deliberately updated to match.
 */
const ICON_COUNT: 21 = KANHRD_ICONS.length;
void ICON_COUNT;
