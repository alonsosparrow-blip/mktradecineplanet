# Solicitudes Trade Marketing · Cineplanet

Mini site donde los gerentes de cine envían solicitudes al área de Trade Marketing.

- `public/index.html`: formulario para gerentes.
- `public/panel.html`: panel interno de Marketing, protegido con clave.
- `public/config.js`: aquí va la URL del servidor.
- `apps-script/Code.gs`: servidor en Google Apps Script. Guarda la solicitud en una hoja de cálculo, sube la foto a la carpeta de Drive **Trade_MKT** y envía los correos. **No se publica en Netlify.**

## Cómo funciona

```
Gerente ──► Sitio en Netlify ──► Google Apps Script ──► Correo a asparrow@cineplanet.com.pe
                                        ├──► Foto en Drive (Trade_MKT)
                                        └──► Hoja "Trade Marketing · Solicitudes"
```

Netlify solo publica páginas, así que no puede enviar correos ni guardar archivos en Drive. Eso lo hace Apps Script, que funciona con la cuenta de Google dueña de la carpeta.

## Paso 1: Servidor (Google Apps Script). Se hace una sola vez.

1. Entra a https://script.google.com con **cines.pla@gmail.com** (la cuenta dueña de la carpeta Trade_MKT) y pulsa **Nuevo proyecto**.
2. Borra el contenido de `Código.gs` y pega el de `apps-script/Code.gs`.
3. Dentro de la función `configurar()`, cambia `CLAVE_PANEL` por la clave que usará Marketing. Elige `configurar` en el menú de funciones y pulsa **Ejecutar**. Acepta los permisos de Drive, Hojas de cálculo y Gmail.
4. Ve a **Implementar → Nueva implementación**. En el engranaje, elige **Aplicación web** y configura:
   - Ejecutar como: **Yo (cines.pla@gmail.com)**
   - Quién tiene acceso: **Cualquier persona**. Si eliges otra opción, el sitio no podrá conectarse.
5. Copia la **URL de la aplicación web**. Termina en `/exec`.

## Paso 2: Conectar el sitio

Abre `public/config.js` y pega la URL:

```js
window.TM_CONFIG = {
  API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec"
};
```

## Paso 3: GitHub y Netlify

1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify, elige **Add new site → Import an existing project → GitHub** y selecciona el repositorio.
3. Netlify lee `netlify.toml` y publica la carpeta `public`. No necesita comando de build.
4. Listo:
   - Formulario: `https://TU-SITIO.netlify.app/`
   - Panel de Marketing: `https://TU-SITIO.netlify.app/panel.html`
5. Opcional: pon esa URL en `URL_SITIO` dentro de Code.gs, para que el correo incluya el enlace correcto al panel.

## Para hacer cambios después

- **Sitio:** haz commit en GitHub y Netlify vuelve a publicar solo.
- **Code.gs:** después de editarlo, ve a **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. La URL no cambia.
- **Listas** (provincias, complejos, tipos de trabajo): se editan en `CONFIG` de Code.gs **y** en `OPC` de `public/index.html`.

## Si no llega el correo

- En Apps Script, abre **Ejecuciones** (ícono de reloj) y revisa si hay errores.
- Revisa el spam o la cuarentena de asparrow@cineplanet.com.pe. El correo sale desde una cuenta Gmail.
- Con una cuenta Gmail personal, Apps Script puede enviar unos 100 correos al día.
- Si el sitio muestra la franja amarilla de "Modo demostración", falta la URL en `config.js`.
