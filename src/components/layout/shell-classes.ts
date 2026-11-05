/*
 * Classes da casca (menu lateral e topo) usadas pelo admin, pelo portal e
 * pela vitrine de desenvolvimento: assim os três ficam iguais.
 */

/** Item do menu lateral: pílula; o ativo é azul elétrico e brilha. */
export const NAV_ITEM_CLASS =
  "h-9 gap-2.5 rounded-full px-3 text-[13.5px] text-sidebar-foreground transition-[background-color,color,box-shadow] duration-150 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-glow data-[active=true]:hover:bg-sidebar-primary data-[active=true]:hover:text-sidebar-primary-foreground [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-(--sidebar-primary-icon)"

/** Topo das telas: transparente no computador; no celular, barra de vidro fixa. */
export const TOPBAR_CLASS =
  "sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 px-3 max-md:h-[calc(3rem+env(safe-area-inset-top))] max-md:border-b max-md:border-glass-edge max-md:glass-surface max-md:pt-[env(safe-area-inset-top)] md:h-16 md:px-4"

/** A seção atual no topo (computador: pílula de vidro). */
export const TOPBAR_SECTION_CLASS =
  "flex items-center gap-2 text-[13px] font-medium text-foreground md:h-9 md:rounded-full md:border md:border-glass-edge md:bg-card md:px-3.5 md:shadow-[inset_0_1px_0_var(--glass-highlight)]"

/** Botão de abrir e fechar o menu, no topo. */
export const TOPBAR_TRIGGER_CLASS =
  "-ml-1 size-9 rounded-full border border-glass-edge bg-card text-muted-foreground shadow-[inset_0_1px_0_var(--glass-highlight)] hover:bg-accent hover:text-foreground max-md:hidden"
