# AnimeAV1 — plugin para Kino

Plugin de Kino que busca y reproduce anime desde [animeav1.com](https://animeav1.com).

| Capability | Qué hace |
| --- | --- |
| `search` | Busca en `/catalogo?search=…&page=…` y devuelve títulos, tipo (serie/película) y póster. |
| `episodes` | Lee `/media/{slug}` y devuelve los episodios numerados. |
| `resolve` | Lee `/media/{slug}/{ep}` y devuelve **un** stream (HLS o MP4). |

## Instalación

En Kino: **Ajustes → Plugins → Instalar** con el `owner/repo` de este repositorio (requiere `apiVersion: 4`).

## Resolvers (orden en `resolve`)

1. **UPNShare** — `animeav1.uns.bio/api/v1/video` devuelve un blob hex que se descifra con AES-128-CBC (key/iv fijos del sitio) → JSON con `cfNative`/`source` (HLS).
2. **Voe** — `voe.sx/e/{id}` redirige a un espejo; el JSON inline se decodifica con rot13 → quitar tokens → base64 → −3 → reverse → base64 → JSON → `source` (HLS firmado).
3. **MP4Upload** — `embed-{id}.html` → regex de `src: "….mp4"` → MP4 con `Referer`.

Se intenta SUB y, si no hay, DUB. Si un servidor falla se pasa al siguiente; si fallan todos: `unavailable`.

## Desarrollo

```powershell
node sdk/validate.mjs .                          # contrato de Kino
node sdk/run.mjs . search "naruto"               # live
node sdk/run.mjs . episodes naruto
node sdk/run.mjs . resolve "naruto|1"
node --test test/plugin.test.mjs                 # offline (usa test/fixtures.json)
```

Para refrescar los fixtures (graba un tape por capability y se concatenan):

```powershell
node sdk/run.mjs --record test/f-search.json . search "naruto"
node sdk/run.mjs --record test/f-episodes.json . episodes naruto
node sdk/run.mjs --record test/f-resolve.json . resolve "naruto|1"
node -e "const fs=require('fs'),p='test/';const a=['f-search.json','f-episodes.json','f-resolve.json'].flatMap(f=>JSON.parse(fs.readFileSync(p+f,'utf8')));fs.writeFileSync(p+'fixtures.json',JSON.stringify(a,null,1));['f-search.json','f-episodes.json','f-resolve.json'].forEach(f=>fs.unlinkSync(p+f))"
```

`--record` **sobrescribe** el tape en cada corrida; por eso se graba uno por archivo y se fusiona.

## Estructura

```
kino-plugin.json   manifest (hosts, capabilities, apiVersion 4)
contract.json      copia del contrato del SDK (fuente única de verdad)
plugin.js          search / episodes / resolve
sdk/               validate.mjs, run.mjs, kino-shim.mjs (copiados del archive)
test/              fixtures.json (grabados) + plugin.test.mjs (offline)
```

## Límites conocidos

- Un solo stream por `resolve` (contrato de Kino): si el primero falla se prueba el siguiente servidor, pero no se exponen alternativas.
- Idioma fijo: SUB con fallback a DUB (no hay setting).
- `maxEpisodes: 5000`, `maxSearchItems: 100`; `streamHosts: "any"` (los streams viven en hosts dinámicos: `*.uns.bio`, espejos de Voe, `*.mp4upload.com`).
