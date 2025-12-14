// workers/orchestrator/index.js

export default {
    /**
     * Maneja los eventos programados (cron jobs).
     */
    async scheduled(event, env, ctx) {
        console.log("🤖 Iniciando orquestador (evento programado/cron)...");
        console.log("Evento recibido:", JSON.stringify(event, null, 2));

        // =========================================================================
        // 1. VALIDACIÓN DE VARIABLES DE ENTORNO
        // =========================================================================
        console.log("🔑 Verificando variables de entorno disponibles:", Object.keys(env));
        
        const githubApiToken = env.GITHUB_TOKEN;

        if (!githubApiToken) {
            console.error("❌ ERROR CRÍTICO: La variable de entorno GITHUB_TOKEN no está configurada.");
            return new Response("Error de configuración: GITHUB_TOKEN no encontrado.", { status: 500 });
        }

        console.log("✅ Token de GitHub validado correctamente.");

        // =========================================================================
        // 2. CONSTRUCCIÓN DE LA PETICIÓN AL WORKFLOW 'WRAPPER'
        // =========================================================================
        const owner = 'chicagocs';
        const repo = 'radiomax';
        const workflowId = 'dispatch-wrapper'; // <-- CAMBIO CLAVE: Llamamos al nuevo wrapper
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

        const body = {
            ref: 'main',
            inputs: {
                original_reason: `Scheduled backup from Cloudflare Worker at ${new Date().toISOString()}`
            }
        };

        console.log("📬 Detalles de la petición al WRAPPER:");
        console.log("   URL:", url);
        console.log("   Body:", JSON.stringify(body, null, 2));

        // =========================================================================
        // 3. EJECUCIÓN DE LA PETICIÓN
        // =========================================================================
        try {
            console.log("🚀 Enviando petición a la API de GitHub para disparar el WRAPPER...");
            
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

            console.log("📨 Respuesta recibida de GitHub (WRAPPER):");
            console.log("   Status:", response.status);
            console.log("   Status Text:", response.statusText);

            if (response.ok) {
                console.log("✅ Workflow WRAPPER dispatch exitoso. El workflow 'backup' debería ejecutarse ahora.");
                return new Response("Orquestador ejecutado con éxito (via wrapper).", { status: 200 });
            } else {
                const errorBody = await response.text();
                console.error(`❌ Fallo al hacer dispatch del workflow WRAPPER. Status: ${response.status}`);
                console.error("   Cuerpo del error:", errorBody);
                return new Response(`Error al ejecutar orquestador (via wrapper): ${response.status}`, { status: 500 });
            }
        } catch (error) {
            console.error("🚨 ERROR DE RED O EJECUCIÓN al intentar conectar con la API de GitHub (WRAPPER):");
            console.error("   Mensaje del error:", error.message);
            return new Response(`Error de red al ejecutar orquestador (via wrapper): ${error.message}`, { status: 500 });
        }
    },

    /**
     * Maneja las peticiones fetch normales (inesperadas).
     */
    async fetch(request, env, ctx) {
        return new Response("Este worker solo se activa por eventos programados (scheduled).", { status: 200 });
    }
};
