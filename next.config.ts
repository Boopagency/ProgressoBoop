import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // O indicador de desenvolvimento fica à direita para não cobrir o usuário na sidebar.
  devIndicators: { position: "bottom-right" },
}

export default nextConfig
