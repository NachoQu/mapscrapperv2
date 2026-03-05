# GeoScouting by Plano

Extensión de Chrome para scraping de Google Maps orientada a generación de leads.

## Qué extrae
- Nombre del negocio
- Categoría
- Rating
- Teléfono
- Teléfono en formato WhatsApp (`https://wa.me/`)
- Correo electrónico (si se detecta)
- Link de red social (Facebook, Instagram, LinkedIn, TikTok, YouTube, X/Twitter, WhatsApp)
- Dirección
- Link de Maps del negocio
- `place_id` (opcional)

## Mejoras incluidas
- Auto-scroll inteligente en listado para capturar más resultados sin hacerlo manualmente.
- Detección de fin de lista usando estabilidad de altura de scroll.
- UI renovada con branding `GeoScouting by Plano` + `by planoweb.com.ar`.
- Exportación a CSV + copia de JSON al portapapeles.

## Instalación
1. Ir a `chrome://extensions/`
2. Activar **Developer mode**.
3. Click en **Load unpacked** y seleccionar esta carpeta.

## Uso
1. Abrir Google Maps y realizar una búsqueda (ejemplo: `dentistas en córdoba`).
2. Abrir la extensión.
3. Elegir máximo de resultados.
4. Presionar **Iniciar scraping**.
5. Al finalizar, descargar CSV o copiar JSON.
