# PA POS — Sistema de Punto de Venta

Sistema POS para Perros Americanos, CC Manila Fusagasugá.

## Instalación
- **Windows:** descargar `PA-POS-Setup-x.x.x.exe`
- **Linux:** descargar `pa-pos_x.x.x_amd64.deb`

## Desarrollo

```bash
npm install
npm start
```

> En Linux es necesario `--no-sandbox` (ya configurado en el script `start`).

## Generar instaladores

```bash
npm run build:win    # Genera .exe (requiere Windows o Wine)
npm run build:linux  # Genera .deb
npm run build:all    # Genera ambos
```

Los instaladores quedan en la carpeta `release/`.

## Publicar nueva versión

1. Actualizar `version` en `package.json`
2. Actualizar `CHANGELOG.md`
3. Hacer commit: `git commit -am "Release vX.X.X"`
4. Crear tag: `git tag vX.X.X`
5. Subir: `git push origin vX.X.X`
6. GitHub Actions genera los instaladores y los publica automáticamente en GitHub Releases

> Requiere el secret `GH_TOKEN` configurado en el repositorio con permisos de escritura en releases.

## Auto-actualización

La app verifica actualizaciones automáticamente al iniciar (solo en versión instalada, no en desarrollo). El administrador ve notificaciones de descarga y puede instalar con un clic desde el Dashboard o desde Configuración → Versión.
