import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Presentation,
  type LucideIcon,
} from "lucide-react"

import { fileKindOf, type FileKind } from "@/features/client-files/logic"
import { cn } from "@/lib/utils"

const KIND_ICON: Record<FileKind, LucideIcon> = {
  pdf: FileType,
  image: FileImage,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: FileArchive,
  video: FileVideo,
  text: FileText,
}

/** Ícone do arquivo pelo tipo (PDF, imagem, planilha…), num quadrado discreto. */
export function FileKindTile({ mimeType, className }: { mimeType: string; className?: string }) {
  const Icon = KIND_ICON[fileKindOf(mimeType)]
  return (
    <span
      aria-hidden
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", className)}
    >
      <Icon className="size-4" />
    </span>
  )
}
