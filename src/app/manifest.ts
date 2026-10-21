import type { MetadataRoute } from "next"

/**
 * O app instalável (PWA), da equipe e do portal: um só endereço, então um só
 * app. Abre em "/", que leva a equipe para Hoje e o cliente para o portal.
 * Os ícones são a marca sobre o navy da Boop (public/icons).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Boop",
    short_name: "Boop",
    description: "A Boop no celular: conteúdo, aprovações, mensagens e avisos.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0B1B2C",
    theme_color: "#0B1B2C",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
