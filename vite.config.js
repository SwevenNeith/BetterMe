import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * GitHub Pages : 404.html redirige uniquement les routes SPA (pas les assets manquants).
 * @see https://github.com/rafgraph/spa-github-pages
 */
function ghPagesSpaFallback() {
  let pathSegmentsToKeep = 0

  return {
    name: 'gh-pages-spa-fallback',
    configResolved(config) {
      pathSegmentsToKeep = config.base.replace(/\/$/, '').split('/').filter(Boolean).length
    },
    closeBundle() {
      const outDir = resolve(__dirname, 'dist')
      const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>BetterMe</title>
    <script>
      (function () {
        var path = window.location.pathname
        var lastSegment = path.split('/').pop() || ''
        if (/\\.[a-z0-9]+$/i.test(lastSegment)) return

        var segmentCount = ${pathSegmentsToKeep}
        var l = window.location
        l.replace(
          l.protocol +
            '//' +
            l.hostname +
            (l.port ? ':' + l.port : '') +
            l.pathname
              .split('/')
              .slice(0, 1 + segmentCount)
              .join('/') +
            '/?/' +
            l.pathname
              .slice(1)
              .split('/')
              .slice(segmentCount)
              .join('/')
              .replace(/&/g, '~and~') +
            (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
            l.hash
        )
      })()
    </script>
  </head>
  <body></body>
</html>
`
      writeFileSync(resolve(outDir, '404.html'), html, 'utf8')
    },
  }
}

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'emoji-picker',
        },
      },
    }),
    ghPagesSpaFallback(),
  ],
  base: '/BetterMe/',
})
