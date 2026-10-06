import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // O indicador de desenvolvimento fica à direita para não cobrir o usuário na sidebar.
  devIndicators: { position: "bottom-right" },

  // A tela inicial é Hoje, em /hoje. A antiga tela da reunião de segunda
  // virou Reuniões.
  async redirects() {
    return [
      { source: "/", destination: "/hoje", permanent: false },
      { source: "/segunda", destination: "/reunioes", permanent: false },
    ]
  },
}

export default nextConfig
