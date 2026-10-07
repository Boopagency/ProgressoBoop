"use client"

import type { ComponentProps } from "react"

import { ColumnChart } from "@/components/charts/column-chart"
import { LineChart } from "@/components/charts/line-chart"
import { formatMoney, formatMoneyAxis } from "@/features/finance/money"

/*
 * Gráficos com o formato já definido, para usar em componentes do servidor
 * (funções não atravessam a fronteira servidor → navegador).
 */

type ColumnProps = Omit<ComponentProps<typeof ColumnChart>, "format" | "axisFormat">
type LineProps = Omit<ComponentProps<typeof LineChart>, "format" | "axisFormat">

export function MoneyColumnChart(props: ColumnProps) {
  return <ColumnChart {...props} format={formatMoney} axisFormat={formatMoneyAxis} />
}

export function MoneyLineChart(props: LineProps) {
  return <LineChart {...props} format={formatMoney} axisFormat={formatMoneyAxis} />
}

/** Contagens ("3 tarefas"). */
export function CountColumnChart({ singular, plural, ...props }: ColumnProps & { singular: string; plural: string }) {
  return (
    <ColumnChart
      {...props}
      format={(value) => `${value} ${value === 1 ? singular : plural}`}
      axisFormat={(value) => String(value)}
    />
  )
}
