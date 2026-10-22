// Confere se alguma tela rola para o lado no celular (#73): abre cada rota do
// admin e do portal em 360, 390 e 430 px e compara o `scrollWidth` da página
// com a largura da tela. Sai com erro se alguma passar.
//
// Precisa do Playwright, que não é dependência do projeto:
//   npm i --no-save playwright && npx playwright install chromium
//
// Uso (as senhas só em variável de ambiente, nunca em arquivo):
//   BASE_URL=http://localhost:3000 TEAM_EMAIL=… TEAM_PASSWORD=… \
//   CLIENT_EMAIL=… CLIENT_PASSWORD=… node scripts/check-mobile-width.mjs
//
// Opcionais: WIDTHS (padrão "360,390,430"), THEME ("light" ou "dark"),
// VERCEL_BYPASS (o segredo de bypass da prévia protegida) e PLAYWRIGHT_MODULE
// (caminho do Playwright, se estiver instalado fora do projeto). Sem a conta
// de cliente, confere só o admin.

const env = process.env
const { chromium } = await import(env.PLAYWRIGHT_MODULE ?? "playwright")

const BASE = (env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")
const WIDTHS = (env.WIDTHS ?? "360,390,430").split(",").map(Number)
const ID = "[0-9a-f-]{36}"

/** Rotas da equipe. `detail` acha, na lista, o link de uma página de dentro. */
const TEAM_ROUTES = [
  { path: "/hoje" },
  { path: "/tarefas" },
  { path: "/projetos", detail: new RegExp(`^/projetos/${ID}$`) },
  { path: "/calendario" },
  { path: "/reunioes", detail: new RegExp(`^/reunioes/${ID}$`) },
  { path: "/comercial" },
  { path: "/conteudo" },
  { path: "/conteudo?visao=semana" },
  { path: "/conteudo?ver=quadro" },
  { path: "/conteudo?ver=lista" },
  { path: "/conteudo?ver=feed" },
  { path: "/conteudo?ver=ideias" },
  { path: "/clientes", detail: new RegExp(`^/clientes/${ID}$`) },
  { path: "/comunicacoes" },
  { path: "/indicadores" },
  { path: "/metas" },
  { path: "/financeiro" },
  { path: "/financeiro/lancamentos" },
  { path: "/financeiro/contratos" },
  { path: "/financeiro/projecao" },
  { path: "/financeiro/dre" },
  { path: "/financeiro/fechamento" },
  { path: "/financeiro/parametros" },
  { path: "/relatorios" },
  { path: "/decisoes" },
  { path: "/processos", detail: new RegExp(`^/processos/${ID}$`) },
]

/** Rotas do portal do cliente. */
const CLIENT_ROUTES = [
  { path: "/portal" },
  { path: "/portal/calendario" },
  { path: "/portal/feed", detail: new RegExp(`^/portal/posts/${ID}`) },
  { path: "/portal/projetos", detail: new RegExp(`^/portal/projetos/${ID}`) },
  { path: "/portal/documentos" },
  { path: "/portal/comunicacao" },
  { path: "/portal/notificacoes" },
]

/** Mede a página aberta: a largura rolável e o que sai da tela (fora de um carrossel ou de uma faixa que rola). */
function measure() {
  const width = window.innerWidth
  const scrollWidth = document.documentElement.scrollWidth
  const insideScroller = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowX
      if (overflow === "auto" || overflow === "scroll" || overflow === "hidden" || overflow === "clip") return true
    }
    return false
  }
  const outside = [...document.querySelectorAll("body *")].filter((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && (rect.right > width + 1 || rect.left < -1) && getComputedStyle(element).position !== "fixed" && !insideScroller(element)
  })
  const leaves = outside
    .filter((element) => !outside.some((other) => other !== element && element.contains(other)))
    .slice(0, 4)
    .map((element) => {
      const rect = element.getBoundingClientRect()
      const name = `${element.tagName.toLowerCase()}${element.className && typeof element.className === "string" ? `.${element.className.trim().split(/\s+/).slice(0, 4).join(".")}` : ""}`
      return `${name} [${Math.round(rect.left)}..${Math.round(rect.right)}]`
    })
  return { width, scrollWidth, leaves }
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`)
  await page.fill("#email", email)
  await page.fill("#password", password)
  await page.click("button[type=submit]")
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })
}

async function open(page, path) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(800)
}

async function checkRoutes(browser, label, email, password, routes) {
  const failures = []
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      colorScheme: env.THEME === "dark" ? "dark" : "light",
      extraHTTPHeaders: env.VERCEL_BYPASS
        ? { "x-vercel-protection-bypass": env.VERCEL_BYPASS, "x-vercel-set-bypass-cookie": "true" }
        : undefined,
    })
    const page = await context.newPage()
    await signIn(page, email, password)
    const paths = []
    for (const route of routes) {
      paths.push(route.path)
      if (!route.detail || width !== WIDTHS[0]) continue
      await open(page, route.path)
      const hrefs = await page.$$eval("a[href]", (links) => links.map((link) => link.getAttribute("href") ?? ""))
      const detail = hrefs.find((href) => route.detail.test(href.split("?")[0]))
      if (detail) route.found = detail
    }
    for (const route of routes) if (route.found) paths.push(route.found)
    for (const path of paths) {
      await open(page, path)
      const result = await page.evaluate(measure)
      const ok = result.scrollWidth <= result.width
      console.log(`${ok ? "ok  " : "PASSA"} ${label} ${width}px ${path}${ok ? "" : ` (largura ${result.scrollWidth})`}`)
      if (!ok) {
        for (const leaf of result.leaves) console.log(`      ${leaf}`)
        failures.push(`${label} ${width}px ${path}`)
      }
    }
    await context.close()
  }
  return failures
}

const browser = await chromium.launch()
const failures = []
try {
  if (!env.TEAM_EMAIL || !env.TEAM_PASSWORD) throw new Error("Faltam TEAM_EMAIL e TEAM_PASSWORD.")
  failures.push(...(await checkRoutes(browser, "equipe", env.TEAM_EMAIL, env.TEAM_PASSWORD, TEAM_ROUTES)))
  if (env.CLIENT_EMAIL && env.CLIENT_PASSWORD) {
    failures.push(...(await checkRoutes(browser, "cliente", env.CLIENT_EMAIL, env.CLIENT_PASSWORD, CLIENT_ROUTES)))
  } else {
    console.log("Sem CLIENT_EMAIL e CLIENT_PASSWORD: o portal não foi conferido.")
  }
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.log(`\n${failures.length} tela(s) rolam para o lado:\n${failures.map((item) => `- ${item}`).join("\n")}`)
  process.exit(1)
}
console.log("\nNenhuma tela rola para o lado.")
