/**
 * Módulo orquestador para el backup programado.
 * Se encarga de recibir el evento 'scheduled' (cron) y disparar un workflow en GitHub.
 *
 * Mejoras:
 * - Configuración del repositorio y workflow a través de variables de entorno.
 * - Uso de la cabecera de autorización 'Bearer' (recomendado por GitHub).
 */
export default {
  /**
   * Maneja las peticiones fetch normales (inesperadas).
   * Este worker está diseñado principalmente para tareas programadas, así que las peticiones fetch
   * solo devuelven un mensaje informativo.
   */
  async fetch(request, env, ctx) {
    console.log("ℹ️ Orquestador recibió una petición fetch (inesperada).");
    return new Response("Este worker solo se activa por eventos programados (scheduled).", { status: 200 });
  },

  /**
   * Maneja los eventos programados (cron jobs).
   * Esta es la función principal que se ejecuta según el cron en wrangler.toml.
   */
  async scheduled(event, env, ctx) {
    console.log("🤖 Iniciando orquestador (evento programado/cron)...");
    console.log("Evento recibido:", event);

    // =========================================================================
    // 1. VALIDACIÓN DE VARIABLES DE ENTORNO
    // =========================================================================
    console.log("🔑 Verificando variables de entorno disponibles:", Object.keys(env));

    // Obtenemos todas las variables necesarias del entorno.
    const githubApiToken = env.GITHUB_TOKEN;
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const workflowId = env.GITHUB_WORKFLOW_ID; // SIN la extensión .yml

    // Validación para el Token de GitHub
    if (!githubApiToken) {
      console.error("❌ ERROR CRÍTICO: La variable de entorno GITHUB_TOKEN no está configurada.");
      console.error(" Solución: Ve a tu Worker en el dashboard de Cloudflare -> Settings -> Environment Variables y añade 'GITHUB_TOKEN' como un 'secret'.");
      return; // Termina la ejecución para evitar más errores.
    }

    if (typeof githubApiToken !== 'string') {
      console.error("❌ ERROR CRÍTICO: La variable de entorno GITHUB_TOKEN no es un string.");
      console.error(" Valor recibido:", githubApiToken);
      return;
    }

    if (!githubApiToken.startsWith('ghp_') && !githubApiToken.startsWith('gho_') && !githubApiToken.startsWith('github_pat_')) {
      console.error("❌ ADVERTENCIA: El token de GitHub no parece tener un formato estándar. Podría estar mal.");
      console.error(" Valor del token:", githubApiToken.substring(0, 10) + "...");
    }

    // Validación para las nuevas variables de configuración
    if (!owner || !repo || !workflowId) {
      console.error("❌ ERROR CRÍTICO: Faltan una o más variables de entorno para el repositorio (GITHUB_OWNER, GITHUB_REPO, GITHUB_WORKFLOW_ID).");
      console.error(" Solución: Añade estas variables en la configuración de tu Worker.");
      return;
    }

    console.log("✅ Variables de entorno validadas correctamente.");
    console.log(`   - Owner: ${owner}`);
    console.log(`   - Repo: ${repo}`);
    console.log(`   - Workflow ID: ${workflowId}`);

    // =========================================================================
    // 2. CONSTRUCCIÓN DE LA PETICIÓN A LA API DE GITHUB
    // =========================================================================
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

    const body = {
      ref: 'main', // La rama donde se ejecutará el workflow
      inputs: {
        reason: `Scheduled backup from Cloudflare Worker at ${new Date().toISOString()}`
      }
    };

    console.log("📬 Detalles de la petición a GitHub:");
    console.log(" URL:", url);
    console.log(" Body:", JSON.stringify(body, null, 2));

    // =========================================================================
    // 3. EJECUCIÓN DE LA PETICIÓN (con manejo de errores robusto y timeout)
    // =========================================================================
    // Creamos un AbortController para poder cancelar la petición si tarda demasiado.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos de timeout

    try {
      console.log("🚀 Enviando petición a la API de GitHub...");

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          // CAMBIO: Usar 'Bearer' en lugar de 'token' para la autorización (recomendado por GitHub).
          'Authorization': `Bearer ${githubApiToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Cloudflare-Worker-Orchestrator'
        },
        body: JSON.stringify(body),
        signal: controller.signal // Asociamos la señal del controller
      });

      // Limpiamos el timeout si la petición se completó a tiempo
      clearTimeout(timeoutId);

      console.log("📨 Respuesta recibida de GitHub:");
      console.log(" Status:", response.status);
      console.log(" Status Text:", response.statusText);
      console.log(" Headers:", Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        console.log("✅ Workflow de GitHub dispatch exitoso.");
        // No necesitamos el cuerpo de una respuesta 204, pero lo logueamos por si acaso.
        const responseText = await response.text();
        if (responseText) {
          console.log(" Cuerpo de la respuesta:", responseText);
        }
      } else {
        // Si la respuesta no es 'ok', es un error de la API de GitHub.
        const errorBody = await response.text();
        console.error(`❌ Fallo al hacer dispatch del workflow. Status: ${response.status}`);
        console.error(" Cuerpo del error:", errorBody);
      }
    } catch (error) {
      // Limpiamos el timeout si hubo un error de red
      clearTimeout(timeoutId);

      console.error("🚨 ERROR DE RED O EJECUCIÓN al intentar conectar con la API de GitHub:");
      console.error(" Mensaje del error:", error.message);
      console.error(" Stack del error:", error.stack);

      // Diferenciamos si el error fue causado por nuestro timeout o por otra cosa
      if (error.name === 'AbortError') {
        console.error(" El error fue causado por un TIMEOUT (la petición tardó más de 15 segundos).");
      }
    }
  }
};
