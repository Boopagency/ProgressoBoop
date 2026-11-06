"use client"

import { ChannelsView } from "@/features/channels/channels-view"
import { todayKey } from "@/lib/dates"

import { vbChannels, vbCommunications, vbPreviews } from "../fixtures"
import { VitrineB } from "../vitrine-b"

/** Comunicações de verdade: canais e a conversa de exemplo (`?canal=ch-aurora`). */
export default function VitrineChannelsPage() {
  const today = todayKey()
  return (
    <VitrineB active="/comunicacoes">
      <ChannelsView channels={vbChannels(today)} previews={vbPreviews(today)} communications={vbCommunications(today)} initialQuery="" />
    </VitrineB>
  )
}
