/**
 * Módulo orquestador para el backup programado.
 * Se encarga de recibir el evento 'scheduled' (cron) y disparar un workflow en GitHub.
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
        // 1. VALIDACIÓN DE VARIABLES DE ENTORNO (El paso más importante)
        // =========================================================================
        console.log("🔑 Verificando variables de entorno disponibles:", Object.keys(env));
        
        const githubApiToken = env.GITHUB_TOKEN;

        if (!githubApiToken) {
            console.error("❌ ERROR CRÍTICO: La variable de entorno GITHUB_TOKEN no está configurada.");
            console.error("   Solución: Ve a tu Worker en el dashboard de Cloudflare -> Settings -> Environment Variables y añade 'GITHUB_TOKEN' con tu token.");
            return; // Termina la ejecución para evitar más errores.
        }

        if (typeof githubApiToken !== 'string') {
            console.error("❌ ERROR CRÍTICO: La variable de entorno GITHUB_TOKEN no es un string.");
            console.error("   Valor recibido:", githubApiToken);
            return;
        }
        
        if (!githubApiToken.startsWith('ghp_') && !githubApiToken.startsWith('gho_')) {
            console.error("❌ ADVERTENCIA: El token de GitHub no parece tener el formato estándar (ghp_ o gho_). Podría estar mal.");
            console.error("   Valor del token:", githubApiToken.substring(0, 10) + "...");
        }

        console.log("✅ Token de GitHub validado correctamente.");

        // =========================================================================
        // 2. CONSTRUCCIÓN DE LA PETICIÓN A LA API DE GITHUB
        // =========================================================================
        const owner = 'chicagocs';
        const repo = 'radiomax';
        const workflowId = 'backup'; // SIN la extensión .yml
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

        const body = {
            ref: 'main', // La rama donde se ejecutará el workflow
            inputs: {
                reason: `Scheduled backup from Cloudflare Worker at ${new Date().toISOString()}`
            }
        };

        console.log("📬 Detalles de la petición a GitHub:");
        console.log("   URL:", url);
        console.log("   Body:", JSON.stringify(body, null, 2)); // null, 2 para formato bonito

        // =========================================================================
        // 3. EJECUCIÓN DE LA PETICIÓN (con manejo de errores robusto)
        // =========================================================================
        try {
            console.log("🚀 Enviando petición a la API de GitHub...");
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${githubApiToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Cloudflare-Worker-Orchestrator'
                },
                body: JSON.stringify(body)
            });

            console.log("📨 Respuesta recibida de GitHub:");
            console.log("   Status:", response.status);
            console.log("   Status Text:", response.statusText);

            if (response.ok) {
                console.log("✅ Workflow de GitHub dispatch exitoso.");
                // No necesitamos el cuerpo de una respuesta 204, pero lo logueamos por si acaso.
                const responseText = await response.text();
                if (responseText) {
                    console.log("   Cuerpo de la respuesta:", responseText);
                }
            } else {
                // Si la respuesta no es 'ok', es un error de la API de GitHub.
                const errorBody = await response.text();
                console.error(`❌ Fallo al hacer dispatch del workflow. Status: ${response.status}`);
                console.error("   Cuerpo del error:", errorBody);
            }
        } catch (error) {
            // Captura cualquier error de red, de sintaxis (en JSON), etc.
            console.error("🚨 ERROR DE RED O EJECUCIÓN al intentar conectar con la API de GitHub:");
            console.error("   Mensaje del error:", error.message);
            console.error("   Stack del error:", error.stack);
        }
    }
};
