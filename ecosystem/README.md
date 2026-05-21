# Ronin Ecosystem submission

Anexa el archivo [`ronin-directory.json`](./ronin-directory.json) cuando
abras el Pull Request en el repositorio oficial del directorio de Ronin.

## Pasos para el PR

1. Confirma el repo oficial (mayo 2026, candidatos):
   - `skymavis/ecosystem-directory`
   - `axieinfinity/ronin-ecosystem`
   - Formulario alternativo en <https://developers.skymavis.com>
2. Fork → branch `add-rwia` → copia `ronin-directory.json` en la carpeta
   que el repo te indique (ej. `projects/`, `dapps/`).
3. Antes de abrir el PR, rellena en el JSON:
   - Repos GitHub (`github`, `documentation`)
   - Direcciones de contratos desplegados en Saigon (ya verificadas en el
     explorer)
   - `twitter`, `discord` si aplica
   - `logoUrl` apuntando al SVG en tu repo público
4. PR title sugerido: `feat: add Ronin Waypoint Intent Aggregator (RWIA)`
5. PR body sugerido: copia el `description` del JSON + enlace a SECURITY.md +
   captura del Saigon Explorer mostrando los contratos verificados.

## Validar el JSON antes del PR

```powershell
# JSON syntax check
Get-Content ronin-directory.json -Raw | ConvertFrom-Json | Out-Null
if ($?) { Write-Host "JSON OK" -ForegroundColor Green }
```

## Tras merge del PR

- Anota el PR URL en `README.md` (sección "Ecosystem submission")
- Adjunta el PR URL en la postulación de Notion (Ronin Grant)
