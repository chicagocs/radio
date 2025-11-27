# 🎧 RadioMax Streaming Player

<!-- TODO: Reemplaza 'TU_USUARIO' y 'TU_REPOSITORIO' con tus datos -->
[![Live Demo](https://img.shields.io/badge/Demo-Live-orange?style=for-the-badge&logo=github-pages)](https://chicagocs.github.io/radiomax/)
[![GitHub Pages](https://img.shields.io/badge/GitHub-Pages-blue?style=for-the-badge&logo=github)](https://pages.github.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

Un reproductor de radio web elegante y moderno, construido únicamente con HTML, CSS y JavaScript vanilla. Ofrece una experiencia de usuario inmersiva con una interfaz oscura, controles intuitivos y la capacidad de sintonizar una variedad de estaciones de SomaFM.

---

### 🖼️ Captura de Pantalla

![Screenshot of the Radio Player UI](screenshot.png)

*La interfaz muestra el reproductor con la estación "Space Station Soma" seleccionada, mostrando la información de la canción actual y los controles de reproducción.*

---

### ✨ Características Principales

-   **🎨 Diseño Moderno y Elegante:** Interfaz de usuario oscura con acentos en naranja, animaciones sutiles y un diseño totalmente responsive que se adapta a cualquier dispositivo.
-   **📻 Selección de Estaciones:** Elige entre una lista curada de más de 30 estaciones de SomaFM, desde ambient y electrónica hasta rock y reggae.
-   **🎵 Información en Tiempo Real:** Muestra la canción, artista y álbum que se está reproduciendo actualmente gracias a la API pública de SomaFM.
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
**[▶️ Escúchalo en vivo aquí](https://TU_USUARIO.github.io/TU_REPOSITORIO/)**

---

### 📂 Cómo Usarlo Localmente

Es muy sencillo. No necesitas instalar nada.

1.  **Clona el repositorio:**
    ```bash
    # TODO: Reemplaza 'TU_USUARIO' y 'TU_REPOSITORIO' con tus datos
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
