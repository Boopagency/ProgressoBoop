import { cn } from "@/lib/utils"

const MONEY = /^([-−+]?)\s?R\$\s?([\d.]+)(,\d+)?$/
const NUMBER = /^([-−+]?[\d.,]+)(\s?\S.*)?$/

/**
 * Número grande na serifada itálica (`display-number`), com o acessório
 * menor: em dinheiro, o "R$" pequeno em cima e os centavos menores; num
 * percentual ou numa unidade ("66,3%", "2,4 meses"), o sufixo menor. O
 * valor continua inteiro e exato; só muda o peso visual das partes.
 */
export function DisplayValue({ value, className }: { value: string; className?: string }) {
  const money = MONEY.exec(value)
  if (money) {
    const [, sign, units, cents] = money
    return (
      <span className={cn("display-number whitespace-nowrap", className)}>
        {sign}
        <span className="mr-[0.12em] align-[0.62em] font-sans text-[0.32em] font-medium tracking-normal not-italic opacity-70">R$</span>
        {units}
        {cents ? <span className="text-[0.6em] opacity-75">{cents}</span> : null}
      </span>
    )
  }
  const number = NUMBER.exec(value)
  if (number && number[2]) {
    return (
      <span className={cn("display-number whitespace-nowrap", className)}>
        {number[1]}
        <span className="ml-[0.08em] text-[0.55em] opacity-75">{number[2].trim()}</span>
      </span>
    )
  }
  return <span className={cn("display-number whitespace-nowrap", className)}>{value}</span>
}
