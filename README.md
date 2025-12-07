🎧 RadioMax | Una experiencia inmersiva

RadioMax es una aplicación web progresiva (PWA) moderna y elegante para escuchar radio en linea. 
Diseñada para los amantes de la música, ofrece una experiencia envolvente con información de canciones en tiempo real, portadas de álbumes y una interfaz oscura y personalizada. Instálala en tu dispositivo para disfrutar de una experiencia de aplicación nativa.

Características Clave

🚀 Instalable como PWA: Disfruta de una experiencia de aplicación nativa, directamente desde tu navegador. Funciona sin conexión gracias al caché inteligente.
🎵 Multiplataforma de streaming: Incluye estaciones de servicios populares y selectos en un solo lugar.
🎨 Información enriquecida: Muestra en tiempo real el título, artista, álbum, portada, año, sello discográfico y género de la canción que suena.
⚡ Rendimiento superior: Construido con service worker y proxy para una experiencia rápida, segura y fiable.
🎨 Interfaz pulida: Un diseño oscuro con acentos naranjas, totalmente responsivo y creado para una experiencia musical inmersiva.
🔒 Seguro y robusto: Implementa las mejores prácticas de seguridad web moderna, incluyendo Content Security Policy (CSP).
📱 Totalmente adaptable: Se adapta sin problemas a cualquier tamaño de pantalla, desde escritorio hasta móvil.
Tecnologías Utilizadas
Frontend: HTML5, CSS3, JavaScript (ES6+)
PWA: Service Workers, Web App Manifest
Backend/Proxy: Cloudflare Workers para llamadas a APIs seguras.


<!-- TODO: Reemplaza 'TU_USUARIO' y 'TU_REPOSITORIO' con tus datos -->
[![Live Demo](https://img.shields.io/badge/Demo-Live-orange?style=for-the-badge&logo=github-pages)](https://chicagocs.github.io/radiomax/)
[![GitHub Pages](https://img.shields.io/badge/GitHub-Pages-blue?style=for-the-badge&logo=github)](https://pages.github.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

### 🖼️ Captura de Pantalla

![Screenshot of the Radio Player UI](screenshot.png)

*La interfaz muestra el reproductor con la estación "Space Station Soma" seleccionada, mostrando la información de la canción actual y los controles de reproducción.*

---

### ✨ Características Principales

-   **🎨 Diseño Moderno y Elegante:** Interfaz de usuario oscura con acentos en naranja, animaciones sutiles y un diseño totalmente responsive que se adapta a cualquier dispositivo.
-   **📻 Selección de Estaciones:** Elige entre una lista curada de más de 40 selecciones estaciones de radio, desde ambient y electrónica hasta rock y reggae.
-   **🎵 Información en Tiempo Real:** Muestra la canción, artista y álbum que se está reproduciendo actualmente gracias a APIs públicas.
-   **▶️ Controles Completos:** Reproduce, pausa y detén la transmisión con controles claros y accesibles.
-   **🔊 Control de Volumen:** Deslizador para ajustar el volumen y un botón para silenciar (mute) de un solo clic.
-   **⚡ Liviano y Rápido:** No requiere dependencias externas ni frameworks pesados. Carga instantáneamente.

---

### 🛠️ Tecnología Utilizada

Este proyecto es una demostración de las capacidades de las tecnologías web modernas:

-   **HTML5:** Para la estructura semántica y el elemento `<audio>` que maneja el streaming.
-   **CSS3:** Para el estilizado avanzado, incluyendo flexbox, animaciones y diseños adaptables (responsive design).
-   **JavaScript Vanilla:** Para toda la lógica de interactividad, la gestión de eventos, las llamadas a la API (`fetch`) y la manipulación del DOM.

---

### 🚀 Demo en Vivo

¿Quieres escucharlo ahora mismo? Puedes acceder al reproductor desplegado en GitHub Pages:

<!-- TODO: Reemplaza 'TU_USUARIO' y 'TU_REPOSITORIO' con tus datos -->
**[▶️ Escúchalo en vivo aquí](https://chicagocs.github.io/radiomax/)**

---

### 📂 Cómo Usarlo Localmente

Es muy sencillo. No necesitas instalar nada.

1.  **Clona el repositorio:**
    ```bash
 
    git clone https://github.com/chicagocs/radiomax.git
    ```
2.  **Abre el archivo:**
    Navega a la carpeta del proyecto y abre el archivo `index.html` en tu navegador web favorito (Chrome, Firefox, Safari, etc.).

¡Y listo! Ya puedes empezar a disfrutar de la música.

---

### 🎛️ ¿Cómo Añadir o Modificar Estaciones?

Las estaciones se definen directamente en el archivo `index.html` dentro del elemento `<select id="stationSelect">`. Cada `<option>` tiene un formato específico en su atributo `value`:

```html
<option value="URL_DEL_STREAM|Nombre de la Estación|Descripción de la Estación|ID_PARA_API">Nombre Visible</option>
